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
  assert.throws(()=>reviewCustomerTransfer(r.requestId,{decision:'approved',reason:'Review'},{...manager,today:change==='date'?'2026-09-15':date},db))
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

import {collectionAccess,setCollectionAccess,dispatchOpenCollection} from '../server/flexibleCollectionService.mjs'
import {branchCollectionOpen} from '../server/flexibleCollectionPolicy.mjs'
import {driverToday} from '../server/dispatchService.mjs'
import {applyV74Migration} from '../server/migrationV74.mjs'
const owner={...manager,id:900,role:'owner_admin'}
function openZone(db){
 db.exec("INSERT INTO auth_accounts(id,employee_id,username,password_hash,role,system_role) VALUES(900,1,'kcadmin','test','admin','owner_admin'); INSERT OR REPLACE INTO company_menu(id,owner_account_id) VALUES(1,900); UPDATE dispatch_stops SET route_number=1; UPDATE areas SET zone_group_id=1")
 setCollectionAccess(db,owner,1,{isOpen:true,revision:0})
}
test('only pinned owner toggles each route; revisions prevent stale writes; no expiry and audited closure',()=>{
 const{db}=fixture();try{
 openZone(db);assert.equal(branchCollectionOpen(db,1,date),true)
 assert.equal(collectionAccess(db,owner).canEdit,true)
 assert.equal(collectionAccess(db,{...owner,id:901}).canEdit,false)
 assert.throws(()=>setCollectionAccess(db,{...owner,id:901},1,{isOpen:false,revision:1}),{code:'MENU_OWNER_ONLY'})
 assert.throws(()=>setCollectionAccess(db,owner,1,{isOpen:false,revision:0}),{code:'MENU_STALE'})
 db.exec("UPDATE route_collection_access SET changed_at='2000-01-01'")
 assert.equal(branchCollectionOpen(db,1,date),true)
 setCollectionAccess(db,owner,1,{isOpen:false,revision:1});assert.equal(branchCollectionOpen(db,1,date),false)
 assert.equal(db.prepare('SELECT COUNT(*) n FROM route_collection_access_events').get().n,2)
 assert.equal(collectionAccess(db,owner).items.find(z=>z.id===2).isOpen,0)
 }finally{db.close()}
})
test('open own route permits priority arrival, mobile enables it, closing restores order; arrived work keeps billing/proof guards',()=>{
 const{db,tripId,stops}=fixture();try{
 openZone(db)
 assert.equal(driverToday(context,db).trips.find(t=>t.id===tripId).stops.find(s=>s.id===stops[1]).canArrive,true)
 setCollectionAccess(db,owner,1,{isOpen:false,revision:1})
 assert.throws(()=>arrive(db,stops[1]),{code:'STOP_SEQUENCE_REQUIRED'})
 setCollectionAccess(db,owner,1,{isOpen:true,revision:2});arrive(db,stops[1])
 setCollectionAccess(db,owner,1,{isOpen:false,revision:3})
 assert.throws(()=>completeDriverStop(stops[1],context,db),{code:'BILL_REQUIRED'})
 assert.equal(db.prepare('SELECT COUNT(*) n FROM flexible_collection_claims').get().n,1)
 }finally{db.close()}
})
test('open route claim transfers identity once, concurrent other driver is blocked, supervisor can reassign untouched work',()=>{
 const{db,tripId,targetId,stops}=twoCars();try{
 openZone(db);const before=db.prepare('SELECT COUNT(*) n FROM dispatch_stops').get().n
 const r=collectExistingCustomer({branchId:1,tripId:targetId},other,db)
 assert.equal(r.stopId,stops[0]);assert.equal(r.pending,undefined)
 assert.equal(db.prepare('SELECT COUNT(*) n FROM dispatch_stops').get().n,before)
 assert.throws(()=>collectExistingCustomer({branchId:1,tripId},context,db),{code:'FLEX_CLAIMED'})
 assert.equal(collectExistingCustomer({branchId:1,tripId:targetId},other,db).reused,true)
 dispatchOpenCollection(db,manager,{routeNumber:1,branchId:1,tripId})
 assert.equal(db.prepare('SELECT driver_id FROM dispatches WHERE id=(SELECT dispatch_id FROM dispatch_stops WHERE id=?)').get(stops[0]).driver_id,1)
 assert.equal(db.prepare("SELECT actor FROM dispatch_change_logs WHERE change_type='open_zone_collection_assigned' ORDER BY id DESC LIMIT 1").get().actor,'Supervisor')
 arrive(db,stops[0]);assert.throws(()=>request(db,targetId),{code:'PICKUP_PROTECTED'})
 }finally{db.close()}
})
test('closing a claimed untouched stop removes its special order exemption and new transfers require approval',()=>{
 const{db,tripId,targetId,stops}=twoCars();try{
 openZone(db);const r=collectExistingCustomer({branchId:1,tripId:targetId},other,db)
 setCollectionAccess(db,owner,1,{isOpen:false,revision:1})
 assert.throws(()=>arriveAtStop(r.stopId,{latitude:3.1,longitude:101.6,accuracy:10,captured_at:now.toISOString()},other,db),{code:'STOP_SEQUENCE_REQUIRED'})
 const pending=collectExistingCustomer({branchId:1,tripId,reason:'Normal transfer'},context,db);assert.equal(pending.pending,true)
 assert.throws(()=>dispatchOpenCollection(db,manager,{routeNumber:1,branchId:1,tripId}),{code:'FLEX_CLOSED'})
 assert.equal(db.prepare('SELECT dispatch_trip_id FROM dispatch_stops WHERE id=?').get(stops[0]).dispatch_trip_id,targetId)
 }finally{db.close()}
})
test('v74 upgrade retains records and settings across repeat startup',()=>{
 const{db}=fixture();try{db.exec('INSERT INTO schema_meta(version) VALUES(73)');applyV74Migration(db);openZone(db);applyV74Migration(db);assert.equal(branchCollectionOpen(db,1,date),true);assert.equal(db.prepare('SELECT MAX(version) v FROM schema_meta').get().v,74);assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0)}finally{db.close()}
})
test('flexible mode retains pending-approval, crew and Cash payment guards',()=>{
 const{db,targetId,stops,productId}=twoCars();try{
 openZone(db)
 assert.throws(()=>dispatchOpenCollection(db,other,{routeNumber:1,branchId:1,tripId:targetId}),{code:'INTAKE_PERMISSION'})
 assert.throws(()=>collectExistingCustomer({branchId:1,tripId:targetId},{...other,role:'crew'},db),{code:'INTAKE_PERMISSION'})
 const source=db.prepare('SELECT * FROM dispatch_stops WHERE id=?').get(stops[0])
 db.prepare("INSERT INTO driver_arrangement_requests(dispatch_stop_id,service_date,employee_id,employee_role,trip_id,kind,reason,payload_json) VALUES(?,?,1,'driver',?,'order','test','{}')").run(source.id,date,source.dispatch_trip_id)
 assert.throws(()=>collectExistingCustomer({branchId:1,tripId:targetId},other,db),{code:'PICKUP_PROTECTED'})
 assert.throws(()=>arrive(db,source.id),{code:'PICKUP_PENDING'})
 db.exec("UPDATE driver_arrangement_requests SET status='rejected'")
 const r=collectExistingCustomer({branchId:1,tripId:targetId},other,db)
 arriveAtStop(r.stopId,{latitude:3.1,longitude:101.6,accuracy:10,captured_at:now.toISOString()},other,db)
 createPurchaseBill(r.stopId,{weightMethod:'on_site',printChoice:'no_print',items:[{productId,quantity:10}]},other,db)
 assert.throws(()=>completeDriverStop(r.stopId,other,db),{code:'PAYMENT_PROOF_REQUIRED'})
 assert.equal(db.prepare('SELECT driver_employee_id FROM purchase_bills WHERE dispatch_stop_id=?').get(r.stopId).driver_employee_id,2)
 }finally{db.close()}
})

