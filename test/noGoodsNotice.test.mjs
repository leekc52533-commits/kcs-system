import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {schemaSql} from '../server/schema.mjs'
import {ensureV28Schema} from '../server/migrationV28.mjs'
import {generateWeek,saveDraftAdjustments,approveDay,driverToday,routeSignature} from '../server/dispatchService.mjs'
import {startDriverTrip,arriveAtStop,completeDriverTrip} from '../server/driverExecutionService.mjs'
import {submitNoGoodsNotice,restoreNoGoodsNotice,noGoodsNoticePhoto} from '../server/noGoodsNoticeService.mjs'
const today='2026-09-10',context={employeeId:1,role:'driver',today},office={employeeId:3,role:'office',employeeName:'Office',today}
const payload={reason:'Customer called: no cartons',contactMethod:'phone',photo:{name:'call.png',dataUrl:'data:image/png;base64,iVBORw0KGgo='}}
function setup(t){const x=fixture(),uploadsRoot=fs.mkdtempSync(path.join(os.tmpdir(),'kcs-no-goods-'));t.after(()=>{x.db.close();fs.rmSync(uploadsRoot,{recursive:true,force:true})});return{...x,uploadsRoot}}
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

test('future stop can be skipped before arrival; current stop advances; no collected/arrival count and recurrence preserved',t=>{
 const{db,ids,uploadsRoot}=setup(t),before=db.prepare('SELECT * FROM branch_schedules').all()
 submitNoGoodsNotice(ids[1],payload,context,db,{uploadsRoot})
 assert.equal(driverToday(context,db).trips[0].currentStopId,ids[0])
 submitNoGoodsNotice(ids[0],payload,context,db,{uploadsRoot})
 const route=driverToday(context,db)
 assert.equal(route.trips[0].currentStopId,ids[2]);assert.equal(route.completedStops,0);assert.equal(route.noGoodsCount,2);assert.equal(route.pendingStops,1)
 assert.equal(route.trips[0].stops[0].arrivedAt,null);assert.equal(route.trips[0].stops[0].canArrive,false)
 assert.deepEqual(db.prepare('SELECT * FROM branch_schedules').all(),before)
 assert.throws(()=>arriveAtStop(ids[0],{latitude:3.1,longitude:101.6,accuracy:10,captured_at:new Date().toISOString()},{...context,remoteArrivalTestMode:true},db),/already ended/)
})
test('before departure works without invalidating an approved route; assigned crew can report, other driver cannot read or write',t=>{
 const{db,ids,trip,uploadsRoot}=setup(t)
 db.exec("UPDATE dispatch_days SET status='approved';UPDATE dispatch_trips SET execution_status='not_started',started_at=NULL;UPDATE dispatches SET assistant_id=4")
 const day=db.prepare('SELECT dispatch_day_id id FROM dispatch_trips WHERE id=?').get(trip).id
 const before=routeSignature(db,day,1)
 const n=submitNoGoodsNotice(ids[1],payload,{...context,employeeId:4,role:'crew'},db,{uploadsRoot})
 assert.equal(routeSignature(db,day,1),before)
 assert.equal(driverToday(context,db).trips[0].canStart,true)
 assert.equal(noGoodsNoticePhoto(n.id,{...context,employeeId:4,role:'crew'},db).employee_id,4)
 assert.throws(()=>submitNoGoodsNotice(ids[2],payload,{...context,employeeId:2},db,{uploadsRoot}),/NG_ACCESS/)
 assert.throws(()=>noGoodsNoticePhoto(n.id,{...context,employeeId:2},db),/NG_ACCESS/)
})
test('retry is idempotent; office restores, resubmission retains original proof history',t=>{
 const{db,ids,uploadsRoot}=setup(t),n=submitNoGoodsNotice(ids[0],payload,context,db,{uploadsRoot})
 assert.equal(submitNoGoodsNotice(ids[0],payload,context,db,{uploadsRoot}).id,n.id)
 assert.throws(()=>restoreNoGoodsNotice(n.id,{reason:'Mistake'},context,db),/NG_ACCESS/)
 restoreNoGoodsNotice(n.id,{reason:'Customer has cartons'},office,db)
 assert.equal(driverToday(context,db).trips[0].currentStopId,ids[0]);assert.equal(driverToday(context,db).noGoodsCount,0)
 const n2=submitNoGoodsNotice(ids[0],payload,context,db,{uploadsRoot});assert.notEqual(n.id,n2.id)
 assert.equal(db.prepare('SELECT COUNT(*) n FROM no_goods_notices').get().n,2)
 assert.equal(fs.readdirSync(path.join(uploadsRoot,'no-goods-notices')).length,2)
 assert.equal(noGoodsNoticePhoto(n.id,office,db).restore_reason,'Customer has cartons')
})
test('required evidence, wrong date, inactive staff and protected stops reject without changes',t=>{
 const{db,ids,uploadsRoot}=setup(t)
 assert.throws(()=>submitNoGoodsNotice(ids[0],{...payload,photo:null},context,db,{uploadsRoot}))
 assert.throws(()=>submitNoGoodsNotice(ids[0],{...payload,reason:''},context,db,{uploadsRoot}),/NG_DETAILS/)
 assert.throws(()=>submitNoGoodsNotice(ids[0],payload,{...context,today:'2026-09-11'},db,{uploadsRoot}),/NG_TODAY/)
 db.exec('UPDATE employees SET is_active=0 WHERE id=1');assert.throws(()=>submitNoGoodsNotice(ids[0],payload,context,db,{uploadsRoot}),/NG_ACCESS/)
 db.exec("UPDATE employees SET is_active=1 WHERE id=1;UPDATE dispatch_stops SET status='completed' WHERE id="+ids[0])
 assert.throws(()=>submitNoGoodsNotice(ids[0],payload,context,db,{uploadsRoot}),/NG_PROTECTED/)
 assert.equal(db.prepare('SELECT COUNT(*) n FROM no_goods_notices').get().n,0)
 assert.equal(fs.readdirSync(uploadsRoot).length,0)
})
test('database failure cleans uploaded file and leaves stop untouched',t=>{
 const{db,ids,uploadsRoot}=setup(t)
 db.exec("CREATE TRIGGER reject_notice BEFORE INSERT ON no_goods_notices BEGIN SELECT RAISE(ABORT,'injected failure'); END")
 assert.throws(()=>submitNoGoodsNotice(ids[0],payload,context,db,{uploadsRoot}),/injected failure/)
 assert.equal(db.prepare('SELECT completion_outcome FROM dispatch_stops WHERE id=?').get(ids[0]).completion_outcome,null)
 assert.equal(fs.readdirSync(path.join(uploadsRoot,'no-goods-notices')).length,0)
})
test('all skipped stops allow trip completion and office restoration reopens it',t=>{
 const{db,ids,trip,uploadsRoot}=setup(t)
 const notices=ids.map(id=>submitNoGoodsNotice(id,payload,context,db,{uploadsRoot}))
 assert.equal(driverToday(context,db).trips[0].canComplete,true)
 completeDriverTrip(trip,context,db)
 restoreNoGoodsNotice(notices[0].id,{reason:'Customer called back'},office,db)
 assert.equal(db.prepare('SELECT execution_status s FROM dispatch_trips WHERE id=?').get(trip).s,'in_progress')
 assert.equal(driverToday(context,db).pendingStops,1)
 assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[])
})

