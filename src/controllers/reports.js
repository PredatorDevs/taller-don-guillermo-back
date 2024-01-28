import PdfPrinter from 'pdfmake';
import * as fs from 'fs';
import connUtil from "../helpers/connectionUtil.js";
import renders from "../helpers/pdfRendering.js";
import rendersAlt from "../helpers/pdfRenderingAlt.js";
import errorResponses from '../helpers/errorResponses.js';
import path from 'path';
import { fileURLToPath } from 'url';
import dayjs from 'dayjs';
import stringHelpers from '../helpers/stringHelpers.js';

const controller = {};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const queries = {
  kardexByProduct: `
    SELECT * FROM (
      SELECT
        log.id AS logId,
        IFNULL(policies.docNumber, '-') AS referenceNumber,
        IFNULL(policies.docDatetime, '1990-01-01 00:00:00') AS referenceDatetime,
        CONCAT("Ingreso de póliza #", IFNULL(policies.docNumber, '-')) AS concept,
        'Póliza' AS referenceType,
        0.00 AS sales,
        log.quantity AS purchases,
        log.newBalance AS balance
      FROM
        productstocklogs log
        INNER JOIN policies 
          ON log.referenceId = policies.id
        INNER JOIN policydetails 
          ON policies.id = policydetails.policyId
      WHERE
        log.productStockId = (
          SELECT id FROM productstocks WHERE locationId = ? AND productId = ? LIMIT 1
        )
        AND log.referenceType = 'policy'
        AND DATE_FORMAT(policies.docDatetime, "%Y-%m-%d") BETWEEN ? AND ?
      UNION
      SELECT
        log.id AS logId,
        IFNULL(sales.docNumber, '-') AS referenceNumber,
        IFNULL(sales.docDatetime, '1990-01-01 00:00:00') AS referenceDatetime,
        CONCAT("Venta #", IFNULL(sales.docNumber, '-')) AS concept,
        'Venta' AS referenceType,
        log.quantity AS sales,
        0.00 AS purchases,
        log.newBalance AS balance
      FROM
        productstocklogs log
        INNER JOIN sales 
          ON log.referenceId = sales.id
        INNER JOIN saledetails 
          ON sales.id = saledetails.saleId
      WHERE 
        log.productStockId = (
          SELECT id FROM productstocks WHERE locationId = ? AND productId = ? LIMIT 1
        )
        AND log.referenceType = 'sale'
        AND DATE_FORMAT(sales.docDatetime, "%Y-%m-%d") BETWEEN ? AND ?
    ) AS result
    ORDER BY result.referenceDatetime;
  `,
  getLocationProductsByCategory: `
    SELECT id, name FROM categories
    WHERE id IN (SELECT categoryId FROM products WHERE isActive = 1);
    SELECT
      productId,
      productName,
      packageContent,
      productCost,
      productCategoryId,
      ROUND((
        SELECT
          stock
        FROM
          productstocks
        WHERE
          productId = vw_products.productId
          AND locationId = ?
      ), 2) AS currentLocationStock
    FROM
      vw_products;
  `,
  getLocationProductsByBrand: `
    SELECT id, name FROM brands
    WHERE id IN (SELECT brandId FROM products WHERE isActive = 1);
    SELECT
      productId,
      productName,
      packageContent,
      productCost,
      productBrandId,
      ROUND((
        SELECT
          stock
        FROM
          productstocks
        WHERE
          productId = vw_products.productId
          AND locationId = ?
      ), 2) AS currentLocationStock
    FROM
      vw_products;
  `,
  shiftcutSettlement: `
    SELECT * FROM vw_shitfcuts WHERE shiftcutId = ?;
    CALL usp_ReportShiftcutSales(?);
    CALL usp_ShiftcutSummary(?);
    CALL usp_ShiftcutPayments(?);
    CALL usp_ShiftcutCashFundMovements(?);
  `,
  getMainDashboardData: `
    CALL usp_MainDashboard(?, ?);
  `,
  getCashierLocationSalesByMonth: `
    SELECT *
    FROM vw_sales
    WHERE locationId = ?
    AND cashierId = ?
    AND documentTypeId = ?
    AND docDatetimeFormatted = ?
    ORDER BY docNumber;
  `,
  getMonthlyFinalConsumerSaleBook: `
    SELECT
      ROW_NUMBER() OVER(ORDER BY vs.docDatetime) AS rowNum,
      date_format(vs.docDatetime, '%Y-%m-%d') AS reportDay,
      vs.documentTypeId AS documentTypeId,
      vs.cashierId AS cashierId,
      MIN(vs.docNumber) AS documentNumberFrom,
      MAX(vs.docNumber) AS documentNumberTo,
      SUM(IFNULL(vs.noTaxableSubTotal, 0)) AS noTaxableSubTotal,
      SUM(IFNULL(vs.taxableSubTotal, 0)) AS taxableSubTotal,
      SUM(IFNULL(0, 0)) AS exportations,
      SUM(IFNULL(vs.total, 0)) AS total,
      SUM(IFNULL(0, 0)) AS totalToThirdAccounts,
      SUM(IFNULL(vs.totalTaxes, 0)) AS totalTaxes,
      ROUND(SUM(IFNULL(vs.IVARetention, 0)), 2) AS IVARetention
    FROM
      vw_sales vs
    WHERE
      vs.locationId = ?
      AND vs.documentTypeId IN (1, 2)
      AND vs.docDatetimeFormatted = ?
    GROUP BY
      date_format(vs.docDatetime, '%Y-%m-%d'),
      vs.documentTypeId,
      vs.cashierId
    ORDER BY
      date_format(vs.docDatetime, '%Y-%m-%d'),
      vs.docNumber;
  `,
  getMonthlyTaxPayerSaleBook: `
    SELECT
      ROW_NUMBER() OVER(ORDER BY vs.docDatetime) AS rowNum,
      date_format(vs.docDatetime, '%Y-%m-%d') AS reportDay,
      vs.documentTypeId AS documentTypeId,
      vs.cashierId AS cashierId,
      vs.docNumber AS documentNumber,
      '' AS formUniqueController,
      vs.customerFullname AS customerFullname,
      vs.customerNrc AS customerNrc,
      IFNULL(vs.noTaxableSubTotal, 0) AS noTaxableSubTotal,
      IFNULL(vs.taxableSubTotal, 0) AS taxableSubTotal,
      IFNULL(vs.taxableSubTotalWithoutTaxes, 0) AS taxableSubTotalWithoutTaxes,
      IFNULL(vs.totalTaxes, 0) AS totalTaxes,
      0 AS thirdNoTaxableSubTotal,
      0 AS thirdTaxableSubTotal,
      0 AS thirdTaxableSubTotalWithoutTaxes,
      0 AS thirdTotalTaxes,
      ROUND(IFNULL(vs.IVARetention, 0), 2) AS IVARetention,
      IFNULL(vs.total, 0) AS total
    FROM
      vw_sales vs
    WHERE
      vs.locationId = ?
      AND vs.documentTypeId IN (3)
      AND vs.docDatetimeFormatted = ?
    ORDER BY
      date_format(vs.docDatetime, '%Y-%m-%d'),
      vs.docNumber;
  `,
  getMonthlyPurchasesBook: `
    SELECT
      ROW_NUMBER() OVER(ORDER BY vpp.documentDatetime) AS rowNum,
      date_format(vpp.documentDatetime, '%Y-%m-%d') AS reportDay,
      vpp.documentTypeId AS documentTypeId,
      vpp.documentNumber AS documentNumber,
      vpp.supplierNrc AS supplierNrc,
      vpp.supplierName AS supplierName,
      IFNULL(vpp.noTaxableSubTotal, 0) AS noTaxableSubTotal,
      0 AS noTaxableSubTotalImport,
      IFNULL(vpp.taxableSubTotal, 0) AS taxableSubTotal,
      0 AS taxableSubTotalImport,
      IFNULL(vpp.taxableSubTotalWithoutTaxes, 0) AS taxableSubTotalWithoutTaxes,
      0 AS taxableSubTotalWithoutTaxesImport,
      IFNULL(vpp.totalTaxes, 0) AS totalTaxes,
      IFNULL(vpp.total, 0) AS total,
      ROUND(IFNULL(vpp.IVAretention, 0), 2) AS IVAretention,
      0 AS totalExcludeIndividuals
    FROM
      vw_productpurchases vpp
    WHERE
      vpp.locationId = ?
      AND vpp.documentDatetimeFormatted = ?
    ORDER BY
      date_format(vpp.documentDatetime, '%Y-%m-%d'),
      vpp.documentNumber;
  `,
  getTransferSheet: `
    SELECT * FROM vw_transfers WHERE transferId = ?;
    SELECT * FROM vw_transferdetails WHERE transferId = ?;
  `
}

controller.testquery = (req, res) => {
  const { data } = req.body;
  req.getConnection(
    connUtil.connFunc(
      `SELECT * FROM testtable WHERE id = @param AND name = @param;`, 
      [
        data.id,
        data.name
      ], 
      res
    )
  );
}

controller.kardexByProduct = (req, res) => {
  const { locationId, productId, startDate, endDate } = req.params;
  req.getConnection(
    connUtil.connFunc(
      queries.kardexByProduct, 
      [
        locationId || 0, productId || 0, startDate, endDate, 
        locationId || 0, productId || 0, startDate, endDate
      ], 
      res
    )
  );
}

controller.createNewPdf = (req, res) => {
  try {
    renders.generateNewPdf();
    res.json({ status: 200, message: 'success' });
  } catch(error) {
    res.json({ status: 400, message: 'error' });
  }
}

