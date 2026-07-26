import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {schemaSql} from '../server/schema.mjs'
import {applyV19Migration,syncV18BranchPricesToV19} from '../server/migrationV19.mjs'
import {syncLegacyOccPrices} from '../server/migrationV18.mjs'
import {captureDispatchStopPriceSnapshot,createPriceLevel,listBranchMaterials,listCustomerMaterialPricing,replaceBranchMaterialSelections,saveCustomerMaterialPricing} from '../server/materialPriceService.mjs'
import {createBranch,createCustomer,getBranch,getCustomer,updateCustomer} from '../server/customerMasterService.mjs'
import {accountCan,roleCan} from '../server/authService.mjs'

const database=()=>{const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');db.exec(schemaSql);syncLegacyOccPrices(db);return db}
const levels=db=>{
  const occ=db.prepare("SELECT id FROM materials WHERE material_code='OCC'").get().id,plastic=db.prepare("SELECT id FROM materials WHERE material_code='PLASTIC'").get().id
  return{occ,plastic,occ30:createPriceLevel(occ,{priceAmount:.30,effectiveDate:'2026-08-01',reason:'Standard'},db),occ28:createPriceLevel(occ,{priceAmount:.28,effectiveDate:'2026-08-01',reason:'Outstation'},db),occ26:createPriceLevel(occ,{priceAmount:.26,effectiveDate:'2026-09-01',reason:'Outstation revision'},db),plastic10:createPriceLevel(plastic,{priceAmount:.10,effectiveDate:'2026-08-01',reason:'Plastic standard'},db)}
}

test('v18 to v19 migration defaults existing Branch Materials to Standard and is idempotent',()=>{
  const db=database()
  db.exec('DROP TABLE branch_material_price_selection_history;DROP TABLE branch_material_price_selections;DROP TABLE customer_material_pricing_history;DROP TABLE customer_material_pricing;DELETE FROM schema_meta;INSERT INTO schema_meta(version) VALUES(18)')
  db.prepare("INSERT INTO customers(jodoo_customer_id,name) VALUES('DIY','DIY')").run()
  db.prepare("INSERT INTO branches(jodoo_branch_id,customer_id,branch_name) VALUES('DIY-KCH',1,'DIY Kuching'),('DIY-OUT',1,'DIY Sri Aman')").run()
  const occ=db.prepare("SELECT id FROM materials WHERE material_code='OCC'").get().id,level=createPriceLevel(occ,{priceAmount:.30,effectiveDate:'2026-08-01',reason:'Legacy'},db)
  db.prepare("INSERT INTO branch_material_prices(branch_id,material_id,price_level_id,effective_date,status) VALUES(1,?,?,?,'active'),(2,?,?,?,'active')").run(occ,level.id,'2026-08-01',occ,level.id,'2026-08-01')
  const first=applyV19Migration(db),second=syncV18BranchPricesToV19(db)
  assert.equal(db.prepare('SELECT MAX(version) version FROM schema_meta').get().version,19)
  assert.equal(first.branchSelectionCount,2);assert.equal(second.branchSelectionCount,2)
  assert.equal(db.prepare("SELECT COUNT(*) count FROM branch_material_price_selections WHERE price_type='standard'").get().count,2)
  assert.equal(db.prepare('SELECT COUNT(*) count FROM branch_material_price_selections WHERE uses_legacy_price=1').get().count,2)
  assert.equal(listBranchMaterials(1,db)[0].currentPrice,.30)
  const migrated=listCustomerMaterialPricing('DIY',db).items[0]
  assert.throws(()=>saveCustomerMaterialPricing('DIY',[migrated],{reason:'Confirm migrated pricing'},db),/Second confirmation/)
  saveCustomerMaterialPricing('DIY',[migrated],{reason:'Confirm migrated pricing',confirmed:true},db)
  assert.equal(db.prepare('SELECT COUNT(*) count FROM branch_material_price_selections WHERE uses_legacy_price=1').get().count,0)
})

test('one Customer sets Standard and optional Outstation per Material; Branches select independently',()=>{
  const db=database(),price=levels(db);createCustomer({customerId:'DIY',customerName:'DIY'},db)
  saveCustomerMaterialPricing('DIY',[
    {materialId:price.occ,standardPriceLevelId:price.occ30.id,outstationEnabled:true,outstationPriceLevelId:price.occ28.id},
    {materialId:price.plastic,standardPriceLevelId:price.plastic10.id,outstationEnabled:false}
  ],{changedBy:'Admin',reason:'DIY agreement'},db)
  createBranch({branchId:'DIY-KCH',customerId:'DIY',branchName:'DIY Kuching',materials:[{materialId:price.occ,priceType:'standard'},{materialId:price.plastic,priceType:'standard'}]},db)
  createBranch({branchId:'DIY-OUT',customerId:'DIY',branchName:'DIY Sri Aman',materials:[{materialId:price.occ,priceType:'outstation'},{materialId:price.plastic,priceType:'standard'}]},db)
  assert.equal(getBranch('DIY-KCH',db).materials.find(item=>item.materialCode==='OCC').currentPrice,.30)
  assert.equal(getBranch('DIY-OUT',db).materials.find(item=>item.materialCode==='OCC').currentPrice,.28)
  assert.equal(getBranch('DIY-OUT',db).materials.find(item=>item.materialCode==='PLASTIC').priceType,'standard')
  const pricing=getCustomer('DIY',db).materialPricing.find(item=>item.materialCode==='OCC')
  assert.equal(pricing.standardBranchCount,1);assert.equal(pricing.outstationBranchCount,1)
  assert.deepEqual(pricing.standardBranches.map(item=>item.branchId),['DIY-KCH'])
  assert.deepEqual(pricing.outstationBranches.map(item=>item.branchId),['DIY-OUT'])
})

test('changing Customer Outstation Price once updates only selected Outstation Branches and records audit',()=>{
  const db=database(),price=levels(db);createCustomer({customerId:'CHAIN',customerName:'Chain'},db)
  saveCustomerMaterialPricing('CHAIN',[{materialId:price.occ,standardPriceLevelId:price.occ30.id,outstationEnabled:true,outstationPriceLevelId:price.occ28.id}],{changedBy:'Admin',reason:'Opening'},db)
  createBranch({branchId:'STD',customerId:'CHAIN',branchName:'Standard Branch',materials:[{materialId:price.occ,priceType:'standard'}]},db)
  createBranch({branchId:'OUT',customerId:'CHAIN',branchName:'Outstation Branch',materials:[{materialId:price.occ,priceType:'outstation'}]},db)
  assert.throws(()=>saveCustomerMaterialPricing('CHAIN',[{materialId:price.occ,standardPriceLevelId:price.occ30.id,outstationEnabled:true,outstationPriceLevelId:price.occ26.id}],{changedBy:'Admin',reason:'Market change'},db),/Second confirmation/)
  saveCustomerMaterialPricing('CHAIN',[{materialId:price.occ,standardPriceLevelId:price.occ30.id,outstationEnabled:true,outstationPriceLevelId:price.occ26.id}],{changedBy:'Admin',reason:'Market change',confirmed:true},db)
  assert.equal(getBranch('STD',db).materials[0].currentPrice,.30)
  assert.equal(getBranch('OUT',db).materials[0].currentPrice,.26)
  const audit=db.prepare('SELECT * FROM customer_material_pricing_history ORDER BY id DESC LIMIT 1').get()
  assert.equal(audit.reason,'Market change');assert.equal(audit.affected_standard_branch_count,1);assert.equal(audit.affected_outstation_branch_count,1)
})

test('Branch cannot select Outstation when Customer Material has not enabled it',()=>{
  const db=database(),price=levels(db);createCustomer({customerId:'LOCAL',customerName:'Local'},db)
  saveCustomerMaterialPricing('LOCAL',[{materialId:price.plastic,standardPriceLevelId:price.plastic10.id,outstationEnabled:false}],{changedBy:'Admin',reason:'Local pricing'},db)
  const customer=db.prepare("SELECT id FROM customers WHERE jodoo_customer_id='LOCAL'").get(),branch=db.prepare("INSERT INTO branches(jodoo_branch_id,customer_id,branch_name) VALUES('LOCAL-1',?,'Local One')").run(customer.id)
  assert.throws(()=>replaceBranchMaterialSelections(Number(branch.lastInsertRowid),[{materialId:price.plastic,priceType:'outstation'}],{},db),/not enabled/)
})

test('Customer Special Price, reopen persistence and future Branch Price List resolution work',()=>{
  const db=database(),price=levels(db)
  createCustomer({customerId:'SPECIAL',customerName:'Special',materialPricing:[{materialId:price.occ,standardSpecialPrice:.315,outstationEnabled:true,outstationSpecialPrice:.285}]},db)
  createBranch({branchId:'SPECIAL-OUT',customerId:'SPECIAL',branchName:'Special Outstation',materials:[{materialId:price.occ,priceType:'outstation'}]},db)
  const reopened=getBranch('SPECIAL-OUT',db),customer=getCustomer('SPECIAL',db)
  assert.equal(reopened.materials[0].priceType,'outstation');assert.equal(reopened.materials[0].currentPrice,.285)
  assert.equal(customer.materialPricing[0].standardSpecialPrice,.315);assert.equal(customer.materialPricing[0].outstationSpecialPrice,.285)
  updateCustomer('SPECIAL',{customerName:'Special',materialPricing:customer.materialPricing,pricingConfirmed:true,reason:'Verified'},db)
  assert.equal(listCustomerMaterialPricing('SPECIAL',db).items[0].outstationPrice,.285)
})

test('completed dispatch snapshot stays immutable after Customer price changes',()=>{
  const db=database(),price=levels(db);createCustomer({customerId:'SNAP',customerName:'Snapshot'},db)
  saveCustomerMaterialPricing('SNAP',[{materialId:price.occ,standardPriceLevelId:price.occ30.id,outstationEnabled:true,outstationPriceLevelId:price.occ28.id}],{reason:'Opening'},db)
  createBranch({branchId:'SNAP-OUT',customerId:'SNAP',branchName:'Snapshot Out',materials:[{materialId:price.occ,priceType:'outstation'}]},db)
  const branch=db.prepare("SELECT id FROM branches WHERE jodoo_branch_id='SNAP-OUT'").get(),dispatch=db.prepare("INSERT INTO dispatches(dispatch_date,status) VALUES('2026-08-02','draft')").run(),stop=db.prepare('INSERT INTO dispatch_stops(dispatch_id,branch_id,stop_sequence) VALUES(?,?,1)').run(dispatch.lastInsertRowid,branch.id)
  captureDispatchStopPriceSnapshot(Number(stop.lastInsertRowid),db)
  saveCustomerMaterialPricing('SNAP',[{materialId:price.occ,standardPriceLevelId:price.occ30.id,outstationEnabled:true,outstationPriceLevelId:price.occ26.id}],{reason:'Change',confirmed:true},db)
  assert.equal(db.prepare('SELECT price_snapshot price FROM dispatch_stop_material_prices WHERE dispatch_stop_id=?').get(stop.lastInsertRowid).price,.28)
  assert.equal(listBranchMaterials(branch.id,db)[0].currentPrice,.26)
})

test('Customer pricing permission remains server-authorized',()=>{
  const db=database();assert.equal(roleCan('owner_admin','price_manage'),true);assert.equal(roleCan('operations_admin','price_manage'),true);assert.equal(roleCan('office','price_manage'),false)
  db.prepare("INSERT INTO employees(employee_code,name,job_role) VALUES('SUP','Supervisor','Supervisor')").run();const account=db.prepare("INSERT INTO auth_accounts(employee_id,username,password_hash,role) VALUES(1,'sup','hash','supervisor')").run()
  assert.equal(accountCan({id:Number(account.lastInsertRowid),role:'supervisor'},'price_manage',db),false)
  db.prepare("INSERT INTO auth_account_permissions(account_id,permission,granted_by) VALUES(?,'price_manage','Owner')").run(account.lastInsertRowid)
  assert.equal(accountCan({id:Number(account.lastInsertRowid),role:'supervisor'},'price_manage',db),true)
})
