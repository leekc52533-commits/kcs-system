import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {schemaSql} from '../server/schema.mjs'
import {applyV28Migration} from '../server/migrationV28.mjs'
import {seedV22MasterData} from '../server/migrationV22.mjs'
import {approveDay,generateWeek,saveDraftAdjustments} from '../server/dispatchService.mjs'
import {arriveAtStop,completeDriverStop,startDriverTrip,deferDriverStop} from '../server/driverExecutionService.mjs'
import {createPurchaseBill} from '../server/purchaseBillingService.mjs'

const date='2026-09-07',now=new Date('2026-09-07T01:00:00Z'),context={employeeId:1,role:'driver',today:date,now}

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
function unscheduled(db){
 db.exec("INSERT INTO branches(jodoo_branch_id,customer_id,area_id,branch_name,address,latitude,longitude,payment_type) VALUES('B3',1,1,'Leader Depot','Lot 3',3.1,101.6,'Cash')")
 return db.prepare("SELECT id FROM branches WHERE jodoo_branch_id='B3'").get().id
}
const request=(db,targetId,branchId=1)=>collectExistingCustomer({branchId,tripId:targetId,reason:'Customer called our vehicle'},other,db)
const approve=(db,id)=>reviewCustomerTransfer(id,{decision:'approved',reason:'Checked both vehicles'},manager,db)

test('lookup finds partial company / branch names and codes, marks current vehicle, excludes inactive records',()=>{
 const{db}=twoCars();unscheduled(db)
 assert.equal(searchPickupCustomers('eAd',context,db)[0].name,'Leader Depot')
 assert.equal(searchPickupCustomers('cAsH',context,db).length,2)
 assert.equal(searchPickupCustomers('B2',context,db)[0].assignment.own,false)
 assert.equal(searchPickupCustomers('B1',context,db)[0].assignment.own,true)
 assert.equal(searchPickupCustomers('%',context,db).length,0)
 assert.equal(pickupCustomerDetails(3,context,db).products[0].currentPrice,.2)
 db.exec('UPDATE branches SET is_active=0 WHERE id=3')
 assert.equal(searchPickupCustomers('leader',context,db).length,0)
 assert.throws(()=>pickupCustomerDetails(3,context,db),{code:'PICKUP_BRANCH'})
 assert.throws(()=>searchPickupCustomers('cash',{...context,employeeId:99},db),{code:'INTAKE_PERMISSION'})
 db.close()
})

test('one-time existing pickup reuses masters and fixed prices, preserves schedules, deduplicates and requires live arrival and Cash proof',()=>{
 const{db,tripId,productId}=fixture(),branchId=unscheduled(db),master=db.prepare('SELECT * FROM branches').all(),schedules=db.prepare('SELECT * FROM branch_schedules').all()
 const r=collectExistingCustomer({branchId,tripId},context,db)
 assert.equal(collectExistingCustomer({branchId,tripId},context,db).stopId,r.stopId)
 assert.equal(db.prepare('SELECT COUNT(*) n FROM temporary_customer_intakes').get().n,0)
 assert.equal(listExistingPickups(context,db)[0].paymentMethod,'Cash')
 assert.throws(()=>createPurchaseBill(r.stopId,{items:[{productId,quantity:100,unitPrice:.01}]},context,db),{code:'ARRIVAL_REQUIRED'})
 arrive(db,r.stopId)
 const bill=createPurchaseBill(r.stopId,{weightMethod:'on_site',printChoice:'no_print',items:[{productId,quantity:100,unitPrice:.01}]},context,db)
 assert.equal(bill.totalCents,2000)
 assert.throws(()=>completeDriverStop(r.stopId,context,db),{code:'PAYMENT_PROOF_REQUIRED'})
 assert.deepEqual(db.prepare('SELECT * FROM branches').all(),master);assert.deepEqual(db.prepare('SELECT * FROM branch_schedules').all(),schedules)
 assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);db.close()
})

test('opening original same-car stop preserves normal order protection',()=>{
 const{db,tripId,stops}=fixture(),before=db.prepare('SELECT * FROM dispatch_stops').all()
 const r=collectExistingCustomer({branchId:2,tripId},context,db)
 assert.equal(r.stopId,stops[1]);assert.equal(r.reused,true)
 assert.deepEqual(db.prepare('SELECT * FROM dispatch_stops').all(),before)
 assert.throws(()=>arrive(db,r.stopId))
 assert.equal(db.prepare('SELECT kind FROM existing_customer_pickups').get().kind,'existing');db.close()
})

