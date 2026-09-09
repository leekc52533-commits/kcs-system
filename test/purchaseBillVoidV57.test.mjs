import {applyV57Migration} from '../server/migrationV57.mjs'
import {listBillVoids,requestBillVoid,decideBillVoid} from '../server/purchaseBillVoidService.mjs'
import {reissuePurchaseBill,uploadReplacementProof,getReplacementBilling} from '../server/purchaseBillingService.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import {schemaSql,SCHEMA_VERSION} from '../server/schema.mjs'
import {applyV28Migration} from '../server/migrationV28.mjs'
import {applyV44Migration} from '../server/migrationV44.mjs'
import {seedV22MasterData} from '../server/migrationV22.mjs'
import {approveDay,generateWeek,saveDraftAdjustments,handoverRoute,getDispatchDay,driverToday} from '../server/dispatchService.mjs'
import {mobileWeightContext} from '../server/unloadingWeightService.mjs'
import {arriveAtStop,completeDriverStop,startDriverTrip} from '../server/driverExecutionService.mjs'
import {createPurchaseBill,getPurchaseBilling,uploadPurchasePaymentProof} from '../server/purchaseBillingService.mjs'
import {configureCashFloat,mobileCashFloat} from '../server/cashFloatService.mjs'

const date='2026-09-07',now=new Date('2026-09-07T01:00:00Z'),context={employeeId:1,role:'driver',today:date,now}
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

function fixture(){
  const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON;'+schemaSql);applyV28Migration(db);seedV22MasterData(db)
  db.prepare("INSERT INTO areas(jodoo_area_id,name) VALUES('A','A')").run()
  db.prepare("INSERT INTO customers(jodoo_customer_id,name,payment_type,default_payment_type) VALUES('C1','Cash Company','Cash','Cash'),('C2','Credit Company','Credit','Credit')").run()
  db.prepare("INSERT INTO branches(jodoo_branch_id,customer_id,area_id,branch_name,address,latitude,longitude,payment_type) VALUES('B1',1,1,'Cash Branch','A',3.1,101.6,'Cash'),('B2',2,1,'Credit Branch','B',3.1,101.6,'Credit')").run()
  db.prepare("INSERT INTO branch_schedules(jodoo_schedule_id,branch_id,source_branch_id,frequency,days_of_week) VALUES('S1',1,'B1','Weekly','Monday'),('S2',2,'B2','Weekly','Monday')").run()
  db.prepare("INSERT INTO vehicles(vehicle_code,status,operational_status) VALUES('V','available','active')").run()
  db.prepare("INSERT INTO employees(employee_code,name,job_role,employment_status,is_active) VALUES('D','Driver','Driver','active',1)").run()
  const product=db.prepare("SELECT id,material_id FROM material_products WHERE product_code='OCC'").get(),level=db.prepare("INSERT INTO material_price_levels(material_id,product_id,price_amount,price_cents,effective_date,is_fixed) VALUES(?,?,0.20,20,'2026-01-01',1)").run(product.material_id,product.id)
  for(const customerId of [1,2])db.prepare('INSERT INTO customer_product_pricing(customer_id,product_id,standard_price_level_id) VALUES(?,?,?)').run(customerId,product.id,Number(level.lastInsertRowid))
  for(const branchId of [1,2])db.prepare('INSERT OR IGNORE INTO branch_product_availability(branch_id,product_id,is_selectable) VALUES(?,?,1)').run(branchId,product.id)
  generateWeek({startDate:date},db);const stops=db.prepare('SELECT id FROM dispatch_stops ORDER BY id').all().map(row=>row.id)
  saveDraftAdjustments({adjustments:stops.map(stopId=>({stopId,vehicleId:1,tripNumber:1})),reason:'test',changedBy:'test'},db);db.prepare('UPDATE dispatches SET driver_id=1').run();approveDay(date,{approvedBy:'Supervisor',reason:'ready'},db)
  const tripId=db.prepare('SELECT id FROM dispatch_trips WHERE EXISTS(SELECT 1 FROM dispatch_stops WHERE dispatch_trip_id=dispatch_trips.id)').get().id;startDriverTrip(tripId,context,db)
  return{db,tripId,stops,productId:product.id}
}
const arrive=(db,id)=>arriveAtStop(id,{latitude:3.1001,longitude:101.6001,accuracy:10,captured_at:'2026-09-07T00:59:30Z'},context,db)

