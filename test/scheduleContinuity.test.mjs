import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {ensureV28Schema} from '../server/migrationV28.mjs'
import {schemaSql} from '../server/schema.mjs'
import {installWeeklyRoutePlan} from '../server/weeklyRoutePlanService.mjs'
import {generateDay,ensureRollingWeek,getDispatchDay,assignStopsToRoute,assignRouteVehicle,approveRoute,addTemporaryRouteCollection,recordCustomerReportedNoGoods,reconcileScheduleWindow} from '../server/dispatchService.mjs'
import {getCollectionScheduleManagement,saveCollectionScheduleManagement} from '../server/collectionScheduleManagementService.mjs'
import {routeScheduleProposals} from '../server/routeSchedulePlanning.mjs'
import {synchronizeRouteScheduleBaseline} from '../server/routeScheduleBaselineService.mjs'
import {scheduleMatchesDate} from '../shared/scheduleRecurrence.js'
function fixture(){const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON;'+schemaSql);ensureV28Schema(db);db.prepare("INSERT INTO customers(jodoo_customer_id,name) VALUES('C','Customer')").run();db.prepare("INSERT INTO branches(jodoo_branch_id,customer_id,branch_name,status,collection_frequency,assigned_weekdays,latitude,longitude) VALUES('B1',1,'One','active','Weekly','[\"Monday\"]',1,1),('B2',1,'Two','active','Weekly','[\"Monday\"]',1,1),('B3',1,'Three','active','Weekly','[\"Monday\"]',1,1)").run();db.prepare("INSERT INTO branch_schedules(jodoo_schedule_id,branch_id,source_branch_id,frequency,days_of_week) VALUES('S1',1,'B1','Weekly','Monday'),('S2',2,'B2','Weekly','Monday'),('S3',3,'B3','Weekly','Monday')").run();db.prepare("INSERT INTO vehicles(vehicle_code,registration_number,status,operational_status) VALUES('Lorry 2','QAA4293N','available','active'),('Lorry 3','QAB1225B','available','active')").run();db.prepare("INSERT INTO employees(employee_code,name,job_role,employment_status,is_active) VALUES('D1','Driver One','Driver','active',1),('D2','Driver Two','Driver','active',1)").run();installWeeklyRoutePlan({name:'Routes',sourceName:'test',entries:[[1,'QAA4293N',1,1,'B1','',''],[1,'QAA4293N',1,2,'B2','',''],[1,'QAB1225B',1,1,'B3','','']]},{},db);generateDay({startDate:'2026-09-07'},db);return db}
const context={role:'supervisor',actor:'Manager',today:'2026-09-07'}
const stop=(db,branch,date='2026-09-07')=>db.prepare('SELECT ds.* FROM dispatch_stops ds JOIN dispatch_trips dt ON dt.id=ds.dispatch_trip_id JOIN dispatch_days dd ON dd.id=dt.dispatch_day_id WHERE ds.branch_id=? AND dd.dispatch_date=? AND ds.status<>\'cancelled\'').get(branch,date)
const addBranch=db=>db.exec(`INSERT INTO branches(jodoo_branch_id,customer_id,branch_name,status,collection_frequency,assigned_weekdays,latitude,longitude) VALUES('B4',1,'New customer','active','Weekly','["Monday"]',1,1); INSERT INTO branch_schedules(jodoo_schedule_id,branch_id,source_branch_id,frequency,days_of_week) VALUES('S4',4,'B4','Weekly','Monday')`)
const save=(db,branch,fields)=>{const item=getCollectionScheduleManagement(branch,db);return saveCollectionScheduleManagement(branch,{...item,recurrenceType:undefined,anchorDate:'',effectiveDate:'2026-09-07',reason:'Permanent supervisor choice',expectedUpdatedAt:item.updatedAt,...fields},db)}

test('refresh fills a missing customer without rebuilding existing stops, choices or order',()=>{const db=fixture();try{
 ensureRollingWeek({startDate:'2026-09-07'},db);const before=db.prepare('SELECT * FROM dispatch_stops').all();addBranch(db)
 ensureRollingWeek({startDate:'2026-09-07'},db);assert.ok(stop(db,4));for(const original of before)assert.deepEqual(db.prepare('SELECT * FROM dispatch_stops WHERE id=?').get(original.id),original)
 assignStopsToRoute('2026-09-07',{routeNumber:1,stopIds:[stop(db,4).id]},db);generateDay({startDate:'2026-09-07'},db);assert.equal(stop(db,4).route_number,1)
 const n=db.prepare('SELECT total_changes() n').get().n;ensureRollingWeek({startDate:'2026-09-07'},db);assert.equal(db.prepare('SELECT total_changes() n').get().n,n)
}finally{db.close()}})

