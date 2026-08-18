import {db as defaultDb} from './database.mjs'
import {
  COLLECTION_FREQUENCIES,
  COLLECTION_WEEKDAYS,
  normalizeCollectionSettings,
} from '../shared/collectionSettings.js'
import {sortMaterials} from '../shared/materialOrder.js'

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
  const branch=database.prepare('SELECT id,customer_id FROM branches WHERE id=?').get(branchId)
  if(!branch?.customer_id)return[]
  const items=database.prepare(`SELECT cmp.id,? branchInternalId,m.id materialId,m.material_code materialCode,m.material_name materialName,m.unit,
    cmp.price_type priceType,cmp.id customerMaterialPricingId,0 usesLegacyPrice,
    CASE WHEN cmp.price_type='outstation' THEN cmp.outstation_price_level_id ELSE cmp.standard_price_level_id END priceLevelId,
    CASE WHEN cmp.price_type='outstation' THEN cmp.outstation_special_price ELSE cmp.standard_special_price END specialPrice,
    CASE WHEN cmp.price_type='outstation' THEN COALESCE(cmp.outstation_special_price,outstation.price_amount) ELSE COALESCE(cmp.standard_special_price,standard.price_amount) END currentPrice,
    CASE WHEN (cmp.price_type='outstation' AND cmp.outstation_special_price IS NOT NULL) OR (cmp.price_type='standard' AND cmp.standard_special_price IS NOT NULL) THEN 'customer_special_price' ELSE 'customer_price_level' END priceSource,
    CASE WHEN cmp.price_type='outstation' THEN COALESCE(cmp.outstation_effective_date,outstation.effective_date) ELSE COALESCE(cmp.standard_effective_date,standard.effective_date) END effectiveDate,cmp.status,cmp.resolution_state resolutionState
    FROM customer_material_pricing cmp JOIN materials m ON m.id=cmp.material_id
    LEFT JOIN material_price_levels standard ON standard.id=cmp.standard_price_level_id
    LEFT JOIN material_price_levels outstation ON outstation.id=cmp.outstation_price_level_id
    WHERE cmp.customer_id=? AND cmp.status='active' AND cmp.resolution_state='ready' ORDER BY m.material_name`).all(branch.id,branch.customer_id)
  return sortMaterials(items.map(item=>({...item,usesLegacyPrice:false,inheritedFromCustomer:true})))
}

export function resolveCustomerOccPrice(customerId,database=defaultDb){
  const customer=database.prepare('SELECT id,occ_price occPrice FROM customers WHERE id=? OR jodoo_customer_id=?').get(Number(customerId)||-1,String(customerId))
  if(!customer)return null
  return database.prepare(`SELECT CASE WHEN cmp.price_type='outstation' THEN COALESCE(cmp.outstation_special_price,opl.price_amount) ELSE COALESCE(cmp.standard_special_price,spl.price_amount) END price
    FROM customer_material_pricing cmp JOIN materials m ON m.id=cmp.material_id AND m.material_code='OCC'
    LEFT JOIN material_price_levels spl ON spl.id=cmp.standard_price_level_id LEFT JOIN material_price_levels opl ON opl.id=cmp.outstation_price_level_id
    WHERE cmp.customer_id=? AND cmp.status='active' AND cmp.resolution_state='ready'`).get(customer.id)?.price??customer.occPrice??null
}

