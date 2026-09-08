import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {schemaSql} from '../server/schema.mjs'
import {ensureRollingWeek,assignRouteVehicle,approveRoute,getDispatchDay} from '../server/dispatchService.mjs'
import {generateDay} from '../server/dispatchService.mjs'
import {installWeeklyRoutePlan} from '../server/weeklyRoutePlanService.mjs'
function fixture(){const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON;'+schemaSql);db.prepare("INSERT INTO customers(jodoo_customer_id,name) VALUES('C','Customer')").run();db.prepare("INSERT INTO branches(jodoo_branch_id,customer_id,branch_name,status,collection_frequency,assigned_weekdays,latitude,longitude) VALUES('B1',1,'One','active','Weekly','[\"Monday\"]',1,1),('B2',1,'Two','active','Weekly','[\"Monday\"]',1,1),('B3',1,'Three','active','Weekly','[\"Monday\"]',1,1)").run();db.prepare("INSERT INTO branch_schedules(jodoo_schedule_id,branch_id,source_branch_id,frequency,days_of_week) VALUES('S1',1,'B1','Weekly','Monday'),('S2',2,'B2','Weekly','Monday'),('S3',3,'B3','Weekly','Monday')").run();db.prepare("INSERT INTO vehicles(vehicle_code,registration_number,status,operational_status) VALUES('Lorry 2','QAA4293N','available','active'),('Lorry 3','QAB1225B','available','active')").run();db.prepare("INSERT INTO employees(employee_code,name,job_role,employment_status,is_active) VALUES('D1','Driver One','Driver','active',1),('D2','Driver Two','Driver','active',1)").run();installWeeklyRoutePlan({name:'Routes',sourceName:'test',entries:[[1,'QAA4293N',1,1,'B1','',''],[1,'QAA4293N',1,2,'B2','',''],[1,'QAB1225B',1,1,'B3','','']]},{},db);generateDay({startDate:'2026-09-07'},db);return db}

test('rolling window appends day seven, inherits vehicle and driver, and preserves every existing day',()=>{
 const db=fixture();try{
 assignRouteVehicle('2026-09-07',1,{vehicleId:1},db);assignRouteVehicle('2026-09-07',2,{vehicleId:2},db)
 db.exec('UPDATE dispatches SET driver_id=vehicle_id WHERE vehicle_id IS NOT NULL')
 approveRoute('2026-09-07',1,{approvedBy:'Manager'},db)
 const first=ensureRollingWeek({startDate:'2026-09-07'},db)
 assert.equal(first.days.length,7);assert.equal(first.days[6].dispatch_date,'2026-09-13')
 const before=first.days.map(day=>getDispatchDay(day.dispatch_date,db))
 const plan=db.prepare('SELECT * FROM weekly_route_plan_stops').all()
 const next=ensureRollingWeek({startDate:'2026-09-08'},db)
 assert.deepEqual(next.days.map(day=>day.dispatch_date),['2026-09-08','2026-09-09','2026-09-10','2026-09-11','2026-09-12','2026-09-13','2026-09-14'])
 for(const day of before)assert.deepEqual(getDispatchDay(day.dispatch_date,db),day)
 const added=next.days[6];assert.equal(added.routeBoards[0].vehicleId,1);assert.equal(added.vehicleBoards.find(v=>v.id===1).driverId,1)
 assert.notEqual(added.routeBoards[0].approvalStatus,'approved')
 assert.deepEqual(db.prepare('SELECT * FROM weekly_route_plan_stops').all(),plan)
 const changes=db.prepare('SELECT total_changes() n').get().n
 ensureRollingWeek({startDate:'2026-09-08'},db)
 assert.equal(db.prepare('SELECT total_changes() n').get().n,changes)
 }finally{db.close()}
})
test('missing days are filled after several days away and existing blank days are kept',()=>{
 const db=fixture();try{
 ensureRollingWeek({startDate:'2026-09-07'},db)
 const blank=getDispatchDay('2026-09-10',db)
 const next=ensureRollingWeek({startDate:'2026-09-10'},db)
 assert.equal(next.days.length,7);assert.equal(next.days[6].dispatch_date,'2026-09-16')
 assert.deepEqual(getDispatchDay('2026-09-10',db),blank)
 assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0)
 }finally{db.close()}
})
