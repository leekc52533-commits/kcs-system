import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {schemaSql} from '../server/schema.mjs'
import {ensureV28Schema} from '../server/migrationV28.mjs'
import {applyV55Migration} from '../server/migrationV55.mjs'
import {generateWeek,saveDraftAdjustments,approveDay,driverToday} from '../server/dispatchService.mjs'
import {startDriverTrip} from '../server/driverExecutionService.mjs'
import {reorderDriverStop,requestDriverDate,decideDriverDate,listDriverDateRequests} from '../server/driverRouteAdjustmentService.mjs'
import {isRouteTrialDate} from '../shared/routeTrial.js'
const today='2026-09-10',context={employeeId:1,role:'driver',today},supervisor={employeeId:3,role:'supervisor',employeeName:'Supervisor',today}
function fixture(){
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON;'+schemaSql);ensureV28Schema(db)
 db.exec("INSERT INTO schema_meta(version) VALUES(55);INSERT INTO areas(jodoo_area_id,name) VALUES('A1','North');INSERT INTO customers(jodoo_customer_id,name) VALUES('C1','Alpha');INSERT INTO vehicles(vehicle_code,status,operational_status) VALUES('V1','available','active'),('V2','available','active');INSERT INTO employees(employee_code,name,job_role,employment_status,is_active) VALUES('D1','Driver One','Driver','active',1),('D2','Driver Two','Driver','active',1),('S1','Supervisor','Supervisor','active',1),('C1','Crew One','Crew','active',1)")
 for(let i=1;i<=3;i++){db.prepare("INSERT INTO branches(jodoo_branch_id,customer_id,area_id,branch_name,address,latitude,longitude) VALUES(?,1,1,?,'Address',3.1,101.6)").run('B'+i,'Branch '+i);db.prepare("INSERT INTO branch_schedules(jodoo_schedule_id,branch_id,source_branch_id,frequency,days_of_week) VALUES(?,?,?,'Weekly','Thursday')").run('S'+i,i,'B'+i)}
 generateWeek({startDate:today},db)
 const stops=db.prepare('SELECT id FROM dispatch_stops WHERE service_date=? ORDER BY id').all(today)
 saveDraftAdjustments({adjustments:stops.map(s=>({stopId:s.id,vehicleId:1,tripNumber:1})),reason:'Assign'},db)
 db.exec('UPDATE dispatches SET driver_id=1 WHERE vehicle_id=1')
 approveDay(today,{approvedBy:'Supervisor',reason:'Ready'},db)
 const trip=db.prepare('SELECT dispatch_trip_id id FROM dispatch_stops WHERE id=?').get(stops[0].id).id
 startDriverTrip(trip,context,db)
 db.exec("INSERT INTO weekly_route_plans(name,source_name,created_by) VALUES('Current','Test','Supervisor');INSERT INTO weekly_route_definitions(plan_id,route_number,display_name) VALUES(1,1,'Current route');INSERT INTO daily_route_assignments(dispatch_day_id,route_number,vehicle_id,assigned_by) SELECT id,1,1,'Supervisor' FROM dispatch_days WHERE dispatch_date='2026-09-11'")
 return{db,ids:stops.map(s=>s.id),trip}
}
const order=(db,trip)=>db.prepare("SELECT id FROM dispatch_stops WHERE dispatch_trip_id=? AND status<>'cancelled' ORDER BY stop_sequence,id").all(trip).map(s=>s.id)
const request=(db,id)=>requestDriverDate(id,{targetDate:'2026-09-11',reason:'Customer requests Friday'},context,db)
const approve=(db,id)=>decideDriverDate(id,'approved',{routeNumber:1,reason:'Confirmed with customer'},supervisor,db)
test('trial boundaries include 10 and 23 September, exclude 9 and 24',()=>{assert.equal(isRouteTrialDate('2026-09-09'),false);assert.equal(isRouteTrialDate(today),true);assert.equal(isRouteTrialDate('2026-09-23'),true);assert.equal(isRouteTrialDate('2026-09-24'),false)})
test('own order swaps, current customer follows, fixed schedules unchanged and adjustment audited',()=>{const{db,ids,trip}=fixture(),before=db.prepare('SELECT * FROM branch_schedules').all();reorderDriverStop(ids[1],{direction:'up',expectedOrder:ids},context,db);assert.deepEqual(order(db,trip),[ids[1],ids[0],ids[2]]);assert.equal(driverToday(context,db).trips[0].currentStopId,ids[1]);assert.deepEqual(db.prepare('SELECT * FROM branch_schedules').all(),before);assert.equal(db.prepare("SELECT COUNT(*) n FROM dispatch_change_logs WHERE change_type='driver_trial_order_changed'").get().n,1);db.close()})
test('another driver, stale order and expired trial cannot reorder',()=>{const{db,ids,trip}=fixture();assert.throws(()=>reorderDriverStop(ids[1],{direction:'up',expectedOrder:ids},{...context,employeeId:2},db));assert.throws(()=>reorderDriverStop(ids[1],{direction:'up',expectedOrder:ids.slice(1)},context,db),/stale/);db.exec("UPDATE dispatch_days SET dispatch_date='2026-09-24' WHERE dispatch_date='2026-09-10'");assert.throws(()=>reorderDriverStop(ids[1],{direction:'up',expectedOrder:ids},{...context,today:'2026-09-24'},db),/expired/);assert.deepEqual(order(db,trip),ids);db.close()})
test('assigned crew can reorder, unassigned crew cannot',()=>{const{db,ids}=fixture(),crew={...context,employeeId:4,role:'crew'};assert.throws(()=>reorderDriverStop(ids[1],{direction:'up',expectedOrder:ids},crew,db));db.exec('UPDATE dispatches SET assistant_id=4 WHERE vehicle_id=1');reorderDriverStop(ids[1],{direction:'up',expectedOrder:ids},crew,db);db.close()})
test('arrived customer cannot be skipped and completed history cannot be moved',()=>{const{db,ids}=fixture();db.prepare("UPDATE dispatch_stops SET status='active',arrived_at='now' WHERE id=?").run(ids[0]);assert.throws(()=>reorderDriverStop(ids[2],{direction:'up',expectedOrder:ids},context,db),/finishCurrent/);db.prepare("UPDATE dispatch_stops SET status='completed' WHERE id=?").run(ids[0]);assert.throws(()=>reorderDriverStop(ids[1],{direction:'up',expectedOrder:ids},context,db),/protected/);db.close()})
test('pending request does not change route and duplicate retries are idempotent',()=>{const{db,ids}=fixture(),before=db.prepare('SELECT * FROM dispatch_stops').all(),r=request(db,ids[0]);assert.equal(request(db,ids[0]).id,r.id);assert.deepEqual(db.prepare('SELECT * FROM dispatch_stops').all(),before);assert.equal(driverToday(context,db).trips[0].stops[0].dateRequest.status,'pending');assert.equal(listDriverDateRequests(db)[0].routes[0].name,'Current route');db.close()})
test('approval preserves original record as cancelled and creates a single assigned future stop',()=>{const{db,ids}=fixture(),r=request(db,ids[0]),before=db.prepare('SELECT * FROM branch_schedules').all(),result=approve(db,r.id);assert.equal(db.prepare('SELECT status FROM dispatch_stops WHERE id=?').get(ids[0]).status,'cancelled');const target=db.prepare('SELECT * FROM dispatch_stops WHERE id=?').get(result.targetStopId);assert.equal(target.service_date,'2026-09-11');assert.equal(target.route_number,1);assert.equal(target.source_schedule_id,1);assert.equal(db.prepare('SELECT vehicle_id FROM dispatches WHERE id=?').get(target.dispatch_id).vehicle_id,1);assert.equal(db.prepare('SELECT COUNT(*) n FROM schedule_exceptions').get().n,1);assert.deepEqual(db.prepare('SELECT * FROM branch_schedules').all(),before);assert.equal(approve(db,r.id).idempotent,true);assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);db.close()})
test('non-supervisor approval is rejected and rejected request retains original stop',()=>{const{db,ids}=fixture(),r=request(db,ids[0]);assert.throws(()=>decideDriverDate(r.id,'approved',{routeNumber:1,reason:'Forged'},context,db),/supervisorOnly/);decideDriverDate(r.id,'rejected',{reason:'Keep today'},supervisor,db);assert.notEqual(db.prepare('SELECT status FROM dispatch_stops WHERE id=?').get(ids[0]).status,'cancelled');db.close()})
test('execution after request prevents approval',()=>{const{db,ids}=fixture(),r=request(db,ids[0]);db.prepare("UPDATE dispatch_stops SET arrived_at='now',status='active' WHERE id=?").run(ids[0]);assert.throws(()=>approve(db,r.id),/protected/);assert.equal(db.prepare('SELECT status FROM driver_date_requests').get().status,'pending');db.close()})
test('invalid dates and missing target vehicle cannot remove original stop',()=>{const{db,ids}=fixture();assert.throws(()=>requestDriverDate(ids[0],{targetDate:'2026-02-30',reason:'x'},context,db),/dateReason/);const r=request(db,ids[0]);db.exec('DELETE FROM daily_route_assignments');assert.throws(()=>approve(db,r.id),/chooseRoute/);assert.notEqual(db.prepare('SELECT status FROM dispatch_stops WHERE id=?').get(ids[0]).status,'cancelled');db.close()})
test('audit failure rolls back order and all date approval writes',()=>{const{db,ids,trip}=fixture();db.exec("CREATE TRIGGER audit_fail BEFORE INSERT ON dispatch_change_logs WHEN NEW.change_type='driver_trial_order_changed' BEGIN SELECT RAISE(ABORT,'audit failure'); END");assert.throws(()=>reorderDriverStop(ids[1],{direction:'up',expectedOrder:ids},context,db),/audit failure/);assert.deepEqual(order(db,trip),ids);const r=request(db,ids[0]);db.exec("CREATE TRIGGER approve_fail BEFORE INSERT ON dispatch_change_logs WHEN NEW.change_type='driver_date_request_approved' BEGIN SELECT RAISE(ABORT,'audit failure'); END");assert.throws(()=>approve(db,r.id),/audit failure/);assert.notEqual(db.prepare('SELECT status FROM dispatch_stops WHERE id=?').get(ids[0]).status,'cancelled');assert.equal(db.prepare("SELECT COUNT(*) n FROM dispatch_stops WHERE service_date='2026-09-11'").get().n,0);db.close()})
test('migration is additive and idempotent',()=>{const db=new DatabaseSync(':memory:');db.exec(schemaSql);db.exec('DROP TABLE driver_date_requests;INSERT INTO schema_meta(version) VALUES(54)');assert.equal(applyV55Migration(db).schemaVersion,55);assert.equal(applyV55Migration(db).noOp,true);db.close()})
test('an existing target customer blocks approval without cancelling the source',()=>{const{db,ids}=fixture(),r=request(db,ids[0]),targetDay=db.prepare("SELECT id FROM dispatch_days WHERE dispatch_date='2026-09-11'").get();db.exec("INSERT INTO dispatches(dispatch_date,vehicle_id,status) VALUES('2026-09-11',1,'draft')");const dispatchId=db.prepare('SELECT MAX(id) id FROM dispatches').get().id;db.prepare('INSERT INTO dispatch_trips(dispatch_day_id,dispatch_id,trip_number) VALUES(?,?,1)').run(targetDay.id,dispatchId);const tripId=db.prepare('SELECT MAX(id) id FROM dispatch_trips').get().id;db.prepare("INSERT INTO dispatch_stops(dispatch_id,dispatch_trip_id,branch_id,stop_sequence,service_date,status) VALUES(?,?,1,1,'2026-09-11','locked')").run(dispatchId,tripId);assert.throws(()=>approve(db,r.id),/Duplicate Branch Service Date/);assert.notEqual(db.prepare('SELECT status FROM dispatch_stops WHERE id=?').get(ids[0]).status,'cancelled');db.close()})
test('approving the last stop out closes an otherwise empty running trip',()=>{const{db,ids,trip}=fixture();db.prepare("UPDATE dispatch_stops SET status='cancelled' WHERE id IN (?,?)").run(ids[1],ids[2]);const r=request(db,ids[0]);approve(db,r.id);assert.equal(db.prepare('SELECT execution_status status FROM dispatch_trips WHERE id=?').get(trip).status,'completed');db.close()})