function setup({cash=true,configured=true}={}){
 const f=fixture(),{db,stops,productId}=f
 db.prepare("INSERT INTO employees(employee_code,name,job_role,employment_status,is_active) VALUES('M','Manager','Supervisor','active',1),('X','Other','Driver','active',1)").run()
 if(!cash)db.prepare("UPDATE branches SET payment_type='Credit' WHERE id=1").run()
 if(configured)configureCashFloat(1,{targetFloat:500,currentBalance:500,lowBalanceThreshold:100,serviceDate:date},context,db)
 arrive(db,stops[0])
 const payload={weightMethod:'on_site',printChoice:'no_print',items:[{productId,quantity:100}]},bill=createPurchaseBill(stops[0],payload,context,db)
 return {...f,bill,payload,manager:{employeeId:2,role:'supervisor',now},other:{...context,employeeId:3}}
}
test('cash approval preserves documents and completed stop; retries reverse exactly once; historical reissue gets new number',()=>{
 const {db,stops,bill,payload,manager}=setup(),folder=fs.mkdtempSync(path.join(os.tmpdir(),'void-proof-'))
 try{
  uploadPurchasePaymentProof(stops[0],{photo:{dataUrl:png,name:'original.png'}},context,db,{uploadsRoot:folder})
  completeDriverStop(stops[0],context,db)
  const originalItems=db.prepare('SELECT * FROM purchase_bill_items WHERE purchase_bill_id=?').all(bill.id),proof=db.prepare('SELECT * FROM purchase_payment_proofs').get(),stop=db.prepare('SELECT * FROM dispatch_stops WHERE id=?').get(stops[0])
  const request=requestBillVoid(bill.id,{reason:'Wrong quantity'},context,db)
  assert.equal(requestBillVoid(bill.id,{reason:'Retry'},context,db).id,request.id)
  assert.equal(mobileCashFloat(1,db).balanceCents,48000)
  decideBillVoid(request.id,'approved',{},manager,db)
  decideBillVoid(request.id,'approved',{},manager,db)
  assert.equal(db.prepare("SELECT count(*) n FROM cash_float_transactions WHERE transaction_type='reversal'").get().n,1)
  assert.equal(mobileCashFloat(1,db).balanceCents,50000)
  assert.equal(db.prepare('SELECT status FROM purchase_bills WHERE id=?').get(bill.id).status,'voided')
  assert.deepEqual(db.prepare('SELECT * FROM purchase_bill_items WHERE purchase_bill_id=?').all(bill.id),originalItems)
  assert.deepEqual(db.prepare('SELECT * FROM purchase_payment_proofs').get(),proof)
  assert.ok(fs.existsSync(path.join(folder,proof.storage_key)))
  const after=db.prepare('SELECT * FROM dispatch_stops WHERE id=?').get(stops[0]);assert.equal(after.status,'completed');assert.equal(after.completed_at,stop.completed_at)
  const later={...context,today:'2026-09-10',now:new Date('2026-09-10T01:00:00Z')}
  assert.equal(getReplacementBilling(bill.id,later,db).bill,null)
  const replacement=reissuePurchaseBill(bill.id,{...payload,items:[{productId:payload.items[0].productId,quantity:50}]},later,db)
  assert.notEqual(replacement.billNumber,bill.billNumber)
  assert.equal(reissuePurchaseBill(bill.id,payload,later,db).id,replacement.id)
  assert.equal(mobileCashFloat(1,db).balanceCents,49000)
  assert.equal(replacement.paymentProofUploaded,false)
  uploadReplacementProof(bill.id,{photo:{dataUrl:png,name:'new.png'}},later,db,{uploadsRoot:folder})
  assert.equal(db.prepare('SELECT count(*) n FROM purchase_payment_proofs').get().n,2)
  assert.equal(db.prepare('SELECT status FROM dispatch_stops WHERE id=?').get(stops[0]).status,'completed')
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[])
  assert.equal(db.prepare('SELECT count(*) n FROM purchase_bill_void_events').get().n,3)
 }finally{db.close();fs.rmSync(folder,{recursive:true,force:true})}
})
test('ownership, approval roles, reason and rejection; request alone never changes ledger',()=>{
 const {db,bill,manager,other}=setup()
 assert.equal(listBillVoids({},other,db).items.length,0)
 assert.throws(()=>requestBillVoid(bill.id,{reason:'x'},other,db),{code:'PERMISSION_DENIED'})
 assert.throws(()=>requestBillVoid(bill.id,{reason:' '},context,db),{code:'VOID_REASON_REQUIRED'})
 const r=requestBillVoid(bill.id,{reason:'Wrong bill'},context,db)
 assert.throws(()=>decideBillVoid(r.id,'approved',{},context,db),{code:'PERMISSION_DENIED'})
 assert.throws(()=>decideBillVoid(r.id,'approved',{}, {...manager,role:'office'},db),{code:'PERMISSION_DENIED'})
 assert.throws(()=>decideBillVoid(r.id,'rejected',{},manager,db),{code:'VOID_REASON_REQUIRED'})
 decideBillVoid(r.id,'rejected',{note:'Verified original'},manager,db)
 assert.throws(()=>decideBillVoid(r.id,'approved',{},manager,db),{code:'VOID_STATE_CONFLICT'})
 assert.equal(mobileCashFloat(1,db).balanceCents,48000)
 assert.equal(db.prepare('SELECT status FROM purchase_bills WHERE id=?').get(bill.id).status,'issued')
 assert.notEqual(requestBillVoid(bill.id,{reason:'New evidence'},context,db).id,r.id)
 db.prepare("UPDATE employees SET employment_status='inactive',is_active=0 WHERE id=1").run()
 assert.throws(()=>listBillVoids({},context,db),{code:'PERMISSION_DENIED'})
 db.close()
})
test('credit or cash without original deduction cannot create a credit; ledger mismatch rolls back approval',()=>{
 for(const settings of [{cash:false},{configured:false}]){
  const {db,bill,manager}=setup(settings),r=requestBillVoid(bill.id,{reason:'Wrong'},context,db)
  decideBillVoid(r.id,'approved',{},manager,db)
  assert.equal(db.prepare("SELECT count(*) n FROM cash_float_transactions WHERE transaction_type='reversal'").get().n,0)
  db.close()
 }
 const {db,bill,manager}=setup(),r=requestBillVoid(bill.id,{reason:'Wrong'},context,db)
 db.prepare('UPDATE cash_float_transactions SET amount_cents=-123 WHERE purchase_bill_id=?').run(bill.id)
 assert.throws(()=>decideBillVoid(r.id,'approved',{},manager,db),{code:'VOID_LEDGER_CONFLICT'})
 assert.equal(db.prepare('SELECT status FROM purchase_bills WHERE id=?').get(bill.id).status,'issued')
 assert.equal(db.prepare('SELECT status FROM purchase_bill_void_requests WHERE id=?').get(r.id).status,'pending')
 db.close()
})
test('v56 migration rebuild keeps IDs, foreign keys, items, photo and ledger; partial uniqueness allows replacement',()=>{
 const {db,bill,stops}=setup(),folder=fs.mkdtempSync(path.join(os.tmpdir(),'void-migration-'))
 uploadPurchasePaymentProof(stops[0],{photo:{dataUrl:png,name:'original.png'}},context,db,{uploadsRoot:folder})
 const proofs=db.prepare('SELECT * FROM purchase_payment_proofs').all()
 // Recreate the old inline UNIQUE constraint with existing child records.
 db.exec('PRAGMA foreign_keys=OFF; DROP INDEX purchase_bills_issued_stop;')
 const create=db.prepare("SELECT sql FROM sqlite_master WHERE name='purchase_bills' AND type='table'").get().sql
 db.exec(create.replace('purchase_bills','purchase_bills_old').replace('dispatch_stop_id INTEGER NOT NULL','dispatch_stop_id INTEGER NOT NULL UNIQUE'))
 db.exec('INSERT INTO purchase_bills_old SELECT * FROM purchase_bills; DROP TABLE purchase_bills; ALTER TABLE purchase_bills_old RENAME TO purchase_bills; DELETE FROM schema_meta; INSERT INTO schema_meta(version) VALUES(56); PRAGMA foreign_keys=ON;')
 const before=db.prepare('SELECT * FROM purchase_bills').all(),children=db.prepare('SELECT * FROM purchase_bill_items').all(),ledger=db.prepare('SELECT * FROM cash_float_transactions').all()
 applyV57Migration(db);applyV57Migration(db)
 assert.deepEqual(db.prepare('SELECT * FROM purchase_bills').all(),before)
 assert.deepEqual(db.prepare('SELECT * FROM purchase_bill_items').all(),children)
 assert.deepEqual(db.prepare('SELECT * FROM cash_float_transactions').all(),ledger)
 assert.deepEqual(db.prepare('SELECT * FROM purchase_payment_proofs').all(),proofs)
 assert.ok(fs.existsSync(path.join(folder,proofs[0].storage_key)))
 assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys,1)
 assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[])
 assert.equal(db.prepare('SELECT MAX(version) v FROM schema_meta').get().v,57)
 const unique=db.prepare("SELECT sql FROM sqlite_master WHERE name='purchase_bills_issued_stop'").get().sql
 assert.match(unique,/WHERE status='issued'/)
 db.close();fs.rmSync(folder,{recursive:true,force:true})
})
