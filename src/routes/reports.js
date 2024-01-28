import { Router } from 'express';
const router = Router();

import controller from '../controllers/reports.js';
import middleware from '../middlewares/middleware.js';

const {
  testquery,
  kardexByProduct,
  createNewPdf,
  createNewPdfAlt,
  getPdf,
  getLocationProductsByCategory,
  getLocationProductsByBrand,
  getLocationProductsByFilteredData,
  shiftcutSettlement,
  getMainDashboardData,
  getCashierLocationSalesByMonth,
  getMonthlyFinalConsumerSaleBook,
  getMonthlyTaxPayerSaleBook,
  getMonthlyFinalConsumerSaleBookPDF,
  getMonthlyTaxPayerSaleBookPDF,
  getMonthlyPurchasesBook,
  getMonthlyPurchaseBookPDF,
  getTransferSheet
} = controller;

const { checkToken, checkUserIsActive } = middleware;

router.get('/kardex/by-product/:locationId/:productId/:startDate/:endDate', checkToken, checkUserIsActive, kardexByProduct);
router.post('/create-pdf', createNewPdf);
router.post('/create-pdf-alt', createNewPdfAlt);
router.get('/get-pdf', getPdf);
router.get('/get-product-by-cat/:locationId', getLocationProductsByCategory);
router.get('/get-product-by-brand/:locationId', getLocationProductsByBrand);
router.get('/shiftcut-settlement/:shiftcutId', shiftcutSettlement);
router.get('/main-dashboard/:startDate/:endDate', getMainDashboardData);
router.get('/cashier-location-sales-by-month/:locationId/:cashierId/:documentTypeId/:month', getCashierLocationSalesByMonth);
router.get('/location-final-consumer-sale-book/:locationId/:month', getMonthlyFinalConsumerSaleBook);
router.get('/location-tax-payer-sale-book/:locationId/:month', getMonthlyTaxPayerSaleBook);
router.get('/location-final-consumer-sale-book-pdf/:locationId/:month', getMonthlyFinalConsumerSaleBookPDF);
router.get('/location-tax-payer-sale-book-pdf/:locationId/:month', getMonthlyTaxPayerSaleBookPDF);
router.get('/location-purchase-book/:locationId/:month', getMonthlyPurchasesBook);
router.get('/location-purchase-book-pdf/:locationId/:month', getMonthlyPurchaseBookPDF);
router.get('/transfer-sheet/:transferId', getTransferSheet);

router.post('/get-product-by-filtered-data', getLocationProductsByFilteredData);

router.post('/testquery', testquery);

export default router;
