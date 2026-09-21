import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {schemaSql} from '../server/schema.mjs'
import {applyV28Migration} from '../server/migrationV28.mjs'
import {seedV22MasterData} from '../server/migrationV22.mjs'
import {approveDay,generateWeek,saveDraftAdjustments} from '../server/dispatchService.mjs'
import {arriveAtStop,completeDriverStop,startDriverTrip,deferDriverStop} from '../server/driverExecutionService.mjs'
import {createPurchaseBill} from '../server/purchaseBillingService.mjs'

const date='2026-09-14',now=new Date('2026-09-14T01:00:00Z'),context={employeeId:1,role:'driver',today:date,now}

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
const arrive=(db,id)=>arriveAtStop(id,{latitude:3.1001,longitude:101.6001,accuracy:10,captured_at:'2026-09-14T00:59:30Z'},context,db)

import {searchPickupCustomers,pickupCustomerDetails,collectExistingCustomer,listExistingPickups,listCustomerTransfers,reviewCustomerTransfer} from '../server/existingCustomerPickupService.mjs'
import {applyV63Migration} from '../server/migrationV63.mjs'
const manager={role:'supervisor',employeeId:1,employeeName:'Supervisor',today:date},other={...context,employeeId:2}
function twoCars(){
 const f=fixture(),{db,tripId,stops}=f,t=db.prepare('SELECT * FROM dispatch_trips WHERE id=?').get(tripId)
 db.exec("INSERT INTO employees(employee_code,name,job_role,employment_status,is_active) VALUES('D2','Other Driver','Driver','active',1); INSERT INTO vehicles(vehicle_code,registration_number,status,operational_status) VALUES('V2','ABC222','available','active');")
 const dispatchId=Number(db.prepare("INSERT INTO dispatches(dispatch_date,vehicle_id,driver_id,status) VALUES(?,2,2,'in_progress')").run(date).lastInsertRowid)
 const targetId=Number(db.prepare("INSERT INTO dispatch_trips(dispatch_day_id,dispatch_id,trip_number,execution_status,started_at,started_by_employee_id) VALUES(?,?,1,'in_progress',?,2)").run(t.dispatch_day_id,dispatchId,now.toISOString()).lastInsertRowid)
 db.prepare('UPDATE dispatch_stops SET dispatch_id=?,dispatch_trip_id=?,route_number=2 WHERE id=?').run(dispatchId,targetId,stops[1])
 return {...f,targetId}
}