test('approved day reports missing customers and remains byte-for-byte unchanged',()=>{const db=fixture();try{
 assignRouteVehicle('2026-09-07',1,{vehicleId:1},db);approveRoute('2026-09-07',1,{approvedBy:'Manager'},db);ensureRollingWeek({startDate:'2026-09-07'},db)
 const before=getDispatchDay('2026-09-07',db);addBranch(db);const result=ensureRollingWeek({startDate:'2026-09-07'},db);assert.ok(result.scheduleReview.some(r=>r.kind==='missing'&&r.branchId==='B4'));assert.deepEqual(getDispatchDay('2026-09-07',db),before)
}finally{db.close()}})

test('permanent weekday change commits Branch, Schedule and Route together, then reconciles draft days',()=>{const db=fixture();try{
 ensureRollingWeek({startDate:'2026-09-07'},db);save(db,'B1',{frequency:'Once a week',weekdays:['Tuesday'],routeNumber:1});ensureRollingWeek({startDate:'2026-09-07'},db)
 assert.equal(stop(db,1),undefined);assert.equal(stop(db,1,'2026-09-08').route_number,1)
 assert.deepEqual(JSON.parse(db.prepare('SELECT assigned_weekdays FROM branches WHERE id=1').get().assigned_weekdays),['Tuesday'])
 assert.deepEqual(db.prepare('SELECT weekday FROM weekly_route_plan_stops WHERE branch_id=1').all().map(r=>r.weekday),[2])
 generateDay({startDate:'2026-09-08'},db);assert.equal(stop(db,1,'2026-09-08').route_number,1)
}finally{db.close()}})

test('invalid route choice rolls back both master schedule and route edits',()=>{const db=fixture();try{
 const before=db.prepare('SELECT * FROM branch_schedules WHERE id=1').get(),routes=db.prepare('SELECT * FROM weekly_route_plan_stops').all();assert.throws(()=>save(db,'B1',{frequency:'Once a week',weekdays:['Tuesday'],routeNumber:9}));assert.deepEqual(db.prepare('SELECT * FROM branch_schedules WHERE id=1').get(),before);assert.deepEqual(db.prepare('SELECT * FROM weekly_route_plan_stops').all(),routes)
}finally{db.close()}})

for(const weeks of [2,3])test(`${weeks}-week customer is assigned to home Route only when due`,()=>{const db=fixture();try{
 save(db,'B1',{frequency:`Every ${weeks} Weeks`,weekdays:['Monday'],anchorDate:'2026-09-07',routeNumber:1});generateDay({startDate:'2026-09-14'},db);assert.equal(stop(db,1,'2026-09-14'),undefined)
 const due=weeks===2?'2026-09-21':'2026-09-28';generateDay({startDate:due},db);assert.equal(stop(db,1,due).route_number,1)
 const schedule=db.prepare('SELECT * FROM branch_schedules WHERE id=1').get();assert.equal(scheduleMatchesDate(schedule,due),true)
}finally{db.close()}})

test('monthly recurrence remains monthly and missing anchors become visible proposals',()=>{const db=fixture();try{
 db.prepare("UPDATE branch_schedules SET frequency='Every 2 Weeks',recurrence_type='interval_weeks',interval_weeks=2 WHERE id=1").run()
 const proposal=routeScheduleProposals(db,'2026-09-07').find(r=>r.branchId==='B1');assert.equal(proposal.automatic,false);assert.equal(proposal.proposal.anchorDate,'2026-09-07')
 synchronizeRouteScheduleBaseline(db,{today:'2026-09-07'});assert.equal(db.prepare('SELECT frequency FROM branch_schedules WHERE id=1').get().frequency,'Every 2 Weeks')
 save(db,'B1',{frequency:'Monthly',weekdays:['Monday'],anchorDate:'2026-09-07',monthlyOccurrence:2,routeNumber:1});generateDay({startDate:'2026-09-14'},db);assert.equal(stop(db,1,'2026-09-14').route_number,1);generateDay({startDate:'2026-09-21'},db);assert.equal(stop(db,1,'2026-09-21'),undefined)
}finally{db.close()}})

test('uploaded Route baseline synchronizes regular weekdays, is atomic and idempotent',()=>{const db=fixture();try{
 db.exec("UPDATE branch_schedules SET days_of_week='Tuesday' WHERE id=1")
 const preview=synchronizeRouteScheduleBaseline(db,{dryRun:true,today:'2026-09-07'});assert.ok(preview.automatic.length)
 synchronizeRouteScheduleBaseline(db,{today:'2026-09-07'});assert.deepEqual(getCollectionScheduleManagement('B1',db).weekdays,['Monday']);assert.equal(synchronizeRouteScheduleBaseline(db,{today:'2026-09-07'}).applied,0)
}finally{db.close()}})

