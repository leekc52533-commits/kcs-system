import {listPurchaseBillArchive} from '../server/purchaseBillArchiveService.mjs'
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
import {arriveAtStop,completeDriverStop,startDriverTrip,deferDriverStop} from '../server/driverExecutionService.mjs'
import {createPurchaseBill,getPurchaseBilling,uploadPurchasePaymentProof} from '../server/purchaseBillingService.mjs'
import {createIntake,listIntakes,reviewIntake,cancelIntake,intakeTrips} from '../server/temporaryCustomerIntakeService.mjs'
import {applyV62Migration} from '../server/migrationV62.mjs'
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


const manager={role:'supervisor',employeeId:1,employeeName:'Supervisor'}
const create=(db,tripId,extra={})=>createIntake({name:'New Shop',phone:'0123456789',latitude:3.1,longitude:101.6,tripId,requestKey:'intake-test-unique-001',...extra},context,db)
const makeBill=(db,stopId,productId)=>createPurchaseBill(stopId,{weightMethod:'on_site',printChoice:'no_print',items:[{productId,quantity:100,unitPrice:0.19}]},context,db)

test('temporary creation is scoped, idempotent, unscheduled and leaves existing route order untouched',()=>{
 const {db,tripId}=fixture(),before=db.prepare('SELECT * FROM dispatch_stops').all(),count=db.prepare('SELECT COUNT(*) n FROM branch_schedules').get().n
 assert.equal(intakeTrips(context,db).length,1)
 assert.throws(()=>createIntake({name:'X'}, {...context,role:'crew'},db),{code:'INTAKE_PERMISSION'})
 assert.throws(()=>create(db,tripId,{tripId:999}),{code:'INTAKE_TRIP'})
 assert.throws(()=>create(db,tripId,{latitude:''}),{code:'INTAKE_GPS'})
 const result=create(db,tripId,{contactPerson:'Shop Owner',whatsapp:'0123456789',address:'Lot 12 Jalan Test',remark:'Call at gate'});assert.equal(create(db,tripId).id,result.id)
 const details=db.prepare('SELECT b.address,b.contact_person,b.notes,c.whatsapp FROM branches b JOIN customers c ON c.id=b.customer_id JOIN temporary_customer_intakes i ON i.branch_id=b.id WHERE i.id=?').get(result.id)
 assert.equal(details.address,'Lot 12 Jalan Test');assert.equal(details.contact_person,'Shop Owner');assert.equal(details.notes,'Call at gate');assert.equal(details.whatsapp,'0123456789')
 assert.deepEqual(db.prepare('SELECT * FROM dispatch_stops WHERE id<>?').all(result.stopId),before)
 assert.equal(db.prepare('SELECT COUNT(*) n FROM branch_schedules').get().n,count)
 assert.equal(listIntakes(manager,db,{review:true}).length,0)
 assert.equal(listIntakes(context,db)[0].name,'New Shop')
 assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0)
 db.close()
})

test('temporary collection bills out of order but requires actual arrival, proof and immutable prices',()=>{
 const {db,tripId,stops,productId}=fixture(),before=db.prepare('SELECT * FROM dispatch_stops ORDER BY id').all(),r=create(db,tripId)
 assert.throws(()=>makeBill(db,r.stopId,productId),{code:'ARRIVAL_REQUIRED'})
 assert.throws(()=>getPurchaseBilling(r.stopId,{...context,employeeId:999},db))
 assert.equal(getPurchaseBilling(r.stopId,context,db).temporary,true)
 arrive(db,r.stopId)
 const bill=makeBill(db,r.stopId,productId);assert.equal(bill.totalCents,1900)
 assert.equal(makeBill(db,r.stopId,productId).id,bill.id)
 assert.equal(listIntakes(manager,db,{review:true}).length,1)
 assert.throws(()=>completeDriverStop(r.stopId,context,db),{code:'PAYMENT_PROOF_REQUIRED'})
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'intake-proof-'))
 try{uploadPurchasePaymentProof(r.stopId,{photo:{name:'proof.png',dataUrl:png}},context,db,{uploadsRoot:dir});completeDriverStop(r.stopId,context,db)}finally{fs.rmSync(dir,{recursive:true,force:true})}
 assert.deepEqual(db.prepare('SELECT * FROM dispatch_stops WHERE id<>? ORDER BY id').all(r.stopId),before)
 assert.equal(db.prepare('SELECT price_amount FROM material_price_levels WHERE product_id=?').get(productId).price_amount,.20)
 const snapshots=db.prepare('SELECT * FROM purchase_bills').all()
 reviewIntake(r.id,{decision:'linked',reason:'Same shop',branchId:1},manager,db)
 assert.deepEqual(db.prepare('SELECT * FROM purchase_bills').all(),snapshots)
 assert.equal(db.prepare('SELECT linked_branch_id FROM temporary_customer_intakes WHERE id=?').get(r.id).linked_branch_id,1)
 assert.equal(listIntakes(manager,db,{review:true}).length,0)
 assert.equal(listPurchaseBillArchive({from:date,to:date,search:'Cash Company'},db).items[0].id,bill.id)
 assert.throws(()=>reviewIntake(r.id,{decision:'formal',reason:'again'},manager,db),{code:'INTAKE_STATE'})
 assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0)
 db.close()
})

