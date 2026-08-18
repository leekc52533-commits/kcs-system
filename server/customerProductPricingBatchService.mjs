import {saveCustomerProductPricing} from './materialProductService.mjs'

export const APPROVED_PRODUCT_PRICES=Object.freeze({
  ALUMINUM_CAN:5,
  ALUMINIUM_ANGLE:5,
  MIXED_ALLOY:.8,
  WET_BATTERY:1.2,
  DRY_BATTERY:1.6,
  SMALL_BATTERY:.8,
  COPPER:12,
  AIR_CONDITIONER:20,
  MIXED_ELECTRICAL_GOODS:.1,
  TV_MONITOR:3,
  ALL_SCRAPPED:.1,
  TANK:90,
  NEWSPAPER:.25,
  BLACK_WHITE_PAPER:.3,
  MIXED_PAPER:.05,
  MIX_PLASTIC:.2,
  SALI_TIN:.3,
  G1:.6,
  G2:.4,
})

const reason='Approved product pricing for active OCC Customers on 2026-08-18'
const priceReason='Approved Scrap Iron G1 price RM0.60 on 2026-08-18'
const runId='approved-customer-product-pricing-20260818'
const json=value=>JSON.stringify(value)

function targetCustomers(database){
  return database.prepare(`SELECT DISTINCT c.id,c.jodoo_customer_id customerId,c.name
    FROM customers c JOIN customer_material_pricing cmp ON cmp.customer_id=c.id
    JOIN materials m ON m.id=cmp.material_id AND m.material_code='OCC'
    WHERE c.status='active' AND cmp.status='active' AND cmp.resolution_state='ready'
      AND CAST(c.jodoo_customer_id AS TEXT)<>'10268'
    ORDER BY c.id`).all()
}

function approvedProducts(database){
  const products=database.prepare(`SELECT p.id,p.product_code productCode,p.full_name fullName
    FROM material_products p WHERE p.status='active' AND p.visibility_status='active' AND p.product_code<>'OCC'
    ORDER BY p.id`).all()
  const expectedCodes=Object.keys(APPROVED_PRODUCT_PRICES).sort(),actualCodes=products.map(item=>item.productCode).sort()
  if(json(actualCodes)!==json(expectedCodes))throw new Error(`Approved Product set mismatch: expected ${expectedCodes.join(',')}; found ${actualCodes.join(',')}`)
  return products.map(product=>{
    const desiredPrice=APPROVED_PRODUCT_PRICES[product.productCode],desiredCents=Math.round(desiredPrice*100)
    let level=database.prepare(`SELECT * FROM material_price_levels WHERE product_id=? AND status='active' AND visibility_status='active' AND price_cents=?`).get(product.id,desiredCents)
    if(product.productCode==='G1'&&!level){
      level=database.prepare("SELECT * FROM material_price_levels WHERE product_id=? AND status='active' AND visibility_status='active' AND price_cents=50").get(product.id)
      if(!level)throw new Error('G1 must have the approved source Price Group RM0.50 or final Price Group RM0.60')
    }
    if(!level)throw new Error(`${product.productCode} is missing approved Price Group RM${desiredPrice.toFixed(2)}`)
    return{...product,priceLevelId:Number(level.id),currentPrice:Number(level.price_amount),desiredPrice,desiredCents}
  })
}

function snapshotProtected(database){
  return{
    occ:json(database.prepare(`SELECT cmp.* FROM customer_material_pricing cmp JOIN materials m ON m.id=cmp.material_id WHERE m.material_code='OCC' ORDER BY cmp.id`).all()),
    testing:json(database.prepare(`SELECT cpp.* FROM customer_product_pricing cpp JOIN customers c ON c.id=cpp.customer_id WHERE CAST(c.jodoo_customer_id AS TEXT)='10268' ORDER BY cpp.id`).all()),
  }
}

