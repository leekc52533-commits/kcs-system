import {driverArrangementSchemaSql} from '../server/migrationV64.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {schemaSql} from '../server/schema.mjs'
import {ensureV28Schema} from '../server/migrationV28.mjs'
import {ensureDriverPlanSchema} from '../server/driverPlanSchema.mjs'
import {generateWeek,saveDraftAdjustments,approveDay,driverTomorrow,getDispatchDay} from '../server/dispatchService.mjs'
import {driverPlanSummary} from '../server/driverPlanState.mjs'
import {changeTomorrowPlan} from '../server/driverPlanService.mjs'
import {routeSignature} from '../server/routeApprovalState.mjs'
const date='2026-10-08',context={employeeId:1,role:'driver',now:new Date('2026-10-07T02:00:00Z')}
function fixture(){
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON;'+schemaSql);ensureV28Schema(db);db.exec(driverArrangementSchemaSql);ensureDriverPlanSchema(db)
 db.exec("INSERT INTO areas(jodoo_area_id,name) VALUES('A1','North');INSERT INTO customers(jodoo_customer_id,name) VALUES('C1','Alpha');INSERT INTO vehicles(vehicle_code,status,operational_status) VALUES('V1','available','active');INSERT INTO employees(employee_code,name,job_role,employment_status,is_active) VALUES('D1','Driver One','Driver','active',1),('D2','Driver Two','Driver','active',1),('C1','Crew One','Crew','active',1)")
 for(let i=1;i<=3;i++){db.prepare("INSERT INTO branches(jodoo_branch_id,customer_id,area_id,branch_name,address,latitude,longitude) VALUES(?,1,1,?,'Address',3.1,101.6)").run('B'+i,'Branch '+i);db.prepare("INSERT INTO branch_schedules(jodoo_schedule_id,branch_id,source_branch_id,frequency,days_of_week) VALUES(?,?,?,'Weekly','Thursday')").run('S'+i,i,'B'+i)}
 generateWeek({startDate:date},db)
 const stops=db.prepare('SELECT id FROM dispatch_stops WHERE service_date=? ORDER BY id').all(date)
 saveDraftAdjustments({adjustments:stops.map(s=>({stopId:s.id,vehicleId:1,tripNumber:1})),reason:'Assign'},db)
 db.exec('UPDATE dispatches SET driver_id=1,assistant_id=3 WHERE vehicle_id=1;UPDATE dispatch_stops SET route_number=1,route_stop_sequence=stop_sequence')
 const trip=db.prepare('SELECT dispatch_trip_id id FROM dispatch_stops WHERE id=?').get(stops[0].id).id
 const state=()=>driverPlanSummary(db,trip)
 const change=(action,payload={},ctx=context)=>changeTomorrowPlan(trip,action,{expectedSignature:state().signature,...payload},ctx,db)
 return {db,trip,ids:stops.map(s=>s.id),state,change}
}
test('driver checks unchanged order once; supervisor sees name/time and mobile remains non-executable',()=>{
 const{db,trip,state,change}=fixture();assert.equal(state().checked,false)
 const first=change('check');assert.equal(first.checked,true);assert.equal(first.checkedBy,'Driver One');assert.ok(first.checkedAt);assert.deepEqual(change('check'),first)
 assert.equal(db.prepare("SELECT count(*) n FROM dispatch_change_logs WHERE change_type='driver_plan_checked'").get().n,1)
 const mobile=driverTomorrow(context,db).trips.find(t=>t.id===trip);assert.equal(mobile.canPlan,true);assert.equal(mobile.canStart,false);assert.equal(mobile.stops[0].canArrive,false)
 assert.equal(getDispatchDay(date,db).routeBoards[0].driverChecks[0].checked,true);db.close()
})
test('order changes clear check and preserve schedule, GPS, dates and both sequence views',()=>{
 const{db,ids,state,change}=fixture(),schedules=db.prepare('SELECT * FROM branch_schedules').all(),branches=db.prepare('SELECT * FROM branches').all()
 change('check');const old=state().signature;change('order',{stopId:ids[1],direction:'up'})
 assert.equal(state().checked,false);assert.notEqual(state().signature,old)
 assert.deepEqual(db.prepare('SELECT id FROM dispatch_stops ORDER BY stop_sequence').all().map(s=>s.id),[ids[1],ids[0],ids[2]])
 assert.deepEqual(db.prepare('SELECT id FROM dispatch_stops ORDER BY route_stop_sequence').all().map(s=>s.id),[ids[1],ids[0],ids[2]])
 assert.deepEqual(db.prepare('SELECT * FROM branch_schedules').all(),schedules);assert.deepEqual(db.prepare('SELECT * FROM branches').all(),branches)
 assert.throws(()=>change('check',{expectedSignature:old}),/STALE/);assert.equal(change('check').checked,true)
 assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);db.close()
})
test('only assigned active driver on server-derived tomorrow can submit or reorder',()=>{
 const{db,ids,change}=fixture()
 for(const ctx of [{...context,employeeId:2},{...context,employeeId:3,role:'crew'},{...context,preview:true}])for(const action of ['check','order'])assert.throws(()=>change(action,{stopId:ids[1],direction:'up'},ctx),/FORBIDDEN/)
 assert.throws(()=>change('check',{}, {...context,now:new Date('2026-10-08T02:00:00Z')}),/DATE/)
 db.exec('UPDATE employees SET is_active=0 WHERE id=1');assert.throws(()=>change('check'),/FORBIDDEN/);db.close()
})
test('approval of any included route blocks direct edits even while day remains draft',()=>{
 const{db,trip,ids,state,change}=fixture(),day=db.prepare('SELECT dispatch_day_id id FROM dispatch_trips WHERE id=?').get(trip).id
 db.prepare('INSERT INTO daily_route_approvals(dispatch_day_id,route_number,route_signature,actor,reason) VALUES(?,1,?,\'Supervisor\',\'Ready\')').run(day,routeSignature(db,day,1))
 assert.equal(state().editable,false);assert.throws(()=>change('order',{stopId:ids[1],direction:'up'}),/LOCKED/);assert.throws(()=>change('check'),/LOCKED/);db.close()
})
test('reassignment, supervisor reorder and membership changes invalidate checks, including change then revert',()=>{
 const{db,ids,state,change}=fixture();change('check');db.exec('UPDATE dispatches SET driver_id=2 WHERE vehicle_id=1;UPDATE dispatches SET driver_id=1 WHERE vehicle_id=1');assert.equal(state().checked,false)
 change('check');db.prepare('UPDATE dispatch_stops SET route_stop_sequence=9 WHERE id=?').run(ids[0]);assert.equal(state().checked,false)
 change('check');db.prepare("UPDATE dispatch_stops SET status='cancelled' WHERE id=?").run(ids[2]);assert.equal(state().checked,false);db.close()
})
test('execution, documented stops and stale writes are protected; audit failures roll back',()=>{
 const{db,trip,ids,state,change}=fixture();change('check')
 db.exec("CREATE TRIGGER plan_audit_fail BEFORE INSERT ON dispatch_change_logs WHEN NEW.change_type='driver_tomorrow_order_changed' BEGIN SELECT RAISE(ABORT,'audit failure'); END")
 const before=state();assert.throws(()=>change('order',{stopId:ids[1],direction:'up'}),/audit failure/);assert.deepEqual(state(),before)
 db.exec('DROP TRIGGER plan_audit_fail');db.prepare("UPDATE dispatch_trips SET execution_status='in_progress' WHERE id=?").run(trip);assert.throws(()=>change('check'),/LOCKED/)
 db.prepare("UPDATE dispatch_trips SET execution_status='not_started' WHERE id=?").run(trip);db.prepare("UPDATE dispatch_stops SET arrived_at='now' WHERE id=?").run(ids[0]);assert.throws(()=>change('check'),/LOCKED/);db.close()
})