test('review cannot run before billing or by a driver; formal and one-time never add recurrence',()=>{
 for(const decision of ['formal','one_time']){
  const {db,tripId,productId}=fixture(),r=create(db,tripId),count=db.prepare('SELECT COUNT(*) n FROM branch_schedules').get().n
  assert.throws(()=>reviewIntake(r.id,{decision,reason:'check'},manager,db),{code:'INTAKE_STATE'})
  arrive(db,r.stopId);makeBill(db,r.stopId,productId)
  assert.throws(()=>reviewIntake(r.id,{decision,reason:'check'},context,db),{code:'INTAKE_PERMISSION'})
  reviewIntake(r.id,{decision,reason:'Checked GPS and bill'},manager,db)
  assert.equal(listIntakes(manager,db,{review:true,history:true})[0].status,decision)
  assert.equal(db.prepare('SELECT COUNT(*) n FROM branch_schedules').get().n,count)
  db.close()
 }
})

test('invalid temporary prices roll back billing; cancelling is allowed only before any bill',()=>{
 const {db,tripId,productId}=fixture(),r=create(db,tripId);arrive(db,r.stopId)
 for(const unitPrice of ['',null,-1,.123,Infinity])assert.throws(()=>createPurchaseBill(r.stopId,{weightMethod:'on_site',printChoice:'no_print',items:[{productId,quantity:10,unitPrice}]},context,db),{code:'INTAKE_PRICE'})
 assert.equal(db.prepare('SELECT COUNT(*) n FROM purchase_bills').get().n,0)
 cancelIntake(r.id,context,db);assert.equal(db.prepare('SELECT status FROM dispatch_stops WHERE id=?').get(r.stopId).status,'cancelled')
 const next=create(db,tripId,{requestKey:'intake-test-unique-002'});arrive(db,next.stopId);makeBill(db,next.stopId,productId)
 assert.throws(()=>cancelIntake(next.id,context,db),{code:'INTAKE_STATE'})
 db.close()
})

test('schema 61 upgrade preserves records and can be repeated',()=>{
 const {db}=fixture(),before=db.prepare('SELECT * FROM dispatch_stops').all()
 db.exec('DELETE FROM schema_meta; INSERT INTO schema_meta(version) VALUES(61)')
 applyV62Migration(db);applyV62Migration(db)
 assert.equal(db.prepare('SELECT MAX(version) v FROM schema_meta').get().v,62)
 assert.deepEqual(db.prepare('SELECT * FROM dispatch_stops').all(),before)
 assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');db.close()
})

test('active other drivers cannot access, arrive, cancel or complete someone else temporary collection',()=>{
 const {db,tripId,productId}=fixture(),r=create(db,tripId)
 db.exec("INSERT INTO employees(employee_code,name,job_role,employment_status,is_active) VALUES('D2','Other Driver','Driver','active',1)")
 const other={...context,employeeId:2}
 assert.throws(()=>createIntake({name:'X',latitude:3.1,longitude:101.6,tripId,requestKey:'different-driver-001'},other,db),{code:'INTAKE_TRIP'})
 assert.equal(listIntakes(other,db).length,0)
 assert.throws(()=>getPurchaseBilling(r.stopId,other,db),{code:'PERMISSION_DENIED'})
 assert.throws(()=>cancelIntake(r.id,other,db),{code:'INTAKE_PERMISSION'})
 assert.throws(()=>arriveAtStop(r.stopId,{latitude:3.1,longitude:101.6,accuracy:10,captured_at:now.toISOString()},other,db),{code:'PERMISSION_DENIED'})
 arrive(db,r.stopId);makeBill(db,r.stopId,productId)
 assert.throws(()=>completeDriverStop(r.stopId,other,db),{code:'PERMISSION_DENIED'})
 db.exec(`UPDATE dispatch_stops SET status='completed',completion_outcome='completed' WHERE id=${r.stopId}`)
 assert.throws(()=>completeDriverStop(r.stopId,other,db),{code:'PERMISSION_DENIED'})
 db.close()
})

test('temporary collection cannot bypass an outstanding return-later supervisor approval',()=>{
 const {db,tripId,stops}=fixture(),r=create(db,tripId)
 arrive(db,stops[0]);deferDriverStop(stops[0],{reason:'customer_requested_return',expectedReturnTime:'11:00'},context,db)
 assert.throws(()=>arrive(db,r.stopId),{code:'DEFER_APPROVAL_PENDING'})
 assert.throws(()=>create(db,tripId,{requestKey:'blocked-intake-003'}),{code:'DEFER_APPROVAL_PENDING'})
 db.close()
})
