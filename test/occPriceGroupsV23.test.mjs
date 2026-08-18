import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {schemaSql} from '../server/schema.mjs'
import {seedFixedOccPriceGroups} from '../server/migrationV21.mjs'
import {applyV23Migration} from '../server/migrationV23.mjs'
import {assignBranchesToOccPriceGroup,createOccPriceGroup,listOccPriceGroups,updateOccPriceGroup} from '../server/occPriceGroupService.mjs'
import {createPriceLevel} from '../server/materialPriceService.mjs'
import {accountCan,roleCan} from '../server/authService.mjs'
import {apiErrorMessage,apiRequest,setApiLanguage} from '../src/apiClient.js'

const fixture=()=>{
  const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON;'+schemaSql)
  seedFixedOccPriceGroups(db);db.prepare('INSERT OR IGNORE INTO schema_meta(version) VALUES(22)').run()
  db.prepare("INSERT INTO customers(jodoo_customer_id,name) VALUES('C1','Customer')").run()
  db.prepare("INSERT INTO branches(jodoo_branch_id,customer_id,branch_name) VALUES('B1',1,'One'),('B2',1,'Two')").run()
  const occ=db.prepare("SELECT id FROM materials WHERE material_code='OCC'").get(),level=createPriceLevel(occ.id,{priceAmount:.19,effectiveDate:'2026-01-01',reason:'fixture'},db)
  for(const id of [1,2])db.prepare("INSERT INTO branch_material_prices(branch_id,material_id,price_level_id,effective_date,status,assigned_by) VALUES(?,?,?,'2026-01-01','active','Historical fixture')").run(id,occ.id,level.id)
  return db
}

test('v23 preserves stable Group IDs while managed creation blocks duplicate prices',()=>{
  const db=fixture(),before=db.prepare("SELECT id FROM occ_price_groups WHERE price_amount=.19").get().id
  const result=applyV23Migration(db)
  assert.equal(result.schemaVersion,23)
  assert.throws(()=>createOccPriceGroup({priceAmount:.19,itemCode:'OCC-TRANSITION',reason:'Transition group'},db),error=>error.code==='OCC_LEGACY_READ_ONLY'&&error.statusCode===410)
  assert.equal(db.prepare("SELECT id FROM occ_price_groups WHERE price_amount=.19").get().id,before)
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok')
  assert.equal(applyV23Migration(db).schemaVersion,23)
})

test('repricing changes one stable Group only, keeps Branch assignments and audits snapshot',()=>{const db=fixture();applyV23Migration(db);const group=listOccPriceGroups(db).items.find(item=>item.priceAmount===.19);db.prepare("INSERT INTO branch_occ_price_assignments(branch_id,occ_price_group_id,assigned_by) VALUES(1,?,'Historical')").run(group.id);const before=db.prepare('SELECT * FROM occ_price_groups WHERE id=?').get(group.id);assert.throws(()=>updateOccPriceGroup(group.id,{priceAmount:.2,effectiveDate:'2026-07-01',reason:'Forbidden',changedBy:'Spoof'},db),error=>error.statusCode===410);assert.deepEqual({...db.prepare('SELECT * FROM occ_price_groups WHERE id=?').get(group.id)},{...before});assert.equal(db.prepare('SELECT occ_price_group_id id FROM branch_occ_price_assignments WHERE branch_id=1').get().id,group.id);assert.equal(db.prepare('SELECT COUNT(*) n FROM occ_price_group_price_history').get().n,0)})

test('OCC home data exposes used groups and Price Not Set without creating RM0.00',()=>{const db=fixture();applyV23Migration(db);const group=listOccPriceGroups(db).items.find(item=>item.priceAmount===.19);db.prepare("INSERT INTO branch_occ_price_assignments(branch_id,occ_price_group_id,assigned_by) VALUES(1,?,'Historical')").run(group.id);const result=listOccPriceGroups(db);assert.equal(result.items.find(item=>item.id===group.id).branchCount,1);assert.equal(result.priceNotSetCount,1);assert.throws(()=>assignBranchesToOccPriceGroup(group.id,[2],{reason:'Forbidden'},db),/read-only/);assert.equal(db.prepare('SELECT COUNT(*) count FROM occ_price_groups WHERE price_amount=0').get().count,0)})

