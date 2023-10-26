import connUtil from "../helpers/connectionUtil.js";

const controller = {};

const queries = {
  find: `
    SELECT * FROM vw_cashiers
    WHERE isActive = 1;
  `,
  findMyCashier: `
    SELECT * FROM vw_cashiers
    WHERE id = ?;
  `,
  checkIfAbleToProcess: `
    SELECT
      isOpen,
      currentShiftcutId
    FROM
      vw_cashiers
    WHERE
      id = ?;
  `,
  findById: `SELECT * FROM vw_cashiershiftcutinfo WHERE cashierId = ?;`,
  findByLocationId: `SELECT * FROM vw_cashiershiftcutinfo WHERE cashierLocationId = ?;`,
  closeCurrentAndOpenNextShiftcut: `CALL usp_CloseCurrentAndOpenNextShiftcut(?, ?, ?, ?, ?, ?, ?, ?);`,
  canCloseShiftcut: `SELECT fn_shiftcutcanbeclosed(?) AS success;`,
  getCurrentShiftcutReport: `CALL usp_ReportShiftcutSales(?);`,
  getCurrentShiftcutSummary: `CALL usp_ShiftcutSummary(?);`,
  getCurrentShiftcutPayments: `CALL usp_ShiftcutPayments(?);`,
  // cashierId, actionBy, actionDatetime, initialAmount
  openCashier: `
    CALL usp_OpenCashier(?, ?, ?, ?);
  `,
  // cashierId, actionBy, actionDatetime, finalAmount, remittedAmount
  closeCashier: `
    CALL usp_CloseCashier(?, ?, ?, ?, ?, ?);
  `
}

controller.find = (req, res) => {
  req.getConnection(connUtil.connFunc(queries.find, [], res));
}

controller.findMyCashier = (req, res) => {
  const { cashierId } = req.params;
  req.getConnection(connUtil.connFunc(queries.findMyCashier, [ cashierId ], res));
}

controller.checkIfAbleToProcess = (req, res) => {
  const { cashierId } = req.params;
  req.getConnection(connUtil.connFunc(queries.checkIfAbleToProcess, [ cashierId ], res));
}

controller.findById = (req, res) => {
  const { cashierId } = req.params;
  req.getConnection(connUtil.connFunc(queries.findById, [ cashierId ], res));
}

controller.findByLocationId = (req, res) => {
  const { locationId } = req.params;
  req.getConnection(connUtil.connFunc(queries.findByLocationId, [ locationId ], res));
}

controller.closeCurrentAndOpenNextShiftcut = (req, res) => {
  const { locationId, cashierId, actionBy, actionDatetime, initialAmount, finalAmount, remittedAmount, shiftcutDatetime } = req.body;
  req.getConnection(connUtil.connSPFunc(
    queries.closeCurrentAndOpenNextShiftcut, 
    [ locationId, cashierId, actionBy, actionDatetime, initialAmount, finalAmount, remittedAmount, shiftcutDatetime ], 
    res
  ));
}

controller.canCloseShiftcut = (req, res) => {
  const { shiftcutId } = req.params;
  req.getConnection(connUtil.connFunc(queries.canCloseShiftcut, [ shiftcutId ], res));
}

controller.getCurrentShiftcutReport = (req, res) => {
  const { shiftcutId } = req.params;
  req.getConnection(connUtil.connSPFunc(queries.getCurrentShiftcutReport, [ shiftcutId ], res));
}

controller.getCurrentShiftcutSummary = (req, res) => {
  const { shiftcutId } = req.params;
  console.log(shiftcutId);
  req.getConnection(connUtil.connSPFunc(queries.getCurrentShiftcutSummary, [ shiftcutId ], res));
}

controller.getCurrentShiftcutPayments = (req, res) => {
  const { shiftcutId } = req.params;
  req.getConnection(connUtil.connSPFunc(queries.getCurrentShiftcutPayments, [ shiftcutId ], res));
}

controller.openCashier = (req, res) => {
  const { cashierId, actionBy, actionDatetime, initialAmount } = req.body;
  console.log(req.body);
  req.getConnection(connUtil.connSPFunc(queries.openCashier, [ cashierId, actionBy, actionDatetime, initialAmount ], res));
}

controller.closeCashier = (req, res) => {
  const { cashierId, actionBy, actionDatetime, finalAmount, remittedAmount, cashFunds } = req.body;
  req.getConnection(connUtil.connSPFunc(queries.closeCashier, [ cashierId, actionBy, actionDatetime, finalAmount, remittedAmount, cashFunds ], res));
}

export default controller;
