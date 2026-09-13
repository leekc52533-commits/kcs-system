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
const today='2026-09-14',context={employeeId:1,role:'driver',today},office={employeeId:3,role:'office',employeeName:'Office',today}
const payload={reason:'Customer called: no cartons',contactMethod:'phone',photo:{name:'call.png',dataUrl:'data:image/png;base64,iVBORw0KGgo='}}
function setup(t){const x=fixture(),uploadsRoot=fs.mkdtempSync(path.join(os.tmpdir(),'kcs-no-goods-'));t.after(()=>{x.db.close();fs.rmSync(uploadsRoot,{recursive:true,force:true})});return{...x,uploadsRoot}}
function fixture(){
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON;'+schemaSql);ensureV28Schema(db)
 db.exec("INSERT INTO schema_meta(version) VALUES(55);INSERT INTO areas(jodoo_area_id,name) VALUES('A1','North');INSERT INTO customers(jodoo_customer_id,name) VALUES('C1','Alpha');INSERT INTO vehicles(vehicle_code,status,operational_status) VALUES('V1','available','active'),('V2','available','active');INSERT INTO employees(employee_code,name,job_role,employment_status,is_active) VALUES('D1','Driver One','Driver','active',1),('D2','Driver Two','Driver','active',1),('S1','Supervisor','Supervisor','active',1),('C1','Crew One','Crew','active',1)")
 for(let i=1;i<=3;i++){db.prepare("INSERT INTO branches(jodoo_branch_id,customer_id,area_id,branch_name,address,latitude,longitude) VALUES(?,1,1,?,'Address',3.1,101.6)").run('B'+i,'Branch '+i);db.prepare("INSERT INTO branch_schedules(jodoo_schedule_id,branch_id,source_branch_id,frequency,days_of_week) VALUES(?,?,?,'Weekly','Monday')").run('S'+i,i,'B'+i)}
 generateWeek({startDate:today},db)
 const stops=db.prepare('SELECT id FROM dispatch_stops WHERE service_date=? ORDER BY id').all(today)
 saveDraftAdjustments({adjustments:stops.map(s=>({stopId:s.id,vehicleId:1,tripNumber:1})),reason:'Assign'},db)
 db.exec('UPDATE dispatches SET driver_id=1 WHERE vehicle_id=1')
 approveDay(today,{approvedBy:'Supervisor',reason:'Ready'},db)
 const trip=db.prepare('SELECT dispatch_trip_id id FROM dispatch_stops WHERE id=?').get(stops[0].id).id
 startDriverTrip(trip,context,db)
 db.exec("INSERT INTO weekly_route_plans(name,source_name,created_by) VALUES('Current','Test','Supervisor');INSERT INTO weekly_route_definitions(plan_id,route_number,display_name) VALUES(1,1,'Current route');INSERT INTO daily_route_assignments(dispatch_day_id,route_number,vehicle_id,assigned_by) SELECT id,1,1,'Supervisor' FROM dispatch_days WHERE dispatch_date='2026-09-15'")
 return{db,ids:stops.map(s=>s.id),trip}
}

import {reorderDriverStop} from '../server/driverRouteAdjustmentService.mjs'
import {reviewArrangementRequest,listArrangementRequests,arrangementProof} from '../server/driverArrangementService.mjs'
import {isRouteTrialDate} from '../shared/routeTrial.js'
import {requiresDriverApproval} from '../shared/driverChangePolicy.js'
import {applyV64Migration} from '../server/migrationV64.mjs'
const approve=(db,id)=>reviewArrangementRequest(id,{decision:'approved',reason:'Checked with driver'},office,db)
const snapshot=db=>db.prepare('SELECT * FROM dispatch_stops ORDER BY id').all()
const gps={latitude:3.1,longitude:101.6,accuracy:8,captured_at:'2026-09-14T01:00:00Z'}
const arrivalContext={...context,now:new Date(gps.captured_at)}

