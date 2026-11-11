import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {ensureV28Schema} from '../server/migrationV28.mjs'
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

test('next Monday follows actual collections, not saved dispatch order or vehicle; preserves other routes and drafts',()=>{
 const db=fixture()
 ensureV28Schema(db)
 try{
  assignRouteVehicle('2026-09-07',1,{vehicleId:1},db)
  const trip=db.prepare('SELECT dispatch_trip_id id FROM dispatch_stops WHERE branch_id=1').get().id
  db.prepare("UPDATE dispatch_trips SET execution_status='completed' WHERE id=?").run(trip)
  const finish=db.prepare("UPDATE dispatch_stops SET status='completed',completion_outcome='completed',completed_at=?,completed_by_employee_id=1 WHERE branch_id=?")
  finish.run('2026-09-07T09:00:00+08:00',2);finish.run('2026-09-07T10:00:00+08:00',1)
  const order=date=>db.prepare('SELECT s.branch_id FROM dispatch_stops s JOIN dispatch_trips t ON t.id=s.dispatch_trip_id JOIN dispatch_days d ON d.id=t.dispatch_day_id WHERE d.dispatch_date=? AND s.route_number=1 ORDER BY s.route_stop_sequence').all(date).map(s=>s.branch_id)
  generateDay({startDate:'2026-09-14'},db)
  assert.deepEqual(order('2026-09-14'),[2,1])
  assert.deepEqual(order('2026-09-07'),[1,2])
  db.prepare("UPDATE dispatch_stops SET completion_outcome='no_goods' WHERE branch_id=2 AND dispatch_trip_id=?").run(trip)
  generateDay({startDate:'2026-09-21'},db)
  assert.deepEqual(order('2026-09-21'),[1,2])
  assert.deepEqual(order('2026-09-14'),[2,1])
 }finally{db.close()}
})

test('temporary pickups never become weekly stops; missed recurring branches retain their slot',()=>{
 const db=fixture();ensureV28Schema(db)
 try{
  db.exec("UPDATE weekly_route_plan_stops SET route_number=1,stop_sequence=3 WHERE branch_id=3")
  assignRouteVehicle('2026-09-07',1,{vehicleId:1},db)
  const trip=db.prepare('SELECT dispatch_trip_id id FROM dispatch_stops WHERE branch_id=1').get().id
  const dispatch=db.prepare('SELECT dispatch_id id FROM dispatch_trips WHERE id=?').get(trip).id
  db.prepare("UPDATE dispatch_trips SET execution_status='completed' WHERE id=?").run(trip)
  db.prepare("UPDATE dispatch_stops SET dispatch_trip_id=?,dispatch_id=?,route_number=1,stop_sequence=5 WHERE branch_id=3").run(trip,dispatch)
  db.exec("INSERT INTO branches(jodoo_branch_id,branch_name) VALUES('TEMP','One-off')")
  db.prepare("INSERT INTO dispatch_stops(dispatch_id,dispatch_trip_id,branch_id,route_number,stop_sequence,status) VALUES(?,?,4,1,6,'completed')").run(dispatch,trip)
  for(const [id,hour] of [[3,8],[4,9],[1,10]]){
   db.prepare("UPDATE dispatch_stops SET status='completed',completion_outcome='completed',completed_by_employee_id=1,completed_at=? WHERE branch_id=?").run('2026-09-07T'+String(hour).padStart(2,'0')+':00:00+08:00',id)
  }
  generateDay({startDate:'2026-09-14'},db)
  const rows=db.prepare("SELECT branch_id FROM dispatch_stops WHERE service_date='2026-09-14' ORDER BY route_stop_sequence").all()
  assert.deepEqual(rows.map(x=>x.branch_id),[3,2,1])
 }finally{db.close()}
})
