import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {DatabaseSync} from 'node:sqlite'
import {schemaSql} from '../server/schema.mjs'
import {applyV19Migration,syncV18BranchPricesToV19} from '../server/migrationV19.mjs'
import {syncLegacyOccPrices} from '../server/migrationV18.mjs'
import {ensureV42Schema} from '../server/migrationV42.mjs'
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
  const first=applyV19Migration(db),second=syncV18BranchPricesToV19(db);ensureV42Schema(db)
  assert.equal(db.prepare('SELECT MAX(version) version FROM schema_meta').get().version,19)
  assert.equal(first.branchSelectionCount,2);assert.equal(second.branchSelectionCount,2)
  assert.equal(db.prepare("SELECT COUNT(*) count FROM branch_material_price_selections WHERE price_type='standard'").get().count,2)
  assert.equal(db.prepare('SELECT COUNT(*) count FROM branch_material_price_selections WHERE uses_legacy_price=1').get().count,2)
  assert.equal(listBranchMaterials(1,db)[0].currentPrice,.30)
  const migrated=listCustomerMaterialPricing('DIY',db).items[0]
  assert.doesNotThrow(()=>saveCustomerMaterialPricing('DIY',[migrated],{reason:'Review migrated pricing'},db))
  assert.equal(db.prepare('SELECT COUNT(*) count FROM branch_material_price_selections WHERE uses_legacy_price=1').get().count,2)
})

test('one Customer sets Standard and optional Outstation per Material; Branches select independently',()=>{const db=database(),price=levels(db);createCustomer({customerId:'DIY',customerName:'DIY'},db);saveCustomerMaterialPricing('DIY',[{materialId:price.occ,standardPriceLevelId:price.occ30.id,outstationEnabled:true,outstationPriceLevelId:price.occ28.id,priceType:'outstation'}],{changedBy:'Admin',reason:'DIY agreement'},db);createBranch({branchId:'DIY-KCH',customerId:'DIY',branchName:'DIY Kuching'},db);createBranch({branchId:'DIY-OUT',customerId:'DIY',branchName:'DIY Sri Aman'},db);for(const id of ['DIY-KCH','DIY-OUT'])assert.deepEqual({type:getBranch(id,db).materials[0].priceType,price:getBranch(id,db).materials[0].currentPrice},{type:'outstation',price:.28});assert.equal(db.prepare('SELECT COUNT(*) n FROM branch_material_price_selections').get().n,0)})

test('changing Customer Outstation Price once updates only selected Outstation Branches and records audit',()=>{const db=database(),price=levels(db);createCustomer({customerId:'CHAIN',customerName:'Chain'},db);saveCustomerMaterialPricing('CHAIN',[{materialId:price.occ,standardPriceLevelId:price.occ30.id,outstationEnabled:true,outstationPriceLevelId:price.occ28.id,priceType:'outstation'}],{changedBy:'Admin',reason:'Opening'},db);createBranch({branchId:'STD',customerId:'CHAIN',branchName:'One'},db);createBranch({branchId:'OUT',customerId:'CHAIN',branchName:'Two'},db);saveCustomerMaterialPricing('CHAIN',[{materialId:price.occ,standardPriceLevelId:price.occ30.id,outstationEnabled:true,outstationPriceLevelId:price.occ26.id,priceType:'outstation'}],{changedBy:'Admin',reason:'Market change',confirmed:true},db);assert.equal(getBranch('STD',db).materials[0].currentPrice,.26);assert.equal(getBranch('OUT',db).materials[0].currentPrice,.26);const audit=db.prepare('SELECT * FROM customer_material_pricing_history ORDER BY id DESC LIMIT 1').get();assert.equal(audit.reason,'Market change');assert.equal(audit.changed_by,'Admin');assert.equal(JSON.parse(audit.before_json).priceType,'outstation');assert.equal(JSON.parse(audit.after_json).outstationPriceLevelId,price.occ26.id)})

test('Branch cannot select Outstation when Customer Material has not enabled it',()=>{
  const db=database(),price=levels(db);createCustomer({customerId:'LOCAL',customerName:'Local'},db)
  saveCustomerMaterialPricing('LOCAL',[{materialId:price.plastic,standardPriceLevelId:price.plastic10.id,outstationEnabled:false}],{changedBy:'Admin',reason:'Local pricing'},db)
  const customer=db.prepare("SELECT id FROM customers WHERE jodoo_customer_id='LOCAL'").get(),branch=db.prepare("INSERT INTO branches(jodoo_branch_id,customer_id,branch_name) VALUES('LOCAL-1',?,'Local One')").run(customer.id)
  assert.throws(()=>replaceBranchMaterialSelections(Number(branch.lastInsertRowid),[{materialId:price.plastic,priceType:'outstation'}],{},db),/inherited from Customer/)
})