test('cutover ends free ordering on September 13 and requires approval from September 14',()=>{
 assert.equal(isRouteTrialDate('2026-09-13'),true);assert.equal(isRouteTrialDate(today),false)
 assert.equal(requiresDriverApproval('2026-09-13'),false);assert.equal(requiresDriverApproval(today),true)
})
test('unarrived No Goods preserves route until approval, keeps evidence, prevents driver approval and retries safely',t=>{
 const{db,ids,uploadsRoot}=setup(t),before=snapshot(db),r=submitNoGoodsNotice(ids[0],payload,context,db,{uploadsRoot})
 assert.equal(r.status,'pending');assert.deepEqual(snapshot(db),before);assert.equal(driverToday(context,db).noGoodsCount,0)
 assert.equal(submitNoGoodsNotice(ids[0],payload,context,db,{uploadsRoot}).id,r.id)
 assert.equal(fs.readdirSync(path.join(uploadsRoot,'no-goods-notices')).length,1)
 assert.throws(()=>approveAsDriver(),{code:'NG_ACCESS'})
 function approveAsDriver(){return reviewArrangementRequest(r.id,{decision:'approved',reason:'Self'},context,db)}
 assert.equal(listArrangementRequests(office,db).length,1);assert.throws(()=>arrangementProof(r.id,context,db),{code:'NG_ACCESS'})
 assert(fs.existsSync(path.join(uploadsRoot,arrangementProof(r.id,office,db).storage_key)))
 approve(db,r.id);assert.equal(approve(db,r.id).idempotent,true)
 const view=driverToday(context,db);assert.equal(view.noGoodsCount,1);assert.equal(view.completedStops,0);assert.equal(view.trips[0].currentStopId,ids[1]);assert.equal(view.trips[0].stops[0].arrivedAt,null)
 assert.equal(db.prepare('SELECT COUNT(*) n FROM no_goods_notices').get().n,1)
 assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0)
})
test('verified on-site No Goods completes immediately with proof; selecting onsite alone does not bypass approval',t=>{
 const{db,ids,uploadsRoot}=setup(t)
 const unverified=submitNoGoodsNotice(ids[1],{...payload,contactMethod:'onsite'},context,db,{uploadsRoot});assert.equal(unverified.status,'pending')
 arriveAtStop(ids[0],gps,arrivalContext,db)
 assert.equal(driverToday(context,db).trips[0].stops[0].noGoodsApprovalRequired,false)
 assert.throws(()=>submitNoGoodsNotice(ids[0],{...payload,photo:null},context,db,{uploadsRoot}))
 const onsite=submitNoGoodsNotice(ids[0],payload,context,db,{uploadsRoot});assert.equal(onsite.status,'approved');assert.equal(driverToday(context,db).noGoodsCount,1)
})
test('remote test arrival outside radius still requires approval, including legacy No Goods endpoint',async t=>{
 const{recordNoGoods}=await import('../server/driverExecutionService.mjs')
 const{db,ids,uploadsRoot}=setup(t)
 arriveAtStop(ids[0],{...gps,latitude:1.5,longitude:110.3},{...arrivalContext,remoteArrivalTestMode:true},db)
 assert.throws(()=>recordNoGoods(ids[0],payload,context,db,{uploadsRoot}),{code:'ARRANGEMENT_APPROVAL_REQUIRED'})
 assert.equal(submitNoGoodsNotice(ids[0],payload,context,db,{uploadsRoot}).status,'pending')
})
test('order request changes nothing until approval and keeps fixed schedules unchanged',t=>{
 const{db,ids,trip}=setup(t),before=snapshot(db),schedules=db.prepare('SELECT * FROM branch_schedules').all(),body={direction:'up',expectedOrder:ids,reason:'Customer opening time'}
 const r=reorderDriverStop(ids[1],body,context,db);assert.equal(r.status,'pending');assert.deepEqual(snapshot(db),before)
 assert.equal(reorderDriverStop(ids[1],body,context,db).id,r.id)
 assert.equal(driverToday(context,db).trialOrderEnabled,false);assert.equal(driverToday(context,db).driverApprovalRequired,true)
 approve(db,r.id)
 assert.deepEqual(db.prepare('SELECT id FROM dispatch_stops WHERE dispatch_trip_id=? ORDER BY stop_sequence').all(trip).map(s=>s.id),[ids[1],ids[0],ids[2]])
 assert.deepEqual(db.prepare('SELECT * FROM branch_schedules').all(),schedules)
 assert.equal(approve(db,r.id).idempotent,true)
})
test('approval rejects changed date, driver and newly executed stops without partially applying',t=>{
 const{db,ids,uploadsRoot}=setup(t),r=submitNoGoodsNotice(ids[0],payload,context,db,{uploadsRoot}),before=snapshot(db)
 assert.throws(()=>reviewArrangementRequest(r.id,{decision:'approved',reason:'Late'},{...office,today:'2026-09-15'},db),{code:'ARRANGEMENT_STALE'})
 db.exec('UPDATE dispatches SET driver_id=2 WHERE vehicle_id=1');assert.throws(()=>approve(db,r.id),{code:'ARRANGEMENT_STALE'})
 db.exec('UPDATE dispatches SET driver_id=1 WHERE vehicle_id=1');assert.deepEqual(snapshot(db),before)
 db.prepare("UPDATE dispatch_stops SET status='completed' WHERE id=?").run(ids[0]);assert.throws(()=>approve(db,r.id),{code:'NG_PROTECTED'})
 assert.equal(db.prepare('SELECT status FROM driver_arrangement_requests').get().status,'pending')
})
test('order approval rejects stale order or a customer reached while waiting',t=>{
 const{db,ids}=setup(t),r=reorderDriverStop(ids[1],{direction:'up',expectedOrder:ids,reason:'Change'},context,db)
 arriveAtStop(ids[0],gps,arrivalContext,db);const before=snapshot(db);assert.throws(()=>approve(db,r.id));assert.deepEqual(snapshot(db),before)
})
test('rejection preserves original stop and proof, and allows a fresh request; schema upgrade repeats safely',t=>{
 const{db,ids,uploadsRoot}=setup(t),before=snapshot(db),r=submitNoGoodsNotice(ids[0],payload,context,db,{uploadsRoot})
 reviewArrangementRequest(r.id,{decision:'rejected',reason:'Visit first'},office,db);assert.deepEqual(snapshot(db),before)
 const next=submitNoGoodsNotice(ids[0],payload,context,db,{uploadsRoot});assert.notEqual(r.id,next.id)
 db.exec('DELETE FROM schema_meta; INSERT INTO schema_meta(version) VALUES(63)');applyV64Migration(db);applyV64Migration(db)
 assert.equal(db.prepare('SELECT MAX(version) v FROM schema_meta').get().v,64);assert.deepEqual(snapshot(db),before)
 assert.equal(db.prepare('SELECT COUNT(*) n FROM driver_arrangement_requests').get().n,2)
 assert.equal(fs.readdirSync(path.join(uploadsRoot,'no-goods-notices')).length,2)
})