test('temporary extra leaves original occurrence, recurrence, bills and fixed Route unchanged; duplicates reject',()=>{const db=fixture();try{
 ensureRollingWeek({startDate:'2026-09-07'},db);const source=stop(db,1),schedules=db.prepare('SELECT * FROM branch_schedules').all(),routes=db.prepare('SELECT * FROM weekly_route_plan_stops').all();const day=getDispatchDay('2026-09-08',db)
 addTemporaryRouteCollection(source.id,{date:day.dispatch_date,targetRevision:day.revision,reason:'Customer asked for extra collection'},context,db)
 assert.deepEqual(stop(db,1),source);assert.equal(stop(db,1,'2026-09-08').route_number,1);assert.deepEqual(db.prepare('SELECT * FROM branch_schedules').all(),schedules);assert.deepEqual(db.prepare('SELECT * FROM weekly_route_plan_stops').all(),routes)
 assert.throws(()=>addTemporaryRouteCollection(source.id,{date:day.dispatch_date,targetRevision:getDispatchDay(day.dispatch_date,db).revision,reason:'Duplicate'},context,db))
 generateDay({startDate:day.dispatch_date},db);assert.equal(stop(db,1,day.dispatch_date).route_number,1)
}finally{db.close()}})

test('customer notice never invents arrival or changes bills and can be followed by an extra collection',()=>{const db=fixture();try{
 ensureRollingWeek({startDate:'2026-09-07'},db);const source=stop(db,1);recordCustomerReportedNoGoods(source.id,{expectedRevision:getDispatchDay('2026-09-07',db).revision,reason:'Customer called: no goods'},context,db)
 const saved=db.prepare('SELECT * FROM dispatch_stops WHERE id=?').get(source.id);assert.equal(saved.arrived_at,null);assert.equal(saved.completed_at,null);assert.equal(saved.override_note,'customer_reported_no_goods')
 assert.equal(getDispatchDay('2026-09-07',db).noGoodsNotices.length,1);ensureRollingWeek({startDate:'2026-09-07'},db);assert.equal(stop(db,1),undefined)
 const day=getDispatchDay('2026-09-08',db);addTemporaryRouteCollection(source.id,{date:day.dispatch_date,targetRevision:day.revision,reason:'Try tomorrow'},context,db);assert.ok(stop(db,1,day.dispatch_date))
 assert.throws(()=>recordCustomerReportedNoGoods(stop(db,2).id,{expectedRevision:getDispatchDay('2026-09-07',db).revision,reason:'unauthorized'},{...context,role:'driver'},db))
 db.prepare("UPDATE dispatch_stops SET arrived_at='2026-09-07 09:00:00',status='active' WHERE id=?").run(stop(db,2).id);assert.throws(()=>recordCustomerReportedNoGoods(stop(db,2).id,{expectedRevision:getDispatchDay('2026-09-07',db).revision,reason:'cannot rewrite visit'},context,db))
 assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0)
}finally{db.close()}})

test('supervisor confirmation appends a missing customer to approved Route without moving old stops',()=>{const db=fixture();try{
 assignRouteVehicle('2026-09-07',1,{vehicleId:1},db);approveRoute('2026-09-07',1,{approvedBy:'Manager'},db);ensureRollingWeek({startDate:'2026-09-07'},db);const originals=db.prepare('SELECT * FROM dispatch_stops').all();addBranch(db)
 db.prepare("INSERT INTO weekly_route_plan_stops(plan_id,weekday,branch_id,vehicle_registration_number,trip_number,stop_sequence,route_number) VALUES(1,1,4,'QAA4293N',1,3,1)").run()
 const before=getDispatchDay('2026-09-07',db);assert.throws(()=>reconcileScheduleWindow({startDate:'2026-09-07',confirmedDate:'2026-09-07',expectedRevision:before.revision+1},db))
 reconcileScheduleWindow({startDate:'2026-09-07',confirmedDate:'2026-09-07',expectedRevision:before.revision,changedBy:'Manager'},db)
 assert.equal(stop(db,4).route_number,1);for(const original of originals)assert.deepEqual(db.prepare('SELECT * FROM dispatch_stops WHERE id=?').get(original.id),original)
 assert.equal(getDispatchDay('2026-09-07',db).routeBoards[0].approvalStatus,'approved')
}finally{db.close()}})