test('review allows active vehicles, a supervisor-selected date, and a same-day route transfer',()=>{
 const{db,ids}=fixture(),r=request(db,ids[0])
 db.exec("UPDATE vehicles SET operational_status='active' WHERE id=2;INSERT INTO weekly_route_definitions(plan_id,route_number,display_name) VALUES(1,2,'Other route');INSERT INTO daily_route_assignments(dispatch_day_id,route_number,vehicle_id,assigned_by) SELECT id,2,2,'Supervisor' FROM dispatch_days WHERE dispatch_date='2026-09-10'")
 const result=decideDriverDate(r.id,'approved',{targetDate:today,routeNumber:2,scope:'once',reason:'Other vehicle today'},supervisor,db)
 const target=db.prepare('SELECT * FROM dispatch_stops WHERE id=?').get(result.targetStopId)
 assert.equal(target.service_date,today);assert.equal(target.route_number,2)
 assert.equal(db.prepare('SELECT target_date FROM driver_date_requests WHERE id=?').get(r.id).target_date,'2026-09-11')
 assert.equal(db.prepare('SELECT scope FROM driver_date_reviews').get().scope,'once')
 assert.equal(db.prepare("SELECT COUNT(*) n FROM dispatch_stops WHERE branch_id=1 AND service_date=? AND status<>'cancelled'").get(today).n,1)
 assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);db.close()
})