controller.createNewPdfAlt = (req, res) => {
  try {
    rendersAlt.generateNewPdf();
    res.json({ status: 200, message: 'success' });
  } catch(error) {
    console.log(error);
    res.json({ status: 400, message: 'error' });
  }
}

controller.getPdf = (req, res) => {
  try {
    const file = fs.createReadStream(process.cwd() + '/src/pdfs/newpdfalt.pdf');
    const stat = fs.statSync(process.cwd() + '/src/pdfs/newpdfalt.pdf');
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=quote.pdf');
    file.pipe(res);
  } catch(error) {
    console.log(error);
    res.json({ status: 400, message: 'error' });
  }
}

controller.getLocationProductsByCategory = (req, res) => {
  let result = [];

  req.getConnection((error, conn) => {
    if (error) 
      res.status(500).json(errorResponses.status500(error));

    conn.beginTransaction((transactionError) => {
      if (transactionError) res.status(500).json(errorResponses.status500(error));

      const { locationId } = req.params;

      conn.query(
        queries.getLocationProductsByCategory,
        [ locationId ],
        (queryError, queryRows) => {
          if (queryError)
            conn.rollback(() => res.status(500).json(errorResponses.status500(queryError)));

          result = queryRows;

          conn.commit((commitError) => {
            if (commitError) conn.rollback(() => { res.status(500).json(errorResponses.status500(queryError)); });

            try {
              const categoriesData = result[0];
              const productsData = result[1];

              const fonts = {
                Roboto: {
                  normal: path.resolve(__dirname, '../fonts/Roboto-Regular.ttf'),
                  bold: path.resolve(__dirname, '../fonts/Roboto-Medium.ttf'),
                  italics: path.resolve(__dirname, '../fonts/Roboto-Italic.ttf'),
                  bolditalics: path.resolve(__dirname, '../fonts/Roboto-MediumItalic.ttf')
                }
              };

              console.log(process.cwd());
              
              const printer = new PdfPrinter(fonts);
          
              const bodyData = [];
              bodyData.push(['CODIGO', 'NOMBRE', 'EXISTENCIAS', 'CONTENIDO', 'GENERAL', 'COSTO', 'VALOR']);
          
              for(const category of (categoriesData || [])) {
                bodyData.push([
                  '',
                  { text: category?.name || '', bold: true, decoration: 'underline' },
                  '',
                  '',
                  '',
                  '',
                  ''
                ]);
                for(const product of (productsData || []).filter(x => x.productCategoryId === category.id)) {
                  bodyData.push([
                    product?.productId || 0,
                    product?.productName || '',
                    product?.currentLocationStock || 0,
                    product?.packageContent || 0,
                    ((+product?.currentLocationStock || 0) / (+product?.packageContent || 0)).toFixed(2),
                    product?.productCost || 0,
                    ((+product?.currentLocationStock || 0) * (+product?.productCost || 0)).toFixed(2)
                  ]);
                }
              }
          
              const docDefinition = {
                header: function(currentPage, pageCount, pageSize) {
                  // Podemos tener hasta cuatro líneas de encabezado de página
                  return [
                    { text: 'Reporte de Productos por Categoría', alignment: 'left', margin: [40, 30, 40, 0] },
                    { text: 'Todo Para Cake', alignment: 'left', margin: [40, 0, 40, 0] }
                    // { text: 'Reporte de Productos por Categoría', alignment: 'left', margin: [40, 0, 40, 0] },
                    // { text: 'Reporte de Productos por Categoría', alignment: 'left', margin: [40, 0, 40, 0] }
                  ]
                },
                footer: function(currentPage, pageCount) {
                  // Podemos tener hasta cuatro líneas de pie de página
                  return [
                    { text: `Sistema de Información Gerencial SigProCOM`, alignment: 'right', margin: [40, 0, 40, 0] },
                    { text: `${currentPage.toString()} de ${pageCount}`, alignment: 'right', margin: [40, 0, 40, 0] }
                    // { text: `${currentPage.toString()} de ${pageCount}`, alignment: 'right', margin: [40, 0, 40, 0] },
                    // { text: `${currentPage.toString()} de ${pageCount}`, alignment: 'right', margin: [40, 0, 40, 0] }
                  ]
                },
                content: [
                  {
                    layout: 'headerLineOnly', // optional
                    table: {
                      // Los encabezados se muestran automáticamente en todas las páginas en las que se extienda la tabla
                      // Puedes definir el número de filas que serán tratadas como encabezados de la tabla
                      headerRows: 1,
                      widths: ['10%', '40%', '10%', '10%', '10%', '10%', '10%'],
                      body: bodyData
                    }
                  }
                ],
                defaultStyle: {
                  font: 'Roboto',
                  fontSize: 6
                },
                pageSize: 'LETTER',
                pageMargins: [ 40, 60, 40, 60 ]
              };
              
              const options = {};

              const pdfDoc = printer.createPdfKitDocument(docDefinition, options);

              res.setHeader('Content-Type', 'application/pdf');
              res.setHeader('Content-Disposition', 'attachment; filename=bycategories.pdf');

              pdfDoc.pipe(res);
              pdfDoc.end();
            } catch(error) {
              res.json({ status: 400, message: 'error', errorContent: error });
            }
          });
        }
      );
    });
  });
}

controller.getLocationProductsByBrand = (req, res) => {
  let result = [];

  req.getConnection((error, conn) => {
    if (error) 
      res.status(500).json(errorResponses.status500(error));

    conn.beginTransaction((transactionError) => {
      if (transactionError) res.status(500).json(errorResponses.status500(error));

      const { locationId } = req.params;

      conn.query(
        queries.getLocationProductsByBrand,
        [ locationId ],
        (queryError, queryRows) => {
          if (queryError)
            conn.rollback(() => res.status(500).json(errorResponses.status500(queryError)));

          result = queryRows;

          conn.commit((commitError) => {
            if (commitError) conn.rollback(() => { res.status(500).json(errorResponses.status500(queryError)); });

            try {
              const brandsData = result[0];
              const productsData = result[1];

              const fonts = {
                // Roboto: {
                //   normal: process.cwd() + '/src/fonts/Roboto-Regular.ttf',
                //   bold: process.cwd() + '/src/fonts/Roboto-Medium.ttf',
                //   italics: process.cwd() + '/src/fonts/Roboto-Italic.ttf',
                //   bolditalics: process.cwd() + '/src/fonts/Roboto-MediumItalic.ttf'
                // },
                Roboto: {
                  normal: path.resolve(__dirname, '../fonts/Roboto-Regular.ttf'),
                  bold: path.resolve(__dirname, '../fonts/Roboto-Medium.ttf'),
                  italics: path.resolve(__dirname, '../fonts/Roboto-Italic.ttf'),
                  bolditalics: path.resolve(__dirname, '../fonts/Roboto-MediumItalic.ttf')
                }
              };

              const printer = new PdfPrinter(fonts);
          
              const bodyData = [];
              bodyData.push(['CODIGO', 'NOMBRE', 'EXISTENCIAS', 'CONTENIDO', 'GENERAL', 'COSTO', 'VALOR']);
          
              for(const brand of (brandsData || [])) {
                bodyData.push([
                  '',
                  { text: brand?.name || '', bold: true, decoration: 'underline' },
                  '',
                  '',
                  '',
                  '',
                  ''
                ]);
                for(const product of (productsData || []).filter(x => x.productBrandId === brand.id)) {
                  bodyData.push([
                    product?.productId || 0,
                    product?.productName || '',
                    product?.currentLocationStock || 0,
                    product?.packageContent || 0,
                    ((+product?.currentLocationStock || 0) / (+product?.packageContent || 0)).toFixed(2),
                    product?.productCost || 0,
                    ((+product?.currentLocationStock || 0) * (+product?.productCost || 0)).toFixed(2)
                  ]);
                }
              }
          
              const docDefinition = {
                header: function(currentPage, pageCount, pageSize) {
                  // Podemos tener hasta cuatro líneas de encabezado de página
                  return [
                    { text: 'Reporte de Productos por Marca', alignment: 'left', margin: [40, 30, 40, 0] },
                    { text: 'Todo Para Cake', alignment: 'left', margin: [40, 0, 40, 0] }
                    // { text: 'Reporte de Productos por Categoría', alignment: 'left', margin: [40, 0, 40, 0] },
                    // { text: 'Reporte de Productos por Categoría', alignment: 'left', margin: [40, 0, 40, 0] }
                  ]
                },
                footer: function(currentPage, pageCount) {
                  // Podemos tener hasta cuatro líneas de pie de página
                  return [
                    { text: `Sistema de Información Gerencial SigProCOM`, alignment: 'right', margin: [40, 0, 40, 0] },
                    { text: `${currentPage.toString()} de ${pageCount}`, alignment: 'right', margin: [40, 0, 40, 0] }
                    // { text: `${currentPage.toString()} de ${pageCount}`, alignment: 'right', margin: [40, 0, 40, 0] },
                    // { text: `${currentPage.toString()} de ${pageCount}`, alignment: 'right', margin: [40, 0, 40, 0] }
                  ]
                },
                content: [
                  {
                    layout: 'headerLineOnly', // optional
                    table: {
                      // Los encabezados se muestran automáticamente en todas las páginas en las que se extienda la tabla
                      // Puedes definir el número de filas que serán tratadas como encabezados de la tabla
                      headerRows: 1,
                      widths: ['10%', '40%', '10%', '10%', '10%', '10%', '10%'],
                      body: bodyData
                    }
                  }
                ],
                defaultStyle: {
                  font: 'Roboto',
                  fontSize: 6
                },
                pageSize: 'LETTER',
                pageMargins: [ 40, 60, 40, 60 ]
              };
              
              const options = {};

              const pdfDoc = printer.createPdfKitDocument(docDefinition, options);

              res.setHeader('Content-Type', 'application/pdf');
              res.setHeader('Content-Disposition', 'attachment; filename=bycategories.pdf');

              pdfDoc.pipe(res);
              pdfDoc.end();
            } catch(error) {
              res.json({ status: 400, message: 'error', errorContent: error });
            }
          });
        }
      );
    });
  });
}

