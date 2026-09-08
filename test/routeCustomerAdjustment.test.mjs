import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {schemaSql} from '../server/schema.mjs'
import {adjustRouteCustomer,assignRouteVehicle,generateDay,getDispatchDay} from '../server/dispatchService.mjs'
import {installWeeklyRoutePlan} from '../server/weeklyRoutePlanService.mjs'
function fixture(){const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON;'+schemaSql);db.prepare("INSERT INTO customers(jodoo_customer_id,name) VALUES('C','Customer')").run();db.prepare("INSERT INTO branches(jodoo_branch_id,customer_id,branch_name,status,collection_frequency,assigned_weekdays,latitude,longitude) VALUES('B1',1,'One','active','Weekly','[\"Monday\"]',1,1),('B2',1,'Two','active','Weekly','[\"Monday\"]',1,1),('B3',1,'Three','active','Weekly','[\"Monday\"]',1,1)").run();db.prepare("INSERT INTO branch_schedules(jodoo_schedule_id,branch_id,source_branch_id,frequency,days_of_week) VALUES('S1',1,'B1','Weekly','Monday'),('S2',2,'B2','Weekly','Monday'),('S3',3,'B3','Weekly','Monday')").run();db.prepare("INSERT INTO vehicles(vehicle_code,registration_number,status,operational_status) VALUES('Lorry 2','QAA4293N','available','active'),('Lorry 3','QAB1225B','available','active')").run();db.prepare("INSERT INTO employees(employee_code,name,job_role,employment_status,is_active) VALUES('D1','Driver One','Driver','active',1),('D2','Driver Two','Driver','active',1)").run();installWeeklyRoutePlan({name:'Routes',sourceName:'test',entries:[[1,'QAA4293N',1,1,'B1','',''],[1,'QAA4293N',1,2,'B2','',''],[1,'QAB1225B',1,1,'B3','','']]},{},db);generateDay({startDate:'2026-09-07'},db);return db}

