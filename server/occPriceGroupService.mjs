import {db as defaultDb} from './database.mjs'
import {seedFixedOccPriceGroups} from './migrationV21.mjs'
import {ensureV23Tables} from './migrationV23.mjs'

const text=value=>String(value??'').trim()
const price=value=>{const number=Number(value);if(!Number.isFinite(number)||number<0)throw new Error('OCC price must be zero or greater');return Math.round(number*100)/100}
const occError=(code,message,statusCode=400)=>{const error=new Error(message);error.code=code;error.statusCode=statusCode;return error}
const groupRow=(database,id)=>{ensureV23Tables(database);return database.prepare(`SELECT g.id,g.item_code itemCode,g.group_name groupName,g.price_amount priceAmount,g.previous_price_amount previousPriceAmount,g.pending_price_amount pendingPriceAmount,g.pending_effective_date pendingEffectiveDate,g.is_fixed isFixed,g.status,g.reason,g.created_by createdBy,g.created_at createdAt,g.updated_at updatedAt,COUNT(a.branch_id) branchCount FROM occ_price_groups g LEFT JOIN branch_occ_price_assignments a ON a.occ_price_group_id=g.id WHERE g.id=? GROUP BY g.id`).get(id)}

export function listOccPriceGroups(database=defaultDb){
  seedFixedOccPriceGroups(database)
  ensureV23Tables(database)
  const items=database.prepare(`SELECT g.id,g.item_code itemCode,g.group_name groupName,g.price_amount priceAmount,g.previous_price_amount previousPriceAmount,g.pending_price_amount pendingPriceAmount,g.pending_effective_date pendingEffectiveDate,g.is_fixed isFixed,g.status,g.reason,g.created_by createdBy,g.created_at createdAt,g.updated_at updatedAt,COUNT(a.branch_id) branchCount FROM occ_price_groups g JOIN materials m ON m.id=g.material_id AND m.material_code='OCC' LEFT JOIN branch_occ_price_assignments a ON a.occ_price_group_id=g.id GROUP BY g.id ORDER BY g.price_amount,g.id`).all()
  for(const item of items)item.branches=database.prepare(`SELECT b.id branchInternalId,b.jodoo_branch_id branchId,b.branch_name branchName,c.jodoo_customer_id customerCode,c.name customerName,ar.name areaName FROM branch_occ_price_assignments a JOIN branches b ON b.id=a.branch_id LEFT JOIN customers c ON c.id=b.customer_id LEFT JOIN areas ar ON ar.id=b.area_id WHERE a.occ_price_group_id=? ORDER BY c.name,b.branch_name`).all(item.id)
  const hasAvailability=database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='branch_product_availability'").get()
  const unassigned=hasAvailability?database.prepare(`SELECT COUNT(*) count FROM branches b JOIN branch_product_availability a ON a.branch_id=b.id JOIN material_products p ON p.id=a.product_id AND p.product_code='OCC' LEFT JOIN branch_occ_price_assignments x ON x.branch_id=b.id WHERE a.is_selectable=1 AND x.branch_id IS NULL`).get().count:database.prepare('SELECT COUNT(*) count FROM branches b LEFT JOIN branch_occ_price_assignments x ON x.branch_id=b.id WHERE x.branch_id IS NULL').get().count
  return{items,priceNotSetCount:unassigned}
}

export function updateOccPriceGroup(id,payload={},database=defaultDb){
  const group=groupRow(database,id);if(!group)throw new Error('OCC Price Group not found')
  const amount=price(payload.priceAmount),reason=text(payload.reason),actor=text(payload.changedBy)||'Owner Admin'
  const effectiveDate=text(payload.effectiveDate)||new Date().toISOString().slice(0,10)
  if(!reason)throw new Error('Reason is required')
  if(amount===Number(group.priceAmount))return group
  const today=new Date().toISOString().slice(0,10)
  database.exec('BEGIN IMMEDIATE')
  try{
    database.prepare(`INSERT INTO occ_price_group_price_history(occ_price_group_id,old_price_amount,new_price_amount,branch_count,effective_date,reason,changed_by) VALUES(?,?,?,?,?,?,?)`).run(id,group.priceAmount,amount,group.branchCount,effectiveDate,reason,actor)
    if(effectiveDate>today)database.prepare('UPDATE occ_price_groups SET pending_price_amount=?,pending_effective_date=?,reason=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(amount,effectiveDate,reason,id)
    else database.prepare('UPDATE occ_price_groups SET previous_price_amount=price_amount,price_amount=?,pending_price_amount=NULL,pending_effective_date=NULL,reason=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(amount,reason,id)
    database.exec('COMMIT');return groupRow(database,id)
  }catch(error){database.exec('ROLLBACK');throw error}
}

export function createOccPriceGroup(payload,database=defaultDb){
  const raw=text(payload.priceAmount),numeric=Number(raw);if(!Number.isFinite(numeric)||numeric<=0)throw occError('OCC_PRICE_INVALID','OCC price must be a valid positive number.');if(Math.abs(numeric*100-Math.round(numeric*100))>1e-8)throw occError('OCC_PRICE_PRECISION','OCC price supports at most two decimal places.')
  const amount=price(numeric),reason=text(payload.reason);if(!reason)throw new Error('Reason is required')
  const occ=database.prepare("SELECT id FROM materials WHERE material_code='OCC'").get();if(!occ)throw new Error('OCC material not found')
  const cents=Math.round(amount*100),code=text(payload.itemCode)||`OCC-${String(cents).padStart(3,'0')}`
  if(database.prepare('SELECT id FROM occ_price_groups WHERE price_amount=?').get(amount))throw occError('OCC_PRICE_GROUP_DUPLICATE','An OCC Price Group with this price already exists.',409)
  if(database.prepare('SELECT id FROM occ_price_groups WHERE item_code=? COLLATE NOCASE').get(code))throw occError('OCC_PRICE_GROUP_CODE_DUPLICATE','An OCC Price Group with this code already exists.',409)
  const result=database.prepare(`INSERT INTO occ_price_groups(material_id,item_code,price_amount,is_fixed,status,reason,created_by) VALUES(?,?,?,0,'active',?,?)`).run(occ.id,code,amount,reason,payload.changedBy||'Owner Admin')
  return groupRow(database,Number(result.lastInsertRowid))
}

export function setOccPriceGroupStatus(id,status,payload={},database=defaultDb){
  if(!['active','inactive'].includes(status))throw new Error('Invalid OCC Price Group status')
  const group=groupRow(database,id);if(!group)throw new Error('OCC Price Group not found')
  if(status==='inactive'&&group.branchCount>0)throw new Error('OCC Price Group cannot be hidden while Branches still use it')
  const reason=text(payload.reason);if(!reason)throw new Error('Reason is required')
  database.prepare('UPDATE occ_price_groups SET status=?,reason=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(status,reason,id)
  return groupRow(database,id)
}

export function assignBranchesToOccPriceGroup(){throw new Error('Branch OCC assignments are legacy read-only data. Manage OCC pricing on the Customer.')}

export function bulkTransferOccBranches(){throw new Error('Branch OCC assignments are legacy read-only data. Manage OCC pricing on the Customer.')}