test('other-car transfer stays pending until manager approval, moves the same stop exactly once, keeps recurrence and ownership',()=>{
 const{db,targetId,stops}=twoCars(),before=db.prepare('SELECT * FROM dispatch_stops').all(),schedules=db.prepare('SELECT * FROM branch_schedules').all()
 const r=request(db,targetId);assert.equal(r.pending,true);assert.equal(request(db,targetId).requestId,r.requestId)
 assert.deepEqual(db.prepare('SELECT * FROM dispatch_stops').all(),before)
 assert.equal(listCustomerTransfers(manager,db,{review:true}).length,1)
 assert.equal(listCustomerTransfers(other,db).length,1)
 assert.throws(()=>reviewCustomerTransfer(r.requestId,{decision:'approved',reason:'Self approve'},other,db),{code:'INTAKE_PERMISSION'})
 approve(db,r.requestId);assert.equal(approve(db,r.requestId).idempotent,true)
 const moved=db.prepare('SELECT * FROM dispatch_stops WHERE id=?').get(stops[0]);assert.equal(moved.dispatch_trip_id,targetId);assert.equal(moved.source_schedule_id,before[0].source_schedule_id)
 assert.equal(db.prepare('SELECT COUNT(*) n FROM dispatch_stops').get().n,before.length)
 assert.deepEqual(db.prepare('SELECT * FROM branch_schedules').all(),schedules)
 assert.equal(listCustomerTransfers(manager,db,{review:true}).length,0)
 assert.equal(listExistingPickups(context,db).length,0);assert.equal(listExistingPickups(other,db)[0].stopId,stops[0])
 assert.throws(()=>arrive(db,stops[0]),{code:'PERMISSION_DENIED'})
 arriveAtStop(stops[0],{latitude:3.1,longitude:101.6,accuracy:10,captured_at:now.toISOString()},other,db)
 assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);db.close()
})

test('transfer of Credit customer retains official price and permits completion without Cash proof',()=>{
 const{db,tripId,stops,productId}=twoCars()
 const r=collectExistingCustomer({branchId:2,tripId,reason:'Requested collection'},context,db);approve(db,r.requestId)
 arrive(db,stops[1]);const bill=createPurchaseBill(stops[1],{weightMethod:'on_site',printChoice:'no_print',items:[{productId,quantity:100}]},context,db)
 assert.equal(bill.totalCents,2000);assert.equal(listExistingPickups(context,db)[0].paymentMethod,'Credit')
 completeDriverStop(stops[1],context,db);assert.equal(db.prepare('SELECT status FROM dispatch_stops WHERE id=?').get(stops[1]).status,'completed');db.close()
})

test('approval rechecks source arrival, target assignment, and date without partial movement',()=>{
 for(const change of ['arrive','driver','vehicle','date']){
  const{db,targetId,stops}=twoCars(),r=request(db,targetId)
  if(change==='arrive')arrive(db,stops[0])
  if(change==='driver')db.prepare('UPDATE dispatches SET driver_id=1 WHERE id=(SELECT dispatch_id FROM dispatch_trips WHERE id=?)').run(targetId)
  if(change==='vehicle')db.prepare('UPDATE dispatches SET vehicle_id=1 WHERE id=(SELECT dispatch_id FROM dispatch_trips WHERE id=?)').run(targetId)
  const before=db.prepare('SELECT * FROM dispatch_stops').all()
  assert.throws(()=>reviewCustomerTransfer(r.requestId,{decision:'approved',reason:'Review'},{...manager,today:change==='date'?'2026-09-08':date},db))
  assert.equal(db.prepare('SELECT status FROM customer_transfer_requests').get().status,'pending');assert.deepEqual(db.prepare('SELECT * FROM dispatch_stops').all(),before);db.close()
 }
})

test('started and completed stops cannot be requested; rejected transfer leaves original stop intact',()=>{
 const{db,targetId,stops}=twoCars(),r=request(db,targetId),before=db.prepare('SELECT * FROM dispatch_stops').all()
 reviewCustomerTransfer(r.requestId,{decision:'rejected',reason:'Keep original vehicle'},manager,db)
 assert.deepEqual(db.prepare('SELECT * FROM dispatch_stops').all(),before)
 assert.throws(()=>approve(db,r.requestId),{code:'PICKUP_STALE'})
 arrive(db,stops[0]);assert.throws(()=>request(db,targetId),{code:'PICKUP_PROTECTED'})
 db.prepare("UPDATE dispatch_stops SET status='completed' WHERE id=?").run(stops[0]);assert.throws(()=>request(db,targetId),{code:'PICKUP_PROTECTED'});db.close()
})

test('pending return-later approval and missing GPS block added pickups',()=>{
 const{db,tripId,stops}=fixture(),branchId=unscheduled(db)
 db.prepare('UPDATE branches SET latitude=NULL WHERE id=?').run(branchId)
 assert.throws(()=>collectExistingCustomer({branchId,tripId},context,db),{code:'PICKUP_GPS'})
 db.prepare('UPDATE branches SET latitude=3.1 WHERE id=?').run(branchId)
 arrive(db,stops[0]);deferDriverStop(stops[0],{reason:'customer_requested_return',expectedReturnTime:'11:00'},context,db)
 assert.throws(()=>collectExistingCustomer({branchId,tripId},context,db),{code:'DEFER_APPROVAL_PENDING'});db.close()
})

test('schema 62 upgrade is repeatable and preserves pending transfers and dispatch records',()=>{
 const{db,targetId}=twoCars(),r=request(db,targetId),before=db.prepare('SELECT * FROM dispatch_stops').all()
 db.exec('DELETE FROM schema_meta; INSERT INTO schema_meta(version) VALUES(62)');applyV63Migration(db);applyV63Migration(db)
 assert.equal(db.prepare('SELECT MAX(version) v FROM schema_meta').get().v,63)
 assert.equal(db.prepare('SELECT id FROM customer_transfer_requests').get().id,r.requestId)
 assert.deepEqual(db.prepare('SELECT * FROM dispatch_stops').all(),before)
 assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');db.close()
})