import {flexibleExecution} from '../server/flexibleCollectionPolicy.mjs'
import {applyV76Migration} from '../server/migrationV76.mjs'
test('source route permission follows an untouched claim onto a closed destination route',()=>{
 const{db,tripId,targetId,stops}=twoCars();try{
 openZone(db);setCollectionAccess(db,owner,1,{isOpen:false,revision:1});setCollectionAccess(db,owner,2,{isOpen:true,revision:0})
 db.prepare('UPDATE dispatch_stops SET route_number=2 WHERE id=?').run(stops[0])
 collectExistingCustomer({branchId:1,tripId:targetId},other,db)
 assert.equal(branchCollectionOpen(db,1,date),true);assert.equal(flexibleExecution(db,stops[0]),true)
 assert.equal(flexibleExecution(db,stops[1]),false)
 setCollectionAccess(db,owner,2,{isOpen:false,revision:1});assert.equal(flexibleExecution(db,stops[0]),false)
 setCollectionAccess(db,owner,2,{isOpen:true,revision:2});dispatchOpenCollection(db,manager,{routeNumber:2,branchId:1,tripId})
 assert.equal(db.prepare('SELECT dispatch_trip_id id FROM dispatch_stops WHERE id=?').get(stops[0]).id,tripId)
 }finally{db.close()}
})
test('v76 retires old geographic grants, preserves history and migrates idempotently',()=>{
 const{db}=fixture();try{
 db.exec("INSERT INTO zone_collection_access(zone_id,is_open,revision,changed_by) VALUES(1,1,1,900); INSERT INTO schema_meta(version) VALUES(75)")
 const before=db.prepare('SELECT * FROM dispatch_stops ORDER BY id').all()
 applyV76Migration(db);assert.equal(db.prepare('SELECT MAX(version) v FROM schema_meta').get().v,76)
 assert.equal(db.prepare('SELECT COUNT(*) n FROM route_collection_access').get().n,5)
 assert.equal(branchCollectionOpen(db,1,date),false)
 const history=db.prepare('SELECT * FROM route_collection_access_events').all();applyV76Migration(db)
 assert.deepEqual(db.prepare('SELECT * FROM route_collection_access_events').all(),history)
 assert.deepEqual(db.prepare('SELECT * FROM dispatch_stops ORDER BY id').all(),before)
 assert.equal(db.prepare('SELECT is_open FROM zone_collection_access WHERE zone_id=1').get().is_open,1)
 assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok')
 }finally{db.close()}
})