test('permanent approval synchronizes Customer Schedule and generated future occurrences; regeneration retains the approved route',async()=>{
 const{getCollectionScheduleManagement}=await import('../server/collectionScheduleManagementService.mjs')
 const{db,ids}=fixture()
 db.exec("INSERT INTO weekly_route_plan_stops(plan_id,weekday,branch_id,vehicle_registration_number,trip_number,stop_sequence,route_number) VALUES(1,4,1,'V1',1,1,1)")
 generateWeek({startDate:'2026-09-17'},db)
 db.exec("UPDATE dispatch_days SET status='approved' WHERE dispatch_date='2026-09-17'")
 const originalFuture=db.prepare("SELECT id FROM dispatch_stops WHERE branch_id=1 AND service_date='2026-09-17' AND status<>'cancelled'").get().id
 const before=getCollectionScheduleManagement(1,db),r=request(db,ids[0])
 const result=decideDriverDate(r.id,'approved',{targetDate:'2026-09-11',routeNumber:1,scope:'permanent',reason:'Every Friday',expectedScheduleUpdatedAt:before.updatedAt},supervisor,db)
 const after=getCollectionScheduleManagement(1,db)
 assert.deepEqual(after.weekdays,['Friday']);assert.equal(after.homeRouteNumber,1);assert.equal(after.nextCollectionDate,'2026-09-11')
 assert.equal(after.adjustments[0].scope,'permanent');assert.equal(after.adjustments[0].date,'2026-09-11')
 assert.equal(db.prepare('SELECT status FROM dispatch_stops WHERE id=?').get(originalFuture).status,'cancelled')
 assert.equal(db.prepare("SELECT status FROM dispatch_days WHERE dispatch_date='2026-09-17'").get().status,'reapproval_required')
 assert.equal(db.prepare("SELECT COUNT(*) n FROM dispatch_stops WHERE branch_id=1 AND service_date='2026-09-18' AND status<>'cancelled'").get().n,1)
 assert.equal(db.prepare("SELECT route_number FROM dispatch_stops WHERE branch_id=1 AND service_date='2026-09-18' AND status<>'cancelled'").get().route_number,1)
 generateWeek({startDate:'2026-09-11'},db)
 assert.equal(db.prepare('SELECT route_number FROM dispatch_stops WHERE id=?').get(result.targetStopId).route_number,1)
 assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);db.close()
})

