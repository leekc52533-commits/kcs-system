import {db as defaultDb} from './database.mjs'

export const COLLECTION_FREQUENCIES=['Once a week','Twice a week','3 times a week','4 times a week','Daily','On Call','Paused']
export const WEEKDAYS=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
const text=value=>String(value??'').trim()
const amount=value=>{const number=Number(value);if(!Number.isFinite(number)||number<0)throw new Error('Price must be zero or greater');return Math.round(number*1e6)/1e6}
const parseWeekdays=value=>{
  const source=Array.isArray(value)?value:String(value||'').replace(/^\[|\]$/g,'').split(/[,;/]/)
  const normalized=[...new Set(source.map(item=>String(item).replaceAll('"','').trim()).map(item=>item==='Thurday'?'Thursday':item).filter(Boolean))]
  const invalid=normalized.filter(item=>!WEEKDAYS.includes(item));if(invalid.length)throw new Error(`Invalid weekday: ${invalid.join(', ')}`)
  return WEEKDAYS.filter(item=>normalized.includes(item))
}

export function normalizeCollectionSettings(frequency,weekdays){
  const value=text(frequency)
  if(value&&!COLLECTION_FREQUENCIES.includes(value))throw new Error('Invalid Collection Frequency')
  let selected=parseWeekdays(weekdays)
  if(['On Call','Paused'].includes(value))selected=[]
  const expected={'Once a week':1,'Twice a week':2,'3 times a week':3,'4 times a week':4,Daily:7}[value]
  const warning=expected&&selected.length&&selected.length!==expected?`${value} expects ${expected} weekday${expected===1?'':'s'}, but ${selected.length} selected.`:null
  return{collectionFrequency:value||null,assignedWeekdays:selected,assignedWeekdaysStorage:selected.length?JSON.stringify(selected):null,frequencyWarning:warning}
}

export function listBranchMaterials(branchId,database=defaultDb){
  return database.prepare(`SELECT bmp.id,bmp.branch_id branchInternalId,m.id materialId,m.material_code materialCode,m.material_name materialName,m.unit,
    bmp.price_level_id priceLevelId,bmp.special_price specialPrice,COALESCE(bmp.special_price,pl.price_amount) currentPrice,
    CASE WHEN bmp.special_price IS NOT NULL THEN 'special_price' ELSE 'price_level' END priceSource,
    COALESCE(bmp.effective_date,pl.effective_date) effectiveDate,bmp.status,pl.status priceLevelStatus
    FROM branch_material_prices bmp JOIN materials m ON m.id=bmp.material_id LEFT JOIN material_price_levels pl ON pl.id=bmp.price_level_id
    WHERE bmp.branch_id=? ORDER BY m.material_name`).all(branchId)
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
    const special=item.specialPrice!==''&&item.specialPrice!=null?amount(item.specialPrice):null
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
    COUNT(DISTINCT pl.id) priceLevelCount,COUNT(DISTINCT bmp.branch_id) branchCount
    FROM materials m LEFT JOIN material_price_levels pl ON pl.material_id=m.id LEFT JOIN branch_material_prices bmp ON bmp.material_id=m.id AND bmp.status='active'
    WHERE (?=1 OR m.status='active') GROUP BY m.id ORDER BY m.material_name`).all(includeInactive?1:0)
}

export function getMaterial(materialId,database=defaultDb){
  const material=database.prepare('SELECT id,material_code materialCode,material_name materialName,unit,status,created_by createdBy,created_at createdAt,updated_at updatedAt FROM materials WHERE id=?').get(materialId)
  if(!material)return null
  material.priceLevels=database.prepare(`SELECT pl.id,pl.price_amount priceAmount,pl.effective_date effectiveDate,pl.status,pl.reason,pl.created_by createdBy,pl.created_at createdAt,pl.updated_at updatedAt,
    COUNT(DISTINCT bmp.branch_id) affectedBranchCount FROM material_price_levels pl LEFT JOIN branch_material_prices bmp ON bmp.price_level_id=pl.id AND bmp.status='active' WHERE pl.material_id=? GROUP BY pl.id ORDER BY pl.status='active' DESC,pl.price_amount,pl.effective_date DESC`).all(materialId)
  material.branches=database.prepare(`SELECT b.jodoo_branch_id branchId,c.name customerName,b.branch_name branchName,bmp.price_level_id priceLevelId,bmp.special_price specialPrice,COALESCE(bmp.special_price,pl.price_amount) currentPrice FROM branch_material_prices bmp JOIN branches b ON b.id=bmp.branch_id LEFT JOIN customers c ON c.id=b.customer_id LEFT JOIN material_price_levels pl ON pl.id=bmp.price_level_id WHERE bmp.material_id=? AND bmp.status='active' ORDER BY c.name,b.branch_name`).all(materialId)
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
  const branches=database.prepare(`SELECT b.jodoo_branch_id branchId,c.name customerName,b.branch_name branchName FROM branch_material_prices bmp JOIN branches b ON b.id=bmp.branch_id LEFT JOIN customers c ON c.id=b.customer_id WHERE bmp.price_level_id=? AND bmp.status='active' ORDER BY c.name,b.branch_name`).all(priceLevelId)
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
  for(const item of prices)insert.run(stopId,item.materialId,item.materialName,item.unit,item.currentPrice,item.priceSource,item.priceLevelId,item.effectiveDate)
  return database.prepare('SELECT * FROM dispatch_stop_material_prices WHERE dispatch_stop_id=? ORDER BY material_id').all(stopId)
}