import {getWorkClose,requestWorkClose,listWorkClose,reviewWorkClose} from '../server/workCloseService.mjs'
function setup(){const f=fixture();f.db.exec("INSERT INTO weekly_route_plans(name,source_name,created_by) VALUES('Current','Test','Supervisor');INSERT INTO weekly_route_definitions(plan_id,route_number,display_name) VALUES(1,1,'One'),(1,2,'Two');UPDATE dispatch_stops SET route_number=CASE WHEN branch_id=1 THEN 1 ELSE 2 END");return f}
function submit(f){return requestWorkClose(f.tripId,{reason:'Two areas / staff shortage',version:getWorkClose(f.tripId,context,f.db).version},context,f.db)}
function review(f,r,actions,ctx=manager){return reviewWorkClose(r.id,{decision:'approved',reason:'Arranged outstanding customers',version:listWorkClose(ctx,f.db).find(x=>x.id===r.id).version,actions},ctx,f.db)}
function moves(f){return getWorkClose(f.tripId,context,f.db).stops.map(s=>({stopId:s.id,kind:'reschedule',targetDate:'2026-09-15',routeNumber:s.routeNumber}))}
test('one request covers both routes, requires active assigned driver and is idempotent',()=>{
 const f=setup(),{db}=f;try{
 assert.throws(()=>getWorkClose(f.tripId,other,db),{code:'PERMISSION_DENIED'})
 assert.throws(()=>getWorkClose(f.tripId,{...context,role:'crew'},db),{code:'PERMISSION_DENIED'})
 assert.throws(()=>listWorkClose(context,db),{code:'PERMISSION_DENIED'})
 assert.throws(()=>requestWorkClose(f.tripId,{reason:'x',version:'old'},context,db),{code:'WORK_CLOSE_STALE'})
 const r=submit(f);assert.equal(submit(f).id,r.id);assert.equal(listWorkClose(manager,db)[0].stops.length,2)
 assert.deepEqual(new Set(getWorkClose(f.tripId,context,db).stops.map(s=>s.routeNumber)),new Set([1,2]))
 assert.equal(db.prepare('SELECT COUNT(*) n FROM trip_work_close_requests').get().n,1)
 }finally{db.close()}
})
test('approve once-only batch reschedules both routes and closes trip without collection times; retry safe',()=>{
 const f=setup(),{db}=f;try{
 const before=db.prepare('SELECT * FROM branch_schedules').all(),r=submit(f),actions=moves(f)
 assert.throws(()=>reviewWorkClose(r.id,{decision:'approved',reason:'x',actions},context,db),{code:'PERMISSION_DENIED'})
 review(f,r,actions)
 assert.equal(db.prepare('SELECT execution_status FROM dispatch_trips WHERE id=?').get(f.tripId).execution_status,'completed')
 for(const id of f.stops){const s=db.prepare('SELECT * FROM dispatch_stops WHERE id=?').get(id);assert.equal(s.status,'cancelled');assert.equal(s.arrived_at,null);assert.equal(s.completed_at,null)}
 assert.equal(db.prepare("SELECT COUNT(*) n FROM driver_date_requests WHERE status='approved'").get().n,2)
 assert.deepEqual(db.prepare('SELECT id,days_of_week FROM branch_schedules').all().map(s=>({...s})),before.map(s=>({id:s.id,days_of_week:s.days_of_week})))
 assert.equal(reviewWorkClose(r.id,{decision:'approved',reason:'retry'},manager,db).idempotent,true)
 }finally{db.close()}
})
test('failure on second allocation rolls back first allocation and keeps request pending',()=>{
 const f=setup(),{db}=f;try{const r=submit(f),actions=moves(f);actions[1].routeNumber=99
 assert.throws(()=>review(f,r,actions));assert.equal(db.prepare("SELECT COUNT(*) n FROM dispatch_stops WHERE dispatch_trip_id=? AND status='cancelled'").get(f.tripId).n,0)
 assert.equal(db.prepare('SELECT COUNT(*) n FROM driver_date_requests').get().n,0)
 assert.equal(db.prepare('SELECT status FROM trip_work_close_requests WHERE id=?').get(r.id).status,'pending')
 }finally{db.close()}
})
test('bill or arrival becomes protected; stale snapshot cannot approve and bill/proof preserved',()=>{
 const f=setup(),{db}=f;try{const r=submit(f),old=listWorkClose(manager,db)[0],actions=moves(f)
 arrive(db,f.stops[0]);const bill=createPurchaseBill(f.stops[0],{weightMethod:'on_site',printChoice:'no_print',items:[{productId:f.productId,quantity:100}]},context,db)
 assert.throws(()=>reviewWorkClose(r.id,{decision:'approved',reason:'x',version:old.version,actions},manager,db),{code:'WORK_CLOSE_STALE'})
 assert.equal(listWorkClose(manager,db)[0].stops[0].issue,'proof')
 assert.throws(()=>review(f,r,actions),{code:'WORK_CLOSE_PROTECTED'})
 assert.equal(db.prepare('SELECT status FROM purchase_bills WHERE id=?').get(bill.id).status,'issued')
 }finally{db.close()}
})
test('a pending stop approval blocks approval; rejection leaves all stops intact',()=>{
 const f=setup(),{db}=f;try{const r=submit(f),before=db.prepare('SELECT * FROM dispatch_stops').all()
 db.prepare('INSERT INTO driver_date_requests(dispatch_stop_id,employee_id,source_date,target_date,reason) VALUES(?,1,?,?,?)').run(f.stops[0],date,'2026-09-15','test')
 assert.equal(listWorkClose(manager,db)[0].stops[0].issue,'approval');assert.throws(()=>review(f,r,moves(f)),{code:'WORK_CLOSE_PROTECTED'})
 reviewWorkClose(r.id,{decision:'rejected',reason:'Please resolve'},manager,db)
 assert.deepEqual(db.prepare('SELECT * FROM dispatch_stops').all(),before);assert.equal(getWorkClose(f.tripId,context,db).request.status,'rejected')
 }finally{db.close()}
})
test('supervisor can resolve a prior-day request by future rescheduling',()=>{
 const f=setup(),{db}=f;try{const r=submit(f),actions=moves(f).map(a=>({...a,targetDate:'2026-09-16'}));review(f,r,actions,{...manager,today:'2026-09-15'})
 assert.equal(db.prepare('SELECT status FROM trip_work_close_requests').get().status,'approved')
 }finally{db.close()}
})
test('transfer to another running vehicle preserves stop IDs and does not count them as collected',()=>{
 const f=twoCars(),{db}=f;try{const r=submit(f),stopId=getWorkClose(f.tripId,context,db).stops[0].id
 review(f,r,[{stopId,kind:'transfer',tripId:f.targetId}])
 const s=db.prepare('SELECT * FROM dispatch_stops WHERE id=?').get(stopId);assert.equal(s.dispatch_trip_id,f.targetId);assert.equal(s.status,'available');assert.equal(s.completed_at,null)
 assert.equal(db.prepare('SELECT execution_status FROM dispatch_trips WHERE id=?').get(f.tripId).execution_status,'completed')
 assert.equal(db.prepare('SELECT execution_status FROM dispatch_trips WHERE id=?').get(f.targetId).execution_status,'in_progress')
 }finally{db.close()}
})

import {applyV77Migration} from '../server/migrationV77.mjs'
test('schema 77 is additive and repeat startup preserves pending work requests and audit',()=>{
 const f=setup(),{db}=f;try{const r=submit(f),before=db.prepare('SELECT * FROM trip_work_close_requests').all(),stopsBefore=db.prepare('SELECT * FROM dispatch_stops').all()
 db.exec('INSERT INTO schema_meta(version) VALUES(76)');applyV77Migration(db);applyV77Migration(db)
 assert.equal(db.prepare('SELECT MAX(version) v FROM schema_meta').get().v,77)
 assert.deepEqual(db.prepare('SELECT * FROM trip_work_close_requests').all(),before)
 assert.deepEqual(db.prepare('SELECT * FROM dispatch_stops').all(),stopsBefore)
 assert.equal(submit(f).id,r.id)
 }finally{db.close()}
})