test('migration from 58 is idempotent and retains operational records',async t=>{
 const{db,ids}=setup(t),{applyV59Migration}=await import('../server/migrationV59.mjs')
 db.exec('INSERT INTO schema_meta(version) VALUES(58)')
 const before=db.prepare('SELECT * FROM dispatch_stops').all()
 assert.equal(applyV59Migration(db).schemaVersion,59)
 assert.equal(applyV59Migration(db).noOp,true)
 assert.deepEqual(db.prepare('SELECT * FROM dispatch_stops').all(),before)
 assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok')
})
test('pending date request is superseded and an already-arrived stop retains arrival evidence',t=>{
 const{db,ids,uploadsRoot}=setup(t)
 db.prepare("UPDATE dispatch_stops SET status='active',arrived_at='2026-09-10T10:00:00+08:00' WHERE id=?").run(ids[0])
 db.prepare("INSERT INTO driver_date_requests(dispatch_stop_id,employee_id,source_date,target_date,reason) VALUES(?,1,'2026-09-10','2026-09-17','Later')").run(ids[0])
 const n=submitNoGoodsNotice(ids[0],{...payload,contactMethod:'onsite'},context,db,{uploadsRoot})
 assert.equal(db.prepare('SELECT status FROM driver_date_requests WHERE dispatch_stop_id=?').get(ids[0]).status,'rejected')
 restoreNoGoodsNotice(n.id,{reason:'Goods ready'},office,db)
 const s=db.prepare('SELECT * FROM dispatch_stops WHERE id=?').get(ids[0])
 assert.equal(s.status,'active');assert.equal(s.arrived_at,'2026-09-10T10:00:00+08:00')
})