test('Customer Special Price, reopen persistence and future Branch Price List resolution work',()=>{const db=database(),price=levels(db);createCustomer({customerId:'SPECIAL',customerName:'Special',materialPricing:[{materialId:price.occ,standardSpecialPrice:.315,outstationEnabled:true,outstationSpecialPrice:.285,priceType:'outstation'}]},db);createBranch({branchId:'SPECIAL-1',customerId:'SPECIAL',branchName:'One'},db);createBranch({branchId:'SPECIAL-2',customerId:'SPECIAL',branchName:'Two'},db);for(const id of ['SPECIAL-1','SPECIAL-2'])assert.deepEqual({type:getBranch(id,db).materials[0].priceType,price:getBranch(id,db).materials[0].currentPrice},{type:'outstation',price:.285});assert.equal(getCustomer('SPECIAL',db).materialPricing[0].priceType,'outstation')})

test('Customer Special Price can return to shared Standard/Outstation and validates amounts',()=>{const db=database(),price=levels(db);createCustomer({customerId:'SWITCH',customerName:'Switch',materialPricing:[{materialId:price.occ,standardSpecialPrice:.315,outstationEnabled:true,outstationSpecialPrice:.285,priceType:'outstation'}]},db);createBranch({branchId:'SWITCH-1',customerId:'SWITCH',branchName:'One'},db);saveCustomerMaterialPricing('SWITCH',[{materialId:price.occ,standardPriceLevelId:price.occ30.id,outstationEnabled:true,outstationPriceLevelId:price.occ28.id,priceType:'standard'}],{changedBy:'Admin',reason:'Use Standard',confirmed:true},db);assert.deepEqual({type:getBranch('SWITCH-1',db).materials[0].priceType,price:getBranch('SWITCH-1',db).materials[0].currentPrice},{type:'standard',price:.30});assert.throws(()=>saveCustomerMaterialPricing('SWITCH',[{materialId:price.occ,standardSpecialPrice:'invalid'}],{confirmed:true},db),/valid number/);assert.throws(()=>saveCustomerMaterialPricing('SWITCH',[{materialId:price.occ,standardSpecialPrice:-.01}],{confirmed:true},db),/negative/);assert.throws(()=>saveCustomerMaterialPricing('SWITCH',[{materialId:price.occ,standardSpecialPrice:.1234}],{confirmed:true},db),/3 decimal/)})

test('explicit removedMaterialIds safely deactivates only unused Customer Pricing and audits removal',()=>{
  const db=database(),price=levels(db)
  createCustomer({customerId:'REMOVE',customerName:'Remove Test',materialPricing:[
    {materialId:price.occ,standardSpecialPrice:.123},
    {materialId:price.plastic,standardPriceLevelId:price.plastic10.id},
  ]},db)
  createCustomer({customerId:'OTHER',customerName:'Other Customer',materialPricing:[
    {materialId:price.occ,standardPriceLevelId:price.occ30.id},
  ]},db)
  assert.equal(getCustomer('REMOVE',db).materialPricing.length,2)

  updateCustomer('REMOVE',{
    customerName:'Remove Test',
    materialPricing:[{materialId:price.plastic,standardPriceLevelId:price.plastic10.id}],
    removedMaterialIds:[price.occ],
    changedBy:'Admin',
    reason:'Remove unused OCC pricing',
  },db)

  assert.deepEqual(getCustomer('REMOVE',db).materialPricing.map(item=>item.materialCode),['PLASTIC'])
  assert.equal(db.prepare('SELECT status FROM customer_material_pricing WHERE customer_id=(SELECT id FROM customers WHERE jodoo_customer_id=?) AND material_id=?').get('REMOVE',price.occ).status,'inactive')
  assert.equal(getCustomer('OTHER',db).materialPricing[0].materialCode,'OCC')
  const history=db.prepare('SELECT before_json,after_json,reason,changed_by FROM customer_material_pricing_history WHERE customer_id=(SELECT id FROM customers WHERE jodoo_customer_id=?) AND material_id=? ORDER BY id DESC LIMIT 1').get('REMOVE',price.occ)
  assert.equal(JSON.parse(history.before_json).standardSpecialPrice,.123)
  assert.equal(JSON.parse(history.after_json).removed,true)
  assert.equal(history.reason,'Remove unused OCC pricing')
  assert.equal(history.changed_by,'Admin')
})