controller.getLocationProductsByFilteredData = (req, res) => {
  try {
    const { productsData } = req.body;

    const fonts = {
      Roboto: {
        normal: path.resolve(__dirname, '../fonts/Roboto-Regular.ttf'),
        bold: path.resolve(__dirname, '../fonts/Roboto-Medium.ttf'),
        italics: path.resolve(__dirname, '../fonts/Roboto-Italic.ttf'),
        bolditalics: path.resolve(__dirname, '../fonts/Roboto-MediumItalic.ttf')
      }
    };

    console.log(process.cwd());
    
    const printer = new PdfPrinter(fonts);

    const bodyData = [];
    bodyData.push(['CODIGO', 'NOMBRE', 'EXISTENCIAS', 'CONTENIDO', 'GENERAL', 'COSTO', 'VALOR']);

    for(const product of (productsData || [])) {
      bodyData.push([
        product?.productId || 0,
        product?.productName || '',
        product?.currentLocationStock || 0,
        product?.packageContent || 0,
        ((+product?.currentLocationStock || 0) / (+product?.packageContent || 0)).toFixed(2),
        product?.productCost || 0,
        ((+product?.currentLocationStock || 0) * (+product?.productCost || 0)).toFixed(2)
      ]);
    }

    const docDefinition = {
      header: function(currentPage, pageCount, pageSize) {
        // Podemos tener hasta cuatro líneas de encabezado de página
        return [
          { text: 'Reporte de Productos (Filtro Personalizado)', alignment: 'left', margin: [40, 30, 40, 0] },
          { text: 'Todo Para Cake', alignment: 'left', margin: [40, 0, 40, 0] }
          // { text: 'Reporte de Productos por Categoría', alignment: 'left', margin: [40, 0, 40, 0] },
          // { text: 'Reporte de Productos por Categoría', alignment: 'left', margin: [40, 0, 40, 0] }
        ]
      },
      footer: function(currentPage, pageCount) {
        // Podemos tener hasta cuatro líneas de pie de página
        return [
          { text: `Sistema de Información Gerencial SigProCOM`, alignment: 'right', margin: [40, 0, 40, 0] },
          { text: `${currentPage.toString()} de ${pageCount}`, alignment: 'right', margin: [40, 0, 40, 0] }
          // { text: `${currentPage.toString()} de ${pageCount}`, alignment: 'right', margin: [40, 0, 40, 0] },
          // { text: `${currentPage.toString()} de ${pageCount}`, alignment: 'right', margin: [40, 0, 40, 0] }
        ]
      },
      content: [
        {
          layout: 'headerLineOnly', // optional
          table: {
            // Los encabezados se muestran automáticamente en todas las páginas en las que se extienda la tabla
            // Puedes definir el número de filas que serán tratadas como encabezados de la tabla
            headerRows: 1,
            widths: ['10%', '40%', '10%', '10%', '10%', '10%', '10%'],
            body: bodyData
          }
        }
      ],
      defaultStyle: {
        font: 'Roboto',
        fontSize: 6
      },
      pageSize: 'LETTER',
      pageMargins: [ 40, 60, 40, 60 ]
    };
    
    const options = {};

    const pdfDoc = printer.createPdfKitDocument(docDefinition, options);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=bycategories.pdf');

    pdfDoc.pipe(res);
    pdfDoc.end();
  } catch(error) {
    res.json({ status: 400, message: 'error', errorContent: error });
  }
}