test('permanent approval preserves executed future history and rolls back entirely on audit failure',async()=>{
 const{getCollectionScheduleManagement}=await import('../server/collectionScheduleManagementService.mjs')
 const{db,ids}=fixture()
 db.exec("INSERT INTO weekly_route_plan_stops(plan_id,weekday,branch_id,vehicle_registration_number,trip_number,stop_sequence,route_number) VALUES(1,4,1,'V1',1,1,1)")
 generateWeek({startDate:'2026-09-17'},db)
 db.exec("UPDATE dispatch_stops SET status='completed',arrived_at='now',completed_at='now' WHERE branch_id=1 AND service_date='2026-09-17'")
 const old=db.prepare("SELECT * FROM dispatch_stops WHERE branch_id=1 AND service_date='2026-09-17'").get(),before=getCollectionScheduleManagement(1,db),r=request(db,ids[0]),body={routeNumber:1,scope:'permanent',reason:'Every Friday',expectedScheduleUpdatedAt:before.updatedAt}
 db.exec("CREATE TRIGGER review_fail BEFORE INSERT ON driver_date_reviews BEGIN SELECT RAISE(ABORT,'review audit failure'); END")
 assert.throws(()=>decideDriverDate(r.id,'approved',body,supervisor,db),/review audit failure/)
 assert.deepEqual(getCollectionScheduleManagement(1,db),before)
 assert.notEqual(db.prepare('SELECT status FROM dispatch_stops WHERE id=?').get(ids[0]).status,'cancelled')
 db.exec('DROP TRIGGER review_fail')
 const result=decideDriverDate(r.id,'approved',body,supervisor,db)
 assert.ok(result.preservedDates.includes('2026-09-17'))
 assert.deepEqual(db.prepare('SELECT * FROM dispatch_stops WHERE id=?').get(old.id),old);db.close()
})