test('v76 carries fully open routes only, with partial routes closed and original dispatch dates respected',()=>{
 const{db,stops}=fixture();try{
 db.exec("INSERT INTO schema_meta(version) VALUES(75); INSERT INTO zone_collection_access(zone_id,is_open,revision,changed_by) VALUES(1,1,1,900); UPDATE areas SET zone_group_id=1; INSERT INTO areas(jodoo_area_id,name,zone_group_id) VALUES('B','Closed',2); UPDATE branches SET area_id=2 WHERE id=2; INSERT INTO weekly_route_plans(name,source_name,created_by) VALUES('Test','Test','Test'); INSERT INTO weekly_route_plan_stops(plan_id,weekday,branch_id,vehicle_registration_number,trip_number,stop_sequence,route_number) VALUES(1,1,1,'A',1,1,1),(1,2,1,'B',1,1,2),(1,2,2,'B',1,2,2)")
 applyV76Migration(db)
 assert.equal(db.prepare('SELECT is_open FROM route_collection_access WHERE route_number=1').get().is_open,1)
 assert.equal(db.prepare('SELECT is_open FROM route_collection_access WHERE route_number=2').get().is_open,0)
 assert.equal(branchCollectionOpen(db,1,'2026-10-01'),false)
 db.prepare('UPDATE dispatch_stops SET route_number=1 WHERE id=?').run(stops[0]);assert.equal(branchCollectionOpen(db,1,date),true)
 db.prepare('UPDATE dispatch_stops SET route_number=2 WHERE id=?').run(stops[0]);assert.equal(branchCollectionOpen(db,1,date),false)
 db.exec("UPDATE route_collection_access SET is_open=1 WHERE route_number=2")
 assert.equal(branchCollectionOpen(db,1,'2026-10-01'),true)
 }finally{db.close()}
})