controller.shiftcutSettlement = (req, res) => {
  let result = [];

  req.getConnection((error, conn) => {
    if (error) 
      res.status(500).json(errorResponses.status500(error));

    conn.beginTransaction((transactionError) => {
      if (transactionError) res.status(500).json(errorResponses.status500(error));

      const { shiftcutId } = req.params;

      conn.query(
        queries.shiftcutSettlement,
        [ shiftcutId, shiftcutId, shiftcutId, shiftcutId, shiftcutId ],
        (queryError, queryRows) => {
          if (queryError)
            conn.rollback(() => res.status(500).json(errorResponses.status500(queryError)));

          result = queryRows;

          conn.commit((commitError) => {
            if (commitError) conn.rollback(() => { res.status(500).json(errorResponses.status500(queryError)); });

            try {
              // console.log(result[0]);
              /*
                [
                  {
                    id: 94,
                    isHeader: 0,
                    isFooter: 0,
                    saleId: 402,
                    docNumber: '',
                    documentTypeId: 2,
                    documentTypeName: '',
                    paymentTypeName: '',
                    customerId: 3735,
                    productId: 2910,
                    customerFullname: '',
                    productName: 'HARINA FUERTE - DEL PANADERO ',
                    totalSale: '24.00',
                    cashSale: '0.00',
                    creditSale: '24.00',
                    document: ' '
                  }
                ]
              */
              // console.log(result[2]);
              /*
              [
                {
                  movementType: 'Efectivo Inicial',
                  descrip: '',
                  totalAmount: '100.0000000000'
                }
              ]
              */
              // console.log(result[4]);
              /*
                [
                  {
                    paymentId: null,
                    docDatetime: null,
                    registeredByFullname: '',
                    saleId: null,
                    docNumber: null,
                    documentTypeId: null,
                    documentTypeName: null,
                    document: null,
                    customerId: null,
                    customerFullname: 'TOTAL',
                    totalPaid: null
                  }
                ]
              */

              const shiftcutData = result[0];
              const salesReportData = result[1];
              const summaryData = result[3];
              const paymentsData = result[5];
              const movementsData = result[7];

              const fonts = {
                Roboto: {
                  normal: path.resolve(__dirname, '../fonts/Roboto-Regular.ttf'),
                  bold: path.resolve(__dirname, '../fonts/Roboto-Medium.ttf'),
                  italics: path.resolve(__dirname, '../fonts/Roboto-Italic.ttf'),
                  bolditalics: path.resolve(__dirname, '../fonts/Roboto-MediumItalic.ttf')
                }
              };

              // console.log(process.cwd());
              
              const printer = new PdfPrinter(fonts);
          
              const summaryBodyData = [];
              summaryBodyData.push(['CONCEPTO', { text: 'MONTO' || '', bold: false, alignment: 'right' }]);
          
              const salesReportBodyData = [];
              salesReportBodyData.push(['DOCUMENTO', 'TIPO', 'CLIENTE', 'DESCRIPCIÓN', { text: 'MONTO' || '', bold: false, alignment: 'right' }]);

              const paymentsBodyData = [];
              paymentsBodyData.push(['REGISTRADO POR', 'DOCUMENTO', 'CLIENTE', { text: 'MONTO' || '', bold: false, alignment: 'right' }]);

              const movementsBodyData = [];
              movementsBodyData.push([
                'OPERACION',
                'POR',
                'RAZON',
                { text: 'ANTERIOR' || '', bold: false, alignment: 'right' },
                { text: 'MONTO' || '', bold: false, alignment: 'right' },
                { text: 'SALDO' || '', bold: false, alignment: 'right' }
              ]);
              
              let saleReportTotalSaleAmount = 0;
              for(const sale of (salesReportData || [])) {
                if (sale.saleId === null) {
                  saleReportTotalSaleAmount += +sale?.totalSale;
                }
                salesReportBodyData.push([
                  { text: sale?.document || '', bold: false },
                  { text: sale?.paymentTypeName || '', bold: false },
                  { text: sale?.customerFullname || '', bold: false },
                  { text: sale?.productName || '', bold: false },
                  { text: sale?.totalSale || '', bold: false, alignment: 'right' }
                ]);
              }

              salesReportBodyData.push([
                { text: '', bold: false },
                { text: '', bold: false },
                { text: '', bold: false },
                { text: 'TOTAL GENERAL', bold: false },
                { text: Number(saleReportTotalSaleAmount).toFixed(2) || '', bold: false, alignment: 'right' }
              ]);

              for(const concept of (summaryData || [])) {
                summaryBodyData.push([
                  { text: concept?.movementType || '', bold: false },
                  { text: Number(concept?.totalAmount).toFixed(2) || '', bold: false, alignment: 'right' }
                ]);
              }

              for(const payment of (paymentsData || [])) {
                paymentsBodyData.push([
                  { text: payment?.registeredByFullname || '', bold: false },
                  { text: payment?.document || '', bold: false },
                  { text: payment?.customerFullname || '', bold: false },
                  { text: Number(payment?.totalPaid).toFixed(2) || '', bold: false, alignment: 'right' }
                ]);
              }

              for(const movement of (movementsData || [])) {
                movementsBodyData.push([
                  { text: movement?.movementTypeName || '', bold: false },
                  { text: movement?.userPINCodeFullname || '', bold: false },
                  { text: movement?.comments || '', bold: false },
                  { text: Number(movement?.prevAmount).toFixed(2) || '', bold: false, alignment: 'right' },
                  { text: Number(movement?.amount).toFixed(2) || '', bold: false, alignment: 'right' },
                  { text: Number(movement?.newAmount).toFixed(2) || '', bold: false, alignment: 'right' }
                ]);
              }
          
              const docDefinition = {
                header: function(currentPage, pageCount, pageSize) {
                  // Podemos tener hasta cuatro líneas de encabezado de página
                  return [
                    { text: 'Reporte de Cierre de Caja', fontSize: 16, alignment: 'left', margin: [40, 30, 40, 0] },
                    { text: 'Todo Para Cake', alignment: 'left', margin: [40, 0, 40, 0] }
                    // { text: 'Reporte de Productos por Categoría', alignment: 'left', margin: [40, 0, 40, 0] },
                    // { text: 'Reporte de Productos por Categoría', alignment: 'left', margin: [40, 0, 40, 0] }
                  ]
                },
                footer: function(currentPage, pageCount) {
                  // Podemos tener hasta cuatro líneas de pie de página
                  return [
                    { text: `Sistema de Información Gerencial SigProCOM`, alignment: 'right', margin: [40, 0, 40, 0] },
                    { text: `${currentPage.toString()} de ${pageCount}`, alignment: 'right', margin: [40, 0, 40, 0] }
                    // { text: `${currentPage.toString()} de ${pageCount}`, alignment: 'right', margin: [40, 0, 40, 0] },
                    // { text: `${currentPage.toString()} de ${pageCount}`, alignment: 'right', margin: [40, 0, 40, 0] }
                  ]
                },
                content: [
                  { text: 'Información de cierre', fontSize: 13 },
                  { text: `${shiftcutData[0]?.cashierName} - Turno #${shiftcutData[0]?.shiftcutNumber}` },
                  { text: `Apertura`, bold: true },
                  { text: `${shiftcutData[0]?.openedAt} por ${shiftcutData[0]?.openedByFullname}` },
                  { text: `Cierre`, bold: true },
                  { text: `${shiftcutData[0]?.closedAt} por ${shiftcutData[0]?.closedByFullname}` },
                  { text: '-', fontSize: 13 },
                  { text: 'Resumen de caja', fontSize: 13 },
                  {
                    layout: 'headerLineOnly', // optional
                    table: {
                      // Los encabezados se muestran automáticamente en todas las páginas en las que se extienda la tabla
                      // Puedes definir el número de filas que serán tratadas como encabezados de la tabla
                      headerRows: 1,
                      widths: ['25%', '25%'],
                      body: [
                        ...summaryBodyData,
                        [
                          { text: 'Caja Chica Final', bold: false },
                          { text: Number(shiftcutData[0]?.cashFunds).toFixed(2) || '', bold: false, alignment: 'right' }
                        ],
                        [
                          { text: 'Efectivo Total Final', bold: false },
                          { text: Number(shiftcutData[0]?.finalAmount).toFixed(2) || '', bold: false, alignment: 'right' }
                        ],
                        [
                          { text: 'Efectivo a entregar', bold: false },
                          { text: Number(+shiftcutData[0]?.finalAmount - +shiftcutData[0]?.initialAmount - +shiftcutData[0]?.cashFunds).toFixed(2) || '', bold: false, alignment: 'right' }
                        ],
                        [
                          { text: 'Efectivo entregado', bold: false },
                          { text: Number(shiftcutData[0]?.remittedAmount).toFixed(2) || '', bold: false, alignment: 'right' }
                        ],
                        [
                          { text: 'Diferencia', bold: false },
                          { text: Number(+shiftcutData[0]?.remittedAmount - (+shiftcutData[0]?.finalAmount - +shiftcutData[0]?.initialAmount - +shiftcutData[0]?.cashFunds)).toFixed(2) || '', bold: false, alignment: 'right' }
                        ]
                      ]
                    }
                  },
                  { text: '-', fontSize: 13 },
                  { text: 'Resumen de ventas', fontSize: 13 },
                  {
                    layout: 'headerLineOnly', // optional
                    table: {
                      // Los encabezados se muestran automáticamente en todas las páginas en las que se extienda la tabla
                      // Puedes definir el número de filas que serán tratadas como encabezados de la tabla
                      headerRows: 1,
                      widths: ['10%', '10%', '30%', '40%', '10%'],
                      body: salesReportBodyData
                    }
                  },
                  { text: '-', fontSize: 13 },
                  { text: 'Resumen de abonos', fontSize: 13 },
                  {
                    layout: 'headerLineOnly', // optional
                    table: {
                      // Los encabezados se muestran automáticamente en todas las páginas en las que se extienda la tabla
                      // Puedes definir el número de filas que serán tratadas como encabezados de la tabla
                      headerRows: 1,
                      widths: ['20%', '20%', '40%', '20%'],
                      body: paymentsBodyData
                    }
                  },
                  { text: '-', fontSize: 13 },
                  { text: 'Movimientos de Caja Chica', fontSize: 13 },
                  {
                    layout: 'headerLineOnly', // optional
                    table: {
                      // Los encabezados se muestran automáticamente en todas las páginas en las que se extienda la tabla
                      // Puedes definir el número de filas que serán tratadas como encabezados de la tabla
                      headerRows: 1,
                      widths: ['10%', '20%', '40%', '10%', '10%', '10%'],
                      body: movementsBodyData
                    }
                  }
                ],
                defaultStyle: {
                  font: 'Roboto',
                  fontSize: 6
                },
                pageSize: 'LETTER',
                pageMargins: [ 40, 60, 40, 60 ]
              };
              
              const options = {};

              const pdfDoc = printer.createPdfKitDocument(docDefinition, options);

              res.setHeader('Content-Type', 'application/pdf');
              res.setHeader('Content-Disposition', 'attachment; filename=shiftcutsettlement.pdf');

              pdfDoc.pipe(res);
              pdfDoc.end();
            } catch(error) {
              res.json({ status: 400, message: 'error', errorContent: error });
            }
          });
        }
      );
    });
  });
}

controller.getMainDashboardData = (req, res) => {
  const { startDate, endDate } = req.params;
  req.getConnection(connUtil.connFunc(queries.getMainDashboardData, [ startDate || '2024-01-01', endDate || '2024-01-01' ], res));
}

controller.getCashierLocationSalesByMonth = (req, res) => {
  const { locationId, cashierId, documentTypeId, month } = req.params;
  req.getConnection(
    connUtil.connFunc(
      queries.getCashierLocationSalesByMonth, 
      [ locationId || 0, cashierId || 0, documentTypeId || 0, month ], 
      res
    )
  );
}

controller.getMonthlyFinalConsumerSaleBook = (req, res) => {
  const { locationId, month } = req.params;
  req.getConnection(
    connUtil.connFunc(
      queries.getMonthlyFinalConsumerSaleBook, 
      [ locationId || 0, month || '2000-01' ], 
      res
    )
  );
}

controller.getMonthlyTaxPayerSaleBook = (req, res) => {
  const { locationId, month } = req.params;
  req.getConnection(
    connUtil.connFunc(
      queries.getMonthlyTaxPayerSaleBook, 
      [ locationId || 0, month || '2000-01' ], 
      res
    )
  );
}

controller.getMonthlyPurchasesBook = (req, res) => {
  const { locationId, month } = req.params;
  req.getConnection(
    connUtil.connFunc(
      queries.getMonthlyPurchasesBook, 
      [ locationId || 0, month || '2000-01' ], 
      res
    )
  );
}

