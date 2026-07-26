import {db as defaultDb} from './database.mjs'
import {
  COLLECTION_FREQUENCIES,
  COLLECTION_WEEKDAYS,
  normalizeCollectionSettings,
} from '../shared/collectionSettings.js'

export {COLLECTION_FREQUENCIES, normalizeCollectionSettings}
export const WEEKDAYS=COLLECTION_WEEKDAYS
const text=value=>String(value??'').trim()
const amount=value=>{const number=Number(value);if(!Number.isFinite(number)||number<0)throw new Error('Price must be zero or greater');return Math.round(number*1e6)/1e6}
const specialPriceAmount=value=>{
  const raw=text(value),number=Number(raw)
  if(!raw||!Number.isFinite(number))throw new Error('Special Price must be a valid number')
  if(number<0)throw new Error('Special Price cannot be negative')
  if((raw.split('.')[1]||'').length>3)throw new Error('Special Price supports up to 3 decimal places')
  return Math.round(number*1e3)/1e3
}

export function listBranchMaterials(branchId,database=defaultDb){
  return database.prepare(`SELECT s.id,s.branch_id branchInternalId,m.id materialId,m.material_code materialCode,m.material_name materialName,m.unit,
    s.price_type priceType,s.customer_material_pricing_id customerMaterialPricingId,s.uses_legacy_price usesLegacyPrice,
    CASE WHEN s.uses_legacy_price=1 THEN s.legacy_price_level_id WHEN s.price_type='outstation' THEN cmp.outstation_price_level_id ELSE cmp.standard_price_level_id END priceLevelId,
    CASE WHEN s.uses_legacy_price=1 THEN s.legacy_special_price WHEN s.price_type='outstation' THEN cmp.outstation_special_price ELSE cmp.standard_special_price END specialPrice,
    CASE WHEN s.uses_legacy_price=1 THEN COALESCE(s.legacy_special_price,legacy.price_amount) WHEN s.price_type='outstation' THEN COALESCE(cmp.outstation_special_price,outstation.price_amount) ELSE COALESCE(cmp.standard_special_price,standard.price_amount) END currentPrice,
    CASE WHEN s.uses_legacy_price=1 THEN 'legacy_compatibility' WHEN (s.price_type='outstation' AND cmp.outstation_special_price IS NOT NULL) OR (s.price_type='standard' AND cmp.standard_special_price IS NOT NULL) THEN 'customer_special_price' ELSE 'customer_price_level' END priceSource,
    CASE WHEN s.uses_legacy_price=1 THEN COALESCE(s.legacy_effective_date,legacy.effective_date) WHEN s.price_type='outstation' THEN COALESCE(cmp.outstation_effective_date,outstation.effective_date) ELSE COALESCE(cmp.standard_effective_date,standard.effective_date) END effectiveDate,
    'active' status
    FROM branch_material_price_selections s JOIN materials m ON m.id=s.material_id
    LEFT JOIN customer_material_pricing cmp ON cmp.id=s.customer_material_pricing_id
    LEFT JOIN material_price_levels legacy ON legacy.id=s.legacy_price_level_id
    LEFT JOIN material_price_levels standard ON standard.id=cmp.standard_price_level_id
    LEFT JOIN material_price_levels outstation ON outstation.id=cmp.outstation_price_level_id
    WHERE s.branch_id=?
    UNION ALL
    SELECT bmp.id,bmp.branch_id,m.id,m.material_code,m.material_name,m.unit,'standard',NULL,1,bmp.price_level_id,bmp.special_price,
      COALESCE(bmp.special_price,pl.price_amount),'legacy_compatibility',COALESCE(bmp.effective_date,pl.effective_date),bmp.status
    FROM branch_material_prices bmp JOIN materials m ON m.id=bmp.material_id LEFT JOIN material_price_levels pl ON pl.id=bmp.price_level_id
    WHERE bmp.branch_id=? AND NOT EXISTS(SELECT 1 FROM branch_material_price_selections s WHERE s.branch_id=bmp.branch_id AND s.material_id=bmp.material_id)
    ORDER BY materialName`).all(branchId,branchId).map(item=>({...item,usesLegacyPrice:Boolean(item.usesLegacyPrice)}))
}

