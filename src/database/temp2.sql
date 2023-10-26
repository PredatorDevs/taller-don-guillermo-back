-- db_lub_santaclara.vw_products source

CREATE OR REPLACE VIEW `vw_products` AS
select
    `products`.`id` AS `productId`,
    `products`.`name` AS `productName`,
    `products`.`barcode` AS `productBarcode`,
    round(`products`.`cost`, 2) AS `productCost`,
    `products`.`brandId` AS `productBrandId`,
    (select `brands`.`name` from `brands` where (`brands`.`id` = `products`.`brandId`)) AS `productBrandName`,
    `products`.`categoryId` AS `productCategoryId`,
    (select `categories`.`name` from `categories` where (`categories`.`id` = `products`.`categoryId`)) AS `productCategoryName`,
		`products`.`ubicationId` AS `productUbicationId`,
    (select `ubications`.`name` from `ubications` where (`ubications`.`id` = `products`.`ubicationId`)) AS `productUbicationName`,
    `products`.`isService` AS `productIsService`,
    `products`.`measurementUnitId` AS `productMeasurementUnitId`,
    (select `measurementunits`.`name` from `measurementunits` where (`measurementunits`.`id` = `products`.`measurementUnitId`)) AS `productMeasurementUnitName`,
    `products`.`enabledForProduction` AS `productEnabledForProduction`,
    ifnull((select round(`productprices`.`price`, 2) from `productprices` where (`productprices`.`productId` = `products`.`id`) limit 1), 0.00) AS `defaultPrice`,
    `products`.`isTaxable` AS `isTaxable`,
    `fn_getproducttaxes`(`products`.`id`) AS `taxesData`
from
    `products`
where
    (`products`.`isActive` = 1)
order by
    `products`.`name`;