import {BASE_PRODUCT_CODES} from './migrationV22.mjs'

const clean=value=>String(value??'').trim()

export function saveCustomerProductPricing(customerId,items,{changedBy='Administrator',reason='Customer product pricing update',runId=`customer-product-${Date.now()}`,manageTransaction=true}={},database){
  if(!database)throw new Error('Database connection is required')
  if(!Array.isArray(items)||!items.length)return{changed:false,changedCount:0,availabilityCreated:0,runId}
  const why=clean(reason),who=clean(changedBy)||'Administrator'
  if(!why)throw new Error('A reason is required')
  const customer=database.prepare('SELECT id,jodoo_customer_id FROM customers WHERE id=? OR jodoo_customer_id=?').get(Number(customerId)||-1,String(customerId))
  if(!customer)throw new Error('Customer not found')
  const productIds=items.map(item=>Number(item.productId))
  if(productIds.some(id=>!id)||new Set(productIds).size!==productIds.length)throw new Error('The same Product cannot be added more than once')
  const apply=()=>{
    let changedCount=0,availabilityCreated=0
    for(const item of items){
      const productId=Number(item.productId),standardPriceLevelId=Number(item.standardPriceLevelId)||null,outstationEnabled=Boolean(item.outstationEnabled),outstationPriceLevelId=outstationEnabled?(Number(item.outstationPriceLevelId)||null):null
      const product=database.prepare("SELECT id FROM material_products WHERE id=? AND status='active'").get(productId)
      if(!product)throw new Error(`Active Product not found: ${productId}`)
      if(!standardPriceLevelId)throw new Error(`Standard Price Group is required for Product ${productId}`)
      if(!database.prepare("SELECT id FROM material_price_levels WHERE id=? AND product_id=? AND status='active'").get(standardPriceLevelId,productId))throw new Error(`Standard Price Group does not belong to Product ${productId}`)
      if(outstationEnabled&&!outstationPriceLevelId)throw new Error(`Outstation Price Group is required for Product ${productId}`)
      if(outstationPriceLevelId&&!database.prepare("SELECT id FROM material_price_levels WHERE id=? AND product_id=? AND status='active'").get(outstationPriceLevelId,productId))throw new Error(`Outstation Price Group does not belong to Product ${productId}`)
      const old=database.prepare('SELECT * FROM customer_product_pricing WHERE customer_id=? AND product_id=?').get(customer.id,productId)
      const unchanged=old&&old.status==='active'&&Number(old.standard_price_level_id)===standardPriceLevelId&&Boolean(old.outstation_enabled)===outstationEnabled&&Number(old.outstation_price_level_id||0)===Number(outstationPriceLevelId||0)
      if(!unchanged){
        database.prepare(`INSERT INTO customer_product_pricing(customer_id,product_id,standard_price_level_id,outstation_enabled,outstation_price_level_id,status,updated_by)
          VALUES(?,?,?, ?,?,'active',?) ON CONFLICT(customer_id,product_id) DO UPDATE SET standard_price_level_id=excluded.standard_price_level_id,outstation_enabled=excluded.outstation_enabled,outstation_price_level_id=excluded.outstation_price_level_id,status='active',updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`).run(customer.id,productId,standardPriceLevelId,outstationEnabled?1:0,outstationPriceLevelId,who)
        const after=database.prepare('SELECT * FROM customer_product_pricing WHERE customer_id=? AND product_id=?').get(customer.id,productId)
        database.prepare(`INSERT INTO material_conversion_audit(run_id,action,entity_type,entity_id,before_json,after_json,changed_by)
          VALUES(?,'upsert','customer_product_pricing',?,?,?,?)`).run(runId,`${customer.id}:${productId}`,old?JSON.stringify(old):null,JSON.stringify({...after,reason:why}),who)
        changedCount+=1
      }
      const created=database.prepare(`INSERT OR IGNORE INTO branch_product_availability(branch_id,product_id,is_selectable,created_by)
        SELECT id,?,1,? FROM branches WHERE customer_id=?`).run(productId,who,customer.id)
      availabilityCreated+=Number(created.changes)
    }
    return{changed:changedCount>0,changedCount,availabilityCreated,runId}
  }
  if(!manageTransaction)return apply()
  database.exec('BEGIN IMMEDIATE')
  try{const result=apply();database.exec('COMMIT');return result}catch(error){database.exec('ROLLBACK');throw error}
}