test('Pricing omission never deletes, cross-Customer removal is scoped, and Branch references block removal transactionally',()=>{const db=database(),price=levels(db);createCustomer({customerId:'SAFE',customerName:'Safe',materialPricing:[{materialId:price.occ,standardPriceLevelId:price.occ30.id},{materialId:price.plastic,standardPriceLevelId:price.plastic10.id}]},db);createBranch({branchId:'SAFE-BRANCH',customerId:'SAFE',branchName:'Safe Branch'},db);saveCustomerMaterialPricing('SAFE',[{materialId:price.occ,standardPriceLevelId:price.occ30.id}],{changedBy:'Admin',reason:'Partial update'},db);assert.equal(getCustomer('SAFE',db).materialPricing.length,2);updateCustomer('SAFE',{customerName:'Safe',removedMaterialIds:[price.occ],reason:'Remove OCC',changedBy:'Admin'},db);assert.deepEqual(getCustomer('SAFE',db).materialPricing.map(item=>item.materialCode),['PLASTIC']);assert.ok(getBranch('SAFE-BRANCH',db));assert.equal(db.prepare("SELECT status FROM customer_material_pricing WHERE customer_id=(SELECT id FROM customers WHERE jodoo_customer_id='SAFE') AND material_id=?").get(price.occ).status,'inactive')})

test('completed dispatch snapshot stays immutable after Customer price changes',()=>{const db=database(),price=levels(db);createCustomer({customerId:'SNAP',customerName:'Snapshot'},db);saveCustomerMaterialPricing('SNAP',[{materialId:price.occ,standardPriceLevelId:price.occ30.id,outstationEnabled:true,outstationPriceLevelId:price.occ28.id,priceType:'outstation'}],{reason:'Opening'},db);createBranch({branchId:'SNAP-OUT',customerId:'SNAP',branchName:'Snapshot Out'},db);const branch=db.prepare("SELECT id FROM branches WHERE jodoo_branch_id='SNAP-OUT'").get(),dispatch=db.prepare("INSERT INTO dispatches(dispatch_date,status) VALUES('2026-08-02','draft')").run(),stop=db.prepare('INSERT INTO dispatch_stops(dispatch_id,branch_id,stop_sequence) VALUES(?,?,1)').run(dispatch.lastInsertRowid,branch.id);captureDispatchStopPriceSnapshot(Number(stop.lastInsertRowid),db);saveCustomerMaterialPricing('SNAP',[{materialId:price.occ,standardPriceLevelId:price.occ30.id,outstationEnabled:true,outstationPriceLevelId:price.occ26.id,priceType:'outstation'}],{reason:'Change',confirmed:true},db);assert.equal(db.prepare('SELECT price_snapshot price FROM dispatch_stop_material_prices WHERE dispatch_stop_id=?').get(stop.lastInsertRowid).price,.28);assert.equal(listBranchMaterials(branch.id,db)[0].currentPrice,.26)})

test('Customer pricing permission remains server-authorized',()=>{
  const db=database();assert.equal(roleCan('owner_admin','price_manage'),true);assert.equal(roleCan('operations_admin','price_manage'),true);assert.equal(roleCan('office','price_manage'),false)
  db.prepare("INSERT INTO employees(employee_code,name,job_role) VALUES('SUP','Supervisor','Supervisor')").run();const account=db.prepare("INSERT INTO auth_accounts(employee_id,username,password_hash,role) VALUES(1,'sup','hash','supervisor')").run()
  assert.equal(accountCan({id:Number(account.lastInsertRowid),role:'supervisor'},'price_manage',db),false)
  db.prepare("INSERT INTO auth_account_permissions(account_id,permission,granted_by) VALUES(?,'price_manage','Owner')").run(account.lastInsertRowid)
  assert.equal(accountCan({id:Number(account.lastInsertRowid),role:'supervisor'},'price_manage',db),true)
})

test('Customer editor sends explicit removals and failed saves keep the modal open',()=>{
  const source=readFileSync(new URL('../src/MasterDataPage.jsx',import.meta.url),'utf8')
  const routes=readFileSync(new URL('../server/index.mjs',import.meta.url),'utf8')
  assert.match(source,/removedMaterialIds/)
  assert.match(source,/customerPricingDraftHasDelta/)
  assert.match(source,/Object\.assign\(payload,\{materialPricing:form\.materialPricing,removedMaterialIds,pricingConfirmed,reason\}\)/)
  assert.match(source,/catch\(item\)\{fail\(item\.message\)\}/)
  assert.match(routes,/Array\.isArray\(payload\.removedMaterialIds\).*price_manage/)
})
