import {driverArrangementSchemaSql} from '../server/migrationV64.mjs'
import {ensureGpsExceptionSchema} from '../server/gpsExceptionSchema.mjs'
import {attendanceSchema as leaveSchema} from '../server/migrationV75.mjs'
import test from 'node:test'
import {ensureV28Schema} from '../server/migrationV28.mjs'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {schemaSql} from '../server/schema.mjs'
import {addSupportVehicle,approveRoute,assignRouteVehicle,assignVehicleDay,driverToday,generateDay,getDispatchDay} from '../server/dispatchService.mjs'
import {installWeeklyRoutePlan} from '../server/weeklyRoutePlanService.mjs'
function fixture(){const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON;'+schemaSql);ensureV28Schema(db);ensureGpsExceptionSchema(db);db.exec(driverArrangementSchemaSql);db.exec(leaveSchema);db.prepare("INSERT INTO customers(jodoo_customer_id,name) VALUES('C','Customer')").run();db.prepare("INSERT INTO branches(jodoo_branch_id,customer_id,branch_name,status,collection_frequency,assigned_weekdays,latitude,longitude) VALUES('B1',1,'One','active','Weekly','[\"Monday\"]',1,1),('B2',1,'Two','active','Weekly','[\"Monday\"]',1,1),('B3',1,'Three','active','Weekly','[\"Monday\"]',1,1)").run();db.prepare("INSERT INTO branch_schedules(jodoo_schedule_id,branch_id,source_branch_id,frequency,days_of_week) VALUES('S1',1,'B1','Weekly','Monday'),('S2',2,'B2','Weekly','Monday'),('S3',3,'B3','Weekly','Monday')").run();db.prepare("INSERT INTO vehicles(vehicle_code,registration_number,status,operational_status) VALUES('Lorry 2','QAA4293N','available','active'),('Lorry 3','QAB1225B','available','active')").run();db.prepare("INSERT INTO employees(employee_code,name,job_role,employment_status,is_active) VALUES('D1','Driver One','Driver','active',1),('D2','Driver Two','Driver','active',1)").run();installWeeklyRoutePlan({name:'Routes',sourceName:'test',entries:[[1,'QAA4293N',1,1,'B1','',''],[1,'QAA4293N',1,2,'B2','',''],[1,'QAB1225B',1,1,'B3','','']]},{},db);generateDay({startDate:'2026-09-07'},db);return db}