export function previewLegacyBranchPricing(customerId,database=defaultDb){
  const customer=database.prepare('SELECT id,jodoo_customer_id customerId,name customerName FROM customers WHERE id=? OR jodoo_customer_id=?').get(Number(customerId)||-1,String(customerId))
  if(!customer)throw new Error('Customer not found')
  const rows=database.prepare(`SELECT b.id branchInternalId,b.jodoo_branch_id branchId,b.branch_name branchName,m.id materialId,m.material_code materialCode,m.material_name materialName,
    COALESCE(s.price_type,'standard') priceType,COALESCE(s.legacy_special_price,legacy.price_amount,bmp.special_price,bpl.price_amount,g.price_amount) price
    FROM branches b
    LEFT JOIN branch_material_price_selections s ON s.branch_id=b.id
    LEFT JOIN materials m ON m.id=s.material_id
    LEFT JOIN material_price_levels legacy ON legacy.id=s.legacy_price_level_id
    LEFT JOIN branch_material_prices bmp ON bmp.branch_id=b.id AND (s.material_id IS NULL OR bmp.material_id=s.material_id) AND bmp.status='active'
    LEFT JOIN material_price_levels bpl ON bpl.id=bmp.price_level_id
    LEFT JOIN branch_occ_price_assignments boa ON boa.branch_id=b.id
    LEFT JOIN occ_price_groups g ON g.id=boa.occ_price_group_id AND g.status='active'
    WHERE b.customer_id=? AND (s.id IS NOT NULL OR bmp.id IS NOT NULL OR g.id IS NOT NULL)`).all(customer.id)
  const groups=new Map()
  for(const row of rows){if(!Number.isFinite(Number(row.price)))continue;const materialId=row.materialId||database.prepare("SELECT id FROM materials WHERE material_code='OCC'").get()?.id,key=`${materialId}:${row.priceType}`;if(!groups.has(key))groups.set(key,{materialId,materialCode:row.materialCode||'OCC',materialName:row.materialName||'OCC',priceType:row.priceType,legacy:[]});groups.get(key).legacy.push({branchInternalId:row.branchInternalId,branchId:row.branchId,branchName:row.branchName,price:Number(row.price)})}
  const proposals=[...groups.values()].map(group=>{const prices=[...new Set(group.legacy.map(item=>item.price))].sort((a,b)=>a-b);return{...group,proposedPrice:Math.max(...prices),conflict:prices.length>1,conflictingPrices:prices}})
  return{customer,readOnly:true,rule:'highest_valid_legacy_price',proposals,conflicts:proposals.filter(item=>item.conflict)}
}

export function listCustomerMaterialPricing(customerId,database=defaultDb){
  const customer=database.prepare('SELECT id,jodoo_customer_id customerId,name customerName FROM customers WHERE id=? OR jodoo_customer_id=?').get(Number(customerId)||-1,String(customerId))
  if(!customer)return null
  const items=database.prepare(`SELECT cmp.id,m.id materialId,m.material_code materialCode,m.material_name materialName,m.unit,cmp.status,cmp.price_type priceType,cmp.resolution_state resolutionState,
    cmp.standard_price_level_id standardPriceLevelId,cmp.standard_special_price standardSpecialPrice,COALESCE(cmp.standard_special_price,spl.price_amount) standardPrice,COALESCE(cmp.standard_effective_date,spl.effective_date) standardEffectiveDate,
    cmp.outstation_enabled outstationEnabled,cmp.outstation_price_level_id outstationPriceLevelId,cmp.outstation_special_price outstationSpecialPrice,COALESCE(cmp.outstation_special_price,opl.price_amount) outstationPrice,COALESCE(cmp.outstation_effective_date,opl.effective_date) outstationEffectiveDate,
    CASE WHEN cmp.resolution_state='ready' AND cmp.price_type='standard' THEN (SELECT COUNT(*) FROM branches b WHERE b.customer_id=cmp.customer_id) ELSE 0 END standardBranchCount,
    CASE WHEN cmp.resolution_state='ready' AND cmp.price_type='outstation' THEN (SELECT COUNT(*) FROM branches b WHERE b.customer_id=cmp.customer_id) ELSE 0 END outstationBranchCount,
    (SELECT COUNT(*) FROM branch_material_price_selections s JOIN branches b ON b.id=s.branch_id WHERE s.customer_material_pricing_id=cmp.id AND b.customer_id=cmp.customer_id AND s.uses_legacy_price=1) legacyBranchCount
    FROM customer_material_pricing cmp JOIN materials m ON m.id=cmp.material_id LEFT JOIN material_price_levels spl ON spl.id=cmp.standard_price_level_id LEFT JOIN material_price_levels opl ON opl.id=cmp.outstation_price_level_id
    WHERE cmp.customer_id=? AND cmp.status='active' ORDER BY m.material_name`).all(customer.id)
  for(const item of items){
    item.outstationEnabled=Boolean(item.outstationEnabled)
    const inherited=item.resolutionState==='ready'?database.prepare(`SELECT jodoo_branch_id branchId,branch_name branchName FROM branches WHERE customer_id=? ORDER BY branch_name`).all(customer.id):[]
    item.standardBranches=item.priceType==='standard'?inherited:[]
    item.outstationBranches=item.priceType==='outstation'?inherited:[]
  }
  return{...customer,items:sortMaterials(items)}
}