export function runApprovedCustomerProductPricingBatch(database,{apply=false,expectedTargetCount=255,changedBy='KC'}={}){
  if(!database)throw new Error('Database connection is required')
  if(database.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw new Error('Pre-write integrity_check failed')
  if(database.prepare('PRAGMA foreign_key_check').all().length)throw new Error('Pre-write foreign_key_check failed')
  const customers=targetCustomers(database),products=approvedProducts(database)
  if(customers.length!==expectedTargetCount)throw new Error(`Expected ${expectedTargetCount} eligible Customers, found ${customers.length}`)
  if(products.length!==19)throw new Error(`Expected 19 approved Products, found ${products.length}`)
  const existing=database.prepare(`SELECT * FROM customer_product_pricing WHERE customer_id IN (${customers.map(()=>'?').join(',')}) AND product_id IN (${products.map(()=>'?').join(',')})`).all(...customers.map(item=>item.id),...products.map(item=>item.id))
  const existingMap=new Map(existing.map(item=>[`${item.customer_id}:${item.product_id}`,item]))
  let inserts=0,updates=0,unchanged=0
  for(const customer of customers)for(const product of products){
    const old=existingMap.get(`${customer.id}:${product.id}`)
    if(!old)inserts+=1
    else if(old.status!=='active'||Number(old.standard_price_level_id)!==product.priceLevelId||Boolean(old.outstation_enabled)||old.outstation_price_level_id!=null)updates+=1
    else unchanged+=1
  }
  const g1=products.find(item=>item.productCode==='G1'),g1PriceChange=Math.abs(g1.currentPrice-.6)>.000001
  if(g1PriceChange&&Math.abs(g1.currentPrice-.5)>.000001)throw new Error(`Unexpected G1 source price RM${g1.currentPrice.toFixed(2)}`)
  const g1Outside=database.prepare(`SELECT COUNT(*) n FROM customer_product_pricing WHERE product_id=? AND customer_id NOT IN (${customers.map(()=>'?').join(',')})`).get(g1.id,...customers.map(item=>item.id)).n
  if(g1Outside)throw new Error(`G1 Price Group has ${g1Outside} Customer references outside the approved scope`)
  const branchRows=database.prepare(`SELECT COUNT(*) n FROM branches WHERE customer_id IN (${customers.map(()=>'?').join(',')})`).get(...customers.map(item=>item.id)).n
  const preview={mode:apply?'APPLY':'DRY_RUN',targetCustomers:customers.length,targetBranches:branchRows,products:products.length,desiredConnections:customers.length*products.length,existingConnections:existing.length,inserts,updates,unchanged,g1PriceChange,testingExcluded:true,prices:Object.fromEntries(products.map(item=>[item.productCode,item.desiredPrice]))}
  if(!apply)return preview
  const protectedBefore=snapshotProtected(database),auditBefore=database.prepare('SELECT COUNT(*) n FROM material_conversion_audit WHERE run_id=?').get(runId).n,historyBefore=database.prepare('SELECT COUNT(*) n FROM product_price_group_history WHERE reason=? AND changed_by=?').get(priceReason,changedBy).n
  database.exec('BEGIN IMMEDIATE')
  try{
    if(g1PriceChange){
      const collision=database.prepare('SELECT id FROM material_price_levels WHERE product_id=? AND price_cents=60 AND id<>?').get(g1.id,g1.priceLevelId)
      if(collision)throw new Error('G1 RM0.60 Price Group collision')
      const affected=database.prepare('SELECT COUNT(*) n FROM branch_product_price_assignments WHERE price_level_id=?').get(g1.priceLevelId).n
      database.prepare(`INSERT INTO product_price_group_history(price_level_id,product_id,old_price_amount,new_price_amount,old_effective_date,new_effective_date,affected_branch_count,reason,changed_by)
        SELECT id,product_id,price_amount,.6,effective_date,'2026-08-18',?,?,? FROM material_price_levels WHERE id=?`).run(affected,priceReason,changedBy,g1.priceLevelId)
      database.prepare(`UPDATE material_price_levels SET previous_price_amount=price_amount,price_amount=.6,price_cents=60,effective_date='2026-08-18',reason=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(priceReason,g1.priceLevelId)
    }
    let changedConnections=0,availabilityCreated=0
    const items=products.map(product=>({productId:product.id,standardPriceLevelId:product.priceLevelId,outstationEnabled:false}))
    for(const customer of customers){
      const saved=saveCustomerProductPricing(customer.id,items,{changedBy,reason,runId,manageTransaction:false},database)
      changedConnections+=saved.changedCount;availabilityCreated+=saved.availabilityCreated
    }
    const finalRows=database.prepare(`SELECT cpp.customer_id,cpp.product_id,cpp.standard_price_level_id,cpp.outstation_enabled,cpp.outstation_price_level_id,cpp.status
      FROM customer_product_pricing cpp WHERE cpp.customer_id IN (${customers.map(()=>'?').join(',')}) AND cpp.product_id IN (${products.map(()=>'?').join(',')})`).all(...customers.map(item=>item.id),...products.map(item=>item.id))
    const desiredLevels=new Map(products.map(item=>[item.id,item.priceLevelId]))
    const invalid=finalRows.filter(row=>row.status!=='active'||Number(row.standard_price_level_id)!==desiredLevels.get(Number(row.product_id))||Boolean(row.outstation_enabled)||row.outstation_price_level_id!=null)
    const auditAfter=database.prepare('SELECT COUNT(*) n FROM material_conversion_audit WHERE run_id=?').get(runId).n,historyAfter=database.prepare('SELECT COUNT(*) n FROM product_price_group_history WHERE reason=? AND changed_by=?').get(priceReason,changedBy).n
    if(finalRows.length!==customers.length*products.length||invalid.length)throw new Error(`Post-write pricing guard failed: rows=${finalRows.length}, invalid=${invalid.length}`)
    if(changedConnections!==inserts+updates||auditAfter-auditBefore!==changedConnections)throw new Error(`Post-write audit guard failed: changed=${changedConnections}, auditDelta=${auditAfter-auditBefore}`)
    if(historyAfter-historyBefore!==(g1PriceChange?1:0))throw new Error('G1 Price Group history guard failed')
    if(Number(database.prepare('SELECT price_cents FROM material_price_levels WHERE id=?').get(g1.priceLevelId).price_cents)!==60)throw new Error('G1 final price guard failed')
    const protectedAfter=snapshotProtected(database)
    if(json(protectedAfter)!==json(protectedBefore))throw new Error('Protected OCC or testing data changed')
    if(database.prepare('PRAGMA foreign_key_check').all().length)throw new Error('Post-write foreign_key_check failed')
    database.exec('COMMIT')
    return{...preview,ok:true,changedConnections,availabilityCreated,auditRecordsAdded:auditAfter-auditBefore,priceHistoryAdded:historyAfter-historyBefore,finalConnections:finalRows.length,protectedDataUnchanged:true}
  }catch(error){database.exec('ROLLBACK');throw error}
}