const date='2026-09-07',manager={role:'supervisor',employeeName:'Manager'}
function ready(){const db=fixture();assignRouteVehicle(date,1,{vehicleId:1},db);assignRouteVehicle(date,2,{vehicleId:2},db);assignVehicleDay(date,1,{driverId:1},db);assignVehicleDay(date,2,{driverId:2},db);db.exec("UPDATE dispatch_stops SET zone_group_name_snapshot=CASE route_number WHEN 1 THEN 'Zone A' ELSE 'Zone B' END");return db}
function supportSetup(){const db=ready();db.exec("INSERT INTO vehicles(vehicle_code,registration_number,status,operational_status) VALUES('Spare','SPARE1','available','active');INSERT INTO employees(employee_code,name,job_role,employment_status,is_active) VALUES('D3','Support Driver','Driver','active',1),('C1','Support Crew','Crew','active',1)");return db}
const payload=db=>({vehicleId:3,driverId:3,assistantIds:[4],stopIds:[getDispatchDay(date,db).routeBoards[0].stops[0].id],expectedRevision:getDispatchDay(date,db).revision})
test('support splits approved route atomically, preserves IDs and other approvals, survives regeneration and leaves next week unchanged',()=>{
 const db=supportSetup();try{
 approveRoute(date,1,{approvedBy:'Manager'},db);approveRoute(date,2,{approvedBy:'Manager'},db)
 const original=db.prepare('SELECT * FROM weekly_route_plan_stops ORDER BY branch_id').all(),ids=db.prepare('SELECT id FROM dispatch_stops ORDER BY id').all(),p=payload(db)
 const r=addSupportVehicle(date,1,p,manager,db),support=r.day.routeBoards.find(r=>r.supportSourceRoute===1)
 assert.equal(support.customerCount,1);assert.equal(support.vehicleId,3);assert.equal(r.day.routeBoards[0].customerCount,1);assert.equal(r.day.routeBoards[1].approvalStatus,'approved');assert.equal(support.approvalStatus,'pending')
 assert.deepEqual(db.prepare('SELECT id FROM dispatch_stops ORDER BY id').all(),ids)
 assert.equal(driverToday({employeeId:3,role:'driver',today:date},db).totalStops,1);assert.equal(driverToday({employeeId:4,role:'crew',today:date},db).totalStops,1)
 assert.ok(driverToday({employeeId:3,role:'driver',today:date},db).trips.every(t=>!t.canStart))
 assert.throws(()=>addSupportVehicle(date,1,p,manager,db),/SUPPORT_STALE/)
 generateDay({startDate:date},db);assert.equal(getDispatchDay(date,db).routeBoards.find(r=>r.supportSourceRoute===1).customerCount,1)
 approveRoute(date,support.routeNumber,{approvedBy:'Manager'},db);assert.ok(driverToday({employeeId:3,role:'driver',today:date},db).trips.some(t=>t.canStart))
 generateDay({startDate:'2026-09-14'},db);assert.equal(getDispatchDay('2026-09-14',db).routeBoards[0].customerCount,2)
 assert.deepEqual(db.prepare('SELECT * FROM weekly_route_plan_stops ORDER BY branch_id').all(),original)
 assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0)
 }finally{db.close()}
})
test('permission, stale, staff conflict, leave, arrival and pending guards leave no partial assignments',()=>{
 const db=supportSetup();try{
 const p=payload(db),before=db.prepare('SELECT * FROM dispatch_stops ORDER BY id').all()
 assert.throws(()=>addSupportVehicle(date,1,p,{role:'driver'},db),/SUPPORT_PERMISSION/)
 assert.throws(()=>addSupportVehicle(date,1,{...p,driverId:2},manager,db),/SUPPORT_STAFF/)
 db.exec("INSERT INTO leave_requests(employee_id,account_id,start_date,end_date,reason,requested_at,status) VALUES(3,3,'2026-09-07','2026-09-07','Leave','now','approved')")
 assert.throws(()=>addSupportVehicle(date,1,p,manager,db),/SUPPORT_STAFF/);db.exec('DELETE FROM leave_requests')
 db.prepare("UPDATE dispatch_stops SET arrived_at='now' WHERE id=?").run(p.stopIds[0]);assert.throws(()=>addSupportVehicle(date,1,p,manager,db),/SUPPORT_PROTECTED/);db.prepare('UPDATE dispatch_stops SET arrived_at=NULL WHERE id=?').run(p.stopIds[0])
 db.prepare("INSERT INTO driver_date_requests(dispatch_stop_id,employee_id,source_date,target_date,reason) VALUES(?,1,?,'2026-09-08','Later')").run(p.stopIds[0],date)
 assert.throws(()=>addSupportVehicle(date,1,p,manager,db),/SUPPORT_PENDING/);db.exec('DELETE FROM driver_date_requests')
 assert.deepEqual(db.prepare('SELECT * FROM dispatch_stops ORDER BY id').all(),before);assert.equal(db.prepare("SELECT COUNT(*) n FROM dispatch_change_logs WHERE change_type='support_vehicle_added'").get().n,0)
 }finally{db.close()}
})
test('running source keeps its approval when only untouched stops leave',()=>{
 const db=supportSetup();try{
 approveRoute(date,1,{approvedBy:'Manager'},db);db.exec("UPDATE dispatch_days SET status='in_progress';UPDATE dispatches SET status='in_progress' WHERE vehicle_id=1;UPDATE dispatch_trips SET execution_status='in_progress' WHERE dispatch_id IN (SELECT id FROM dispatches WHERE vehicle_id=1)")
 const r=addSupportVehicle(date,1,payload(db),manager,db);assert.equal(r.day.routeBoards[0].approvalStatus,'approved');assert.equal(r.day.routeBoards.find(r=>r.supportSourceRoute).approvalStatus,'pending')
 }finally{db.close()}
})
test('late write failure rolls back customers, assignments, staff and revision together',()=>{
 const db=supportSetup();try{
 const before=getDispatchDay(date,db),assignments=db.prepare('SELECT * FROM daily_route_assignments').all(),p=payload(db)
 db.exec("CREATE TRIGGER support_failure BEFORE INSERT ON dispatch_change_logs WHEN NEW.change_type='support_vehicle_added' BEGIN SELECT RAISE(ABORT,'injected failure'); END")
 assert.throws(()=>addSupportVehicle(date,1,p,manager,db),/injected failure/)
 assert.deepEqual(getDispatchDay(date,db),before);assert.deepEqual(db.prepare('SELECT * FROM daily_route_assignments').all(),assignments)
 }finally{db.close()}
})