const manager={role:'supervisor',employeeName:'Manager'}
function payload(db,date,routeNumber,sourceDate='2026-09-07'){return{date,routeNumber,reason:'Customer requested change',expectedRevision:getDispatchDay(sourceDate,db).revision,targetRevision:getDispatchDay(date,db).revision}}
test('single occurrence Route change persists regeneration, follows target vehicle and leaves weekly plan unchanged',()=>{
 const db=fixture();try{
 assignRouteVehicle('2026-09-07',1,{vehicleId:1},db);assignRouteVehicle('2026-09-07',2,{vehicleId:2},db)
 const beforePlan=db.prepare('SELECT * FROM weekly_route_plan_stops').all(),day=getDispatchDay('2026-09-07',db),stop=day.routeBoards[0].stops[0]
 adjustRouteCustomer(stop.id,payload(db,'2026-09-07',2),manager,db)
 assert.equal(getDispatchDay('2026-09-07',db).routeBoards[1].stops.find(s=>s.id===stop.id).vehicleId,2)
 generateDay({startDate:'2026-09-07'},db)
 assert.ok(getDispatchDay('2026-09-07',db).routeBoards[1].stops.some(s=>s.id===stop.id))
 assert.deepEqual(db.prepare('SELECT * FROM weekly_route_plan_stops').all(),beforePlan)
 assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0)
 }finally{db.close()}
})
test('reschedule moves one occurrence without losing or duplicating it on regeneration',()=>{
 const db=fixture();try{
 generateDay({startDate:'2026-09-08'},db)
 const stop=getDispatchDay('2026-09-07',db).routeBoards[0].stops[0]
 adjustRouteCustomer(stop.id,payload(db,'2026-09-08',2),manager,db)
 assert.ok(!getDispatchDay('2026-09-07',db).stops.some(s=>s.id===stop.id))
 assert.ok(getDispatchDay('2026-09-08',db).routeBoards[1].stops.some(s=>s.id===stop.id))
 generateDay({startDate:'2026-09-07'},db);generateDay({startDate:'2026-09-08'},db)
 assert.ok(!getDispatchDay('2026-09-07',db).stops.some(s=>s.branchId===stop.branchId))
 assert.equal(getDispatchDay('2026-09-08',db).routeBoards[1].stops.filter(s=>s.branchId===stop.branchId).length,1)
 adjustRouteCustomer(stop.id,payload(db,'2026-09-07',1,'2026-09-08'),manager,db)
 generateDay({startDate:'2026-09-07'},db);generateDay({startDate:'2026-09-08'},db)
 assert.equal(getDispatchDay('2026-09-07',db).routeBoards[0].stops.filter(s=>s.branchId===stop.branchId).length,1)
 assert.ok(!getDispatchDay('2026-09-08',db).stops.some(s=>s.branchId===stop.branchId))

 }finally{db.close()}
})
test('permissions, stale revision, executed stops and approved days reject atomically',()=>{
 const db=fixture();try{
 const stop=getDispatchDay('2026-09-07',db).routeBoards[0].stops[0],args=payload(db,'2026-09-07',2)
 const original=db.prepare('SELECT * FROM dispatch_stops WHERE id=?').get(stop.id)
 assert.throws(()=>adjustRouteCustomer(stop.id,args,{role:'driver'},db),/主管/)
 assert.throws(()=>adjustRouteCustomer(stop.id,{...args,expectedRevision:-1},manager,db),/刷新/)
 db.prepare("UPDATE dispatch_stops SET status='completed' WHERE id=?").run(stop.id)
 assert.throws(()=>adjustRouteCustomer(stop.id,args,manager,db),/单据/)
 db.prepare("UPDATE dispatch_stops SET status=? WHERE id=?").run(original.status,stop.id)
 db.exec("UPDATE dispatch_days SET status='approved'")
 assert.throws(()=>adjustRouteCustomer(stop.id,args,manager,db),/撤回/)
 assert.equal(db.prepare("SELECT COUNT(*) n FROM dispatch_change_logs WHERE change_type='route_customer_adjusted'").get().n,0)
 }finally{db.close()}
})

test('existing bills block movement and duplicate target dates leave records untouched',()=>{
 const db=fixture();try{
 assignRouteVehicle('2026-09-07',1,{vehicleId:1},db)
 const stop=getDispatchDay('2026-09-07',db).routeBoards[0].stops[0]
 db.prepare("INSERT INTO purchase_bills(bill_number,dispatch_stop_id,dispatch_trip_id,dispatch_day_id,branch_id,customer_id,driver_employee_id,vehicle_id,service_date,customer_name_snapshot,branch_code_snapshot,branch_name_snapshot,driver_name_snapshot,vehicle_code_snapshot,payment_method,weight_method,print_choice,subtotal_cents,total_cents,issued_at) VALUES('TEST',?,?,1,1,1,1,1,'2026-09-07','Customer','B1','One','Driver One','Lorry 2','Credit','estimated','no_print',100,100,'2026-09-07T08:00:00+08:00')").run(stop.id,stop.tripId)
 const bill=db.prepare('SELECT * FROM purchase_bills').get()
 assert.throws(()=>adjustRouteCustomer(stop.id,payload(db,'2026-09-07',2),manager,db),/单据/)
 assert.deepEqual(db.prepare('SELECT * FROM purchase_bills').get(),bill)
 generateDay({startDate:'2026-09-14'},db)
 const other=getDispatchDay('2026-09-07',db).routeBoards[0].stops[1]
 const before=db.prepare('SELECT * FROM dispatch_stops WHERE id=?').get(other.id)
 assert.throws(()=>adjustRouteCustomer(other.id,payload(db,'2026-09-14',2),manager,db))
 assert.deepEqual(db.prepare('SELECT * FROM dispatch_stops WHERE id=?').get(other.id),before)
 }finally{db.close()}
})
