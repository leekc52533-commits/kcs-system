import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {schemaSql} from '../server/schema.mjs'
import {seedFixedOccPriceGroups} from '../server/migrationV21.mjs'
import {applyV23Migration} from '../server/migrationV23.mjs'
import {assignBranchesToOccPriceGroup,createOccPriceGroup,listOccPriceGroups,updateOccPriceGroup} from '../server/occPriceGroupService.mjs'
import {createPriceLevel,replaceBranchMaterials} from '../server/materialPriceService.mjs'

const fixture=()=>{
  const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON;'+schemaSql)
  seedFixedOccPriceGroups(db);db.prepare('INSERT OR IGNORE INTO schema_meta(version) VALUES(22)').run()
  db.prepare("INSERT INTO customers(jodoo_customer_id,name) VALUES('C1','Customer')").run()
  db.prepare("INSERT INTO branches(jodoo_branch_id,customer_id,branch_name) VALUES('B1',1,'One'),('B2',1,'Two')").run()
  const occ=db.prepare("SELECT id FROM materials WHERE material_code='OCC'").get(),level=createPriceLevel(occ.id,{priceAmount:.19,effectiveDate:'2026-01-01',reason:'fixture'},db)
  for(const id of [1,2])replaceBranchMaterials(id,[{materialId:occ.id,priceLevelId:level.id}],{},db)
  return db
}

test('v23 safely removes Product + Price uniqueness while preserving stable Group IDs',()=>{
  const db=fixture(),before=db.prepare("SELECT id FROM occ_price_groups WHERE price_amount=.19").get().id
  const result=applyV23Migration(db)
  assert.equal(result.schemaVersion,23)
  const duplicate=createOccPriceGroup({priceAmount:.19,itemCode:'OCC-TRANSITION',reason:'Transition group'},db)
  assert.notEqual(duplicate.id,before)
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok')
  assert.equal(applyV23Migration(db).schemaVersion,23)
})

test('repricing changes one stable Group only, keeps Branch assignments and audits snapshot',()=>{
  const db=fixture();applyV23Migration(db)
  const groups=listOccPriceGroups(db).items,group19=groups.find(item=>item.priceAmount===.19),group20=groups.find(item=>item.priceAmount===.2)
  assignBranchesToOccPriceGroup(group19.id,[1,2],{reason:'Initial',changedBy:'Owner'},db)
  updateOccPriceGroup(group19.id,{priceAmount:.2,effectiveDate:'2026-07-01',reason:'Approved change',changedBy:'Owner'},db)
  assert.equal(db.prepare('SELECT occ_price_group_id id FROM branch_occ_price_assignments WHERE branch_id=1').get().id,group19.id)
  assert.equal(db.prepare('SELECT price_amount FROM occ_price_groups WHERE id=?').get(group20.id).price_amount,.2)
  assert.equal(db.prepare('SELECT COUNT(*) count FROM occ_price_groups WHERE price_amount=.2').get().count,2)
  const audit=db.prepare('SELECT * FROM occ_price_group_price_history WHERE occ_price_group_id=?').get(group19.id)
  assert.equal(audit.old_price_amount,.19);assert.equal(audit.new_price_amount,.2);assert.equal(audit.branch_count,2)
})

test('OCC home data exposes used groups and Price Not Set without creating RM0.00',()=>{
  const db=fixture();applyV23Migration(db)
  const group=listOccPriceGroups(db).items.find(item=>item.priceAmount===.19)
  assignBranchesToOccPriceGroup(group.id,[1],{reason:'Assign one',changedBy:'Owner'},db)
  const result=listOccPriceGroups(db)
  assert.equal(result.items.filter(item=>item.branchCount>0).length,1)
  assert.equal(result.priceNotSetCount,1)
  assert.equal(db.prepare('SELECT COUNT(*) count FROM occ_price_groups WHERE price_amount=0').get().count,0)
})

test('UI sources use used-group cards, branch detail management and modal master creation',async()=>{
  const fs=await import('node:fs')
  const materials=fs.readFileSync(new URL('../src/MaterialsPricesPage.jsx',import.meta.url),'utf8')
  const employees=fs.readFileSync(new URL('../src/EmployeeMasterPage.jsx',import.meta.url),'utf8')
  const zones=fs.readFileSync(new URL('../src/ZoneGroupManager.jsx',import.meta.url),'utf8')
  const master=fs.readFileSync(new URL('../src/MasterDataPage.jsx',import.meta.url),'utf8')
  assert.match(materials,/Show unused price groups/)
  assert.match(materials,/Search Customer Code \/ Customer \/ Branch/)
  assert.match(materials,/Price Not Set/)
  assert.match(employees,/showCreate&&<div className="employee-detail-backdrop"/)
  assert.match(employees,/EmployeeCreateDetail/)
  assert.match(zones,/showCreate&&<div className="zone-rename-backdrop"/)
  assert.doesNotMatch(master,/area-closeout/)
  assert.doesNotMatch(master,/\['transfer','master\.importExport'\]/)
})