export function listCustomerProductPricing(customerId,database){
  if(!database)throw new Error('Database connection is required')
  if(!database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='material_products'").get())return{items:[]}
  const customer=database.prepare('SELECT id FROM customers WHERE id=? OR jodoo_customer_id=?').get(Number(customerId)||-1,String(customerId))
  if(!customer)return{items:[]}
  const items=database.prepare(`WITH effective AS (
      SELECT cpp.customer_id,p.id product_id,p.material_id,'product' pricing_source,'standard' price_type,
        cpp.standard_price_level_id standard_price_level_id,spl.price_amount standard_price,spl.effective_date standard_effective_date,
        cpp.outstation_enabled,cpp.outstation_price_level_id,opl.price_amount outstation_price,opl.effective_date outstation_effective_date
      FROM customer_product_pricing cpp JOIN material_products p ON p.id=cpp.product_id AND p.status='active'
      LEFT JOIN material_price_levels spl ON spl.id=cpp.standard_price_level_id AND spl.product_id=p.id
      LEFT JOIN material_price_levels opl ON opl.id=cpp.outstation_price_level_id AND opl.product_id=p.id
      WHERE cpp.customer_id=? AND cpp.status='active'
      UNION ALL
      SELECT cmp.customer_id,p.id product_id,p.material_id,'material' pricing_source,cmp.price_type,
        cmp.standard_price_level_id,COALESCE(cmp.standard_special_price,spl.price_amount),COALESCE(cmp.standard_effective_date,spl.effective_date),
        cmp.outstation_enabled,cmp.outstation_price_level_id,COALESCE(cmp.outstation_special_price,opl.price_amount),COALESCE(cmp.outstation_effective_date,opl.effective_date)
      FROM customer_material_pricing cmp JOIN material_products p ON p.material_id=cmp.material_id AND p.status='active'
      LEFT JOIN material_price_levels spl ON spl.id=cmp.standard_price_level_id
      LEFT JOIN material_price_levels opl ON opl.id=cmp.outstation_price_level_id
      WHERE cmp.customer_id=? AND cmp.status='active' AND cmp.resolution_state='ready' AND NOT EXISTS(
        SELECT 1 FROM customer_product_pricing cpp WHERE cpp.customer_id=cmp.customer_id AND cpp.product_id=p.id AND cpp.status='active'
      )
    )
    SELECT p.id productId,p.product_code productCode,p.full_name materialName,p.short_form shortForm,p.unit,
      c.id categoryId,COALESCE(c.category_name,'Uncategorized') categoryName,COALESCE(c.sort_order,9999) categorySortOrder,
      e.material_id materialId,e.pricing_source pricingSource,e.price_type priceType,e.standard_price_level_id standardPriceLevelId,
      e.standard_price standardPrice,e.standard_effective_date standardEffectiveDate,CAST(e.outstation_enabled AS INTEGER) outstationEnabled,
      e.outstation_price_level_id outstationPriceLevelId,e.outstation_price outstationPrice,e.outstation_effective_date outstationEffectiveDate,
      'ready' resolutionState
    FROM effective e JOIN material_products p ON p.id=e.product_id
    LEFT JOIN material_categories c ON c.id=p.category_id
    ORDER BY COALESCE(c.sort_order,9999),COALESCE(c.category_name,'Uncategorized') COLLATE NOCASE,p.full_name COLLATE NOCASE`).all(customer.id,customer.id).map(item=>({...item,outstationEnabled:Boolean(item.outstationEnabled)}))
  return{items}
}

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
    WITH target_branch AS (
      SELECT * FROM branches WHERE id=? OR jodoo_branch_id=?
    ), effective_pricing AS (
      SELECT cpp.customer_id,p.id product_id,p.material_id,
        CASE WHEN a.price_type='outstation' AND cpp.outstation_enabled=1 AND cpp.outstation_price_level_id IS NOT NULL THEN 'outstation' ELSE 'standard' END price_type,
        CASE WHEN a.price_type='outstation' AND cpp.outstation_enabled=1 AND cpp.outstation_price_level_id IS NOT NULL THEN cpp.outstation_price_level_id ELSE cpp.standard_price_level_id END price_group_id,
        CASE WHEN a.price_type='outstation' AND cpp.outstation_enabled=1 AND cpp.outstation_price_level_id IS NOT NULL THEN opl.price_amount ELSE spl.price_amount END current_price,
        a.id availability_id
      FROM target_branch b
      JOIN customer_product_pricing cpp ON cpp.customer_id=b.customer_id AND cpp.status='active'
      JOIN material_products p ON p.id=cpp.product_id AND p.status='active'
      LEFT JOIN branch_product_availability a ON a.branch_id=b.id AND a.product_id=p.id AND a.is_selectable=1
      LEFT JOIN material_price_levels spl ON spl.id=cpp.standard_price_level_id AND spl.product_id=p.id
      LEFT JOIN material_price_levels opl ON opl.id=cpp.outstation_price_level_id AND opl.product_id=p.id
      UNION ALL
      SELECT cmp.customer_id,p.id product_id,p.material_id,cmp.price_type,
        CASE WHEN cmp.price_type='outstation' THEN cmp.outstation_price_level_id ELSE cmp.standard_price_level_id END price_group_id,
        CASE WHEN cmp.price_type='outstation' THEN COALESCE(cmp.outstation_special_price,opl.price_amount) ELSE COALESCE(cmp.standard_special_price,spl.price_amount) END current_price,
        NULL availability_id
      FROM target_branch b
      JOIN customer_material_pricing cmp ON cmp.customer_id=b.customer_id AND cmp.status='active' AND cmp.resolution_state='ready'
      JOIN material_products p ON p.material_id=cmp.material_id AND p.status='active'
      LEFT JOIN material_price_levels spl ON spl.id=cmp.standard_price_level_id
      LEFT JOIN material_price_levels opl ON opl.id=cmp.outstation_price_level_id
      WHERE NOT EXISTS (
        SELECT 1 FROM customer_product_pricing cpp
        WHERE cpp.customer_id=b.customer_id AND cpp.product_id=p.id AND cpp.status='active'
      )
    )
    SELECT ep.availability_id availabilityId,b.id branchInternalId,b.jodoo_branch_id branchId,
      m.id materialId,m.material_code materialCode,COALESCE(m.full_name,m.material_name) materialFullName,
      p.id productId,p.product_code productCode,p.full_name fullName,p.short_form shortForm,p.unit,
      1 isSelectable,ep.price_type priceType,ep.price_group_id priceGroupId,ep.current_price currentPrice,
      NULL itemCode,1 priceConfigurationEnabled
    FROM target_branch b
    JOIN effective_pricing ep ON ep.customer_id=b.customer_id
    JOIN material_products p ON p.id=ep.product_id
    JOIN materials m ON m.id=ep.material_id
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
  const effectivePricing=`
    SELECT cpp.customer_id,p.id product_id,'standard' price_type,cpp.standard_price_level_id standard_price_group,cpp.outstation_price_level_id outstation_price_group,spl.price_amount standard_price,opl.price_amount outstation_price
    FROM customer_product_pricing cpp JOIN material_products p ON p.id=cpp.product_id
    LEFT JOIN material_price_levels spl ON spl.id=cpp.standard_price_level_id AND spl.product_id=p.id
    LEFT JOIN material_price_levels opl ON opl.id=cpp.outstation_price_level_id AND opl.product_id=p.id
    WHERE cpp.status='active'
    UNION ALL
    SELECT cmp.customer_id,p.id product_id,cmp.price_type,cmp.standard_price_level_id,cmp.outstation_price_level_id,COALESCE(cmp.standard_special_price,spl.price_amount),COALESCE(cmp.outstation_special_price,opl.price_amount)
    FROM customer_material_pricing cmp JOIN material_products p ON p.material_id=cmp.material_id
    LEFT JOIN material_price_levels spl ON spl.id=cmp.standard_price_level_id
    LEFT JOIN material_price_levels opl ON opl.id=cmp.outstation_price_level_id
    WHERE cmp.status='active' AND cmp.resolution_state='ready' AND NOT EXISTS(
      SELECT 1 FROM customer_product_pricing cpp WHERE cpp.customer_id=cmp.customer_id AND cpp.product_id=p.id AND cpp.status='active'
    )`
  const coverage=database.prepare(`
    WITH effective AS (${effectivePricing})
    SELECT p.product_code productCode,p.full_name fullName,COUNT(DISTINCT b.id) coveredBranches
    FROM material_products p LEFT JOIN effective e ON e.product_id=p.id LEFT JOIN branches b ON b.customer_id=e.customer_id
    WHERE p.product_code IN (${baseCodes.map(()=>'?').join(',')})
    GROUP BY p.id ORDER BY p.product_code
  `).all(...baseCodes).map(row=>({...row,missingBranches:branchCount-row.coveredBranches}))
  const rows=database.prepare(`
    WITH effective AS (${effectivePricing})
    SELECT b.jodoo_branch_id branchId,b.branch_name branchName,m.material_code materialCode,
      COALESCE(m.full_name,m.material_name) material,p.product_code productCode,p.full_name fullName,
      p.short_form shortForm,p.unit,CASE WHEN e.product_id IS NULL THEN 0 ELSE 1 END isSelectable,e.price_type priceType,
      e.standard_price_group standardPriceGroup,e.outstation_price_group outstationPriceGroup,
      CASE WHEN e.price_type='outstation' THEN e.outstation_price ELSE e.standard_price END currentPrice,
      NULL itemCode,
      GROUP_CONCAT(DISTINCT lm.legacy_item_id) legacyItemIds,
      GROUP_CONCAT(DISTINCT lm.legacy_item_name) legacyNames
    FROM branches b
    CROSS JOIN material_products p
    JOIN materials m ON m.id=p.material_id
    LEFT JOIN effective e ON e.customer_id=b.customer_id AND e.product_id=p.id
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
