import PdfPrinter from 'pdfmake';
import * as fs from 'fs';
import connUtil from "../helpers/connectionUtil.js";
import renders from "../helpers/pdfRendering.js";
import rendersAlt from "../helpers/pdfRenderingAlt.js";
import errorResponses from '../helpers/errorResponses.js';
import path from 'path';
import { fileURLToPath } from 'url';

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
                    { text: 'Distribuidora Panadería', alignment: 'left', margin: [40, 0, 40, 0] }
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
                    { text: 'Distribuidora Panadería', alignment: 'left', margin: [40, 0, 40, 0] }
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
          { text: 'Distribuidora Panadería', alignment: 'left', margin: [40, 0, 40, 0] }
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

export default controller;