export function listCustomerMaterialPricing(customerId,database=defaultDb){
  const customer=database.prepare('SELECT id,jodoo_customer_id customerId,name customerName FROM customers WHERE id=? OR jodoo_customer_id=?').get(Number(customerId)||-1,String(customerId))
  if(!customer)return null
  const items=database.prepare(`SELECT cmp.id,m.id materialId,m.material_code materialCode,m.material_name materialName,m.unit,cmp.status,
    cmp.standard_price_level_id standardPriceLevelId,cmp.standard_special_price standardSpecialPrice,COALESCE(cmp.standard_special_price,spl.price_amount) standardPrice,COALESCE(cmp.standard_effective_date,spl.effective_date) standardEffectiveDate,
    cmp.outstation_enabled outstationEnabled,cmp.outstation_price_level_id outstationPriceLevelId,cmp.outstation_special_price outstationSpecialPrice,COALESCE(cmp.outstation_special_price,opl.price_amount) outstationPrice,COALESCE(cmp.outstation_effective_date,opl.effective_date) outstationEffectiveDate,
    (SELECT COUNT(*) FROM branch_material_price_selections s JOIN branches b ON b.id=s.branch_id WHERE s.customer_material_pricing_id=cmp.id AND b.customer_id=cmp.customer_id AND s.price_type='standard') standardBranchCount,
    (SELECT COUNT(*) FROM branch_material_price_selections s JOIN branches b ON b.id=s.branch_id WHERE s.customer_material_pricing_id=cmp.id AND b.customer_id=cmp.customer_id AND s.price_type='outstation') outstationBranchCount,
    (SELECT COUNT(*) FROM branch_material_price_selections s JOIN branches b ON b.id=s.branch_id WHERE s.customer_material_pricing_id=cmp.id AND b.customer_id=cmp.customer_id AND s.uses_legacy_price=1) legacyBranchCount
    FROM customer_material_pricing cmp JOIN materials m ON m.id=cmp.material_id LEFT JOIN material_price_levels spl ON spl.id=cmp.standard_price_level_id LEFT JOIN material_price_levels opl ON opl.id=cmp.outstation_price_level_id
    WHERE cmp.customer_id=? AND cmp.status='active' ORDER BY m.material_name`).all(customer.id)
  for(const item of items){
    item.outstationEnabled=Boolean(item.outstationEnabled)
    item.standardBranches=database.prepare(`SELECT b.jodoo_branch_id branchId,b.branch_name branchName FROM branch_material_price_selections s JOIN branches b ON b.id=s.branch_id WHERE s.customer_material_pricing_id=? AND s.price_type='standard' ORDER BY b.branch_name`).all(item.id)
    item.outstationBranches=database.prepare(`SELECT b.jodoo_branch_id branchId,b.branch_name branchName FROM branch_material_price_selections s JOIN branches b ON b.id=s.branch_id WHERE s.customer_material_pricing_id=? AND s.price_type='outstation' ORDER BY b.branch_name`).all(item.id)
  }
  return{...customer,items}
}