test('customer-reported no goods preserves valid Route approval and other stops',()=>{const db=fixture();try{
 assignRouteVehicle('2026-09-07',1,{vehicleId:1},db);approveRoute('2026-09-07',1,{approvedBy:'Manager'},db);const source=stop(db,1),other=stop(db,2)
 recordCustomerReportedNoGoods(source.id,{expectedRevision:getDispatchDay('2026-09-07',db).revision,reason:'Customer called'},context,db)
 assert.deepEqual(stop(db,2),other);assert.equal(getDispatchDay('2026-09-07',db).routeBoards[0].approvalStatus,'approved')
}finally{db.close()}})

test('issued bill is immutable across schedule edits, reconciliation and rejected no-goods recording',()=>{const db=fixture();try{
 const source=stop(db,1)
 db.prepare("INSERT INTO purchase_bills(bill_number,dispatch_stop_id,dispatch_trip_id,dispatch_day_id,branch_id,customer_id,driver_employee_id,vehicle_id,service_date,customer_name_snapshot,branch_code_snapshot,branch_name_snapshot,driver_name_snapshot,vehicle_code_snapshot,payment_method,weight_method,print_choice,subtotal_cents,total_cents,issued_at) VALUES('TEST',?,?,1,1,1,1,1,'2026-09-07','Customer','B1','One','Driver One','Lorry 2','Credit','estimated','no_print',100,100,'2026-09-07T08:00:00+08:00')").run(source.id,source.dispatch_trip_id)
 const bill=db.prepare('SELECT * FROM purchase_bills').all()
 assert.throws(()=>recordCustomerReportedNoGoods(source.id,{expectedRevision:getDispatchDay('2026-09-07',db).revision,reason:'No goods'},context,db))
 save(db,'B1',{frequency:'Once a week',weekdays:['Tuesday'],routeNumber:1});ensureRollingWeek({startDate:'2026-09-07'},db)
 assert.deepEqual(db.prepare('SELECT * FROM purchase_bills').all(),bill);assert.deepEqual(stop(db,1),source)
}finally{db.close()}})

test('Sunday conflict remains pending while eligible schedules synchronize, including on retry',()=>{const db=fixture();try{
 db.prepare('UPDATE weekly_route_plan_stops SET weekday=0 WHERE branch_id=1').run()
 const before={schedule:db.prepare('SELECT * FROM branch_schedules WHERE branch_id=1').get(),branch:db.prepare('SELECT * FROM branches WHERE id=1').get(),routes:db.prepare('SELECT * FROM weekly_route_plan_stops WHERE branch_id=1').all()}
 const changes=db.prepare('SELECT total_changes() n').get().n
 const preview=synchronizeRouteScheduleBaseline(db,{today:'2026-09-07',dryRun:true})
 assert.equal(db.prepare('SELECT total_changes() n').get().n,changes)
 assert.ok(preview.pending.some(p=>p.branchId==='B1'&&p.issueCode==='SUNDAY_REVIEW_REQUIRED'))
 assert.ok(!preview.automatic.some(p=>p.branchId==='B1'))
 const result=synchronizeRouteScheduleBaseline(db,{today:'2026-09-07'});assert.equal(result.applied,2)
 assert.deepEqual(db.prepare('SELECT * FROM branch_schedules WHERE branch_id=1').get(),before.schedule)
 assert.deepEqual(db.prepare('SELECT * FROM branches WHERE id=1').get(),before.branch)
 assert.deepEqual(db.prepare('SELECT * FROM weekly_route_plan_stops WHERE branch_id=1').all(),before.routes)
 assert.equal(getCollectionScheduleManagement('B2',db).frequency,'Once a week')
 assert.throws(()=>save(db,'B1',{frequency:'Once a week',weekdays:['Sunday']}),/星期日/)
 const retry=synchronizeRouteScheduleBaseline(db,{today:'2026-09-07'});assert.equal(retry.applied,0);assert.ok(retry.pending.some(p=>p.branchId==='B1'&&p.issueCode==='SUNDAY_REVIEW_REQUIRED'))
}finally{db.close()}})

for(const permitted of ['existing Sunday','allowed customer'])test(`baseline retains Sunday allowance for ${permitted}`,()=>{const db=fixture();try{
 db.prepare('UPDATE weekly_route_plan_stops SET weekday=0 WHERE branch_id=1').run()
 if(permitted==='existing Sunday')db.prepare("UPDATE branch_schedules SET days_of_week='Sunday' WHERE branch_id=1").run()
 else db.prepare("UPDATE customers SET name='Everwin' WHERE id=1").run()
 const result=synchronizeRouteScheduleBaseline(db,{today:'2026-09-07'});assert.equal(result.pending.some(p=>p.branchId==='B1'),false)
 assert.deepEqual(getCollectionScheduleManagement('B1',db).weekdays,['Sunday'])
}finally{db.close()}})