controller.getMonthlyFinalConsumerSaleBookPDF = (req, res) => {
  req.getConnection((error, conn) => {
    if (error) 
      res.status(500).json(errorResponses.status500(error));

    conn.beginTransaction((transactionError) => {
      if (transactionError) res.status(500).json(errorResponses.status500(error));

      const { locationId, month } = req.params;

      conn.query(
        queries.getMonthlyFinalConsumerSaleBook,
        [ locationId || 0, month || '2000-01' ],
        (queryError, queryRows) => {
          if (queryError)
            conn.rollback(() => res.status(500).json(errorResponses.status500(queryError)));

          let result = queryRows;

          conn.commit((commitError) => {
            if (commitError) conn.rollback(() => { res.status(500).json(errorResponses.status500(queryError)); });

            try {
              const fonts = {
                Roboto: {
                  normal: path.resolve(__dirname, '../fonts/Roboto-Regular.ttf'),
                  bold: path.resolve(__dirname, '../fonts/Roboto-Medium.ttf'),
                  italics: path.resolve(__dirname, '../fonts/Roboto-Italic.ttf'),
                  bolditalics: path.resolve(__dirname, '../fonts/Roboto-MediumItalic.ttf')
                }
              };

              const printer = new PdfPrinter(fonts);

              const getDataSumByProperty = (propertyName) => {
                let total = 0;
                for (const value of result) {
                  total += +(value?.[propertyName] || 0)
                }
                return total.toFixed(2);
              }

              const tableData = [];

              tableData.push([
                { text: 'DIA' || '', bold: false, alignment: 'left' },
                { text: 'DEL No' || '', bold: false, alignment: 'left' },
                { text: 'AL No' || '', bold: false, alignment: 'left' },
                { text: 'No CAJA O SISTEMAS COMPUTARIZADO' || '', bold: false, alignment: 'left' },
                { text: 'EXENTAS' || '', bold: false, alignment: 'right' },
                { text: 'GRAVADAS' || '', bold: false, alignment: 'right' },
                { text: 'EXPORTACIONES' || '', bold: false, alignment: 'right' },
                { text: 'TOTAL VENTAS DIARIAS PROPIAS' || '', bold: false, alignment: 'right' },
                { text: 'VENTAS A CUENTA DE TERCEROS' || '', bold: false, alignment: 'right' },
                { text: 'IVA RETENIDO' || '', bold: false, alignment: 'right' }
              ]);
              
              for(const element of (result || [])) {
                tableData.push([
                  { text: element?.reportDay || '', bold: false },
                  { text: element?.documentNumberFrom || '', bold: false },
                  { text: element?.documentNumberTo || '', bold: false },
                  { text: element?.cashierId || '', bold: false },
                  { text: element?.noTaxableSubTotal || '', bold: false, alignment: 'right' },
                  { text: element?.taxableSubTotal || '', bold: false, alignment: 'right' },
                  { text: element?.exportations || '', bold: false, alignment: 'right' },
                  { text: element?.total || '', bold: false, alignment: 'right' },
                  { text: element?.totalToThirdAccounts || '', bold: false, alignment: 'right' },
                  { text: element?.IVARetention || '', bold: false, alignment: 'right' }
                ]);
              }

              tableData.push([
                { text: 'TOTALES', bold: false },
                { text: '', bold: false },
                { text: '', bold: false },
                { text: '', bold: false },
                { text: getDataSumByProperty('noTaxableSubTotal'), bold: false, alignment: 'right' },
                { text: getDataSumByProperty('taxableSubTotal'), bold: false, alignment: 'right' },
                { text: getDataSumByProperty('exportations'), bold: false, alignment: 'right' },
                { text: getDataSumByProperty('total'), bold: false, alignment: 'right' },
                { text: getDataSumByProperty('totalToThirdAccounts'), bold: false, alignment: 'right' },
                { text: getDataSumByProperty('IVARetention'), bold: false, alignment: 'right' }
              ]);

              const docDefinition = {
                pageOrientation: 'portrait',
                header: function(currentPage, pageCount, pageSize) {
                  // Podemos tener hasta cuatro líneas de encabezado de página
                  // return [
                  //   {
                  //     columns: [
                  //       {
                  //         // auto-sized columns have their widths based on their content
                  //         width: '50%',
                  //         stack: [
                  //           { text: `Hoja de traslado #${transferHeader?.transferId}`, fontSize: 13, alignment: 'center'},
                  //           { text: 'Copia para repartidor', fontSize: 11, alignment: 'center' }
                  //         ]
                  //       },
                  //       {
                  //         // auto-sized columns have their widths based on their content
                  //         width: '50%',
                  //         stack: [
                  //           { text: `Hoja de traslado #${transferHeader?.transferId}`, fontSize: 13, alignment: 'center' },
                  //           { text: 'Copia para encargado de sala', fontSize: 11, alignment: 'center' }
                  //         ]
                  //       }
                  //     ],
                  //     // optional space between columns
                  //     columnGap: 10,
                  //     margin: [40, 30, 40, 0]
                  //   }
                  // ]
                },
                footer: function(currentPage, pageCount) {
                  // Podemos tener hasta cuatro líneas de pie de página
                  return [
                    { text: `Libro de Ventas ${stringHelpers.capitalizeWord(dayjs(month).format('MMMM YYYY'))}`, alignment: 'right', margin: [40, 0, 40, 0] },
                    { text: `Pagina ${currentPage.toString()} de ${pageCount}`, alignment: 'right', margin: [40, 0, 40, 0] }
                    // { text: `${currentPage.toString()} de ${pageCount}`, alignment: 'right', margin: [40, 0, 40, 0] },
                    // { text: `${currentPage.toString()} de ${pageCount}`, alignment: 'right', margin: [40, 0, 40, 0] }
                  ]
                },
                content: [
                  {
                    text: `EMPRESA:`,
                    fontSize: 10
                  },
                  {
                    text: `LIBRO O REGISTRO DE OPERACIONES DE VENTA A CONSUMIDORES (Art. 141 C.T. y 83 de R.C.T.)`,
                    fontSize: 12
                  },
                  {
                    text: `NOMBRE DEL CONTRIBUYENTE: `,
                    fontSize: 10
                  },
                  {
                    columns: [
                      {
                        width: '33%',
                        text: `MES: ${stringHelpers.capitalizeWord(dayjs(month).format('MMMM'))}`,
                        fontSize: 10
                      },
                      {
                        width: '33%',
                        text: `AÑO: ${dayjs(month).format('YYYY')}`,
                        fontSize: 10
                      },
                      {
                        width: '34%',
                        text: `NRC:`,
                        fontSize: 10
                      }
                    ]
                  },
                  {
                    text: ``,
                    fontSize: 10,
                    margin: [ 0, 5, 0, 0 ]
                  },
                  {
                    layout: 'noBorders', // optional
                    table: {
                      headerRows: 1,
                      widths: ['10%', '20%', '10%', '10%', '10%', '10%', '10%', '10%', '10%'],
                      body: [[
                        { text: '' },
                        { text: 'DOCUMENTOS EMITIDOS' },
                        { text: '' },
                        { text: '' },
                        { text: '' },
                        { text: '' },
                        { text: '' },
                        { text: '' },
                        { text: '' }
                      ]]
                    }
                  },
                  {
                    layout: 'lightHorizontalLines', // optional
                    table: {
                      headerRows: 1,
                      widths: ['10%', '10%', '10%', '10%', '10%', '10%', '10%', '10%', '10%', '10%'],
                      body: tableData
                    }
                  },
                  {
                    text: ``,
                    fontSize: 10,
                    margin: [ 0, 5, 0, 0 ]
                  },
                  {
                    columns: [
                      {
                        width: '20%',
                        text: `VENTA NETA:`
                      },
                      {
                        width: '20%',
                        text: `${(getDataSumByProperty('total') - getDataSumByProperty('totalTaxes')).toFixed(2)}`,
                        alignment: 'right'
                      },
                      {
                        width: '60%',
                        text: ``
                      }
                    ]
                  },
                  {
                    columns: [
                      {
                        width: '20%',
                        text: `DEBITO FISCAL:`
                      },
                      {
                        width: '20%',
                        text: `${(getDataSumByProperty('totalTaxes'))}`,
                        alignment: 'right'
                      },
                      {
                        width: '60%',
                        text: ``
                      }
                    ]
                  },
                  {
                    columns: [
                      {
                        width: '20%',
                        text: `VENTA TOTAL:`
                      },
                      {
                        width: '20%',
                        text: `${(getDataSumByProperty('total'))}`,
                        alignment: 'right'
                      },
                      {
                        width: '60%',
                        text: ``
                      }
                    ]
                  },
                  {
                    text: 'Firma Contribuyente o Contador: __________________________________________',
                    alignment: 'right',
                    margin: [ 0, 5, 0, 0 ]
                  },
                ],
                defaultStyle: {
                  font: 'Roboto',
                  fontSize: 6
                },
                pageSize: 'LETTER',
                pageMargins: [ 40, 60, 40, 60 ]
              };
              
              const options = {};

              const pdfDoc = printer.createPdfKitDocument(docDefinition, options);

              res.setHeader('Content-Type', 'application/pdf');
              res.setHeader('Content-Disposition', 'attachment; filename=transfersheet.pdf');

              pdfDoc.pipe(res);
              pdfDoc.end();
            } catch(error) {
              console.log(error);
              res.json({ status: 400, message: 'error', errorContent: error });
            }
          });
        }
      );
    });
  });
}

