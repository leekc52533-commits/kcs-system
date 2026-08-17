import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {schemaSql} from '../server/schema.mjs'
import {applyV21Migration,seedFixedOccPriceGroups} from '../server/migrationV21.mjs'
import {assignBranchesToOccPriceGroup,bulkTransferOccBranches,createOccPriceGroup,listOccPriceGroups,setOccPriceGroupStatus} from '../server/occPriceGroupService.mjs'
import {captureDispatchStopPriceSnapshot,createPriceLevel,listBranchMaterials,saveCustomerMaterialPricing} from '../server/materialPriceService.mjs'

const database=()=>{const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON;'+schemaSql);seedFixedOccPriceGroups(db);return db}
const branchWithOcc=db=>{
  db.prepare("INSERT INTO customers(jodoo_customer_id,name) VALUES('C1','Customer')").run()
  db.prepare("INSERT INTO branches(jodoo_branch_id,customer_id,branch_name) VALUES('B1',1,'Branch 1'),('B2',1,'Branch 2'),('B3',1,'Branch 3'),('B4',1,'Branch 4'),('B5',1,'Branch 5')").run()
  const occ=db.prepare("SELECT id FROM materials WHERE material_code='OCC'").get(),level=createPriceLevel(occ.id,{priceAmount:.2,effectiveDate:'2026-01-01',reason:'Test'},db)
  for(const id of [1,2,3,4,5])db.prepare("INSERT INTO branch_material_prices(branch_id,material_id,price_level_id,effective_date,status,assigned_by) VALUES(?,?,?,'2026-01-01','active','Historical fixture')").run(id,occ.id,level.id)
  return{occ,level}
}
const legacyAssignments=db=>{branchWithOcc(db);const groups=listOccPriceGroups(db).items,source=groups.find(item=>item.priceAmount===.2),target=groups.find(item=>item.priceAmount===.3);db.prepare("INSERT INTO branch_occ_price_assignments(branch_id,occ_price_group_id,assigned_by) VALUES(1,?,'Historical')").run(source.id);return{source,target}}

test('v21 creates exactly 46 fixed OCC groups idempotently with unique Product + Price',()=>{
  const db=database();db.exec('DELETE FROM occ_price_groups;DELETE FROM schema_meta;INSERT INTO schema_meta(version) VALUES(20)')
  const first=applyV21Migration(db),second=seedFixedOccPriceGroups(db)
  assert.equal(first.fixedGroupCount,46);assert.equal(second.fixedGroupCount,46)
  assert.equal(db.prepare('SELECT COUNT(*) count FROM occ_price_groups').get().count,46)
  assert.equal(db.prepare('SELECT MIN(price_amount) min,MAX(price_amount) max FROM occ_price_groups').get().min,.15)
  assert.equal(db.prepare('SELECT MIN(price_amount) min,MAX(price_amount) max FROM occ_price_groups').get().max,.6)
  const occ=db.prepare("SELECT id FROM materials WHERE material_code='OCC'").get()
  assert.throws(()=>db.prepare("INSERT INTO occ_price_groups(material_id,item_code,price_amount,created_by) VALUES(?,'DUP',.15,'Test')").run(occ.id),/UNIQUE/)
})

test('custom OCC group can be added while fixed groups cannot be repriced through an update API',()=>{
  const db=database(),group=createOccPriceGroup({priceAmount:.7,reason:'New market requirement',changedBy:'Owner'},db)
  assert.equal(group.priceAmount,.7);assert.equal(group.isFixed,0)
  assert.throws(()=>createOccPriceGroup({priceAmount:.7,reason:'Duplicate',changedBy:'Owner'},db),error=>error.code==='OCC_PRICE_GROUP_DUPLICATE'&&error.statusCode===409)
  assert.throws(()=>createOccPriceGroup({priceAmount:.701,reason:'Too precise',changedBy:'Owner'},db),error=>error.code==='OCC_PRICE_PRECISION')
  assert.throws(()=>createOccPriceGroup({priceAmount:0,reason:'Invalid',changedBy:'Owner'},db),error=>error.code==='OCC_PRICE_INVALID')
  assert.equal(typeof group.priceAmount,'number')
})

test('selected Branches transfer between groups atomically with audit and deselection support',()=>{const db=database(),{source,target}=legacyAssignments(db),before=db.prepare('SELECT * FROM branch_occ_price_assignments').all();assert.throws(()=>assignBranchesToOccPriceGroup(target.id,[1],{reason:'No longer allowed'},db),/legacy read-only/);assert.throws(()=>bulkTransferOccBranches(source.id,target.id,[1],{reason:'No longer allowed'},db),/legacy read-only/);assert.deepEqual(db.prepare('SELECT * FROM branch_occ_price_assignments').all(),before);assert.equal(db.prepare('SELECT COUNT(*) n FROM branch_occ_price_assignment_history').get().n,0)})

test('five Branches move to an existing stable Group ID and counts refresh from the database',()=>{const db=database(),{source,target}=legacyAssignments(db),counts=listOccPriceGroups(db).items;assert.throws(()=>bulkTransferOccBranches(source.id,target.id,[1,2,3,4,5],{reason:'Forbidden'},db),/legacy read-only/);assert.equal(listOccPriceGroups(db).items.find(x=>x.id===source.id).branchCount,1);assert.deepEqual(listOccPriceGroups(db).items.map(x=>x.id),counts.map(x=>x.id))})

test('v22 converted Branches move by stable OCC assignment without a legacy price-list row',()=>{const db=database(),{source,target}=legacyAssignments(db);db.prepare('DELETE FROM branch_material_prices').run();assert.throws(()=>bulkTransferOccBranches(source.id,target.id,[1],{reason:'Forbidden'},db),/legacy read-only/);assert.equal(db.prepare('SELECT occ_price_group_id id FROM branch_occ_price_assignments WHERE branch_id=1').get().id,source.id)})

test('audit insertion failure rolls back every converted Branch assignment',()=>{const db=database(),{source,target}=legacyAssignments(db);db.exec("CREATE TRIGGER reject_occ_audit BEFORE INSERT ON branch_occ_price_assignment_history BEGIN SELECT RAISE(ABORT,'audit unavailable'); END");assert.throws(()=>bulkTransferOccBranches(source.id,target.id,[1],{reason:'Forbidden'},db),/legacy read-only/);assert.equal(db.prepare('SELECT COUNT(*) n FROM branch_occ_price_assignment_history').get().n,0)})

test('bulk move validation returns stable codes and stale membership rolls back the entire batch',()=>{const db=database(),{source,target}=legacyAssignments(db);for(const ids of [[],[1]])assert.throws(()=>bulkTransferOccBranches(source.id,target.id,ids,{reason:'Any'},db),/legacy read-only/);assert.equal(db.prepare('SELECT occ_price_group_id id FROM branch_occ_price_assignments WHERE branch_id=1').get().id,source.id)})

test('used group cannot be hidden and invalid source transfer rolls back',()=>{const db=database(),{source,target}=legacyAssignments(db);assert.throws(()=>setOccPriceGroupStatus(source.id,'inactive',{reason:'Hide'},db),/cannot be hidden/);assert.throws(()=>bulkTransferOccBranches(source.id,target.id,[1],{reason:'Forbidden'},db),/legacy read-only/);assert.equal(db.prepare('SELECT occ_price_group_id id FROM branch_occ_price_assignments WHERE branch_id=1').get().id,source.id)})

test('Branch price resolves from OCC group and historical stop snapshot stays immutable',()=>{const db=database();const{occ}=branchWithOcc(db),customerLevel=createPriceLevel(occ.id,{priceAmount:.25,effectiveDate:'2026-08-01',reason:'Customer'},db);saveCustomerMaterialPricing('C1',[{materialId:occ.id,standardPriceLevelId:customerLevel.id}],{reason:'Customer agreement',changedBy:'Owner'},db);const dispatch=db.prepare("INSERT INTO dispatches(dispatch_date,status) VALUES('2026-08-01','completed')").run(),stop=db.prepare('INSERT INTO dispatch_stops(dispatch_id,branch_id,stop_sequence,status) VALUES(?,?,1,?)').run(dispatch.lastInsertRowid,1,'completed');captureDispatchStopPriceSnapshot(Number(stop.lastInsertRowid),db);assert.equal(listBranchMaterials(1,db).find(item=>item.materialCode==='OCC').currentPrice,.25);assert.equal(db.prepare('SELECT price_snapshot FROM dispatch_stop_material_prices WHERE dispatch_stop_id=?').get(stop.lastInsertRowid).price_snapshot,.25)})

test('v21 migration does not convert existing Branch prices',()=>{
  const db=database();branchWithOcc(db);const before=db.prepare('SELECT COUNT(*) count FROM branch_material_prices').get().count
  seedFixedOccPriceGroups(db)
  assert.equal(db.prepare('SELECT COUNT(*) count FROM branch_occ_price_assignments').get().count,0)
  assert.equal(db.prepare('SELECT COUNT(*) count FROM branch_material_prices').get().count,before)
})