test('approval audit failure rolls back skip and decision; pending proof is retained',t=>{
 const{db,ids,uploadsRoot}=setup(t),r=submitNoGoodsNotice(ids[0],payload,context,db,{uploadsRoot}),before=snapshot(db)
 db.exec("CREATE TRIGGER reject_review BEFORE UPDATE ON driver_arrangement_requests BEGIN SELECT RAISE(ABORT,'audit failure'); END")
 assert.throws(()=>approve(db,r.id),/audit failure/);assert.deepEqual(snapshot(db),before)
 assert.equal(db.prepare('SELECT COUNT(*) n FROM no_goods_notices').get().n,0)
 assert.equal(db.prepare('SELECT status FROM driver_arrangement_requests').get().status,'pending')
 assert.equal(fs.readdirSync(path.join(uploadsRoot,'no-goods-notices')).length,1)
})
test('an employee who reaches the customer after requesting may submit fresh onsite proof',t=>{
 const{db,ids,uploadsRoot}=setup(t),r=submitNoGoodsNotice(ids[0],payload,context,db,{uploadsRoot})
 arriveAtStop(ids[0],gps,arrivalContext,db)
 assert.equal(submitNoGoodsNotice(ids[0],{...payload,contactMethod:'onsite'},context,db,{uploadsRoot}).status,'approved')
 assert.equal(db.prepare('SELECT status FROM driver_arrangement_requests WHERE id=?').get(r.id).status,'rejected')
 assert.equal(fs.readdirSync(path.join(uploadsRoot,'no-goods-notices')).length,2)
 assert.throws(()=>approve(db,r.id),{code:'ARRANGEMENT_STALE'})
})