const priceChoice=(item,prefix,database)=>{
  const special=item[`${prefix}SpecialPrice`]!==''&&item[`${prefix}SpecialPrice`]!=null?specialPriceAmount(item[`${prefix}SpecialPrice`]):null
  const levelId=special==null?Number(item[`${prefix}PriceLevelId`])||null:null
  let level=null
  if(levelId){level=database.prepare('SELECT * FROM material_price_levels WHERE id=? AND material_id=?').get(levelId,Number(item.materialId));if(!level)throw new Error(`${prefix} Price Level does not belong to the selected Material`)}
  if(!levelId&&special==null)throw new Error(`${prefix} Price is required`)
  return{levelId,special,effectiveDate:text(item[`${prefix}EffectiveDate`])||(special!=null?new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kuching'}):level.effective_date)}
}

const pricingComparable=item=>({materialId:Number(item.materialId),priceType:text(item.priceType||'standard').toLowerCase(),standardPriceLevelId:Number(item.standardPriceLevelId)||null,standardSpecialPrice:item.standardSpecialPrice===''||item.standardSpecialPrice==null?null:Number(item.standardSpecialPrice),standardEffectiveDate:text(item.standardEffectiveDate)||null,outstationEnabled:Boolean(item.outstationEnabled),outstationPriceLevelId:Number(item.outstationPriceLevelId)||null,outstationSpecialPrice:item.outstationSpecialPrice===''||item.outstationSpecialPrice==null?null:Number(item.outstationSpecialPrice),outstationEffectiveDate:text(item.outstationEffectiveDate)||null})
export function customerMaterialPricingHasDelta(customerId,items,removedMaterialIds=[],database=defaultDb){
  if((removedMaterialIds||[]).map(Number).filter(Boolean).length)return true
  if(!Array.isArray(items))return false
  const current=listCustomerMaterialPricing(customerId,database)?.items||[]
  const normalize=values=>values.map(pricingComparable).sort((a,b)=>a.materialId-b.materialId)
  return JSON.stringify(normalize(items))!==JSON.stringify(normalize(current))
}

export function saveCustomerMaterialPricing(customerId,items,{changedBy='Administrator',reason='Customer material pricing update',confirmed=false,removedMaterialIds=[]}={},database=defaultDb){
  const removals=[...new Set((Array.isArray(removedMaterialIds)?removedMaterialIds:[]).map(Number).filter(Boolean))]
  if(!Array.isArray(items)&&removals.length===0)return{changed:false,...listCustomerMaterialPricing(customerId,database)}
  const customer=database.prepare('SELECT id,jodoo_customer_id FROM customers WHERE id=? OR jodoo_customer_id=?').get(Number(customerId)||-1,String(customerId));if(!customer)throw new Error('Customer not found')
  const submittedItems=Array.isArray(items)?items:[],materialIds=submittedItems.map(item=>Number(item.materialId));if(materialIds.some(id=>!id)||new Set(materialIds).size!==materialIds.length)throw new Error('The same Material cannot be added more than once')
  if(removals.some(materialId=>materialIds.includes(materialId)))throw new Error('A Material cannot be updated and removed in the same request')
  const before=listCustomerMaterialPricing(customer.id,database),upsert=database.prepare(`INSERT INTO customer_material_pricing(customer_id,material_id,standard_price_level_id,standard_special_price,standard_effective_date,outstation_enabled,outstation_price_level_id,outstation_special_price,outstation_effective_date,price_type,resolution_state,status,updated_by)
    VALUES(?,?,?,?,?,?,?,?,?,?,'ready','active',?) ON CONFLICT(customer_id,material_id) DO UPDATE SET standard_price_level_id=excluded.standard_price_level_id,standard_special_price=excluded.standard_special_price,standard_effective_date=excluded.standard_effective_date,outstation_enabled=excluded.outstation_enabled,outstation_price_level_id=excluded.outstation_price_level_id,outstation_special_price=excluded.outstation_special_price,outstation_effective_date=excluded.outstation_effective_date,price_type=excluded.price_type,resolution_state='ready',status='active',updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`)
  let changed=false
  for(const item of submittedItems){
    const materialId=Number(item.materialId);if(!database.prepare('SELECT id FROM materials WHERE id=?').get(materialId))throw new Error('Material not found')
    const standard=priceChoice(item,'standard',database),outstationEnabled=Boolean(item.outstationEnabled),outstation=outstationEnabled?priceChoice(item,'outstation',database):{levelId:null,special:null,effectiveDate:null},priceType=text(item.priceType||'standard').toLowerCase()
    if(!['standard','outstation'].includes(priceType))throw new Error('Customer Price Type must be Standard or Outstation')
    if(priceType==='outstation'&&!outstationEnabled)throw new Error('Outstation pricing must be enabled before selecting it as the Customer Price Type')
    const old=before.items.find(entry=>entry.materialId===materialId),next={priceType,standardPriceLevelId:standard.levelId,standardSpecialPrice:standard.special,standardEffectiveDate:standard.effectiveDate,outstationEnabled,outstationPriceLevelId:outstation.levelId,outstationSpecialPrice:outstation.special,outstationEffectiveDate:outstation.effectiveDate}
    const oldComparable=old&&{priceType:old.priceType,standardPriceLevelId:old.standardPriceLevelId,standardSpecialPrice:old.standardSpecialPrice,standardEffectiveDate:old.standardEffectiveDate,outstationEnabled:old.outstationEnabled,outstationPriceLevelId:old.outstationPriceLevelId,outstationSpecialPrice:old.outstationSpecialPrice,outstationEffectiveDate:old.outstationEffectiveDate}
    const configChanged=!old||JSON.stringify(oldComparable)!==JSON.stringify(next)
    if(old&&configChanged&&(old.standardBranchCount+old.outstationBranchCount)>0&&!confirmed)throw new Error(`Second confirmation is required: ${old.standardBranchCount} Standard and ${old.outstationBranchCount} Outstation Branches are affected`)
    upsert.run(customer.id,materialId,standard.levelId,standard.special,standard.effectiveDate,outstationEnabled?1:0,outstation.levelId,outstation.special,outstation.effectiveDate,priceType,changedBy)
    const current=database.prepare('SELECT * FROM customer_material_pricing WHERE customer_id=? AND material_id=?').get(customer.id,materialId)
    if(configChanged){
      database.prepare(`INSERT INTO customer_material_pricing_history(customer_material_pricing_id,customer_id,material_id,before_json,after_json,affected_standard_branch_count,affected_outstation_branch_count,reason,changed_by) VALUES(?,?,?,?,?,?,?,?,?)`).run(current.id,customer.id,materialId,old?JSON.stringify(oldComparable):null,JSON.stringify(next),old?.standardBranchCount||0,old?.outstationBranchCount||0,text(reason)||'Customer material pricing update',changedBy)
      changed=true
    }
  }
  for(const materialId of removals){
    const current=database.prepare('SELECT * FROM customer_material_pricing WHERE customer_id=? AND material_id=?').get(customer.id,materialId)
    if(!current||current.status==='inactive')continue
    const old=before.items.find(entry=>entry.materialId===materialId),after={...(old||current),status:'inactive',removed:true}
    database.prepare("UPDATE customer_material_pricing SET status='inactive',updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND customer_id=?").run(changedBy,current.id,customer.id)
    database.prepare(`INSERT INTO customer_material_pricing_history(customer_material_pricing_id,customer_id,material_id,before_json,after_json,affected_standard_branch_count,affected_outstation_branch_count,reason,changed_by) VALUES(?,?,?,?,?,?,?,?,?)`).run(current.id,customer.id,materialId,JSON.stringify(old||current),JSON.stringify(after),old?.standardBranchCount||0,old?.outstationBranchCount||0,text(reason)||'Customer material pricing removed',changedBy)
    changed=true
  }
  return{changed,...listCustomerMaterialPricing(customer.id,database)}
}

export function replaceBranchMaterialSelections(){throw new Error('Branch material pricing is inherited from Customer and is read-only.')}

export function replaceBranchMaterials(){throw new Error('Branch material pricing is inherited from Customer and is read-only.')}

const tableExists=(database,name)=>Boolean(database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name))
const materialNameColumns=database=>{
  const names=new Set(database.prepare('PRAGMA table_info(materials)').all().map(row=>row.name))
  return{full:names.has('full_name')?'COALESCE(m.full_name,m.material_name)':'m.material_name',short:names.has('short_form')?'m.short_form':'NULL'}
}

export function listMaterials({includeInactive=false}={},database=defaultDb){
  const names=materialNameColumns(database)
  return sortMaterials(database.prepare(`SELECT m.id,m.material_code materialCode,m.material_name materialName,${names.full} fullName,${names.short} shortForm,m.unit,m.status,
    COUNT(DISTINCT pl.id) priceLevelCount,(SELECT COUNT(*) FROM customer_material_pricing cmp JOIN branches b ON b.customer_id=cmp.customer_id WHERE cmp.material_id=m.id AND cmp.status='active' AND cmp.resolution_state='ready') branchCount
    FROM materials m LEFT JOIN material_price_levels pl ON pl.material_id=m.id
    WHERE (?=1 OR m.status='active') GROUP BY m.id`).all(includeInactive?1:0))
}

export function getMaterial(materialId,database=defaultDb){
  const names=materialNameColumns(database)
  const material=database.prepare(`SELECT m.id,m.material_code materialCode,m.material_name materialName,${names.full} fullName,${names.short} shortForm,m.unit,m.status,m.created_by createdBy,m.created_at createdAt,m.updated_at updatedAt FROM materials m WHERE m.id=?`).get(materialId)
  if(!material)return null
  material.priceLevels=database.prepare(`SELECT pl.id,pl.price_amount priceAmount,pl.effective_date effectiveDate,pl.status,pl.reason,pl.created_by createdBy,pl.created_at createdAt,pl.updated_at updatedAt,
    (SELECT COUNT(*) FROM customer_material_pricing cmp JOIN branches b ON b.customer_id=cmp.customer_id WHERE cmp.material_id=pl.material_id AND cmp.status='active' AND cmp.resolution_state='ready' AND ((cmp.price_type='standard' AND cmp.standard_price_level_id=pl.id) OR (cmp.price_type='outstation' AND cmp.outstation_price_level_id=pl.id))) affectedBranchCount FROM material_price_levels pl WHERE pl.material_id=? GROUP BY pl.id ORDER BY pl.status='active' DESC,pl.price_amount,pl.effective_date DESC`).all(materialId)
  material.branches=database.prepare(`SELECT b.id internalId,b.jodoo_branch_id branchId,c.name customerName,b.branch_name branchName FROM customer_material_pricing cmp JOIN branches b ON b.customer_id=cmp.customer_id JOIN customers c ON c.id=cmp.customer_id WHERE cmp.material_id=? AND cmp.status='active' AND cmp.resolution_state='ready' ORDER BY c.name,b.branch_name`).all(materialId).map(branch=>({...branch,...listBranchMaterials(branch.internalId,database).find(item=>item.materialId===Number(materialId))}))
  material.history=database.prepare(`SELECT h.*,pl.material_id materialId FROM material_price_history h JOIN material_price_levels pl ON pl.id=h.price_level_id WHERE pl.material_id=? ORDER BY h.id DESC`).all(materialId)
  material.products=tableExists(database,'material_products')?database.prepare(`SELECT id,product_code productCode,full_name fullName,short_form shortForm,unit,status FROM material_products WHERE material_id=? ORDER BY full_name`).all(materialId):[]
  return material
}

export function createMaterial(payload,database=defaultDb){
  const code=text(payload.materialCode).toUpperCase().replace(/[^A-Z0-9]+/g,'_'),name=text(payload.fullName||payload.materialName),shortForm=text(payload.shortForm)||null,unit=text(payload.unit)||'kg'
  if(!code||!name)throw new Error('Material Code and Material Name are required')
  if(!['kg','piece'].includes(unit))throw new Error('Unit must be kg or piece')
  const result=database.prepare("INSERT INTO materials(material_code,material_name,full_name,short_form,unit,status,created_by) VALUES(?,?,?,?,?,'active',?)").run(code,name,name,shortForm,unit,payload.changedBy||'Administrator')
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
  const branches=database.prepare(`SELECT b.jodoo_branch_id branchId,c.name customerName,b.branch_name branchName
    FROM customer_material_pricing cmp JOIN branches b ON b.customer_id=cmp.customer_id JOIN customers c ON c.id=cmp.customer_id
    WHERE cmp.status='active' AND cmp.resolution_state='ready' AND ((cmp.price_type='standard' AND cmp.standard_price_level_id=?) OR (cmp.price_type='outstation' AND cmp.outstation_price_level_id=?))
    ORDER BY c.name,b.branch_name`).all(priceLevelId,priceLevelId)
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
  const prices=listBranchMaterials(stop.branch_id,database),insert=database.prepare(`INSERT OR IGNORE INTO dispatch_stop_material_prices(dispatch_stop_id,material_id,material_name_snapshot,unit_snapshot,price_snapshot,price_source,price_level_id_snapshot,effective_date_snapshot,occ_price_group_id_snapshot,item_code_snapshot) VALUES(?,?,?,?,?,?,?,?,?,?)`)
  for(const item of prices)insert.run(stopId,item.materialId,item.materialName,item.unit,item.currentPrice,item.specialPrice!=null?'special_price':'price_level',item.priceLevelId,item.effectiveDate,item.occPriceGroupId||null,item.itemCode||null)
  return database.prepare('SELECT * FROM dispatch_stop_material_prices WHERE dispatch_stop_id=? ORDER BY material_id').all(stopId)
}