test('approval preserves checked evidence and crew changes require another check',()=>{
 const{db,trip,state,change}=fixture();change('check')
 const day=db.prepare('SELECT dispatch_day_id id FROM dispatch_trips WHERE id=?').get(trip).id
 db.prepare('INSERT INTO dispatch_vehicle_assistants(dispatch_day_id,vehicle_id,employee_id) VALUES(?,1,3)').run(day)
 assert.equal(state().checked,false);change('check')
 db.prepare('DELETE FROM dispatch_vehicle_assistants WHERE dispatch_day_id=?').run(day)
 assert.equal(state().checked,false);change('check');approveDay(date,{approvedBy:'Supervisor',reason:'Ready'},db)
 assert.equal(state().checked,true);assert.equal(state().editable,false);db.close()
})
test('repeated order edits survive regeneration; locked positions cannot move',()=>{
 const{db,trip,ids,change}=fixture();change('order',{stopId:ids[1],direction:'up'});change('order',{stopId:ids[2],direction:'up'})
 const before=db.prepare('SELECT id FROM dispatch_stops WHERE dispatch_trip_id=? ORDER BY stop_sequence').all(trip)
 generateWeek({startDate:date},db)
 assert.deepEqual(db.prepare('SELECT id FROM dispatch_stops WHERE dispatch_trip_id=? ORDER BY stop_sequence').all(trip),before)
 db.prepare('UPDATE dispatch_stops SET sequence_locked=1 WHERE id=?').run(ids[2]);assert.throws(()=>change('order',{stopId:ids[2],direction:'up'}),/LOCKED/);db.close()
})
