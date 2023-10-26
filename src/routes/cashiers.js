import { Router } from 'express';
const router = Router();

import controller from '../controllers/cashiers.js';
import middleware from '../middlewares/middleware.js';

const {
  find,
  findMyCashier,
  checkIfAbleToProcess,
  findById,
  findByLocationId,
  getCurrentShiftcutReport,
  getCurrentShiftcutSummary,
  getCurrentShiftcutPayments,
  canCloseShiftcut,
  closeCurrentAndOpenNextShiftcut,
  openCashier,
  closeCashier
} = controller;

const { checkToken, checkUserIsActive } = middleware;

router.get('/', checkToken, checkUserIsActive, find);
router.get('/:cashierId', checkToken, checkUserIsActive, findById);
router.get('/my-cashier/:cashierId', checkToken, checkUserIsActive, findMyCashier);
router.get('/my-cashier/check-if-able-to-process/:cashierId', checkToken, checkUserIsActive, checkIfAbleToProcess);
router.get('/by-location/:locationId', checkToken, checkUserIsActive, findByLocationId);
router.get('/check-close/:shiftcutId', checkToken, checkUserIsActive, canCloseShiftcut);
router.get('/shiftcut-report/:shiftcutId', checkToken, checkUserIsActive, getCurrentShiftcutReport);
router.get('/shiftcut-summary/:shiftcutId', checkToken, checkUserIsActive, getCurrentShiftcutSummary);
router.get('/shiftcut-payments/:shiftcutId', checkToken, checkUserIsActive, getCurrentShiftcutPayments);

router.post('/close-and-open-shiftcut', checkToken, checkUserIsActive, closeCurrentAndOpenNextShiftcut);
router.post('/open', checkToken, checkUserIsActive, openCashier);
router.post('/close', checkToken, checkUserIsActive, closeCashier);

export default router;
