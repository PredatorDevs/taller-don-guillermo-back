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
  update: `
    UPDATE
      cashiers
    SET
      ticketCorrelative = IFNULL(?, ticketCorrelative),
      cfCorrelative = IFNULL(?, cfCorrelative),
      ccfCorrelative = IFNULL(?, ccfCorrelative),
      creditNoteCorrelative = IFNULL(?, creditNoteCorrelative),
      debitNoteCorrelative = IFNULL(?, debitNoteCorrelative),
      receiptCorrelative = IFNULL(?, receiptCorrelative),
      ticketSerie = IFNULL(?, ticketSerie),
      cfSerie = IFNULL(?, cfSerie),
      ccfSerie = IFNULL(?, ccfSerie),
      creditNoteSerie = IFNULL(?, creditNoteSerie),
      debitNoteSerie = IFNULL(?, debitNoteSerie),
      receiptSerie = IFNULL(?, receiptSerie),
      defaultInitialCash = IFNULL(?, defaultInitialCash),
      enableReportCashFundMovements = IFNULL(?, enableReportCashFundMovements)
    WHERE
      id = ?;
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
  getDefaultInitialCashById: `SELECT defaultInitialCash FROM vw_cashiers WHERE id = ?;`,
  getDocumentInformation: `
    SELECT
      fn_getcashierdocumentnextcorrelative(?, ?) AS documentCorrelative,
      fn_getcashierdocumentcurrentserie(?, ?) AS documentSerie;
  `,
  findById: `SELECT * FROM vw_cashiershiftcutinfo WHERE cashierId = ?;`,
  findByLocationId: `SELECT * FROM vw_cashiershiftcutinfo WHERE cashierLocationId = ?;`,
  closeCurrentAndOpenNextShiftcut: `CALL usp_CloseCurrentAndOpenNextShiftcut(?, ?, ?, ?, ?, ?, ?, ?);`,
  canCloseShiftcut: `SELECT fn_shiftcutcanbeclosed(?) AS success;`,
  getCurrentShiftcutReport: `CALL usp_ReportShiftcutSales(?);`,
  getCurrentShiftcutSummary: `CALL usp_ShiftcutSummary(?);`,
  getCurrentShiftcutPayments: `CALL usp_ShiftcutPayments(?);`,
  getCurrentShiftcutCashFundMovements: `CALL usp_ShiftcutCashFundMovements(?);`,
  // cashierId, actionBy, actionDatetime, initialAmount
  openCashier: `
    CALL usp_OpenCashier(?, ?, ?, ?, ?);
  `,
  // cashierId, actionBy, actionDatetime, finalAmount, remittedAmount
  closeCashier: `
    CALL usp_CloseCashier(?, ?, ?, ?, ?, ?, ?);
  `,
  /*
    cashierId,
    movementAmount,
    comments,
    movementBy,
    userPINCode
  */
  newCashFundDeposit: `
    CALL usp_CreateNewShiftcutCashFundDeposit(?, ?, ?, ?, ?);
  `,
  /*
    cashierId,
    movementAmount,
    comments,
    movementBy,
    userPINCode
  */
  newCashFundWithdraw: `
    CALL usp_CreateNewShiftcutCashFundWithdraw(?, ?, ?, ?, ?);
  `
}

controller.find = (req, res) => {
  req.getConnection(connUtil.connFunc(queries.find, [], res));
}

controller.findMyCashier = (req, res) => {
  const { cashierId } = req.params;
  req.getConnection(connUtil.connFunc(queries.findMyCashier, [ cashierId ], res));
}

controller.update = (req, res) => {
  const { cashierId } = req.params;
  const {
    ticketCorrelative,
    cfCorrelative,
    ccfCorrelative,
    creditNoteCorrelative,
    debitNoteCorrelative,
    receiptCorrelative,
    ticketSerie,
    cfSerie,
    ccfSerie,
    creditNoteSerie,
    debitNoteSerie,
    receiptSerie,
    defaultInitialCash,
    enableReportCashFundMovements
  } = req.body;
  console.log(req.params);
  console.log(req.body);
  req.getConnection(
    connUtil.connFunc(
      queries.update,
      [
        ticketCorrelative,
        cfCorrelative,
        ccfCorrelative,
        creditNoteCorrelative,
        debitNoteCorrelative,
        receiptCorrelative,
        ticketSerie,
        cfSerie,
        ccfSerie,
        creditNoteSerie,
        debitNoteSerie,
        receiptSerie,
        defaultInitialCash,
        enableReportCashFundMovements,
        cashierId
      ],
      res
    )
  );
}

controller.checkIfAbleToProcess = (req, res) => {
  const { cashierId } = req.params;
  req.getConnection(connUtil.connFunc(queries.checkIfAbleToProcess, [ cashierId ], res));
}

controller.getDocumentInformation = (req, res) => {
  const { cashierId, documentTypeId } = req.params;
  req.getConnection(connUtil.connFunc(queries.getDocumentInformation, [ cashierId, documentTypeId, cashierId, documentTypeId ], res));
}

controller.getDefaultInitialCashById = (req, res) => {
  const { cashierId } = req.params;
  req.getConnection(connUtil.connFunc(queries.getDefaultInitialCashById, [ cashierId ], res));
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

controller.getCurrentShiftcutCashFundMovements = (req, res) => {
  const { shiftcutId } = req.params;
  req.getConnection(connUtil.connSPFunc(queries.getCurrentShiftcutCashFundMovements, [ shiftcutId ], res));
}

controller.openCashier = (req, res) => {
  const { cashierId, actionBy, actionDatetime, initialAmount, userPINCode } = req.body;
  req.getConnection(connUtil.connSPFunc(queries.openCashier, [ cashierId, actionBy, actionDatetime, initialAmount, userPINCode ], res));
}

controller.closeCashier = (req, res) => {
  const { cashierId, actionBy, actionDatetime, finalAmount, remittedAmount, cashFunds, userPINCode } = req.body;
  req.getConnection(connUtil.connSPFunc(queries.closeCashier, [ cashierId, actionBy, actionDatetime, finalAmount, remittedAmount, cashFunds, userPINCode ], res));
}

controller.newCashFundDeposit = (req, res) => {
  const { idtoauth } = req.headers;
  const {
    cashierId,
    movementAmount,
    comments,
    userPINCode
  } = req.body;
  req.getConnection(
    connUtil.connSPFunc(
      queries.newCashFundDeposit,
      [
        cashierId,
        movementAmount,
        comments,
        idtoauth,
        userPINCode
      ],
      res
    )
  );
}

controller.newCashFundWithdraw = (req, res) => {
  const { idtoauth } = req.headers;
  const {
    cashierId,
    movementAmount,
    comments,
    userPINCode
  } = req.body;
  req.getConnection(
    connUtil.connSPFunc(
      queries.newCashFundWithdraw,
      [
        cashierId,
        movementAmount,
        comments,
        idtoauth,
        userPINCode
      ],
      res
    )
  );
}

export default controller;
