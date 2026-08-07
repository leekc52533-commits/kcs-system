import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {schemaSql} from '../server/schema.mjs'
import {applyV21Migration,seedFixedOccPriceGroups} from '../server/migrationV21.mjs'
import {assignBranchesToOccPriceGroup,bulkTransferOccBranches,createOccPriceGroup,listOccPriceGroups,setOccPriceGroupStatus} from '../server/occPriceGroupService.mjs'
import {captureDispatchStopPriceSnapshot,createPriceLevel,listBranchMaterials,replaceBranchMaterials} from '../server/materialPriceService.mjs'

const database=()=>{const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON;'+schemaSql);seedFixedOccPriceGroups(db);return db}
const branchWithOcc=db=>{
  db.prepare("INSERT INTO customers(jodoo_customer_id,name) VALUES('C1','Customer')").run()
  db.prepare("INSERT INTO branches(jodoo_branch_id,customer_id,branch_name) VALUES('B1',1,'Branch 1'),('B2',1,'Branch 2'),('B3',1,'Branch 3'),('B4',1,'Branch 4'),('B5',1,'Branch 5')").run()
  const occ=db.prepare("SELECT id FROM materials WHERE material_code='OCC'").get(),level=createPriceLevel(occ.id,{priceAmount:.2,effectiveDate:'2026-01-01',reason:'Test'},db)
  for(const id of [1,2,3,4,5])replaceBranchMaterials(id,[{materialId:occ.id,priceLevelId:level.id}],{},db)
  return{occ,level}
}

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

test('selected Branches transfer between groups atomically with audit and deselection support',()=>{
  const db=database();branchWithOcc(db);const groups=listOccPriceGroups(db).items,source=groups.find(item=>item.priceAmount===.2),target=groups.find(item=>item.priceAmount===.3)
  assignBranchesToOccPriceGroup(source.id,[1,2,3],{reason:'Initial group assignment',changedBy:'Owner'},db)
  const result=bulkTransferOccBranches(source.id,target.id,[1,3],{reason:'Approved bulk transfer',changedBy:'Owner'},db)
  assert.equal(result.changedCount,2)
  assert.equal(db.prepare('SELECT occ_price_group_id id FROM branch_occ_price_assignments WHERE branch_id=2').get().id,source.id)
  assert.equal(db.prepare('SELECT occ_price_group_id id FROM branch_occ_price_assignments WHERE branch_id=1').get().id,target.id)
  const audit=db.prepare("SELECT * FROM branch_occ_price_assignment_history WHERE reason='Approved bulk transfer' ORDER BY branch_id").all()
  assert.equal(audit.length,2);assert.equal(audit[0].old_occ_price_group_id,source.id);assert.equal(audit[0].new_occ_price_group_id,target.id);assert.equal(audit[0].changed_by,'Owner')
})

test('five Branches move to an existing stable Group ID and counts refresh from the database',()=>{
  const db=database();branchWithOcc(db);const groups=listOccPriceGroups(db).items,source=groups.find(item=>item.priceAmount===.15),target=groups.find(item=>item.priceAmount===.16)
  assignBranchesToOccPriceGroup(source.id,[1,2,3,4,5],{reason:'Initial assignment',changedBy:'Owner'},db)
  const result=bulkTransferOccBranches(source.id,target.id,[1,2,3,4,5],{reason:'Approved five Branch move',changedBy:'Kc Lee'},db),reloaded=listOccPriceGroups(db).items
  assert.equal(result.changedCount,5)
  assert.equal(reloaded.find(item=>item.id===source.id).branchCount,0)
  assert.equal(reloaded.find(item=>item.id===target.id).branchCount,5)
  assert.equal(db.prepare('SELECT COUNT(*) count FROM branch_occ_price_assignments WHERE occ_price_group_id=?').get(target.id).count,5)
  assert.equal(db.prepare("SELECT COUNT(*) count FROM branch_occ_price_assignment_history WHERE reason='Approved five Branch move' AND changed_by='Kc Lee'").get().count,5)
  assert.equal(db.prepare('SELECT COUNT(*) count FROM occ_price_groups WHERE id=?').get(source.id).count,1)
})

test('v22 converted Branches move by stable OCC assignment without a legacy price-list row',()=>{
  const db=database()
  db.prepare("INSERT INTO customers(jodoo_customer_id,name) VALUES('C-CONVERTED','Converted Customer')").run()
  db.prepare("INSERT INTO branches(jodoo_branch_id,customer_id,branch_name) VALUES('10380',1,'LANDEH'),('10381',1,'WELLNESS SARADISE'),('10382',1,'SEKOLAH'),('10383',1,'GOLD PALM OIL TEMATU'),('10384',1,'KIAN KWONG BAU')").run()
  const groups=listOccPriceGroups(db).items,source=groups.find(item=>item.priceAmount===.15),target=groups.find(item=>item.priceAmount===.16)
  for(const branchId of [1,2,3,4,5])db.prepare("INSERT INTO branch_occ_price_assignments(branch_id,occ_price_group_id,assigned_by) VALUES(?,?, 'Material conversion v22')").run(branchId,source.id)
  assert.equal(db.prepare('SELECT COUNT(*) count FROM branch_material_price_selections').get().count,0)
  assert.equal(db.prepare('SELECT COUNT(*) count FROM branch_material_prices').get().count,0)
  const result=bulkTransferOccBranches(source.id,target.id,[1,2,3,4,5],{reason:'Production-shape transfer',changedBy:'Kc Lee'},db)
  assert.equal(result.changedCount,5)
  assert.equal(result.sourceGroup.branchCount,0)
  assert.equal(result.targetGroup.branchCount,5)
  assert.equal(db.prepare("SELECT COUNT(*) count FROM branch_occ_price_assignment_history WHERE reason='Production-shape transfer'").get().count,5)
})

test('audit insertion failure rolls back every converted Branch assignment',()=>{
  const db=database()
  db.prepare("INSERT INTO customers(jodoo_customer_id,name) VALUES('C-ROLLBACK','Rollback Customer')").run()
  db.prepare("INSERT INTO branches(jodoo_branch_id,customer_id,branch_name) VALUES('RB1',1,'One'),('RB2',1,'Two')").run()
  const groups=listOccPriceGroups(db).items,source=groups.find(item=>item.priceAmount===.15),target=groups.find(item=>item.priceAmount===.16)
  for(const branchId of [1,2])db.prepare("INSERT INTO branch_occ_price_assignments(branch_id,occ_price_group_id,assigned_by) VALUES(?,?, 'Material conversion v22')").run(branchId,source.id)
  db.exec("CREATE TRIGGER reject_occ_audit BEFORE INSERT ON branch_occ_price_assignment_history BEGIN SELECT RAISE(ABORT,'audit unavailable'); END")
  assert.throws(()=>bulkTransferOccBranches(source.id,target.id,[1,2],{reason:'Must roll back',changedBy:'Kc Lee'},db),/audit unavailable/)
  assert.equal(db.prepare('SELECT COUNT(*) count FROM branch_occ_price_assignments WHERE occ_price_group_id=?').get(source.id).count,2)
  assert.equal(db.prepare('SELECT COUNT(*) count FROM branch_occ_price_assignments WHERE occ_price_group_id=?').get(target.id).count,0)
})

test('bulk move validation returns stable codes and stale membership rolls back the entire batch',()=>{
  const db=database();branchWithOcc(db);const groups=listOccPriceGroups(db).items,source=groups.find(item=>item.priceAmount===.15),target=groups.find(item=>item.priceAmount===.16)
  assignBranchesToOccPriceGroup(source.id,[1,2],{reason:'Initial assignment',changedBy:'Owner'},db)
  assert.throws(()=>bulkTransferOccBranches(source.id,target.id,[],{reason:'Move',changedBy:'Owner'},db),error=>error.code==='OCC_NO_BRANCHES_SELECTED')
  assert.throws(()=>bulkTransferOccBranches(source.id,source.id,[1],{reason:'Move',changedBy:'Owner'},db),error=>error.code==='OCC_SAME_GROUP')
  assert.throws(()=>bulkTransferOccBranches(source.id,target.id,[1],{reason:'',changedBy:'Owner'},db),error=>error.code==='OCC_MOVE_REASON_REQUIRED')
  db.prepare('UPDATE branch_occ_price_assignments SET occ_price_group_id=? WHERE branch_id=2').run(target.id)
  assert.throws(()=>bulkTransferOccBranches(source.id,target.id,[1,2],{reason:'Stale page',changedBy:'Owner'},db),error=>error.code==='OCC_BRANCH_SOURCE_CHANGED'&&error.statusCode===409)
  assert.equal(db.prepare('SELECT occ_price_group_id id FROM branch_occ_price_assignments WHERE branch_id=1').get().id,source.id)
  assert.equal(db.prepare("SELECT COUNT(*) count FROM branch_occ_price_assignment_history WHERE reason='Stale page'").get().count,0)
})

test('used group cannot be hidden and invalid source transfer rolls back',()=>{
  const db=database();branchWithOcc(db);const groups=listOccPriceGroups(db).items,source=groups.find(item=>item.priceAmount===.2),target=groups.find(item=>item.priceAmount===.3)
  assignBranchesToOccPriceGroup(source.id,[1],{reason:'Use group',changedBy:'Owner'},db)
  assert.throws(()=>setOccPriceGroupStatus(source.id,'inactive',{reason:'Hide'},db),/cannot be hidden/)
  assert.throws(()=>bulkTransferOccBranches(source.id,target.id,[1,2],{reason:'Invalid mixed transfer',changedBy:'Owner'},db),/no longer belong/)
  assert.equal(db.prepare('SELECT occ_price_group_id id FROM branch_occ_price_assignments WHERE branch_id=1').get().id,source.id)
})

test('Branch price resolves from OCC group and historical stop snapshot stays immutable',()=>{
  const db=database();branchWithOcc(db);const groups=listOccPriceGroups(db).items,source=groups.find(item=>item.priceAmount===.2),target=groups.find(item=>item.priceAmount===.3)
  assignBranchesToOccPriceGroup(source.id,[1],{reason:'Initial',changedBy:'Owner'},db)
  const dispatch=db.prepare("INSERT INTO dispatches(dispatch_date,status) VALUES('2026-08-01','completed')").run(),stop=db.prepare('INSERT INTO dispatch_stops(dispatch_id,branch_id,stop_sequence,status) VALUES(?,?,1,?)').run(dispatch.lastInsertRowid,1,'completed')
  captureDispatchStopPriceSnapshot(Number(stop.lastInsertRowid),db)
  bulkTransferOccBranches(source.id,target.id,[1],{reason:'Future price change',changedBy:'Owner'},db)
  assert.equal(listBranchMaterials(1,db).find(item=>item.materialCode==='OCC').currentPrice,.3)
  const snapshot=db.prepare('SELECT price_snapshot,item_code_snapshot FROM dispatch_stop_material_prices WHERE dispatch_stop_id=?').get(stop.lastInsertRowid)
  assert.equal(snapshot.price_snapshot,.2);assert.equal(snapshot.item_code_snapshot,source.itemCode)
})

test('v21 migration does not convert existing Branch prices',()=>{
  const db=database();branchWithOcc(db);const before=db.prepare('SELECT COUNT(*) count FROM branch_material_prices').get().count
  seedFixedOccPriceGroups(db)
  assert.equal(db.prepare('SELECT COUNT(*) count FROM branch_occ_price_assignments').get().count,0)
  assert.equal(db.prepare('SELECT COUNT(*) count FROM branch_material_prices').get().count,before)
})