test('baseline resolves prefixed production codes whose internal IDs differ',()=>{const db=fixture();try{
 db.exec("UPDATE branches SET jodoo_branch_id='B10036' WHERE id=1; UPDATE branches SET jodoo_branch_id='10037' WHERE id=2")
 for(const code of ['B10036','b10036','10036'])assert.equal(getCollectionScheduleManagement(code,db).branchName,'One')
 for(const code of ['B10037','b10037','10037'])assert.equal(getCollectionScheduleManagement(code,db).branchName,'Two')
 assert.equal(getCollectionScheduleManagement(1,db).branchId,'B10036')
 const result=synchronizeRouteScheduleBaseline(db,{today:'2026-09-07'});assert.equal(result.applied,3)
 assert.equal(getCollectionScheduleManagement('B10036',db).frequency,'Once a week')
 save(db,'b10036',{frequency:'Once a week',weekdays:['Tuesday'],routeNumber:1})
 assert.deepEqual(getCollectionScheduleManagement('10036',db).weekdays,['Tuesday'])
 assert.deepEqual(getCollectionScheduleManagement('10037',db).weekdays,['Monday'])
}finally{db.close()}})

test('external Branch code never selects another customer with the same numeric internal ID',()=>{const db=fixture();try{
 db.exec("UPDATE branches SET jodoo_branch_id='B10036' WHERE id=1; INSERT INTO branches(id,jodoo_branch_id,customer_id,branch_name,status,collection_frequency) VALUES(10036,'B99999',1,'Unrelated customer','active','On Call')")
 assert.equal(getCollectionScheduleManagement('10036',db).branchName,'One')
 assert.equal(getCollectionScheduleManagement(10036,db).branchName,'Unrelated customer')
 const before=db.prepare('SELECT * FROM branches WHERE id=10036').get()
 synchronizeRouteScheduleBaseline(db,{today:'2026-09-07'})
 assert.deepEqual(db.prepare('SELECT * FROM branches WHERE id=10036').get(),before)
 db.exec("UPDATE branches SET jodoo_branch_id='B77777' WHERE id=1")
 assert.equal(getCollectionScheduleManagement('B10036',db),null)
 assert.equal(getCollectionScheduleManagement('10036',db),null)
}finally{db.close()}})

test('ambiguous external aliases reject instead of choosing a random customer',()=>{const db=fixture();try{
 db.exec("UPDATE branches SET jodoo_branch_id='B10036' WHERE id=1; UPDATE branches SET jodoo_branch_id='10036' WHERE id=2")
 assert.throws(()=>getCollectionScheduleManagement('B10036',db),e=>e.statusCode===409)
 assert.equal(getCollectionScheduleManagement(1,db).branchName,'One')
 assert.equal(getCollectionScheduleManagement(2,db).branchName,'Two')
}finally{db.close()}})

test('production preflight can apply the whole baseline inside an outer rollback transaction',()=>{const db=fixture();try{
 db.exec("UPDATE branches SET jodoo_branch_id='B10036' WHERE id=1")
 const tables=['branches','branch_schedules','weekly_route_plan_stops','master_change_history','audit_logs']
 const before=tables.map(name=>db.prepare(`SELECT * FROM ${name}`).all())
 db.exec('BEGIN IMMEDIATE');const report=synchronizeRouteScheduleBaseline(db,{today:'2026-09-07'});assert.equal(report.applied,3);assert.equal(db.isTransaction,true);db.exec('ROLLBACK')
 assert.deepEqual(tables.map(name=>db.prepare(`SELECT * FROM ${name}`).all()),before)
}finally{db.close()}})