test('UI sources use used-group cards, branch detail management and modal master creation',async()=>{
  const fs=await import('node:fs')
  const materials=fs.readFileSync(new URL('../src/MaterialsPricesPage.jsx',import.meta.url),'utf8')
  const employees=fs.readFileSync(new URL('../src/EmployeeMasterPage.jsx',import.meta.url),'utf8')
  const zones=fs.readFileSync(new URL('../src/ZoneGroupManager.jsx',import.meta.url),'utf8')
  const master=fs.readFileSync(new URL('../src/MasterDataPage.jsx',import.meta.url),'utf8')
  assert.match(materials,/Show unused price groups/)
  assert.match(materials,/Search Customer Code \/ Customer \/ Branch/)
  assert.match(materials,/Price Not Set/)
  assert.match(materials,/>Preview Move</)
  assert.match(materials,/Confirm Move/)
  assert.match(materials,/OCC Branch move preview/)
  const css=fs.readFileSync(new URL('../src/MasterDataPage.css',import.meta.url),'utf8')
  assert.match(css,/\.price-level-grid article\[role="button"\]\{cursor:pointer/)
  assert.match(css,/:hover\{border-color:/)
  assert.match(css,/:focus-visible\{outline:/)
  assert.match(css,/\.occ-price-groups>\.price-level-grid article\[role="button"\]>button\{display:none\}/)
  assert.match(materials,/material\.addOccPriceGroup/)
  assert.match(materials,/detail\.products\.length===1/)
  assert.match(materials,/orderedCategories\.map/)
  assert.match(materials,/<BackButton className="material-back-button"/)
  assert.doesNotMatch(materials,/Preview \/ Confirm Move/)
  assert.doesNotMatch(materials,/confirm\(`Move \$\{selected\.length\}/)
  assert.match(employees,/showCreate&&<div className="employee-detail-backdrop"/)
  assert.match(employees,/EmployeeCreateDetail/)
  assert.match(zones,/showCreate&&<div className="zone-rename-backdrop"/)
  assert.doesNotMatch(master,/area-closeout/)
  assert.doesNotMatch(master,/\['transfer','master\.importExport'\]/)
})

test('OCC move permission remains server-authorized and API errors are specific in all languages',async()=>{
  assert.equal(roleCan('owner_admin','price_manage'),true)
  assert.equal(roleCan('office','price_manage'),false)
  const db=fixture();db.prepare("INSERT INTO employees(employee_code,name,job_role) VALUES('SUP-OCC','OCC Supervisor','Supervisor')").run();const account=db.prepare("INSERT INTO auth_accounts(employee_id,username,password_hash,role) VALUES(1,'supervisor-test','hash','supervisor')").run()
  assert.equal(accountCan({id:Number(account.lastInsertRowid),role:'supervisor'},'price_manage',db),false)
  const routes=(await import('node:fs')).readFileSync(new URL('../server/index.mjs',import.meta.url),'utf8')
  assert.match(routes,/occ-price-groups\/bulk-transfer'\)\) return sendJson\(response,410/)
  assert.match(routes,/Branch OCC assignments are legacy read-only data/)
  assert.match(routes,/X-Request-ID/)
  assert.match(routes,/event:'api_error'/)
  for(const language of ['en','ms','zh']){
    setApiLanguage(language)
    assert.notEqual(apiErrorMessage({errorCode:'OCC_BRANCH_SOURCE_CHANGED'}),'apiError.occ_branch_source_changed')
    assert.notEqual(apiErrorMessage({errorCode:'OCC_NO_BRANCHES_SELECTED'}),'apiError.occ_no_branches_selected')
    assert.notEqual(apiErrorMessage({errorCode:'OCC_BRANCH_NOT_FOUND'}),'apiError.occ_branch_not_found')
  }
})

test('API failures retain specific status and expose a safe correlation reference',async()=>{
  const original=globalThis.fetch
  try{
    globalThis.fetch=async()=>new Response(JSON.stringify({errorCode:'OCC_BRANCH_SOURCE_CHANGED',requestId:'req-safe-123'}),{status:409,headers:{'Content-Type':'application/json','X-Request-ID':'req-safe-123'}})
    setApiLanguage('en')
    await assert.rejects(()=>apiRequest('/api/occ-price-groups/bulk-transfer',{method:'POST'}),error=>error.status===409&&error.code==='OCC_BRANCH_SOURCE_CHANGED'&&error.requestId==='req-safe-123'&&/Reference: req-safe-123/.test(error.message))
  }finally{globalThis.fetch=original}
})
