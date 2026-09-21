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


import {createHash} from 'node:crypto'
import {getDispatchDay} from '../server/dispatchService.mjs'
import {requestDriverDate,decideDriverDate} from '../server/driverRouteAdjustmentService.mjs'
function approvedFixture(t){const f=setup(t),{db,trip}=f;const day=db.prepare('SELECT dispatch_day_id id FROM dispatch_trips WHERE id=?').get(trip).id
 db.prepare('UPDATE dispatch_stops SET route_number=1 WHERE dispatch_trip_id=?').run(trip)
 db.prepare("INSERT OR REPLACE INTO daily_route_approvals(dispatch_day_id,route_number,route_signature,actor,reason) VALUES(?,1,?,'Original Supervisor','Departure checked')").run(day,routeSignature(db,day,1))
 return {...f,day}
}
function isApproved(db,day){return db.prepare('SELECT route_signature s FROM daily_route_approvals WHERE dispatch_day_id=? AND route_number=1').get(day)?.s===routeSignature(db,day,1)}
test('departure approval survives normal arrival and completion progress',t=>{
 const{db,ids,day}=approvedFixture(t);const old=routeSignature(db,day,1)
 arriveAtStop(ids[0],gps,arrivalContext,db);assert.equal(routeSignature(db,day,1),old)
 db.prepare("UPDATE dispatch_stops SET status='completed',completion_outcome='completed' WHERE id=?").run(ids[0]);assert.equal(routeSignature(db,day,1),old)
 assert.equal(getDispatchDay(today,db).routeBoards.find(r=>r.routeNumber===1).approvalStatus,'approved')
})
test('approved order request retains departure approval and audit; pending request changes nothing',t=>{
 const{db,ids,day}=approvedFixture(t),old=routeSignature(db,day,1)
 const r=reorderDriverStop(ids[1],{direction:'up',expectedOrder:ids,reason:'Customer asked'},context,db)
 assert.equal(routeSignature(db,day,1),old);approve(db,r.id);assert.ok(isApproved(db,day))
 assert.notEqual(routeSignature(db,day,1),old)
 assert.equal(db.prepare("SELECT COUNT(*) n FROM dispatch_change_logs WHERE change_type='approved_request_route_synced'").get().n,1)
})
test('unapproved separate edit stays unapproved after a supervisor accepts an order request',t=>{
 const{db,ids,day}=approvedFixture(t)
 db.prepare('UPDATE dispatch_stops SET route_stop_sequence=99 WHERE id=?').run(ids[2])
 const saved=db.prepare('SELECT route_signature s FROM daily_route_approvals WHERE dispatch_day_id=? AND route_number=1').get(day).s
 assert.equal(isApproved(db,day),false)
 const r=reorderDriverStop(ids[1],{direction:'up',expectedOrder:ids,reason:'Customer asked'},context,db);approve(db,r.id)
 assert.equal(isApproved(db,day),false);assert.equal(db.prepare('SELECT route_signature s FROM daily_route_approvals WHERE dispatch_day_id=? AND route_number=1').get(day).s,saved)
})
test('approved date request preserves source approval and does not grant departure approval to a new destination route',t=>{
 const{db,ids,day}=approvedFixture(t)
 const r=requestDriverDate(ids[0],{targetDate:'2026-09-15',reason:'Customer called'},context,db)
 decideDriverDate(r.id,'approved',{targetDate:'2026-09-15',routeNumber:1,reason:'Confirmed'},office,db)
 assert.ok(isApproved(db,day));const target=db.prepare("SELECT id FROM dispatch_days WHERE dispatch_date='2026-09-15'").get()
 assert.equal(db.prepare('SELECT 1 FROM daily_route_approvals WHERE dispatch_day_id=?').get(target.id),undefined)
})
test('legacy approval remains valid across execution status changes but never across an unapproved plan change',t=>{
 const{db,day,ids}=approvedFixture(t)
 const rows=db.prepare(`SELECT ds.id,ds.branch_id branchId,ds.route_stop_sequence routeSequence,ds.stop_sequence stopSequence,'locked' status,dt.trip_number tripNumber,d.vehicle_id vehicleId FROM dispatch_stops ds JOIN dispatch_trips dt ON dt.id=ds.dispatch_trip_id JOIN dispatches d ON d.id=ds.dispatch_id WHERE dt.dispatch_day_id=? AND ds.route_number=1 AND ds.status<>'cancelled' ORDER BY ds.route_stop_sequence,ds.id`).all(day)
 const legacy=createHash('sha256').update(JSON.stringify(rows)).digest('hex')
 db.prepare('UPDATE daily_route_approvals SET route_signature=? WHERE dispatch_day_id=?').run(legacy,day)
 arriveAtStop(ids[0],gps,arrivalContext,db);assert.ok(isApproved(db,day))
 db.prepare('UPDATE dispatch_stops SET route_stop_sequence=99 WHERE id=?').run(ids[2]);assert.equal(isApproved(db,day),false)
})
test('audit failure rolls back both accepted request and synchronized departure approval',t=>{
 const{db,ids,day}=approvedFixture(t),old=routeSignature(db,day,1),before=snapshot(db)
 const r=reorderDriverStop(ids[1],{direction:'up',expectedOrder:ids,reason:'Customer asked'},context,db)
 db.exec("CREATE TRIGGER fail_sync BEFORE INSERT ON dispatch_change_logs WHEN NEW.change_type='approved_request_route_synced' BEGIN SELECT RAISE(ABORT,'audit failure'); END")
 assert.throws(()=>approve(db,r.id),/audit failure/);assert.deepEqual(snapshot(db),before);assert.equal(routeSignature(db,day,1),old)
 assert.equal(db.prepare('SELECT status FROM driver_arrangement_requests WHERE id=?').get(r.id).status,'pending')
})