for(const scenario of ['cancelled slot','reversed row IDs'])test(`rolling reconciliation preserves occupied sequence slots: ${scenario}`,()=>{const db=fixture();try{
 ensureRollingWeek({startDate:'2026-09-07'},db)
 if(scenario==='cancelled slot'){
  const old=stop(db,1)
  recordCustomerReportedNoGoods(old.id,{expectedRevision:getDispatchDay('2026-09-07',db).revision,reason:'Customer called'},context,db)
 }else{
  const a=stop(db,1),b=stop(db,2)
  db.prepare('UPDATE dispatch_stops SET stop_sequence=100 WHERE id=?').run(a.id)
  db.prepare('UPDATE dispatch_stops SET stop_sequence=? WHERE id=?').run(a.stop_sequence,b.id)
  db.prepare('UPDATE dispatch_stops SET stop_sequence=? WHERE id=?').run(b.stop_sequence,a.id)
 }
 const before=db.prepare('SELECT * FROM dispatch_stops ORDER BY id').all()
 addBranch(db)
 db.exec("INSERT INTO weekly_route_plan_stops(plan_id,weekday,branch_id,vehicle_registration_number,trip_number,stop_sequence,route_number) VALUES(1,1,4,'QAA4293N',1,3,1)")
 ensureRollingWeek({startDate:'2026-09-07'},db)
 assert.equal(stop(db,4).route_number,1)
 for(const row of before)assert.deepEqual(db.prepare('SELECT * FROM dispatch_stops WHERE id=?').get(row.id),row)
 const after=db.prepare('SELECT * FROM dispatch_stops ORDER BY id').all()
 ensureRollingWeek({startDate:'2026-09-07'},db)
 assert.deepEqual(db.prepare('SELECT * FROM dispatch_stops ORDER BY id').all(),after)
 assert.equal(db.prepare("SELECT count(*) n FROM dispatch_stops WHERE branch_id=4 AND service_date='2026-09-07' AND status<>'cancelled'").get().n,1)
 assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0)
}finally{db.close()}})

import {syncSupervisorSavedSchedule,routeSignature} from '../server/dispatchService.mjs'
const stillApproved=db=>{const day=db.prepare("SELECT id FROM dispatch_days WHERE dispatch_date='2026-09-07'").get().id;return db.prepare('SELECT route_signature s FROM daily_route_approvals WHERE dispatch_day_id=? AND route_number=1').get(day)?.s===routeSignature(db,day,1)}
test('management save itself synchronizes approved dates without approving an unapproved target',t=>{
 t.mock.timers.enable({apis:['Date'],now:new Date('2026-09-07T01:00:00Z')})
 const db=fixture();try{
 ensureRollingWeek({startDate:'2026-09-07'},db);assignRouteVehicle('2026-09-07',1,{vehicleId:1},db);approveRoute('2026-09-07',1,{approvedBy:'Manager'},db)
 const original=stop(db,1),other=stop(db,2),item=getCollectionScheduleManagement('B1',db)
 saveCollectionScheduleManagement('B1',{...item,frequency:'Once a week',weekdays:['Tuesday'],recurrenceType:undefined,routeNumber:1,reason:'Manager changed weekday',expectedUpdatedAt:item.updatedAt},db,{supervisorConfirmed:true})
 assert.equal(stop(db,1),undefined);assert.equal(stop(db,1,'2026-09-08').route_number,1);assert.deepEqual(stop(db,2),other);assert.ok(stillApproved(db))
 assert.equal(db.prepare('SELECT status FROM dispatch_stops WHERE id=?').get(original.id).status,'cancelled')
 assert.equal(db.prepare("SELECT COUNT(*) n FROM daily_route_approvals a JOIN dispatch_days d ON d.id=a.dispatch_day_id WHERE d.dispatch_date='2026-09-08'").get().n,0)
 assert.ok(!reconcileScheduleWindow({startDate:'2026-09-07',branchIds:[1]},db).some(r=>r.kind==='outdated'||r.kind==='missing'))
 }finally{db.close()}
})
test('saved schedule repairs untouched stops on a running day but preserves arrived records and unrelated stale approval',()=>{
 const db=fixture();try{
 ensureRollingWeek({startDate:'2026-09-07'},db);assignRouteVehicle('2026-09-07',1,{vehicleId:1},db);approveRoute('2026-09-07',1,{approvedBy:'Manager'},db)
 db.exec("UPDATE dispatch_days SET status='in_progress' WHERE dispatch_date='2026-09-07'")
 const arrived=stop(db,2);db.prepare("UPDATE dispatch_stops SET status='active',arrived_at='2026-09-07 09:00:00' WHERE id=?").run(arrived.id)
 const before=db.prepare('SELECT * FROM dispatch_stops WHERE id=?').get(arrived.id)
 save(db,'B1',{frequency:'Once a week',weekdays:['Tuesday'],routeNumber:1});save(db,'B2',{frequency:'Once a week',weekdays:['Tuesday'],routeNumber:1})
 db.prepare('UPDATE dispatch_stops SET route_stop_sequence=99 WHERE id=?').run(stop(db,1).id)
 syncSupervisorSavedSchedule({branchId:1,scheduleId:1,startDate:'2026-09-07',changedBy:'KC'},db)
 syncSupervisorSavedSchedule({branchId:2,scheduleId:2,startDate:'2026-09-07',changedBy:'KC'},db)
 assert.equal(stop(db,1),undefined);assert.deepEqual(db.prepare('SELECT * FROM dispatch_stops WHERE id=?').get(arrived.id),before);assert.equal(stillApproved(db),false)
 }finally{db.close()}
})
test('schedule sync failure rolls back stop changes and route approvals',()=>{
 const db=fixture();try{
 ensureRollingWeek({startDate:'2026-09-07'},db);assignRouteVehicle('2026-09-07',1,{vehicleId:1},db);approveRoute('2026-09-07',1,{approvedBy:'Manager'},db)
 save(db,'B1',{frequency:'Once a week',weekdays:['Tuesday'],routeNumber:1})
 const before=db.prepare('SELECT * FROM dispatch_stops').all(),approvals=db.prepare('SELECT * FROM daily_route_approvals').all()
 db.exec("CREATE TRIGGER reject_schedule_sync BEFORE INSERT ON audit_logs WHEN NEW.action='supervisor_schedule_synced' BEGIN SELECT RAISE(ABORT,'test rollback'); END")
 assert.throws(()=>syncSupervisorSavedSchedule({branchId:1,scheduleId:1,startDate:'2026-09-07',changedBy:'KC'},db),/test rollback/)
 assert.deepEqual(db.prepare('SELECT * FROM dispatch_stops').all(),before);assert.deepEqual(db.prepare('SELECT * FROM daily_route_approvals').all(),approvals)
 }finally{db.close()}
})

