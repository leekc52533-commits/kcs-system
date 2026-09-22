import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {ensureV28Schema} from '../server/migrationV28.mjs'
import {schemaSql} from '../server/schema.mjs'
import {applyV53Migration} from '../server/migrationV53.mjs'
import {approveRoute,reopenRoute,applyWeeklyRoutePlanToDay,assignRouteVehicle,driverToday,generateDay,getDispatchDay,reorderRouteStop,routeApprovalCheck} from '../server/dispatchService.mjs'
import {startDriverTrip} from '../server/driverExecutionService.mjs'
import {installWeeklyRoutePlan} from '../server/weeklyRoutePlanService.mjs'

function fixture(){const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON;'+schemaSql);ensureV28Schema(db);db.prepare("INSERT INTO customers(jodoo_customer_id,name) VALUES('C','Customer')").run();db.prepare("INSERT INTO branches(jodoo_branch_id,customer_id,branch_name,status,collection_frequency,assigned_weekdays,latitude,longitude) VALUES('B1',1,'One','active','Weekly','[\"Monday\"]',1,1),('B2',1,'Two','active','Weekly','[\"Monday\"]',1,1),('B3',1,'Three','active','Weekly','[\"Monday\"]',1,1)").run();db.prepare("INSERT INTO branch_schedules(jodoo_schedule_id,branch_id,source_branch_id,frequency,days_of_week) VALUES('S1',1,'B1','Weekly','Monday'),('S2',2,'B2','Weekly','Monday'),('S3',3,'B3','Weekly','Monday')").run();db.prepare("INSERT INTO vehicles(vehicle_code,registration_number,status,operational_status) VALUES('Lorry 2','QAA4293N','available','active'),('Lorry 3','QAB1225B','available','active')").run();db.prepare("INSERT INTO employees(employee_code,name,job_role,employment_status,is_active) VALUES('D1','Driver One','Driver','active',1),('D2','Driver Two','Driver','active',1)").run();installWeeklyRoutePlan({name:'Routes',sourceName:'test',entries:[[1,'QAA4293N',1,1,'B1','',''],[1,'QAA4293N',1,2,'B2','',''],[1,'QAB1225B',1,1,'B3','','']]},{},db);generateDay({startDate:'2026-09-07'},db);return db}

test('each Route can be approved without another unassigned Route blocking it',()=>{const db=fixture();assignRouteVehicle('2026-09-07',1,{vehicleId:1},db);assert.equal(routeApprovalCheck('2026-09-07',1,db).ok,true);assert.equal(routeApprovalCheck('2026-09-07',2,db).ok,false);approveRoute('2026-09-07',1,{approvedBy:'Supervisor'},db);let day=getDispatchDay('2026-09-07',db);assert.equal(day.routeBoards[0].approvalStatus,'approved');assert.equal(day.routeBoards[1].approvalStatus,'pending');assert.equal(day.status,'reapproval_required');assignRouteVehicle('2026-09-07',2,{vehicleId:2},db);approveRoute('2026-09-07',2,{approvedBy:'Supervisor'},db);day=getDispatchDay('2026-09-07',db);assert.equal(day.routeBoards[0].approvalStatus,'approved');assert.equal(day.routeBoards[1].approvalStatus,'approved');assert.equal(day.status,'approved')})

test('editing one Route invalidates only that Route approval',()=>{const db=fixture();assignRouteVehicle('2026-09-07',1,{vehicleId:1},db);assignRouteVehicle('2026-09-07',2,{vehicleId:2},db);approveRoute('2026-09-07',1,{},db);let day=getDispatchDay('2026-09-07',db),second=day.routeBoards[0].stops[1];reorderRouteStop('2026-09-07',1,{stopId:second.id,direction:'up'},db);day=getDispatchDay('2026-09-07',db);assert.equal(day.routeBoards[0].approvalStatus,'reapproval_required');assert.equal(day.routeBoards[1].approvalStatus,'pending')})

