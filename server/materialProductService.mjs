import {BASE_PRODUCT_CODES} from './migrationV22.mjs'

export function seedBranchBaseProducts(branchId,{actor='Branch base products'}={},database){
  if(!database)throw new Error('Database connection is required')
  const before=database.prepare('SELECT COUNT(*) count FROM branch_product_availability WHERE branch_id=?').get(branchId).count
  database.prepare(`INSERT OR IGNORE INTO branch_product_availability(branch_id,product_id,is_selectable,created_by)
    SELECT ?,id,1,? FROM material_products WHERE product_code IN (${BASE_PRODUCT_CODES.map(()=>'?').join(',')})`)
    .run(branchId,actor,...BASE_PRODUCT_CODES)
  const after=database.prepare('SELECT COUNT(*) count FROM branch_product_availability WHERE branch_id=?').get(branchId).count
  return{created:after-before,total:after}
}

export function listBranchProducts(branchId,database){
  if(!database)throw new Error('Database connection is required')
  return database.prepare(`
    SELECT a.id availabilityId,b.id branchInternalId,b.jodoo_branch_id branchId,
      m.id materialId,m.material_code materialCode,COALESCE(m.full_name,m.material_name) materialFullName,
      p.id productId,p.product_code productCode,p.full_name fullName,p.short_form shortForm,p.unit,
      a.is_selectable isSelectable,a.price_type priceType,
      CASE
        WHEN p.product_code='OCC' THEN og.id
        WHEN a.price_type='outstation' THEN cpp.outstation_price_level_id
        ELSE cpp.standard_price_level_id
      END priceGroupId,
      CASE
        WHEN p.product_code='OCC' THEN og.price_amount
        WHEN a.price_type='outstation' THEN opl.price_amount
        ELSE spl.price_amount
      END currentPrice,
      CASE WHEN p.product_code='OCC' THEN og.item_code END itemCode,
      CASE WHEN p.product_code='OCC' THEN 0
           WHEN a.price_type='outstation' THEN cpp.outstation_enabled
           ELSE 1 END priceConfigurationEnabled
    FROM branch_product_availability a
    JOIN branches b ON b.id=a.branch_id
    JOIN material_products p ON p.id=a.product_id
    JOIN materials m ON m.id=p.material_id
    LEFT JOIN branch_occ_price_assignments boa ON boa.branch_id=b.id AND p.product_code='OCC'
    LEFT JOIN occ_price_groups og ON og.id=boa.occ_price_group_id
    LEFT JOIN customer_product_pricing cpp ON cpp.customer_id=b.customer_id AND cpp.product_id=p.id AND cpp.status='active'
    LEFT JOIN material_price_levels spl ON spl.id=cpp.standard_price_level_id
    LEFT JOIN material_price_levels opl ON opl.id=cpp.outstation_price_level_id
    WHERE b.id=? OR b.jodoo_branch_id=?
    ORDER BY m.material_name,p.full_name
  `).all(Number(branchId)||-1,String(branchId)).map(row=>({
    ...row,
    isSelectable:Boolean(row.isSelectable),
    priceNotSet:row.currentPrice==null,
  }))
}

export function requireBranchProductPrice(branchId,productId,database){
  const item=listBranchProducts(branchId,database).find(row=>row.productId===Number(productId))
  if(!item||!item.isSelectable)throw new Error('Product is not selectable for this Branch')
  if(item.currentPrice==null)throw new Error(`Price Not Set: ${item.fullName}`)
  if(!(Number(item.currentPrice)>0))throw new Error(`A valid price greater than RM0.00 is required: ${item.fullName}`)
  return item
}