test('pending employee requests survive both supervisor sync and subsequent rolling reconciliation',()=>{
 const db=fixture();try{
 const source=stop(db,1)
 db.prepare("INSERT INTO driver_date_requests(dispatch_stop_id,employee_id,source_date,target_date,reason) VALUES(?,1,'2026-09-07','2026-09-08','Driver request')").run(source.id)
 save(db,'B1',{frequency:'Once a week',weekdays:['Tuesday'],routeNumber:1})
 syncSupervisorSavedSchedule({branchId:1,scheduleId:1,startDate:'2026-09-07',changedBy:'KC'},db)
 reconcileScheduleWindow({startDate:'2026-09-07'},db)
 assert.deepEqual(stop(db,1),source);assert.equal(db.prepare('SELECT status FROM driver_date_requests').get().status,'pending')
 }finally{db.close()}
})

import {changeBranchLifecycle} from '../server/branchLifecycleService.mjs'
import {syncInactiveBranchStops} from '../server/dispatchService.mjs'
for(const lifecycleStatus of ['TEMPORARILY_PAUSED','CLOSED'])test(`lifecycle ${lifecycleStatus} cancels generated work atomically and retains valid approval`,t=>{
 t.mock.timers.enable({apis:['Date'],now:new Date('2026-09-07T01:00:00Z')})
 const db=fixture();try{
 assignRouteVehicle('2026-09-07',1,{vehicleId:1},db);approveRoute('2026-09-07',1,{approvedBy:'Manager'},db)
 const source=stop(db,1),other=stop(db,2),schedule=db.prepare('SELECT * FROM branch_schedules WHERE id=1').get()
 const result=changeBranchLifecycle('B1',{lifecycleStatus,reason:'Supervisor confirmed'},{changedBy:'KC'},db)
 assert.equal(result.scheduleSync.cancelled.length,1);assert.equal(stop(db,1),undefined);assert.deepEqual(stop(db,2),other);assert.ok(stillApproved(db))
 assert.equal(db.prepare('SELECT completed_at FROM dispatch_stops WHERE id=?').get(source.id).completed_at,null)
 assert.deepEqual(db.prepare('SELECT * FROM branch_schedules WHERE id=1').get(),schedule)
 assert.equal(syncInactiveBranchStops({branchId:1,startDate:'2026-09-07'},db).cancelled.length,0)
 assert.ok(!reconcileScheduleWindow({startDate:'2026-09-07',branchIds:[1]},db).some(r=>r.kind==='outdated'))
 assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0)
 }finally{db.close()}
})
test('lifecycle sync preserves arrived and pending work, history and stale approvals',t=>{
 t.mock.timers.enable({apis:['Date'],now:new Date('2026-09-07T01:00:00Z')})
 const db=fixture();try{
 assignRouteVehicle('2026-09-07',1,{vehicleId:1},db);approveRoute('2026-09-07',1,{approvedBy:'Manager'},db)
 db.prepare('UPDATE dispatch_stops SET route_stop_sequence=99 WHERE id=?').run(stop(db,1).id)
 db.prepare("UPDATE dispatch_stops SET arrived_at='2026-09-07 08:30:00' WHERE id=?").run(stop(db,2).id)
 db.prepare("INSERT INTO driver_date_requests(dispatch_stop_id,employee_id,source_date,target_date,reason) VALUES(?,1,'2026-09-07','2026-09-08','Pending')").run(stop(db,3).id)
 const second=stop(db,2),third=stop(db,3)
 for(const id of ['B1','B2','B3'])changeBranchLifecycle(id,{lifecycleStatus:'CLOSED',reason:'Closed'},{changedBy:'KC'},db)
 assert.equal(stillApproved(db),false);assert.deepEqual(stop(db,2),second);assert.deepEqual(stop(db,3),third)
 }finally{db.close()}
})
test('lifecycle sync audit failure rolls back lifecycle, stops and approval signatures',t=>{
 t.mock.timers.enable({apis:['Date'],now:new Date('2026-09-07T01:00:00Z')})
 const db=fixture();try{
 assignRouteVehicle('2026-09-07',1,{vehicleId:1},db);approveRoute('2026-09-07',1,{approvedBy:'Manager'},db)
 const original=stop(db,1)
 db.exec("CREATE TRIGGER reject_lifecycle_sync BEFORE INSERT ON audit_logs WHEN NEW.action='branch_lifecycle_stops_synced' BEGIN SELECT RAISE(ABORT,'sync failed'); END")
 assert.throws(()=>changeBranchLifecycle('B1',{lifecycleStatus:'CLOSED',reason:'Closed'},{changedBy:'KC'},db),/sync failed/)
 assert.deepEqual(stop(db,1),original);assert.equal(db.prepare('SELECT lifecycle_status FROM branches WHERE id=1').get().lifecycle_status,'ACTIVE');assert.ok(stillApproved(db))
 }finally{db.close()}
})

