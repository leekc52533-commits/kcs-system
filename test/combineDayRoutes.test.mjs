import test from 'node:test'
import {ensureV28Schema} from '../server/migrationV28.mjs'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {schemaSql} from '../server/schema.mjs'
import {approveRoute,combineDayRoutes,assignRouteVehicle,assignVehicleDay,driverToday,generateDay,getDispatchDay} from '../server/dispatchService.mjs'
import {installWeeklyRoutePlan} from '../server/weeklyRoutePlanService.mjs'
function fixture(){const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON;'+schemaSql);ensureV28Schema(db);db.prepare("INSERT INTO customers(jodoo_customer_id,name) VALUES('C','Customer')").run();db.prepare("INSERT INTO branches(jodoo_branch_id,customer_id,branch_name,status,collection_frequency,assigned_weekdays,latitude,longitude) VALUES('B1',1,'One','active','Weekly','[\"Monday\"]',1,1),('B2',1,'Two','active','Weekly','[\"Monday\"]',1,1),('B3',1,'Three','active','Weekly','[\"Monday\"]',1,1)").run();db.prepare("INSERT INTO branch_schedules(jodoo_schedule_id,branch_id,source_branch_id,frequency,days_of_week) VALUES('S1',1,'B1','Weekly','Monday'),('S2',2,'B2','Weekly','Monday'),('S3',3,'B3','Weekly','Monday')").run();db.prepare("INSERT INTO vehicles(vehicle_code,registration_number,status,operational_status) VALUES('Lorry 2','QAA4293N','available','active'),('Lorry 3','QAB1225B','available','active')").run();db.prepare("INSERT INTO employees(employee_code,name,job_role,employment_status,is_active) VALUES('D1','Driver One','Driver','active',1),('D2','Driver Two','Driver','active',1)").run();installWeeklyRoutePlan({name:'Routes',sourceName:'test',entries:[[1,'QAA4293N',1,1,'B1','',''],[1,'QAA4293N',1,2,'B2','',''],[1,'QAB1225B',1,1,'B3','','']]},{},db);generateDay({startDate:'2026-09-07'},db);return db}


const date='2026-09-07',manager={role:'supervisor',employeeName:'Manager'}
const args=db=>({targetRouteNumber:1,sourceRouteNumbers:[2],expectedRevision:getDispatchDay(date,db).revision,reason:'Short staffed'})
function ready(){const db=fixture();assignRouteVehicle(date,1,{vehicleId:1},db);assignRouteVehicle(date,2,{vehicleId:2},db);assignVehicleDay(date,1,{driverId:1},db);assignVehicleDay(date,2,{driverId:2},db);db.exec("UPDATE dispatch_stops SET zone_group_name_snapshot=CASE route_number WHEN 1 THEN 'Zone A' ELSE 'Zone B' END");return db}
test('combines one day without copying stops or schedules; assigned driver sees both areas after regeneration',()=>{
 const db=ready();try{
 db.exec("INSERT INTO employees(employee_code,name,job_role,employment_status,is_active) VALUES('C1','Crew One','Crew','active',1)");assignVehicleDay(date,1,{assistantIds:[3]},db)
 const original=db.prepare('SELECT * FROM weekly_route_plan_stops ORDER BY branch_id').all(),ids=db.prepare('SELECT id FROM dispatch_stops ORDER BY id').all()
 const out=combineDayRoutes(date,args(db),manager,db);assert.equal(out.movedCount,1)
 assert.equal(out.day.routeBoards[0].customerCount,3);assert.equal(out.day.routeBoards[1].customerCount,0)
 assert.deepEqual(db.prepare('SELECT id FROM dispatch_stops ORDER BY id').all(),ids)
 assert.deepEqual(db.prepare('SELECT * FROM weekly_route_plan_stops ORDER BY branch_id').all(),original)
 const phone=driverToday({employeeId:1,role:'driver',today:date},db)
 assert.equal(phone.totalStops,3);assert.equal(driverToday({employeeId:3,role:'crew',today:date},db).totalStops,3);assert.deepEqual(new Set(phone.trips.flatMap(t=>t.stops.map(s=>s.zoneGroup))),new Set(['Zone A','Zone B']))
 assert.ok(phone.trips.every(t=>!t.canStart));
 approveRoute(date,1,{approvedBy:'Manager',reason:'Combined route checked'},db);assert.ok(driverToday({employeeId:1,role:'driver',today:date},db).trips.some(t=>t.canStart));
 db.exec("UPDATE dispatch_days SET status='draft'; DELETE FROM daily_route_approvals");assert.equal(driverToday({employeeId:2,role:'driver',today:date},db).routeAvailable,false)
 generateDay({startDate:date},db)
 assert.equal(getDispatchDay(date,db).routeBoards[0].customerCount,3)
 assert.equal(db.prepare("SELECT COUNT(*) n FROM dispatch_change_logs WHERE change_type='daily_routes_combined'").get().n,1)
 assert.throws(()=>combineDayRoutes(date,{...args(db),expectedRevision:-1},manager,db),/MULTI_STALE/)
 generateDay({startDate:'2026-09-14'},db);assert.equal(getDispatchDay('2026-09-14',db).routeBoards[1].customerCount,1)
 }finally{db.close()}
})
test('permission, approval, execution, document and pending request guards leave assignment unchanged',()=>{
 const db=ready();try{
 const source=getDispatchDay(date,db).routeBoards[1].stops[0],before=db.prepare('SELECT * FROM dispatch_stops ORDER BY id').all(),payload=args(db)
 assert.throws(()=>combineDayRoutes(date,payload,{role:'driver'},db),/MULTI_PERMISSION/)
 db.exec("UPDATE dispatch_days SET status='approved'");assert.throws(()=>combineDayRoutes(date,payload,manager,db),/MULTI_PROTECTED/);db.exec("UPDATE dispatch_days SET status='draft'")
 db.prepare("UPDATE dispatch_stops SET arrived_at='2026-09-07T08:00:00Z' WHERE id=?").run(source.id);assert.throws(()=>combineDayRoutes(date,payload,manager,db),/MULTI_PROTECTED/);db.prepare('UPDATE dispatch_stops SET arrived_at=NULL WHERE id=?').run(source.id)
 db.prepare("UPDATE dispatch_stops SET payment_status='paid' WHERE id=?").run(source.id);assert.throws(()=>combineDayRoutes(date,payload,manager,db),/MULTI_PROTECTED/);db.prepare('UPDATE dispatch_stops SET payment_status=NULL WHERE id=?').run(source.id)
 db.prepare("INSERT INTO driver_date_requests(dispatch_stop_id,employee_id,source_date,target_date,reason) VALUES(?,2,?,'2026-09-08','Later')").run(source.id,date)
 assert.throws(()=>combineDayRoutes(date,payload,manager,db),/MULTI_PENDING/);db.exec('DELETE FROM driver_date_requests')
 db.prepare("INSERT INTO stop_documents(dispatch_stop_id,storage_key,original_name,content_type,size_bytes) VALUES(?,'proof','proof.jpg','image/jpeg',100)").run(source.id)
 const document=db.prepare('SELECT * FROM stop_documents').get();assert.throws(()=>combineDayRoutes(date,payload,manager,db),/MULTI_PROTECTED/);assert.deepEqual(db.prepare('SELECT * FROM stop_documents').get(),document)
 assert.deepEqual(db.prepare('SELECT * FROM dispatch_stops ORDER BY id').all(),before)
 assert.equal(db.prepare("SELECT COUNT(*) n FROM dispatch_change_logs WHERE change_type='daily_routes_combined'").get().n,0)
 }finally{db.close()}
})