controller.getMonthlyTaxPayerSaleBookPDF = (req, res) => {
  req.getConnection((error, conn) => {
    if (error) 
      res.status(500).json(errorResponses.status500(error));

    conn.beginTransaction((transactionError) => {
      if (transactionError) res.status(500).json(errorResponses.status500(error));

      const { locationId, month } = req.params;

      conn.query(
        queries.getMonthlyTaxPayerSaleBook,
        [ locationId || 0, month || '2000-01' ],
        (queryError, queryRows) => {
          if (queryError)
            conn.rollback(() => res.status(500).json(errorResponses.status500(queryError)));

          let result = queryRows;

          conn.commit((commitError) => {
            if (commitError) conn.rollback(() => { res.status(500).json(errorResponses.status500(queryError)); });

            try {
              const fonts = {
                Roboto: {
                  normal: path.resolve(__dirname, '../fonts/Roboto-Regular.ttf'),
                  bold: path.resolve(__dirname, '../fonts/Roboto-Medium.ttf'),
                  italics: path.resolve(__dirname, '../fonts/Roboto-Italic.ttf'),
                  bolditalics: path.resolve(__dirname, '../fonts/Roboto-MediumItalic.ttf')
                }
              };

              const printer = new PdfPrinter(fonts);

              const getDataSumByProperty = (propertyName) => {
                let total = 0;
                for (const value of result) {
                  total += +(value?.[propertyName] || 0)
                }
                return total.toFixed(2);
              }

              const tableData = [];

              tableData.push([
                { text: 'CORRELATIVO' || '', bold: false, alignment: 'left' },
                { text: 'FECHA DE EMISION' || '', bold: false, alignment: 'left' },
                { text: 'NO DE FACTURA' || '', bold: false, alignment: 'left' },
                { text: 'CONTROL FORMULARIO UNICO' || '', bold: false, alignment: 'left' },
                { text: 'NOMBRE CONTRIBUYENTE' || '', bold: false, alignment: 'left' },
                { text: 'NRC' || '', bold: false, alignment: 'left' },
                { text: 'EXENTAS' || '', bold: false, alignment: 'right' },
                { text: 'GRAVADAS' || '', bold: false, alignment: 'right' },
                { text: 'DEBITO FISCAL' || '', bold: false, alignment: 'right' },
                { text: 'EXENTAS' || '', bold: false, alignment: 'right' },
                { text: 'GRAVADAS' || '', bold: false, alignment: 'right' },
                { text: 'DEBITO FISCAL' || '', bold: false, alignment: 'right' },
                { text: 'IMPUESTO RETENIDO' || '', bold: false, alignment: 'right' },
                { text: 'VENTAS TOTALES' || '', bold: false, alignment: 'right' }
              ]);
              
              for(const element of (result || [])) {
                tableData.push([
                  { text: element?.rowNum || '', bold: false },
                  { text: element?.reportDay || '', bold: false },
                  { text: element?.documentNumber || '', bold: false },
                  { text: element?.formUniqueController || '', bold: false },
                  { text: element?.customerFullname || '', bold: false },
                  { text: element?.customerNrc || '', bold: false },
                  { text: element?.noTaxableSubTotal || '', bold: false, alignment: 'right' },
                  { text: element?.taxableSubTotalWithoutTaxes || '', bold: false, alignment: 'right' },
                  { text: element?.totalTaxes || '', bold: false, alignment: 'right' },
                  { text: element?.thirdNoTaxableSubTotal || '', bold: false, alignment: 'right' },
                  { text: element?.thirdTaxableSubTotalWithoutTaxes || '', bold: false, alignment: 'right' },
                  { text: element?.thirdTotalTaxes || '', bold: false, alignment: 'right' },
                  { text: element?.IVARetention || '', bold: false, alignment: 'right' },
                  { text: element?.total || '', bold: false, alignment: 'right' }
                ]);
              }

              tableData.push([
                { text: 'TOTALES', bold: false },
                { text: '', bold: false },
                { text: '', bold: false },
                { text: '', bold: false },
                { text: '', bold: false },
                { text: '', bold: false },
                { text: getDataSumByProperty('noTaxableSubTotal'), bold: false, alignment: 'right' },
                { text: getDataSumByProperty('taxableSubTotalWithoutTaxes'), bold: false, alignment: 'right' },
                { text: getDataSumByProperty('totalTaxes'), bold: false, alignment: 'right' },
                { text: getDataSumByProperty('thirdNoTaxableSubTotal'), bold: false, alignment: 'right' },
                { text: getDataSumByProperty('thirdTaxableSubTotalWithoutTaxes'), bold: false, alignment: 'right' },
                { text: getDataSumByProperty('thirdTotalTaxes'), bold: false, alignment: 'right' },
                { text: getDataSumByProperty('IVARetention'), bold: false, alignment: 'right' },
                { text: getDataSumByProperty('total'), bold: false, alignment: 'right' }
              ]);

              const docDefinition = {
                pageOrientation: 'landscape',
                header: function(currentPage, pageCount, pageSize) {
                  // Podemos tener hasta cuatro líneas de encabezado de página
                  // return [
                  //   {
                  //     columns: [
                  //       {
                  //         // auto-sized columns have their widths based on their content
                  //         width: '50%',
                  //         stack: [
                  //           { text: `Hoja de traslado #${transferHeader?.transferId}`, fontSize: 13, alignment: 'center'},
                  //           { text: 'Copia para repartidor', fontSize: 11, alignment: 'center' }
                  //         ]
                  //       },
                  //       {
                  //         // auto-sized columns have their widths based on their content
                  //         width: '50%',
                  //         stack: [
                  //           { text: `Hoja de traslado #${transferHeader?.transferId}`, fontSize: 13, alignment: 'center' },
                  //           { text: 'Copia para encargado de sala', fontSize: 11, alignment: 'center' }
                  //         ]
                  //       }
                  //     ],
                  //     // optional space between columns
                  //     columnGap: 10,
                  //     margin: [40, 30, 40, 0]
                  //   }
                  // ]
                },
                footer: function(currentPage, pageCount) {
                  // Podemos tener hasta cuatro líneas de pie de página
                  return [
                    { text: `Libro de Ventas ${stringHelpers.capitalizeWord(dayjs(month).format('MMMM YYYY'))}`, alignment: 'right', margin: [40, 0, 40, 0] },
                    { text: `Pagina ${currentPage.toString()} de ${pageCount}`, alignment: 'right', margin: [40, 0, 40, 0] }
                    // { text: `${currentPage.toString()} de ${pageCount}`, alignment: 'right', margin: [40, 0, 40, 0] },
                    // { text: `${currentPage.toString()} de ${pageCount}`, alignment: 'right', margin: [40, 0, 40, 0] }
                  ]
                },
                content: [
                  {
                    text: `EMPRESA:`,
                    fontSize: 10
                  },
                  {
                    text: `LIBRO O REGISTRO DE OPERACIONES DE VENTAS AL CONTRIBUYENTE (Art.141 C.T. Y 85 R.C.T.)`,
                    fontSize: 12
                  },
                  {
                    text: `NOMBRE DEL CONTRIBUYENTE: `,
                    fontSize: 10
                  },
                  {
                    columns: [
                      {
                        width: '33%',
                        text: `MES: ${stringHelpers.capitalizeWord(dayjs(month).format('MMMM'))}`,
                        fontSize: 10
                      },
                      {
                        width: '33%',
                        text: `AÑO: ${dayjs(month).format('YYYY')}`,
                        fontSize: 10
                      },
                      {
                        width: '34%',
                        text: `NRC:`,
                        fontSize: 10
                      }
                    ]
                  },
                  {
                    text: ``,
                    fontSize: 10,
                    margin: [ 0, 5, 0, 0 ]
                  },
                  {
                    layout: 'noBorders', // optional
                    table: {
                      headerRows: 1,
                      widths: ['6.25%', '6.25%', '6.25%', '6.25%', '18.75%', '6.25%', '18.75%', '18.75%', '6.25%', '6.25%'],
                      body: [[
                        { text: '' },
                        { text: '' },
                        { text: '' },
                        { text: '' },
                        { text: '' },
                        { text: '' },
                        { text: 'PROPIAS' },
                        { text: 'A CUENTAS DE TERCEROS' },
                        { text: '' },
                        { text: '' }
                      ]]
                    }
                  },
                  {
                    layout: 'lightHorizontalLines', // optional
                    table: {
                      headerRows: 1,
                      widths: ['6.25%', '6.25%', '6.25%', '6.25%', '18.75%', '6.25%', '6.25%', '6.25%', '6.25%', '6.25%', '6.25%', '6.25%', '6.25%', '6.25%'],
                      body: tableData
                    }
                  },
                  {
                    text: ``,
                    fontSize: 10,
                    margin: [ 0, 5, 0, 0 ]
                  },
                  {
                    columns: [
                      {
                        width: '20%',
                        text: `VENTA NETA:`
                      },
                      {
                        width: '20%',
                        text: `${(getDataSumByProperty('total') - getDataSumByProperty('totalTaxes')).toFixed(2)}`,
                        alignment: 'right'
                      },
                      {
                        width: '60%',
                        text: ``
                      }
                    ]
                  },
                  {
                    columns: [
                      {
                        width: '20%',
                        text: `DEBITO FISCAL:`
                      },
                      {
                        width: '20%',
                        text: `${(getDataSumByProperty('totalTaxes'))}`,
                        alignment: 'right'
                      },
                      {
                        width: '60%',
                        text: ``
                      }
                    ]
                  },
                  {
                    columns: [
                      {
                        width: '20%',
                        text: `VENTA TOTAL:`
                      },
                      {
                        width: '20%',
                        text: `${(getDataSumByProperty('total'))}`,
                        alignment: 'right'
                      },
                      {
                        width: '60%',
                        text: ``
                      }
                    ]
                  },
                  {
                    text: 'Firma Contribuyente o Contador: __________________________________________',
                    alignment: 'right',
                    margin: [ 0, 5, 0, 0 ]
                  },
                ],
                defaultStyle: {
                  font: 'Roboto',
                  fontSize: 6
                },
                pageSize: 'LETTER',
                pageMargins: [ 40, 60, 40, 60 ]
              };
              
              const options = {};

              const pdfDoc = printer.createPdfKitDocument(docDefinition, options);

              res.setHeader('Content-Type', 'application/pdf');
              res.setHeader('Content-Disposition', 'attachment; filename=transfersheet.pdf');

              pdfDoc.pipe(res);
              pdfDoc.end();
            } catch(error) {
              res.json({ status: 400, message: 'error', errorContent: error });
            }
          });
        }
      );
    });
  });
}