export function materialIssueReport(database){
  if(!database)throw new Error('Database connection is required')
  const baseCodes=BASE_PRODUCT_CODES
  const branchCount=database.prepare('SELECT COUNT(*) count FROM branches').get().count
  const coverage=database.prepare(`
    SELECT p.product_code productCode,p.full_name fullName,COUNT(DISTINCT a.branch_id) coveredBranches
    FROM material_products p LEFT JOIN branch_product_availability a ON a.product_id=p.id AND a.is_selectable=1
    WHERE p.product_code IN (${baseCodes.map(()=>'?').join(',')})
    GROUP BY p.id ORDER BY p.product_code
  `).all(...baseCodes).map(row=>({...row,missingBranches:branchCount-row.coveredBranches}))
  const rows=database.prepare(`
    SELECT b.jodoo_branch_id branchId,b.branch_name branchName,m.material_code materialCode,
      COALESCE(m.full_name,m.material_name) material,p.product_code productCode,p.full_name fullName,
      p.short_form shortForm,p.unit,COALESCE(a.is_selectable,0) isSelectable,a.price_type priceType,
      CASE WHEN p.product_code='OCC' THEN og.id ELSE cpp.standard_price_level_id END standardPriceGroup,
      CASE WHEN p.product_code='OCC' THEN NULL ELSE cpp.outstation_price_level_id END outstationPriceGroup,
      CASE WHEN p.product_code='OCC' THEN og.price_amount
           WHEN a.price_type='outstation' THEN opl.price_amount ELSE spl.price_amount END currentPrice,
      CASE WHEN p.product_code='OCC' THEN og.item_code END itemCode,
      GROUP_CONCAT(DISTINCT lm.legacy_item_id) legacyItemIds,
      GROUP_CONCAT(DISTINCT lm.legacy_item_name) legacyNames
    FROM branches b
    CROSS JOIN material_products p
    JOIN materials m ON m.id=p.material_id
    LEFT JOIN branch_product_availability a ON a.branch_id=b.id AND a.product_id=p.id
    LEFT JOIN branch_occ_price_assignments boa ON boa.branch_id=b.id AND p.product_code='OCC'
    LEFT JOIN occ_price_groups og ON og.id=boa.occ_price_group_id
    LEFT JOIN customer_product_pricing cpp ON cpp.customer_id=b.customer_id AND cpp.product_id=p.id AND cpp.status='active'
    LEFT JOIN material_price_levels spl ON spl.id=cpp.standard_price_level_id
    LEFT JOIN material_price_levels opl ON opl.id=cpp.outstation_price_level_id
    LEFT JOIN legacy_item_product_mappings lm ON lm.product_id=p.id
    GROUP BY b.id,p.id
    ORDER BY b.jodoo_branch_id,p.product_code
  `).all().map(row=>({
    ...row,isSelectable:Boolean(row.isSelectable),priceNotSet:row.currentPrice==null,
    isBaseProduct:baseCodes.includes(row.productCode),
    invalidMaterial:!row.materialCode,invalidCategory:!row.productCode,
  }))
  const duplicates=database.prepare(`
    SELECT branch_id,product_id,COUNT(*) count FROM branch_product_availability
    GROUP BY branch_id,product_id HAVING COUNT(*)>1
  `).all()
  const duplicatePriceGroups=database.prepare(`
    SELECT product_id,price_cents,COUNT(*) count,GROUP_CONCAT(id) ids FROM material_price_levels
    WHERE product_id IS NOT NULL AND is_fixed=1 GROUP BY product_id,price_cents HAVING COUNT(*)>1
  `).all()
  const wrongPriceLinks=database.prepare(`
    SELECT cpp.id,cpp.customer_id,cpp.product_id,pl.id price_level_id,pl.product_id price_product_id
    FROM customer_product_pricing cpp JOIN material_price_levels pl
      ON pl.id=cpp.standard_price_level_id OR pl.id=cpp.outstation_price_level_id
    WHERE pl.product_id<>cpp.product_id
  `).all()
  return{
    summary:{
      branchCount,
      expectedBaseRelations:branchCount*baseCodes.length,
      actualBaseRelations:rows.filter(row=>row.isBaseProduct&&row.isSelectable).length,
      missingRelations:rows.filter(row=>row.isBaseProduct&&!row.isSelectable).length,
      priceNotSet:rows.filter(row=>row.isSelectable&&row.priceNotSet).length,
      duplicateRelations:duplicates.length,
      duplicatePriceGroups:duplicatePriceGroups.length,
      wrongPriceLinks:wrongPriceLinks.length,
    },
    coverage,rows,duplicates,duplicatePriceGroups,wrongPriceLinks,
  }
}
