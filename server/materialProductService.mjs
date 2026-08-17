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
    SELECT NULL availabilityId,b.id branchInternalId,b.jodoo_branch_id branchId,
      m.id materialId,m.material_code materialCode,COALESCE(m.full_name,m.material_name) materialFullName,
      p.id productId,p.product_code productCode,p.full_name fullName,p.short_form shortForm,p.unit,
      1 isSelectable,cmp.price_type priceType,
      CASE WHEN cmp.price_type='outstation' THEN cmp.outstation_price_level_id ELSE cmp.standard_price_level_id END priceGroupId,
      CASE WHEN cmp.price_type='outstation' THEN COALESCE(cmp.outstation_special_price,opl.price_amount) ELSE COALESCE(cmp.standard_special_price,spl.price_amount) END currentPrice,
      NULL itemCode,1 priceConfigurationEnabled
    FROM branches b
    JOIN customer_material_pricing cmp ON cmp.customer_id=b.customer_id AND cmp.status='active' AND cmp.resolution_state='ready'
    JOIN materials m ON m.id=cmp.material_id
    JOIN material_products p ON p.material_id=m.id AND p.status='active'
    LEFT JOIN material_price_levels spl ON spl.id=cmp.standard_price_level_id
    LEFT JOIN material_price_levels opl ON opl.id=cmp.outstation_price_level_id
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
    SELECT p.product_code productCode,p.full_name fullName,COUNT(DISTINCT b.id) coveredBranches
    FROM material_products p LEFT JOIN customer_material_pricing cmp ON cmp.material_id=p.material_id AND cmp.status='active' AND cmp.resolution_state='ready' LEFT JOIN branches b ON b.customer_id=cmp.customer_id
    WHERE p.product_code IN (${baseCodes.map(()=>'?').join(',')})
    GROUP BY p.id ORDER BY p.product_code
  `).all(...baseCodes).map(row=>({...row,missingBranches:branchCount-row.coveredBranches}))
  const rows=database.prepare(`
    SELECT b.jodoo_branch_id branchId,b.branch_name branchName,m.material_code materialCode,
      COALESCE(m.full_name,m.material_name) material,p.product_code productCode,p.full_name fullName,
      p.short_form shortForm,p.unit,CASE WHEN cmp.id IS NULL THEN 0 ELSE 1 END isSelectable,cmp.price_type priceType,
      cmp.standard_price_level_id standardPriceGroup,cmp.outstation_price_level_id outstationPriceGroup,
      CASE WHEN cmp.price_type='outstation' THEN COALESCE(cmp.outstation_special_price,opl.price_amount) ELSE COALESCE(cmp.standard_special_price,spl.price_amount) END currentPrice,
      NULL itemCode,
      GROUP_CONCAT(DISTINCT lm.legacy_item_id) legacyItemIds,
      GROUP_CONCAT(DISTINCT lm.legacy_item_name) legacyNames
    FROM branches b
    CROSS JOIN material_products p
    JOIN materials m ON m.id=p.material_id
    LEFT JOIN customer_material_pricing cmp ON cmp.customer_id=b.customer_id AND cmp.material_id=p.material_id AND cmp.status='active' AND cmp.resolution_state='ready'
    LEFT JOIN material_price_levels spl ON spl.id=cmp.standard_price_level_id
    LEFT JOIN material_price_levels opl ON opl.id=cmp.outstation_price_level_id
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
