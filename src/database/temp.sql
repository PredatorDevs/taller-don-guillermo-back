CREATE OR REPLACE VIEW `vw_customerpendingsales` AS
select
    `sales`.`id` AS `saleId`,
    `sales`.`documentTypeId` AS `documentTypeId`,
    (
    select
        `documenttypes`.`name`
    from
        `documenttypes`
    where
        (`documenttypes`.`id` = `sales`.`documentTypeId`)) AS `documentTypeName`,
    ifnull(`sales`.`docNumber`, '-') AS `docNumber`,
    `sales`.`customerId` AS `customerId`,
    round(`sales`.`total`, 2) AS `saleTotal`,
    round(`FN_GETSALETOTALPAID`(`sales`.`id`), 2) AS `saleTotalPaid`,
    round((`sales`.`total` - `FN_GETSALETOTALPAID`(`sales`.`id`)), 2) AS `salePendingAmount`,
    `shiftcuts`.`number` AS `shiftcutNumber`
from
    (`sales`
join `shiftcuts` on
    ((`sales`.`shiftcutId` = `shiftcuts`.`id`)))
where
    (`sales`.`paymentStatus` in (2, 3));