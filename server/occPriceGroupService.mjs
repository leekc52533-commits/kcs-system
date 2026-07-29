import {db as defaultDb} from './database.mjs'
import {seedFixedOccPriceGroups} from './migrationV21.mjs'

const text=value=>String(value??'').trim()
const price=value=>{const number=Number(value);if(!Number.isFinite(number)||number<0)throw new Error('OCC price must be zero or greater');return Math.round(number*100)/100}
const groupRow=(database,id)=>database.prepare(`SELECT g.id,g.item_code itemCode,g.price_amount priceAmount,g.is_fixed isFixed,g.status,g.reason,g.created_by createdBy,g.created_at createdAt,g.updated_at updatedAt,COUNT(a.branch_id) branchCount FROM occ_price_groups g LEFT JOIN branch_occ_price_assignments a ON a.occ_price_group_id=g.id WHERE g.id=? GROUP BY g.id`).get(id)

export function listOccPriceGroups(database=defaultDb){
  seedFixedOccPriceGroups(database)
  const items=database.prepare(`SELECT g.id,g.item_code itemCode,g.price_amount priceAmount,g.is_fixed isFixed,g.status,g.reason,g.created_by createdBy,g.created_at createdAt,g.updated_at updatedAt,COUNT(a.branch_id) branchCount FROM occ_price_groups g JOIN materials m ON m.id=g.material_id AND m.material_code='OCC' LEFT JOIN branch_occ_price_assignments a ON a.occ_price_group_id=g.id GROUP BY g.id ORDER BY g.price_amount`).all()
  for(const item of items)item.branches=database.prepare(`SELECT b.id branchInternalId,b.jodoo_branch_id branchId,b.branch_name branchName,c.name customerName FROM branch_occ_price_assignments a JOIN branches b ON b.id=a.branch_id LEFT JOIN customers c ON c.id=b.customer_id WHERE a.occ_price_group_id=? ORDER BY c.name,b.branch_name`).all(item.id)
  return{items}
}

export function createOccPriceGroup(payload,database=defaultDb){
  const amount=price(payload.priceAmount),reason=text(payload.reason);if(!reason)throw new Error('Reason is required')
  const occ=database.prepare("SELECT id FROM materials WHERE material_code='OCC'").get();if(!occ)throw new Error('OCC material not found')
  const cents=Math.round(amount*100),code=text(payload.itemCode)||`OCC-${String(cents).padStart(3,'0')}`
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

const assertOccBranch=(database,branchId)=>{
  const branch=database.prepare(`SELECT b.id,b.jodoo_branch_id branchId,b.branch_name branchName,c.name customerName FROM branches b LEFT JOIN customers c ON c.id=b.customer_id WHERE b.id=?`).get(branchId)
  if(!branch)throw new Error(`Branch not found: ${branchId}`)
  const hasOcc=database.prepare(`SELECT 1 FROM materials m WHERE m.material_code='OCC' AND (EXISTS(SELECT 1 FROM branch_material_price_selections s WHERE s.branch_id=? AND s.material_id=m.id) OR EXISTS(SELECT 1 FROM branch_material_prices p WHERE p.branch_id=? AND p.material_id=m.id AND p.status='active'))`).get(branchId,branchId)
  if(!hasOcc)throw new Error(`Branch ${branch.branchId} does not have OCC in its price list`)
  return branch
}

export function assignBranchesToOccPriceGroup(groupId,branchIds,payload={},database=defaultDb){
  const group=groupRow(database,groupId);if(!group||group.status!=='active')throw new Error('Target OCC Price Group is not active')
  const ids=[...new Set((branchIds||[]).map(Number).filter(Boolean))],reason=text(payload.reason);if(!ids.length)throw new Error('Select at least one Branch');if(!reason)throw new Error('Reason is required')
  const actor=text(payload.changedBy)||'Owner Admin',changed=[]
  database.exec('BEGIN IMMEDIATE')
  try{
    for(const branchId of ids){const branch=assertOccBranch(database,branchId),old=database.prepare('SELECT occ_price_group_id id FROM branch_occ_price_assignments WHERE branch_id=?').get(branchId);if(old?.id===Number(groupId))continue;database.prepare(`INSERT INTO branch_occ_price_assignments(branch_id,occ_price_group_id,assigned_by) VALUES(?,?,?) ON CONFLICT(branch_id) DO UPDATE SET occ_price_group_id=excluded.occ_price_group_id,assigned_by=excluded.assigned_by,updated_at=CURRENT_TIMESTAMP`).run(branchId,groupId,actor);database.prepare(`INSERT INTO branch_occ_price_assignment_history(branch_id,old_occ_price_group_id,new_occ_price_group_id,reason,changed_by) VALUES(?,?,?,?,?)`).run(branchId,old?.id||null,groupId,reason,actor);changed.push(branch)}
    database.exec('COMMIT');return{changedCount:changed.length,branches:changed,targetGroup:groupRow(database,groupId)}
  }catch(error){database.exec('ROLLBACK');throw error}
}

export function bulkTransferOccBranches(sourceGroupId,targetGroupId,branchIds,payload={},database=defaultDb){
  if(Number(sourceGroupId)===Number(targetGroupId))throw new Error('Source and target OCC Price Groups must be different')
  const source=groupRow(database,sourceGroupId),target=groupRow(database,targetGroupId);if(!source||!target)throw new Error('Source or target OCC Price Group not found');if(target.status!=='active')throw new Error('Target OCC Price Group is not active')
  const ids=[...new Set((branchIds||[]).map(Number).filter(Boolean))];if(!ids.length)throw new Error('Select at least one Branch')
  for(const id of ids)if(!database.prepare('SELECT 1 FROM branch_occ_price_assignments WHERE branch_id=? AND occ_price_group_id=?').get(id,sourceGroupId))throw new Error(`Branch ${id} is not assigned to the source OCC Price Group`)
  return{sourceGroup:source,...assignBranchesToOccPriceGroup(targetGroupId,ids,payload,database)}
}
