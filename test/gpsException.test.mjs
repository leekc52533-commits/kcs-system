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
const today='2026-10-05',context={employeeId:1,role:'driver',today},office={employeeId:3,role:'office',employeeName:'Office',today}
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
 ensureGpsExceptionSchema(db);return{db,ids:stops.map(s=>s.id),trip}
}

import {ensureGpsExceptionSchema} from '../server/gpsExceptionSchema.mjs'
import {requestGpsRelease,reviewGpsRelease,listGpsReleases} from '../server/gpsExceptionService.mjs'
const now=new Date('2026-10-05T02:00:00Z'),driver={...context,now},supervisor={...office,role:'supervisor',now}
const request=(db,id)=>requestGpsRelease(id,{reason:'GPS signal inaccurate at customer'},driver,db)
const approve=(db,id,ctx=supervisor)=>reviewGpsRelease(id,{decision:'approved',reason:'Called and verified with customer'},ctx,db)
test('only current stop can request; pending cannot open billing, review is scoped and audited without fake GPS',t=>{
 const{db,ids}=setup(t)
 assert.throws(()=>request(db,ids[1]),{code:'GPS_RELEASE_ORDER'})
 const r=request(db,ids[0]);assert.equal(request(db,ids[0]).id,r.id)
 assert.equal(db.prepare('SELECT arrived_at FROM dispatch_stops WHERE id=?').get(ids[0]).arrived_at,null)
 assert.throws(()=>approve(db,r.id,driver),{code:'GPS_RELEASE_ACCESS'})
 assert.equal(listGpsReleases(supervisor,db).length,1)
 approve(db,r.id);assert.equal(approve(db,r.id).idempotent,true)
 const stop=db.prepare('SELECT * FROM dispatch_stops WHERE id=?').get(ids[0]);assert.equal(stop.status,'active');assert.ok(stop.arrived_at);assert.equal(stop.arrival_latitude,null);assert.equal(stop.arrival_distance_m,null)
 assert.equal(db.prepare('SELECT status FROM dispatch_stops WHERE id=?').get(ids[1]).status,'locked')
 assert.equal(db.prepare("SELECT COUNT(*) n FROM dispatch_change_logs WHERE change_type='gps_release_approved'").get().n,1)
})
test('trial window expires at Malaysia midnight, assignment change and out-of-order approval are rejected',t=>{
 const{db,ids}=setup(t),r=request(db,ids[0])
 assert.throws(()=>approve(db,r.id,{...supervisor,now:new Date('2026-10-05T16:00:00Z')}),{code:'GPS_RELEASE_EXPIRED'})
 db.exec('UPDATE dispatches SET driver_id=2 WHERE vehicle_id=1')
 assert.throws(()=>approve(db,r.id),{code:'GPS_RELEASE_ACCESS'})
 db.exec('UPDATE dispatches SET driver_id=1 WHERE vehicle_id=1')
 db.prepare('UPDATE dispatch_stops SET stop_sequence=-1 WHERE id=?').run(ids[1])
 assert.throws(()=>approve(db,r.id),{code:'GPS_RELEASE_ORDER'})
 assert.equal(db.prepare('SELECT status FROM gps_arrival_requests WHERE id=?').get(r.id).status,'pending')
})
test('reject preserves stop and reasons; requests blocked outside trial and for another driver',t=>{
 const{db,ids}=setup(t)
 assert.throws(()=>requestGpsRelease(ids[0],{reason:'GPS'}, {...driver,now:new Date('2026-10-04T00:00:00Z')},db),{code:'GPS_RELEASE_EXPIRED'})
 assert.throws(()=>requestGpsRelease(ids[0],{reason:'GPS'},{...driver,employeeId:2},db),{code:'GPS_RELEASE_ACCESS'})
 const r=request(db,ids[0]);reviewGpsRelease(r.id,{decision:'rejected',reason:'Not at customer'},supervisor,db)
 assert.equal(db.prepare('SELECT arrived_at FROM dispatch_stops WHERE id=?').get(ids[0]).arrived_at,null)
 assert.throws(()=>approve(db,r.id),{code:'GPS_RELEASE_STALE'})
})

import {customerWorkspace,saveCustomerWorkspace} from '../server/customerWorkspaceService.mjs'
import {randomUUID} from 'node:crypto'
test('correction request requires saved official GPS, rejects standalone approval and releases atomically',t=>{
 const{db,ids}=setup(t),actor={id:1,employeeId:3,role:'owner_admin',employeeName:'Owner',now}
 const r=requestGpsRelease(ids[0],{reason:'Incorrect GPS',correctionRequired:true,latitude:1.5,longitude:110.3,accuracy:12},driver,db)
 assert.throws(()=>approve(db,r.id),{code:'GPS_RELEASE_CORRECTION_REQUIRED'})
 assert.equal(db.prepare('SELECT arrived_at FROM dispatch_stops WHERE id=?').get(ids[0]).arrived_at,null)
 const b=customerWorkspace({branchId:'B1'},actor,db)
 const p={requestId:randomUUID(),branchId:'B1',revision:b.revision,customer:b.customer,branch:b.branch,reason:'Verified correct position',gpsReleaseRequestId:r.id,gps:{latitude:1.5,longitude:110.3,locationSource:'map_selection'}}
 assert.throws(()=>saveCustomerWorkspace({...p,gps:null},actor,db),/GPS correction/)
 db.exec('UPDATE dispatches SET driver_id=2 WHERE vehicle_id=1')
 assert.throws(()=>saveCustomerWorkspace(p,actor,db),{code:'GPS_RELEASE_ACCESS'})
 assert.equal(db.prepare('SELECT latitude FROM branches WHERE id=1').get().latitude,3.1)
 db.exec('UPDATE dispatches SET driver_id=1 WHERE vehicle_id=1')
 saveCustomerWorkspace(p,actor,db)
 assert.equal(db.prepare('SELECT latitude FROM branches WHERE id=1').get().latitude,1.5)
 assert.equal(db.prepare('SELECT status FROM gps_arrival_requests WHERE id=?').get(r.id).status,'approved')
 assert.equal(db.prepare('SELECT status FROM dispatch_stops WHERE id=?').get(ids[0]).status,'active')
 saveCustomerWorkspace(p,actor,db)
 assert.equal(db.prepare("SELECT count(*) n FROM dispatch_change_logs WHERE change_type='gps_correction_saved_and_released'").get().n,1)
})

test('GPS correction remains available after legacy trial while enforcing current service date',t=>{
 const{db,ids}=setup(t),later=new Date('2026-10-24T02:00:00Z')
 db.exec("UPDATE dispatch_days SET dispatch_date='2026-10-24' WHERE dispatch_date='2026-10-05';UPDATE dispatches SET dispatch_date='2026-10-24' WHERE dispatch_date='2026-10-05';UPDATE dispatch_stops SET service_date='2026-10-24' WHERE service_date='2026-10-05'")
 const r=requestGpsRelease(ids[0],{reason:'Wrong customer GPS',correctionRequired:true},{...driver,now:later},db)
 assert.equal(r.status,'pending')
 assert.equal(db.prepare('SELECT reported_latitude FROM gps_arrival_requests WHERE id=?').get(r.id).reported_latitude,null)
 assert.throws(()=>requestGpsRelease(ids[1],{reason:'Wrong GPS',correctionRequired:true},{...driver,now:later},db),{code:'GPS_RELEASE_ORDER'})
})