for(const protection of [null,'arrived','pending'])test(`lifecycle supersedes approved date moves while preserving ${protection||'approval history'}`,t=>{
 t.mock.timers.enable({apis:['Date'],now:new Date('2026-09-07T01:00:00Z')})
 const db=fixture();try{
 assignRouteVehicle('2026-09-07',1,{vehicleId:1},db);approveRoute('2026-09-07',1,{approvedBy:'Manager'},db)
 const source=stop(db,1)
 db.prepare("INSERT INTO schedule_exceptions(branch_id,schedule_id,exception_type,original_date,target_date,reason,created_by) VALUES(1,1,'move_date','2026-08-31','2026-09-07','Approved move','Manager')").run()
 const requestId=db.prepare("INSERT INTO driver_date_requests(dispatch_stop_id,employee_id,source_date,target_date,reason,status,target_stop_id) VALUES(?,1,'2026-08-31','2026-09-07','Move','approved',?)").run(source.id,source.id).lastInsertRowid
 db.prepare("INSERT INTO driver_date_reviews(request_id,branch_id,approved_date,route_number,scope) VALUES(?,1,'2026-09-07',1,'once')").run(requestId)
 if(protection==='arrived')db.prepare("UPDATE dispatch_stops SET arrived_at='2026-09-07 08:00:00' WHERE id=?").run(source.id)
 if(protection==='pending')db.prepare("INSERT INTO driver_date_requests(dispatch_stop_id,employee_id,source_date,target_date,reason) VALUES(?,1,'2026-09-07','2026-09-08','New pending request')").run(source.id)
 const history=db.prepare('SELECT * FROM driver_date_reviews').all(),exceptions=db.prepare('SELECT * FROM schedule_exceptions').all(),before=db.prepare('SELECT * FROM dispatch_stops WHERE id=?').get(source.id)
 const result=changeBranchLifecycle('B1',{lifecycleStatus:'CLOSED',reason:'Business closed after date approval'},{changedBy:'KC'},db)
 assert.equal(result.scheduleSync.cancelled.length,protection?0:1)
 if(protection)assert.deepEqual(db.prepare('SELECT * FROM dispatch_stops WHERE id=?').get(source.id),before)
 else{
  assert.equal(db.prepare('SELECT status FROM dispatch_stops WHERE id=?').get(source.id).status,'cancelled')
  assert.ok(stillApproved(db));ensureRollingWeek({startDate:'2026-09-07'},db)
  assert.equal(stop(db,1),undefined)
  assert.ok(!reconcileScheduleWindow({startDate:'2026-09-07',branchIds:[1]},db).some(r=>r.kind==='outdated'))
 }
 assert.deepEqual(db.prepare('SELECT * FROM driver_date_reviews').all(),history);assert.deepEqual(db.prepare('SELECT * FROM schedule_exceptions').all(),exceptions)
 assert.ok(stillApproved(db));assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0)
 }finally{db.close()}
})