test('once-only date and route survive regeneration even without membership on the target weekday',()=>{
 const{db,ids}=fixture(),r=request(db,ids[0]);approve(db,r.id)
 generateWeek({startDate:'2026-09-11'},db)
 const rows=db.prepare("SELECT * FROM dispatch_stops WHERE branch_id=1 AND service_date='2026-09-11' AND status<>'cancelled'").all()
 assert.equal(rows.length,1);assert.equal(rows[0].route_number,1);db.close()
})

test('permanent changes reject stale schedules and duplicate weekdays without changing original records',async()=>{
 const{getCollectionScheduleManagement}=await import('../server/collectionScheduleManagementService.mjs')
 const{db,ids}=fixture(),r=request(db,ids[0]),before=getCollectionScheduleManagement(1,db)
 assert.throws(()=>decideDriverDate(r.id,'approved',{routeNumber:1,scope:'permanent',reason:'x',expectedScheduleUpdatedAt:'old'},supervisor,db),/stale/)
 db.exec("UPDATE branch_schedules SET days_of_week='Thursday,Friday',frequency='Twice a week' WHERE id=1")
 assert.throws(()=>decideDriverDate(r.id,'approved',{routeNumber:1,scope:'permanent',reason:'x',expectedScheduleUpdatedAt:getCollectionScheduleManagement(1,db).updatedAt},supervisor,db),/weekdayConflict/)
 assert.equal(db.prepare('SELECT COUNT(*) n FROM driver_date_reviews').get().n,0);db.close()
})

test('schema 58 adds review history without changing existing requests and is idempotent',async()=>{
 const{applyV58Migration}=await import('../server/migrationV58.mjs')
 const{db,ids}=fixture(),r=request(db,ids[0]),before=db.prepare('SELECT * FROM driver_date_requests').all()
 db.exec('DROP TABLE driver_date_reviews;DELETE FROM schema_meta;INSERT INTO schema_meta(version) VALUES(57)')
 assert.equal(applyV58Migration(db).schemaVersion,58);assert.equal(applyV58Migration(db).noOp,true)
 assert.deepEqual(db.prepare('SELECT * FROM driver_date_requests').all(),before)
 assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);db.close()
})