controller.getMonthlyPurchaseBookPDF = (req, res) => {
  req.getConnection((error, conn) => {
    if (error) 
      res.status(500).json(errorResponses.status500(error));

    conn.beginTransaction((transactionError) => {
      if (transactionError) res.status(500).json(errorResponses.status500(error));

      const { locationId, month } = req.params;

      conn.query(
        queries.getMonthlyPurchasesBook,
        [ locationId || 0, month || '2000-01' ],
        (queryError, queryRows) => {
          if (queryError)
            conn.rollback(() => res.status(500).json(errorResponses.status500(queryError)));

          let result = queryRows;

          conn.commit((commitError) => {
            if (commitError) conn.rollback(() => { res.status(500).json(errorResponses.status500(queryError)); });

            try {
              const fonts = {
                Roboto: {
                  normal: path.resolve(__dirname, '../fonts/Roboto-Regular.ttf'),
                  bold: path.resolve(__dirname, '../fonts/Roboto-Medium.ttf'),
                  italics: path.resolve(__dirname, '../fonts/Roboto-Italic.ttf'),
                  bolditalics: path.resolve(__dirname, '../fonts/Roboto-MediumItalic.ttf')
                }
              };

              const printer = new PdfPrinter(fonts);

              const getDataSumByProperty = (propertyName) => {
                let total = 0;
                for (const value of result) {
                  total += +(value?.[propertyName] || 0)
                }
                return total.toFixed(2);
              }

              const tableData = [];

              tableData.push([
                { text: 'CORR' || '', bold: false, alignment: 'left' },
                { text: 'FECHA DE EMISION' || '', bold: false, alignment: 'left' },
                { text: 'NO DE FACTURA' || '', bold: false, alignment: 'left' },
                { text: 'NO DE REGISTRO' || '', bold: false, alignment: 'left' },
                { text: 'NOMBRE PROVEEDOR' || '', bold: false, alignment: 'left' },
                { text: 'INTERNAS' || '', bold: false, alignment: 'right' },
                { text: 'IMPORT.' || '', bold: false, alignment: 'right' },
                { text: 'INTERNAS' || '', bold: false, alignment: 'right' },
                { text: 'IMPORT.' || '', bold: false, alignment: 'right' },
                { text: 'CREDITO FISCAL' || '', bold: false, alignment: 'right' },
                { text: 'TOTAL COMPRAS' || '', bold: false, alignment: 'right' },
                { text: 'RETENCION TERCEROS' || '', bold: false, alignment: 'right' },
                { text: 'COMPRAS A SUJETOS EXCLUIDOS' || '', bold: false, alignment: 'right' }
              ]);
              
              for(const element of (result || [])) {
                tableData.push([
                  { text: element?.rowNum || '', bold: false },
                  { text: element?.reportDay || '', bold: false },
                  { text: element?.documentNumber || '', bold: false },
                  { text: element?.supplierNrc || '', bold: false },
                  { text: element?.supplierName.substring(0, 46) || '', bold: false, fontSize: 5 },
                  { text: element?.noTaxableSubTotal || '', bold: false, alignment: 'right' },
                  { text: element?.noTaxableSubTotalImport || 0, bold: false, alignment: 'right' },
                  { text: element?.taxableSubTotal || '', bold: false, alignment: 'right' },
                  { text: element?.taxableSubTotalImport || 0, bold: false, alignment: 'right' },
                  { text: element?.totalTaxes || '', bold: false, alignment: 'right' },
                  { text: element?.total || '', bold: false, alignment: 'right' },
                  { text: element?.IVAretention || '', bold: false, alignment: 'right' },
                  { text: element?.totalExcludeIndividuals || 0, bold: false, alignment: 'right' }
                ]);
              }

              tableData.push([
                { text: 'TOTALES', bold: false },
                { text: '', bold: false },
                { text: '', bold: false },
                { text: '', bold: false },
                { text: '', bold: false, fontSize: 5 },
                { text: getDataSumByProperty('noTaxableSubTotal'), bold: false, alignment: 'right' },
                { text: getDataSumByProperty('noTaxableSubTotalImport'), bold: false, alignment: 'right' },
                { text: getDataSumByProperty('taxableSubTotal'), bold: false, alignment: 'right' },
                { text: getDataSumByProperty('taxableSubTotalImport'), bold: false, alignment: 'right' },
                { text: getDataSumByProperty('totalTaxes'), bold: false, alignment: 'right' },
                { text: getDataSumByProperty('total'), bold: false, alignment: 'right' },
                { text: getDataSumByProperty('IVAretention'), bold: false, alignment: 'right' },
                { text: getDataSumByProperty('totalExcludeIndividuals'), bold: false, alignment: 'right' }
              ]);

              const docDefinition = {
                pageOrientation: 'landscape',
                header: function(currentPage, pageCount, pageSize) {
                  // Podemos tener hasta cuatro líneas de encabezado de página
                  // return [
                  //   {
                  //     columns: [
                  //       {
                  //         // auto-sized columns have their widths based on their content
                  //         width: '50%',
                  //         stack: [
                  //           { text: `Hoja de traslado #${transferHeader?.transferId}`, fontSize: 13, alignment: 'center'},
                  //           { text: 'Copia para repartidor', fontSize: 11, alignment: 'center' }
                  //         ]
                  //       },
                  //       {
                  //         // auto-sized columns have their widths based on their content
                  //         width: '50%',
                  //         stack: [
                  //           { text: `Hoja de traslado #${transferHeader?.transferId}`, fontSize: 13, alignment: 'center' },
                  //           { text: 'Copia para encargado de sala', fontSize: 11, alignment: 'center' }
                  //         ]
                  //       }
                  //     ],
                  //     // optional space between columns
                  //     columnGap: 10,
                  //     margin: [40, 30, 40, 0]
                  //   }
                  // ]
                },
                footer: function(currentPage, pageCount) {
                  // Podemos tener hasta cuatro líneas de pie de página
                  return [
                    { text: `Libro de Ventas ${stringHelpers.capitalizeWord(dayjs(month).format('MMMM YYYY'))}`, alignment: 'right', margin: [40, 0, 40, 0] },
                    { text: `Pagina ${currentPage.toString()} de ${pageCount}`, alignment: 'right', margin: [40, 0, 40, 0] }
                    // { text: `${currentPage.toString()} de ${pageCount}`, alignment: 'right', margin: [40, 0, 40, 0] },
                    // { text: `${currentPage.toString()} de ${pageCount}`, alignment: 'right', margin: [40, 0, 40, 0] }
                  ]
                },
                content: [
                  {
                    text: `EMPRESA:`,
                    fontSize: 10
                  },
                  {
                    text: `LIBRO O REGISTRO DE COMPRAS (Art. 141 C.T. y 86 R.C.T.)`,
                    fontSize: 12
                  },
                  {
                    text: `NOMBRE DEL CONTRIBUYENTE: `,
                    fontSize: 10
                  },
                  {
                    columns: [
                      {
                        width: '33%',
                        text: `MES: ${stringHelpers.capitalizeWord(dayjs(month).format('MMMM'))}`,
                        fontSize: 10
                      },
                      {
                        width: '33%',
                        text: `AÑO: ${dayjs(month).format('YYYY')}`,
                        fontSize: 10
                      },
                      {
                        width: '34%',
                        text: `NRC:`,
                        fontSize: 10
                      }
                    ]
                  },
                  {
                    text: ``,
                    fontSize: 10,
                    margin: [ 0, 5, 0, 0 ]
                  },
                  {
                    layout: 'noBorders', // optional
                    table: {
                      headerRows: 1,
                      widths: ['5%', '6%', '6%', '6%', '28.90%', '12%', '12%', '6%', '6%', '6%', '6%'],
                      body: [[
                        { text: '' },
                        { text: '' },
                        { text: '' },
                        { text: '' },
                        { text: '' },
                        { text: 'Exentas', alignment: 'center' },
                        { text: 'Afectas', alignment: 'center' },
                        { text: '' },
                        { text: '' },
                        { text: '' },
                        { text: '' }
                      ]]
                    }
                  },
                  {
                    layout: 'lightHorizontalLines', // optional
                    table: {
                      headerRows: 1,
                      widths: ['5%', '6%', '6%', '6%', '28.90%', '6%', '6%', '6%', '6%', '6%', '6%', '6%', '6%'],
                      body: tableData
                    }
                  },
                  /*
                  // 1.66
                  // 0.66
                  // 0.66
                  // 0.66
                  */
                  // 0.66
                  // 0.66
                  // 0.66
                  // 0.66
                  // 0.66
                  // 0.66
                  // 0.66
                  // 0.66
                  {
                    text: ``,
                    fontSize: 10,
                    margin: [ 0, 5, 0, 0 ]
                  },
                  {
                    columns: [
                      {
                        width: '20%',
                        text: `VENTA NETA:`
                      },
                      {
                        width: '20%',
                        text: `${(getDataSumByProperty('total') - getDataSumByProperty('totalTaxes')).toFixed(2)}`,
                        alignment: 'right'
                      },
                      {
                        width: '60%',
                        text: ``
                      }
                    ]
                  },
                  {
                    columns: [
                      {
                        width: '20%',
                        text: `DEBITO FISCAL:`
                      },
                      {
                        width: '20%',
                        text: `${(getDataSumByProperty('totalTaxes'))}`,
                        alignment: 'right'
                      },
                      {
                        width: '60%',
                        text: ``
                      }
                    ]
                  },
                  {
                    columns: [
                      {
                        width: '20%',
                        text: `VENTA TOTAL:`
                      },
                      {
                        width: '20%',
                        text: `${(getDataSumByProperty('total'))}`,
                        alignment: 'right'
                      },
                      {
                        width: '60%',
                        text: ``
                      }
                    ]
                  },
                  {
                    text: 'Firma Contribuyente o Contador: __________________________________________',
                    alignment: 'right',
                    margin: [ 0, 5, 0, 0 ]
                  },
                ],
                defaultStyle: {
                  font: 'Roboto',
                  fontSize: 6
                },
                pageSize: 'LETTER',
                pageMargins: [ 40, 60, 40, 60 ]
              };
              
              const options = {};

              const pdfDoc = printer.createPdfKitDocument(docDefinition, options);

              res.setHeader('Content-Type', 'application/pdf');
              res.setHeader('Content-Disposition', 'attachment; filename=transfersheet.pdf');

              pdfDoc.pipe(res);
              pdfDoc.end();
            } catch(error) {
              res.json({ status: 400, message: 'error', errorContent: error });
            }
          });
        }
      );
    });
  });
}

