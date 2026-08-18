import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {DatabaseSync} from 'node:sqlite'
import {schemaSql} from '../server/schema.mjs'
import {applyV18Migration,syncLegacyOccPrices} from '../server/migrationV18.mjs'
import {bulkUpdatePriceLevel,captureDispatchStopPriceSnapshot,createPriceLevel,getMaterial,normalizeCollectionSettings,saveCustomerMaterialPricing} from '../server/materialPriceService.mjs'
import {createBranch,createCustomer,getBranch} from '../server/customerMasterService.mjs'
import {accountCan,roleCan} from '../server/authService.mjs'

const database=()=>{
  const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');db.exec(schemaSql);return db
}
const legacyDatabase=()=>{
  const db=database()
  db.exec(`DROP TABLE dispatch_stop_material_prices;DROP TABLE branch_material_price_history;DROP TABLE material_price_history;DROP TABLE branch_material_prices;DROP TABLE material_price_levels;DROP TABLE materials;DELETE FROM schema_meta;INSERT INTO schema_meta(version) VALUES(17);`)
  db.prepare("INSERT INTO customers(jodoo_customer_id,name,occ_price) VALUES('C1','One',0.2),('C2','Two',0.2),('C3','Three',0.3)").run()
  db.prepare("INSERT INTO branches(jodoo_branch_id,customer_id,branch_name,occ_price) VALUES('B1',1,'One A',NULL),('B2',2,'Two A',0.2),('B3',3,'Three A',0.3)").run()
  return db
}

test('schema v17 upgrades to v18 and shared legacy OCC levels are idempotent',()=>{
  const db=legacyDatabase(),first=applyV18Migration(db),second=syncLegacyOccPrices(db)
  assert.equal(db.prepare('SELECT MAX(version) version FROM schema_meta').get().version,18)
  assert.equal(first.priceLevelCount,2);assert.equal(first.branchCount,3)
  assert.equal(second.priceLevelCount,2);assert.equal(second.branchCount,3)
  assert.equal(db.prepare("SELECT COUNT(*) count FROM materials WHERE material_code='OCC'").get().count,1)
  assert.equal(db.prepare('SELECT COUNT(*) count FROM branch_material_prices').get().count,3)
})

test('new Branch saves multiple Materials and reopens without losing Price Level or Special Price',()=>{const db=database();syncLegacyOccPrices(db);createCustomer({customerId:'C10',customerName:'Customer Ten'},db);const occ=getMaterial(db.prepare("SELECT id FROM materials WHERE material_code='OCC'").get().id,db),plasticId=db.prepare("SELECT id FROM materials WHERE material_code='PLASTIC'").get().id,occLevel=createPriceLevel(occ.id,{priceAmount:.25,effectiveDate:'2026-08-01',reason:'New customer list'},db);saveCustomerMaterialPricing('C10',[{materialId:occ.id,standardPriceLevelId:occLevel.id},{materialId:plasticId,standardSpecialPrice:.18}],{reason:'Customer agreement',changedBy:'Admin'},db);createBranch({branchId:'B10',customerId:'C10',branchName:'Branch Ten',collectionFrequency:'Twice a week',assignedWeekdays:['Monday','Thursday'],paymentType:'Cash'},db);const branch=getBranch('B10',db);assert.equal(branch.materials.length,2);assert.equal(branch.assignedWeekdays.join(','),'Monday,Thursday');assert.equal(branch.materials.find(item=>item.materialCode==='OCC').priceLevelId,occLevel.id);assert.equal(branch.materials.find(item=>item.materialCode==='PLASTIC').specialPrice,.18);assert.equal(db.prepare('SELECT COUNT(*) n FROM branch_material_price_selections').get().n,0)})

test('bulk adjustment preserves audit history, branch special price and completed stop snapshot',()=>{const db=database();syncLegacyOccPrices(db);createCustomer({customerId:'C20',customerName:'Customer Twenty'},db);const occId=db.prepare("SELECT id FROM materials WHERE material_code='OCC'").get().id,level=createPriceLevel(occId,{priceAmount:.2,effectiveDate:'2026-07-01',reason:'Opening price'},db);saveCustomerMaterialPricing('C20',[{materialId:occId,standardPriceLevelId:level.id}],{reason:'Customer agreement',changedBy:'Admin'},db);createBranch({branchId:'B20',customerId:'C20',branchName:'Branch Twenty'},db);const branch=db.prepare("SELECT id FROM branches WHERE jodoo_branch_id='B20'").get(),dispatch=db.prepare("INSERT INTO dispatches(dispatch_date,status) VALUES('2026-08-01','draft')").run(),stop=db.prepare('INSERT INTO dispatch_stops(dispatch_id,branch_id,stop_sequence) VALUES(?,?,1)').run(dispatch.lastInsertRowid,branch.id);captureDispatchStopPriceSnapshot(Number(stop.lastInsertRowid),db);bulkUpdatePriceLevel(level.id,{newPrice:.3,effectiveDate:'2026-08-15',reason:'Market adjustment',confirmed:true,changedBy:'Admin'},db);assert.equal(db.prepare('SELECT COUNT(*) count FROM material_price_history').get().count,1);assert.equal(db.prepare('SELECT price_snapshot price FROM dispatch_stop_material_prices WHERE dispatch_stop_id=?').get(stop.lastInsertRowid).price,.2);assert.equal(getBranch('B20',db).materials[0].currentPrice,.3)})

test('Collection Frequency accepts undecided weekdays, warns mismatch and excludes days for On Call or Paused',()=>{
  assert.deepEqual(normalizeCollectionSettings('Once a week',[]).assignedWeekdays,[])
  assert.match(normalizeCollectionSettings('Twice a week',['Monday']).frequencyWarning,/expects 2/)
  assert.deepEqual(normalizeCollectionSettings('On Call',['Monday']).assignedWeekdays,[])
  assert.deepEqual(normalizeCollectionSettings('Paused',['Tuesday']).assignedWeekdays,[])
  assert.deepEqual(normalizeCollectionSettings('Once a week',['Thurday']).assignedWeekdays,['Thursday'])
})

test('price management is server-authorized for admins or an explicitly authorized supervisor',()=>{
  const db=database()
  assert.equal(roleCan('owner_admin','price_manage'),true);assert.equal(roleCan('operations_admin','price_manage'),true);assert.equal(roleCan('office','price_manage'),false)
  db.prepare("INSERT INTO employees(employee_code,name,job_role) VALUES('S1','Supervisor','Supervisor')").run()
  const account=db.prepare("INSERT INTO auth_accounts(employee_id,username,password_hash,role) VALUES(1,'supervisor','hash','supervisor')").run()
  assert.equal(accountCan({id:Number(account.lastInsertRowid),role:'supervisor'},'price_manage',db),false)
  db.prepare("INSERT INTO auth_account_permissions(account_id,permission,granted_by) VALUES(?,'price_manage','Owner')").run(account.lastInsertRowid)
  assert.equal(accountCan({id:Number(account.lastInsertRowid),role:'supervisor'},'price_manage',db),true)
})

test('profile menu closes outside and with Escape; sidebar has independent scrolling',()=>{
  const profile=fs.readFileSync(new URL('../src/AccountProfileMenu.jsx',import.meta.url),'utf8')
  const css=fs.readFileSync(new URL('../src/App.css',import.meta.url),'utf8')
  assert.match(profile,/pointerdown/);assert.match(profile,/event\.key==='Escape'/)
  assert.match(css,/\.sidebar nav\{[^}]*overflow-y:auto/);assert.match(css,/height:100dvh/)
})
