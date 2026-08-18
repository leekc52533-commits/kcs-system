import {db as defaultDb} from './database.mjs'

const legacyError=()=>{const error=new Error('Legacy OCC Price Groups are read-only in Schema v42. Manage OCC under Customer Material Pricing and OCC Material Price Levels.');error.code='OCC_LEGACY_READ_ONLY';error.statusCode=410;return error}

export function listOccPriceGroups(database=defaultDb){
  const columns=new Set(database.prepare('PRAGMA table_info(occ_price_groups)').all().map(row=>row.name)),column=(name,alias)=>columns.has(name)?`g.${name} ${alias}`:`NULL ${alias}`
  const items=database.prepare(`SELECT g.id,g.item_code itemCode,${column('group_name','groupName')},g.price_amount priceAmount,${column('previous_price_amount','previousPriceAmount')},${column('pending_price_amount','pendingPriceAmount')},${column('pending_effective_date','pendingEffectiveDate')},g.is_fixed isFixed,g.status,g.reason,g.created_by createdBy,g.created_at createdAt,g.updated_at updatedAt,COUNT(a.branch_id) branchCount FROM occ_price_groups g JOIN materials m ON m.id=g.material_id AND m.material_code='OCC' LEFT JOIN branch_occ_price_assignments a ON a.occ_price_group_id=g.id GROUP BY g.id ORDER BY g.price_amount,g.id`).all()
  for(const item of items)item.branches=database.prepare(`SELECT b.id branchInternalId,b.jodoo_branch_id branchId,b.branch_name branchName,c.jodoo_customer_id customerCode,c.name customerName,ar.name areaName FROM branch_occ_price_assignments a JOIN branches b ON b.id=a.branch_id LEFT JOIN customers c ON c.id=b.customer_id LEFT JOIN areas ar ON ar.id=b.area_id WHERE a.occ_price_group_id=? ORDER BY c.name,b.branch_name`).all(item.id)
  const unassigned=database.prepare('SELECT COUNT(*) count FROM branches b LEFT JOIN branch_occ_price_assignments x ON x.branch_id=b.id WHERE x.branch_id IS NULL').get().count
  return{items,priceNotSetCount:unassigned,legacyReadOnly:true}
}
export function updateOccPriceGroup(){throw legacyError()}
export function createOccPriceGroup(){throw legacyError()}
export function setOccPriceGroupStatus(){throw legacyError()}
export function assignBranchesToOccPriceGroup(){throw legacyError()}
export function bulkTransferOccBranches(){throw legacyError()}