controller.getTransferSheet = (req, res) => {
  req.getConnection((error, conn) => {
    if (error) 
      res.status(500).json(errorResponses.status500(error));

    conn.beginTransaction((transactionError) => {
      if (transactionError) res.status(500).json(errorResponses.status500(error));

      const { transferId } = req.params;

      conn.query(
        queries.getTransferSheet,
        [ transferId || 0, transferId || 0 ],
        (queryError, queryRows) => {
          if (queryError)
            conn.rollback(() => res.status(500).json(errorResponses.status500(queryError)));

          let result = queryRows;

          conn.commit((commitError) => {
            if (commitError) conn.rollback(() => { res.status(500).json(errorResponses.status500(queryError)); });

            try {

              const transferHeader = result[0][0];
              const transferDetails = result[1];

              console.log(transferHeader);
              console.log(transferDetails);

              const fonts = {
                Roboto: {
                  normal: path.resolve(__dirname, '../fonts/Roboto-Regular.ttf'),
                  bold: path.resolve(__dirname, '../fonts/Roboto-Medium.ttf'),
                  italics: path.resolve(__dirname, '../fonts/Roboto-Italic.ttf'),
                  bolditalics: path.resolve(__dirname, '../fonts/Roboto-MediumItalic.ttf')
                }
              };

              // console.log(process.cwd());
              
              const printer = new PdfPrinter(fonts);

              const transferDetailData = [];
              transferDetailData.push([
                'PRODUCTO',
                { text: 'CANTIDAD' || '', bold: false, alignment: 'right' },
                { text: 'ENTREGA' || '', bold: false, alignment: 'right' }
              ]);

              const transferDetailData2 = [];
              transferDetailData2.push([
                'PRODUCTO',
                { text: 'CANTIDAD' || '', bold: false, alignment: 'right' },
                { text: 'RECIBE' || '', bold: false, alignment: 'right' }
              ]);
              
              for(const det of (transferDetails || [])) {
                transferDetailData.push([
                  { text: det?.productName || '', bold: false },
                  { text: det?.quantityExpected || '', bold: false, alignment: 'right' },
                  {
                    svg: `
                      <svg width="30" height="10">
                        <rect x="0" y="0" width="30" height="10"
                        style="fill:white;stroke:black;stroke-width:1;fill-opacity:0.1;stroke-opacity:0.9" />
                      </svg>
                    `,
                    alignment: 'right'
                  },
                ]);
                transferDetailData2.push([
                  { text: det?.productName || '', bold: false },
                  { text: det?.quantityExpected || '', bold: false, alignment: 'right' },
                  {
                    svg: `
                      <svg width="30" height="10">
                        <rect x="0" y="0" width="30" height="10"
                        style="fill:white;stroke:black;stroke-width:1;fill-opacity:0.1;stroke-opacity:0.9" />
                      </svg>
                    `,
                    alignment: 'right'
                  },
                ]);
              }

              const docDefinition = {
                pageOrientation: 'landscape',
                header: function(currentPage, pageCount, pageSize) {
                  // Podemos tener hasta cuatro líneas de encabezado de página
                  return [
                    // { text: 'HOJA DE TRASLADO', fontSize: 16, alignment: 'left', margin: [40, 30, 40, 0] },
                    // { text: 'Todo Para Cake', alignment: 'left', margin: [40, 0, 40, 0] }
                    {
                      columns: [
                        {
                          // auto-sized columns have their widths based on their content
                          width: '50%',
                          stack: [
                            { text: `Hoja de traslado #${transferHeader?.transferId}`, fontSize: 13, alignment: 'center'},
                            { text: 'Copia para repartidor', fontSize: 11, alignment: 'center' }
                          ]
                        },
                        {
                          // auto-sized columns have their widths based on their content
                          width: '50%',
                          stack: [
                            { text: `Hoja de traslado #${transferHeader?.transferId}`, fontSize: 13, alignment: 'center' },
                            { text: 'Copia para encargado de sala', fontSize: 11, alignment: 'center' }
                          ]
                        }
                      ],
                      // optional space between columns
                      columnGap: 10,
                      margin: [40, 30, 40, 0]
                    }
                    // { text: 'Reporte de Productos por Categoría', alignment: 'left', margin: [40, 0, 40, 0] },
                    // { text: 'Reporte de Productos por Categoría', alignment: 'left', margin: [40, 0, 40, 0] }
                  ]
                },
                // footer: function(currentPage, pageCount) {
                //   // Podemos tener hasta cuatro líneas de pie de página
                //   return [
                //     { text: `Sistema de Información Gerencial SigProCOM`, alignment: 'right', margin: [40, 0, 40, 0] },
                //     { text: `${currentPage.toString()} de ${pageCount}`, alignment: 'right', margin: [40, 0, 40, 0] }
                //     // { text: `${currentPage.toString()} de ${pageCount}`, alignment: 'right', margin: [40, 0, 40, 0] },
                //     // { text: `${currentPage.toString()} de ${pageCount}`, alignment: 'right', margin: [40, 0, 40, 0] }
                //   ]
                // },
                content: [
                  {
                    columns: [
                      {
                        // auto-sized columns have their widths based on their content
                        width: '50%',
                        stack: [
                          {
                            columns: [
                              {
                                // auto-sized columns have their widths based on their content
                                width: '50%',
                                stack: [
                                  { text: 'Fecha', fontSize: 9, alignment: 'left'},
                                  { text: 'Proviene de:', fontSize: 9, alignment: 'left'},
                                  { text: 'Entregar a:', fontSize: 9, alignment: 'left' }
                                ]
                              },
                              {
                                // auto-sized columns have their widths based on their content
                                width: '50%',
                                stack: [
                                  { text: `${transferHeader?.sentAt}`, fontSize: 9, bold: true, alignment: 'right' },
                                  { text: `${transferHeader?.originLocationName}`, fontSize: 9, bold: true, alignment: 'right' },
                                  { text: `${transferHeader?.destinationLocationName}`, fontSize: 9, bold: true, alignment: 'right' }
                                ]
                              }
                            ]
                          },
                          {
                            layout: 'lightHorizontalLines', // optional
                            table: {
                              headerRows: 1,
                              widths: ['50%', '25%', '25%'],
                              body: transferDetailData
                            }
                          },
                          { text: '__________________________________________', fontSize: 10, alignment: 'center'},
                          { text: 'FIRMA', fontSize: 10, alignment: 'center'},
                          {
                            layout: 'lightHorizontalLines', // optional
                            table: {
                              headerRows: 1,
                              widths: ['100%'],
                              body: [
                                [{text: 'OBSERVACIONES'}],
                                [{text: '-'}],
                                [{text: '-'}],
                                [{text: '-'}],
                                [{text: ''}]
                              ]
                            }
                          }
                        ]
                      },
                      {
                        // auto-sized columns have their widths based on their content
                        width: '50%',
                        stack: [
                          {
                            columns: [
                              {
                                // auto-sized columns have their widths based on their content
                                width: '50%',
                                stack: [
                                  { text: 'Fecha:', fontSize: 9, alignment: 'left'},
                                  { text: 'Proviene de:', fontSize: 9, alignment: 'left'},
                                  { text: 'Entregar a:', fontSize: 9, alignment: 'left' }
                                ]
                              },
                              {
                                // auto-sized columns have their widths based on their content
                                width: '50%',
                                stack: [
                                  { text: `${transferHeader?.sentAt}`, fontSize: 9, bold: true, alignment: 'right' },
                                  { text: `${transferHeader?.originLocationName}`, fontSize: 9, bold: true, alignment: 'right' },
                                  { text: `${transferHeader?.destinationLocationName}`, fontSize: 9, bold: true, alignment: 'right' }
                                ]
                              }
                            ]
                          },
                          {
                            layout: 'lightHorizontalLines', // optional
                            table: {
                              headerRows: 1,
                              widths: ['50%', '25%', '25%'],
                              body: transferDetailData2
                            }
                          },
                          { text: '__________________________________________', fontSize: 10, alignment: 'center'},
                          { text: 'FIRMA', fontSize: 10, alignment: 'center'},
                          {
                            layout: 'lightHorizontalLines', // optional
                            table: {
                              headerRows: 1,
                              widths: ['100%'],
                              body: [
                                [{text: 'OBSERVACIONES'}],
                                [{text: '-'}],
                                [{text: '-'}],
                                [{text: '-'}],
                                [{text: ''}]
                              ]
                            }
                          }
                        ]
                      }
                    ],
                    // optional space between columns
                    columnGap: 10
                  }
                  // { text: 'Resumen de ventas', fontSize: 13 },
                  // {
                  //   layout: 'headerLineOnly', // optional
                  //   table: {
                  //     headerRows: 1,
                  //     widths: ['10%', '10%', '30%', '40%', '10%'],
                  //     body: salesReportBodyData
                  //   }
                  // },
                ],
                defaultStyle: {
                  font: 'Roboto',
                  fontSize: 6
                },
                pageSize: 'LETTER',
                pageMargins: [ 40, 60, 40, 60 ]
              };
              
              const options = {};

              const pdfDoc = printer.createPdfKitDocument(docDefinition, options);

              res.setHeader('Content-Type', 'application/pdf');
              res.setHeader('Content-Disposition', 'attachment; filename=transfersheet.pdf');

              pdfDoc.pipe(res);
              pdfDoc.end();
            } catch(error) {
              res.json({ status: 400, message: 'error', errorContent: error });
            }
          });
        }
      );
    });
  });
}

export default controller;