const priceChoice=(item,prefix,database)=>{
  const special=item[`${prefix}SpecialPrice`]!==''&&item[`${prefix}SpecialPrice`]!=null?specialPriceAmount(item[`${prefix}SpecialPrice`]):null
  const levelId=special==null?Number(item[`${prefix}PriceLevelId`])||null:null
  let level=null
  if(levelId){level=database.prepare('SELECT * FROM material_price_levels WHERE id=? AND material_id=?').get(levelId,Number(item.materialId));if(!level)throw new Error(`${prefix} Price Level does not belong to the selected Material`)}
  if(!levelId&&special==null)throw new Error(`${prefix} Price is required`)
  return{levelId,special,effectiveDate:text(item[`${prefix}EffectiveDate`])||(special!=null?new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kuching'}):level.effective_date)}
}

export function saveCustomerMaterialPricing(customerId,items,{changedBy='Administrator',reason='Customer material pricing update',confirmed=false,removedMaterialIds=[]}={},database=defaultDb){
  const removals=[...new Set((Array.isArray(removedMaterialIds)?removedMaterialIds:[]).map(Number).filter(Boolean))]
  if(!Array.isArray(items)&&removals.length===0)return{changed:false,...listCustomerMaterialPricing(customerId,database)}
  const customer=database.prepare('SELECT id,jodoo_customer_id FROM customers WHERE id=? OR jodoo_customer_id=?').get(Number(customerId)||-1,String(customerId));if(!customer)throw new Error('Customer not found')
  const submittedItems=Array.isArray(items)?items:[],materialIds=submittedItems.map(item=>Number(item.materialId));if(materialIds.some(id=>!id)||new Set(materialIds).size!==materialIds.length)throw new Error('The same Material cannot be added more than once')
  if(removals.some(materialId=>materialIds.includes(materialId)))throw new Error('A Material cannot be updated and removed in the same request')
  const before=listCustomerMaterialPricing(customer.id,database),upsert=database.prepare(`INSERT INTO customer_material_pricing(customer_id,material_id,standard_price_level_id,standard_special_price,standard_effective_date,outstation_enabled,outstation_price_level_id,outstation_special_price,outstation_effective_date,status,updated_by)
    VALUES(?,?,?,?,?,?,?,?,?,'active',?) ON CONFLICT(customer_id,material_id) DO UPDATE SET standard_price_level_id=excluded.standard_price_level_id,standard_special_price=excluded.standard_special_price,standard_effective_date=excluded.standard_effective_date,outstation_enabled=excluded.outstation_enabled,outstation_price_level_id=excluded.outstation_price_level_id,outstation_special_price=excluded.outstation_special_price,outstation_effective_date=excluded.outstation_effective_date,status='active',updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`)
  let changed=false
  for(const item of submittedItems){
    const materialId=Number(item.materialId);if(!database.prepare('SELECT id FROM materials WHERE id=?').get(materialId))throw new Error('Material not found')
    const standard=priceChoice(item,'standard',database),outstationEnabled=Boolean(item.outstationEnabled),outstation=outstationEnabled?priceChoice(item,'outstation',database):{levelId:null,special:null,effectiveDate:null}
    const old=before.items.find(entry=>entry.materialId===materialId),next={standardPriceLevelId:standard.levelId,standardSpecialPrice:standard.special,standardEffectiveDate:standard.effectiveDate,outstationEnabled,outstationPriceLevelId:outstation.levelId,outstationSpecialPrice:outstation.special,outstationEffectiveDate:outstation.effectiveDate}
    if(old?.outstationBranchCount&&!outstationEnabled)throw new Error('Move all Outstation Branches to Standard before disabling Outstation Price')
    const oldComparable=old&&{standardPriceLevelId:old.standardPriceLevelId,standardSpecialPrice:old.standardSpecialPrice,standardEffectiveDate:old.standardEffectiveDate,outstationEnabled:old.outstationEnabled,outstationPriceLevelId:old.outstationPriceLevelId,outstationSpecialPrice:old.outstationSpecialPrice,outstationEffectiveDate:old.outstationEffectiveDate}
    const configChanged=!old||JSON.stringify(oldComparable)!==JSON.stringify(next),activatingLegacy=Boolean(old?.legacyBranchCount)
    if(old&&(configChanged||activatingLegacy)&&(old.standardBranchCount+old.outstationBranchCount)>0&&!confirmed)throw new Error(`Second confirmation is required: ${old.standardBranchCount} Standard and ${old.outstationBranchCount} Outstation Branches are affected`)
    upsert.run(customer.id,materialId,standard.levelId,standard.special,standard.effectiveDate,outstationEnabled?1:0,outstation.levelId,outstation.special,outstation.effectiveDate,changedBy)
    const current=database.prepare('SELECT * FROM customer_material_pricing WHERE customer_id=? AND material_id=?').get(customer.id,materialId)
    if(configChanged||confirmed)database.prepare('UPDATE branch_material_price_selections SET customer_material_pricing_id=?,uses_legacy_price=0,updated_at=CURRENT_TIMESTAMP WHERE material_id=? AND branch_id IN(SELECT id FROM branches WHERE customer_id=?)').run(current.id,materialId,customer.id)
    if(configChanged||activatingLegacy){
      database.prepare(`INSERT INTO customer_material_pricing_history(customer_material_pricing_id,customer_id,material_id,before_json,after_json,affected_standard_branch_count,affected_outstation_branch_count,reason,changed_by) VALUES(?,?,?,?,?,?,?,?,?)`).run(current.id,customer.id,materialId,old?JSON.stringify(oldComparable):null,JSON.stringify(next),old?.standardBranchCount||0,old?.outstationBranchCount||0,text(reason)||'Customer material pricing update',changedBy)
      changed=true
    }
  }
  for(const materialId of removals){
    const current=database.prepare('SELECT * FROM customer_material_pricing WHERE customer_id=? AND material_id=?').get(customer.id,materialId)
    if(!current||current.status==='inactive')continue
    const branchCount=database.prepare(`SELECT COUNT(DISTINCT s.branch_id) count FROM branch_material_price_selections s JOIN branches b ON b.id=s.branch_id WHERE b.customer_id=? AND s.material_id=?`).get(customer.id,materialId).count
    if(branchCount>0)throw new Error(`Cannot remove Customer Material Pricing while ${branchCount} Branches still use it`)
    const old=before.items.find(entry=>entry.materialId===materialId),after={...(old||current),status:'inactive',removed:true}
    database.prepare("UPDATE customer_material_pricing SET status='inactive',updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND customer_id=?").run(changedBy,current.id,customer.id)
    database.prepare(`INSERT INTO customer_material_pricing_history(customer_material_pricing_id,customer_id,material_id,before_json,after_json,affected_standard_branch_count,affected_outstation_branch_count,reason,changed_by) VALUES(?,?,?,?,?,?,?,?,?)`).run(current.id,customer.id,materialId,JSON.stringify(old||current),JSON.stringify(after),old?.standardBranchCount||0,old?.outstationBranchCount||0,text(reason)||'Customer material pricing removed',changedBy)
    changed=true
  }
  return{changed,...listCustomerMaterialPricing(customer.id,database)}
}

export function replaceBranchMaterialSelections(branchId,items,{changedBy='Supervisor',reason='Branch material price type update'}={},database=defaultDb){
  if(!Array.isArray(items))return{changed:false,items:listBranchMaterials(branchId,database)}
  const branch=database.prepare('SELECT id,customer_id FROM branches WHERE id=?').get(branchId);if(!branch)throw new Error('Branch not found')
  const materialIds=items.map(item=>Number(item.materialId));if(materialIds.some(id=>!id)||new Set(materialIds).size!==materialIds.length)throw new Error('The same Material cannot be added more than once')
  const legacyPayload=items.length>0&&items.every(item=>!Object.hasOwn(item,'priceType')&&(item.priceLevelId||item.specialPrice!==undefined))
  if(legacyPayload){
    const result=replaceBranchMaterials(branchId,items,{changedBy,reason},database)
    for(const item of items){
      const legacy=database.prepare('SELECT * FROM branch_material_prices WHERE branch_id=? AND material_id=?').get(branchId,Number(item.materialId))
      let pricing=database.prepare('SELECT * FROM customer_material_pricing WHERE customer_id=? AND material_id=?').get(branch.customer_id,Number(item.materialId))
      if(!pricing){saveCustomerMaterialPricing(branch.customer_id,[{materialId:item.materialId,standardPriceLevelId:legacy.price_level_id,standardSpecialPrice:legacy.special_price}],{changedBy,reason,confirmed:true},database);pricing=database.prepare('SELECT * FROM customer_material_pricing WHERE customer_id=? AND material_id=?').get(branch.customer_id,Number(item.materialId))}
      database.prepare(`INSERT INTO branch_material_price_selections(branch_id,material_id,customer_material_pricing_id,price_type,uses_legacy_price,legacy_price_level_id,legacy_special_price,legacy_effective_date,assigned_by)
        VALUES(?,?,?,'standard',1,?,?,?,?) ON CONFLICT(branch_id,material_id) DO UPDATE SET customer_material_pricing_id=excluded.customer_material_pricing_id,price_type='standard',uses_legacy_price=1,legacy_price_level_id=excluded.legacy_price_level_id,legacy_special_price=excluded.legacy_special_price,legacy_effective_date=excluded.legacy_effective_date,assigned_by=excluded.assigned_by,updated_at=CURRENT_TIMESTAMP`).run(branchId,Number(item.materialId),pricing.id,legacy.price_level_id,legacy.special_price,legacy.effective_date,changedBy)
    }
    return{...result,items:listBranchMaterials(branchId,database)}
  }
  const before=listBranchMaterials(branchId,database),keep=new Set()
  for(const item of items){
    const materialId=Number(item.materialId),priceType=text(item.priceType||'standard').toLowerCase();if(!['standard','outstation'].includes(priceType))throw new Error('Price Type must be Standard or Outstation')
    let pricing=database.prepare('SELECT * FROM customer_material_pricing WHERE customer_id=? AND material_id=? AND status=?').get(branch.customer_id,materialId,'active')
    if(!pricing&&(item.priceLevelId||item.specialPrice!==undefined)){
      saveCustomerMaterialPricing(branch.customer_id,[{materialId,standardPriceLevelId:item.priceLevelId,standardSpecialPrice:item.specialPrice}],{changedBy,reason,confirmed:true},database)
      pricing=database.prepare('SELECT * FROM customer_material_pricing WHERE customer_id=? AND material_id=? AND status=?').get(branch.customer_id,materialId,'active')
    }
    if(!pricing)throw new Error('Please configure this Material under Customer Material Pricing first')
    if(priceType==='outstation'&&!pricing.outstation_enabled)throw new Error('Outstation Price is not enabled for this Customer and Material')
    const old=before.find(entry=>entry.materialId===materialId),preserveLegacy=old?.usesLegacyPrice&&old.priceType===priceType?1:0
    database.prepare(`INSERT INTO branch_material_price_selections(branch_id,material_id,customer_material_pricing_id,price_type,uses_legacy_price,assigned_by)
      VALUES(?,?,?,?,?,?) ON CONFLICT(branch_id,material_id) DO UPDATE SET customer_material_pricing_id=excluded.customer_material_pricing_id,price_type=excluded.price_type,uses_legacy_price=excluded.uses_legacy_price,assigned_by=excluded.assigned_by,updated_at=CURRENT_TIMESTAMP`).run(branchId,materialId,pricing.id,priceType,preserveLegacy,changedBy)
    if(!old||old.priceType!==priceType||old.customerMaterialPricingId!==pricing.id)database.prepare(`INSERT INTO branch_material_price_selection_history(branch_id,material_id,old_price_type,new_price_type,old_customer_material_pricing_id,new_customer_material_pricing_id,reason,changed_by) VALUES(?,?,?,?,?,?,?,?)`).run(branchId,materialId,old?.priceType||null,priceType,old?.customerMaterialPricingId||null,pricing.id,text(reason)||'Branch material price type update',changedBy)
    keep.add(materialId)
  }
  for(const old of before)if(!keep.has(old.materialId)){database.prepare('DELETE FROM branch_material_price_selections WHERE branch_id=? AND material_id=?').run(branchId,old.materialId);database.prepare('DELETE FROM branch_material_prices WHERE branch_id=? AND material_id=?').run(branchId,old.materialId)}
  const after=listBranchMaterials(branchId,database);return{changed:JSON.stringify(before)!==JSON.stringify(after),items:after,before}
}

export function replaceBranchMaterials(branchId,items,{changedBy='Supervisor',reason='Branch material price update'}={},database=defaultDb){
  if(!Array.isArray(items))return{changed:false,items:listBranchMaterials(branchId,database)}
  const materialIds=items.map(item=>Number(item.materialId))
  if(materialIds.some(id=>!id)||new Set(materialIds).size!==materialIds.length)throw new Error('The same Material cannot be added more than once')
  const before=listBranchMaterials(branchId,database),beforeBy=new Map(before.map(item=>[item.materialId,item]))
  const keep=new Set()
  const upsert=database.prepare(`INSERT INTO branch_material_prices(branch_id,material_id,price_level_id,special_price,effective_date,status,assigned_by)
    VALUES(?,?,?,?,?,'active',?) ON CONFLICT(branch_id,material_id) DO UPDATE SET price_level_id=excluded.price_level_id,special_price=excluded.special_price,effective_date=excluded.effective_date,status='active',assigned_by=excluded.assigned_by,updated_at=CURRENT_TIMESTAMP`)
  const history=database.prepare(`INSERT INTO branch_material_price_history(branch_id,material_id,old_price_level_id,new_price_level_id,old_special_price,new_special_price,reason,changed_by) VALUES(?,?,?,?,?,?,?,?)`)
  for(const item of items){
    const materialId=Number(item.materialId),material=database.prepare('SELECT * FROM materials WHERE id=?').get(materialId);if(!material)throw new Error('Material not found')
    const special=item.specialPrice!==''&&item.specialPrice!=null?specialPriceAmount(item.specialPrice):null
    const priceLevelId=special==null?Number(item.priceLevelId)||null:null
    let level=null
    if(priceLevelId){level=database.prepare('SELECT * FROM material_price_levels WHERE id=? AND material_id=?').get(priceLevelId,materialId);if(!level)throw new Error('Price Level does not belong to the selected Material')}
    if(!priceLevelId&&special==null)throw new Error(`Select a Price Level or Special Price for ${material.material_name}`)
    const effectiveDate=text(item.effectiveDate)||(special!=null?new Date().toISOString().slice(0,10):level.effective_date),old=beforeBy.get(materialId)
    upsert.run(branchId,materialId,priceLevelId,special,effectiveDate,changedBy)
    if(!old||old.priceLevelId!==priceLevelId||old.specialPrice!==special)history.run(branchId,materialId,old?.priceLevelId||null,priceLevelId,old?.specialPrice??null,special,reason,changedBy)
    keep.add(materialId)
  }
  for(const old of before)if(!keep.has(old.materialId)){database.prepare('DELETE FROM branch_material_prices WHERE branch_id=? AND material_id=?').run(branchId,old.materialId);history.run(branchId,old.materialId,old.priceLevelId,null,old.specialPrice??null,null,reason,changedBy)}
  const after=listBranchMaterials(branchId,database)
  return{changed:JSON.stringify(before)!==JSON.stringify(after),items:after,before}
}

export function listMaterials({includeInactive=false}={},database=defaultDb){
  return database.prepare(`SELECT m.id,m.material_code materialCode,m.material_name materialName,m.unit,m.status,
    COUNT(DISTINCT pl.id) priceLevelCount,COUNT(DISTINCT COALESCE(s.branch_id,bmp.branch_id)) branchCount
    FROM materials m LEFT JOIN material_price_levels pl ON pl.material_id=m.id LEFT JOIN branch_material_price_selections s ON s.material_id=m.id LEFT JOIN branch_material_prices bmp ON bmp.material_id=m.id AND bmp.status='active'
    WHERE (?=1 OR m.status='active') GROUP BY m.id ORDER BY m.material_name`).all(includeInactive?1:0)
}

export function getMaterial(materialId,database=defaultDb){
  const material=database.prepare('SELECT id,material_code materialCode,material_name materialName,unit,status,created_by createdBy,created_at createdAt,updated_at updatedAt FROM materials WHERE id=?').get(materialId)
  if(!material)return null
  material.priceLevels=database.prepare(`SELECT pl.id,pl.price_amount priceAmount,pl.effective_date effectiveDate,pl.status,pl.reason,pl.created_by createdBy,pl.created_at createdAt,pl.updated_at updatedAt,
    COUNT(DISTINCT bmp.branch_id) affectedBranchCount FROM material_price_levels pl LEFT JOIN branch_material_prices bmp ON bmp.price_level_id=pl.id AND bmp.status='active' WHERE pl.material_id=? GROUP BY pl.id ORDER BY pl.status='active' DESC,pl.price_amount,pl.effective_date DESC`).all(materialId)
  material.branches=database.prepare(`SELECT b.id internalId,b.jodoo_branch_id branchId,c.name customerName,b.branch_name branchName FROM branches b LEFT JOIN customers c ON c.id=b.customer_id WHERE EXISTS(SELECT 1 FROM branch_material_price_selections s WHERE s.branch_id=b.id AND s.material_id=?) OR EXISTS(SELECT 1 FROM branch_material_prices bmp WHERE bmp.branch_id=b.id AND bmp.material_id=? AND bmp.status='active') ORDER BY c.name,b.branch_name`).all(materialId,materialId).map(branch=>({...branch,...listBranchMaterials(branch.internalId,database).find(item=>item.materialId===Number(materialId))}))
  material.history=database.prepare(`SELECT h.*,pl.material_id materialId FROM material_price_history h JOIN material_price_levels pl ON pl.id=h.price_level_id WHERE pl.material_id=? ORDER BY h.id DESC`).all(materialId)
  return material
}

export function createMaterial(payload,database=defaultDb){
  const code=text(payload.materialCode).toUpperCase().replace(/[^A-Z0-9]+/g,'_'),name=text(payload.materialName),unit=text(payload.unit)||'kg'
  if(!code||!name)throw new Error('Material Code and Material Name are required')
  const result=database.prepare("INSERT INTO materials(material_code,material_name,unit,status,created_by) VALUES(?,?,?,'active',?)").run(code,name,unit,payload.changedBy||'Administrator')
  return getMaterial(Number(result.lastInsertRowid),database)
}

export function createPriceLevel(materialId,payload,database=defaultDb){
  if(!database.prepare('SELECT id FROM materials WHERE id=?').get(materialId))throw new Error('Material not found')
  const price=amount(payload.priceAmount),effectiveDate=text(payload.effectiveDate),reason=text(payload.reason)
  if(!effectiveDate||!reason)throw new Error('Effective Date and modification reason are required')
  const result=database.prepare(`INSERT INTO material_price_levels(material_id,price_amount,effective_date,status,reason,created_by) VALUES(?,?,?,'active',?,?)`).run(materialId,price,effectiveDate,reason,payload.changedBy||'Administrator')
  return database.prepare('SELECT * FROM material_price_levels WHERE id=?').get(result.lastInsertRowid)
}

export function setPriceLevelStatus(priceLevelId,status,payload={},database=defaultDb){
  if(!['active','inactive'].includes(status))throw new Error('Invalid Price Level status')
  const reason=text(payload.reason);if(!reason)throw new Error('Modification reason is required')
  const level=database.prepare('SELECT * FROM material_price_levels WHERE id=?').get(priceLevelId);if(!level)throw new Error('Price Level not found')
  database.prepare('UPDATE material_price_levels SET status=?,reason=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(status,reason,priceLevelId)
  return database.prepare('SELECT * FROM material_price_levels WHERE id=?').get(priceLevelId)
}

export function bulkUpdatePriceLevel(priceLevelId,payload,database=defaultDb){
  if(payload.confirmed!==true)throw new Error('Second confirmation is required before bulk price update')
  const reason=text(payload.reason),effectiveDate=text(payload.effectiveDate),newPrice=amount(payload.newPrice)
  if(!reason||!effectiveDate)throw new Error('Effective Date and modification reason are required')
  const before=database.prepare('SELECT * FROM material_price_levels WHERE id=?').get(priceLevelId);if(!before)throw new Error('Price Level not found')
  const branches=database.prepare(`SELECT DISTINCT b.jodoo_branch_id branchId,c.name customerName,b.branch_name branchName
    FROM branches b LEFT JOIN customers c ON c.id=b.customer_id
    WHERE EXISTS(SELECT 1 FROM branch_material_prices bmp WHERE bmp.branch_id=b.id AND bmp.price_level_id=? AND bmp.status='active')
      OR EXISTS(SELECT 1 FROM branch_material_price_selections s JOIN customer_material_pricing cmp ON cmp.id=s.customer_material_pricing_id WHERE s.branch_id=b.id AND s.uses_legacy_price=0 AND ((s.price_type='standard' AND cmp.standard_price_level_id=?) OR (s.price_type='outstation' AND cmp.outstation_price_level_id=?)))
    ORDER BY c.name,b.branch_name`).all(priceLevelId,priceLevelId,priceLevelId)
  database.exec('BEGIN IMMEDIATE')
  try{
    database.prepare('UPDATE material_price_levels SET price_amount=?,effective_date=?,reason=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(newPrice,effectiveDate,reason,priceLevelId)
    database.prepare(`INSERT INTO material_price_history(price_level_id,old_price,new_price,old_effective_date,new_effective_date,affected_branch_count,reason,changed_by) VALUES(?,?,?,?,?,?,?,?)`).run(priceLevelId,before.price_amount,newPrice,before.effective_date,effectiveDate,branches.length,reason,payload.changedBy||'Administrator')
    database.exec('COMMIT')
  }catch(error){database.exec('ROLLBACK');throw error}
  return{priceLevelId,oldPrice:before.price_amount,newPrice,effectiveDate,affectedBranchCount:branches.length,branches}
}

export function captureDispatchStopPriceSnapshot(stopId,database=defaultDb){
  const stop=database.prepare('SELECT branch_id FROM dispatch_stops WHERE id=?').get(stopId);if(!stop)throw new Error('Dispatch Stop not found')
  const prices=listBranchMaterials(stop.branch_id,database),insert=database.prepare(`INSERT OR IGNORE INTO dispatch_stop_material_prices(dispatch_stop_id,material_id,material_name_snapshot,unit_snapshot,price_snapshot,price_source,price_level_id_snapshot,effective_date_snapshot) VALUES(?,?,?,?,?,?,?,?)`)
  for(const item of prices)insert.run(stopId,item.materialId,item.materialName,item.unit,item.currentPrice,item.specialPrice!=null?'special_price':'price_level',item.priceLevelId,item.effectiveDate)
  return database.prepare('SELECT * FROM dispatch_stop_material_prices WHERE dispatch_stop_id=? ORDER BY material_id').all(stopId)
}