test('v53 migration is additive and idempotent',()=>{const db=fixture();db.exec('DROP TABLE daily_route_approvals;DELETE FROM schema_meta;INSERT INTO schema_meta(version) VALUES(52)');const first=applyV53Migration(db),second=applyV53Migration(db);assert.equal(first.schemaVersion,53);assert.equal(second.noOp,true);assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok')})

test('an individually approved Route appears and starts on its assigned employee phone',()=>{const db=fixture();assignRouteVehicle('2026-09-07',1,{vehicleId:1},db);assignRouteVehicle('2026-09-07',2,{vehicleId:2},db);db.prepare('UPDATE dispatches SET driver_id=CASE vehicle_id WHEN 1 THEN 1 WHEN 2 THEN 2 END').run();approveRoute('2026-09-07',1,{approvedBy:'Supervisor'},db);const first=driverToday({employeeId:1,role:'driver',today:'2026-09-07'},db),second=driverToday({employeeId:2,role:'driver',today:'2026-09-07'},db);assert.equal(first.routeAvailable,true);assert.equal(first.totalStops,2);assert.equal(first.trips[0].registrationNumber,'QAA4293N');assert.equal(second.routeAvailable,true);assert.throws(()=>startDriverTrip(second.trips[0].id,{employeeId:2,role:'driver',today:'2026-09-07'},db),/Approved route/);const started=startDriverTrip(first.trips[0].id,{employeeId:1,role:'driver',today:'2026-09-07'},db);assert.equal(started.status,'in_progress');assert.throws(()=>startDriverTrip(second.trips[0].id,{employeeId:2,role:'driver',today:'2026-09-07'},db),/Approved route/);approveRoute('2026-09-07',2,{approvedBy:'Supervisor'},db);const secondReady=driverToday({employeeId:2,role:'driver',today:'2026-09-07'},db);assert.equal(secondReady.routeAvailable,true);assert.equal(startDriverTrip(secondReady.trips[0].id,{employeeId:2,role:'driver',today:'2026-09-07'},db).status,'in_progress');assert.equal(getDispatchDay('2026-09-07',db).status,'in_progress')})

test('employee mobile vehicle heading displays only the plate',async()=>{const source=await import('node:fs/promises').then(fs=>fs.readFile(new URL('../src/AuthPages.jsx',import.meta.url),'utf8'));assert.match(source,/trip\.registrationNumber\|\|trip\.vehicleCode/);assert.doesNotMatch(source,/<h2>\{trip\.vehicleName\|\|trip\.vehicleCode\}/)})


test('withdraw one approved route preserves other approval and all order, then reapprove',()=>{
 const db=fixture(),date='2026-09-07';assignRouteVehicle(date,1,{vehicleId:1},db);assignRouteVehicle(date,2,{vehicleId:2},db)
 const second=getDispatchDay(date,db).routeBoards[0].stops[1];reorderRouteStop(date,1,{stopId:second.id,direction:'up'},db)
 const ids=()=>getDispatchDay(date,db).routeBoards[0].stops.map(s=>s.id),before=ids();approveRoute(date,1,{},db)
 reopenRoute(date,1,{reason:'Change order'},db);assert.deepEqual(ids(),before);assert.equal(getDispatchDay(date,db).routeBoards[0].approvalStatus,'pending')
 approveRoute(date,1,{},db);approveRoute(date,2,{},db)
 const other=db.prepare('SELECT * FROM daily_route_approvals WHERE route_number=2').get();reopenRoute(date,1,{reason:'Review'},db)
 assert.deepEqual(db.prepare('SELECT * FROM daily_route_approvals WHERE route_number=2').get(),other);assert.deepEqual(ids(),before)
 applyWeeklyRoutePlanToDay(db,db.prepare('SELECT * FROM dispatch_days WHERE dispatch_date=?').get(date));assert.deepEqual(ids(),before)
 const execution=db.prepare('SELECT id FROM dispatch_stops WHERE route_number=1 ORDER BY stop_sequence').all().map(s=>s.id);assert.deepEqual(execution,before)
 approveRoute(date,1,{},db);assert.equal(getDispatchDay(date,db).status,'approved')
 assert.throws(()=>reopenRoute(date,1,{reason:''},db),/reason/)
 db.prepare("UPDATE dispatches SET status='in_progress' WHERE vehicle_id=1").run();assert.throws(()=>reopenRoute(date,1,{reason:'Blocked'},db),/started/)
 assert.ok(db.prepare('SELECT 1 FROM daily_route_approvals WHERE route_number=1').get());db.close()
})

for(const status of ['published','in_progress'])test(`unstarted route can be withdrawn while another route is ${status}`,()=>{
 const db=fixture(),date='2026-09-07';try{
 assignRouteVehicle(date,1,{vehicleId:1},db);assignRouteVehicle(date,2,{vehicleId:2},db)
 approveRoute(date,1,{},db);approveRoute(date,2,{},db)
 db.prepare('UPDATE dispatch_days SET status=? WHERE dispatch_date=?').run(status,date)
 db.exec("UPDATE dispatches SET status='in_progress' WHERE vehicle_id=2; UPDATE dispatch_trips SET execution_status='in_progress' WHERE dispatch_id IN (SELECT id FROM dispatches WHERE vehicle_id=2)")
 const stops=db.prepare('SELECT * FROM dispatch_stops ORDER BY id').all(),other=db.prepare('SELECT * FROM daily_route_approvals WHERE route_number=2').get()
 reopenRoute(date,1,{reason:'Vehicle absent'},db)
 assert.equal(db.prepare('SELECT * FROM daily_route_approvals WHERE route_number=1').get(),undefined)
 assert.deepEqual(db.prepare('SELECT * FROM daily_route_approvals WHERE route_number=2').get(),other)
 assert.deepEqual(db.prepare('SELECT * FROM dispatch_stops ORDER BY id').all(),stops)
 if(status==='in_progress')assert.equal(getDispatchDay(date,db).status,'in_progress')
 assert.throws(()=>reopenRoute(date,2,{reason:'Already running'},db),/started/)
 }finally{db.close()}
})
test('completed day and arrived route remain protected',()=>{
 const db=fixture(),date='2026-09-07';try{
 assignRouteVehicle(date,1,{vehicleId:1},db);approveRoute(date,1,{},db)
 db.exec("UPDATE dispatch_days SET status='completed'")
 assert.throws(()=>reopenRoute(date,1,{reason:'No'},db),/started/)
 db.exec("UPDATE dispatch_days SET status='in_progress';UPDATE dispatch_stops SET arrived_at=CURRENT_TIMESTAMP WHERE route_number=1")
 assert.throws(()=>reopenRoute(date,1,{reason:'No'},db),/started/)
 assert.ok(db.prepare('SELECT 1 FROM daily_route_approvals WHERE route_number=1').get())
 }finally{db.close()}
})
