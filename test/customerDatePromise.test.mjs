import {driverArrangementSchemaSql} from '../server/migrationV64.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {schemaSql} from '../server/schema.mjs'
import {ensureV28Schema} from '../server/migrationV28.mjs'
import {applyV55Migration} from '../server/migrationV55.mjs'
import {generateWeek,saveDraftAdjustments,approveDay,driverToday} from '../server/dispatchService.mjs'
import {startDriverTrip} from '../server/driverExecutionService.mjs'
import {reorderDriverStop,requestDriverDate,decideDriverDate as decideDriverDateRaw,listDriverDateRequests} from '../server/driverRouteAdjustmentService.mjs'
import {isRouteTrialDate} from '../shared/routeTrial.js'
const decideDriverDate=(id,decision,payload,...args)=>decideDriverDateRaw(id,decision,{evidenceChecked:true,...payload},...args)
const today='2026-09-10',context={employeeId:1,role:'driver',today},supervisor={employeeId:3,role:'supervisor',employeeName:'Supervisor',today}
function fixture(){
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON;'+schemaSql);ensureV28Schema(db);db.exec(driverArrangementSchemaSql)
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

import {customerDatePromise,ensureCustomerDatePromiseSchema} from '../server/customerDatePromise.mjs'
import {getCollectionScheduleManagement} from '../server/collectionScheduleManagementService.mjs'
import {reviewDateWithSystemChange} from '../server/dateSystemReviewService.mjs'
import {changePlannedCustomer} from '../server/driverRouteAdjustmentService.mjs'
import {businessError} from '../server/businessErrors.mjs'
const body={targetDate:'2026-09-11',reason:'Customer requested rescheduling',reasonCode:'customer',evidence:{contactMethod:'phone',contactName:'Customer',contactAt:'2026-09-10T01:00:00Z'}}
const request=(db,id)=>requestDriverDate(id,body,context,db)
const approval={scope:'once',customerPromiseConfirmed:true,routeNumber:1,evidenceChecked:true,reason:'Confirmed promised date'}
test('customer date requires explicit scope/acknowledgement, exact date; once approval locks live target and keeps recurring schedule',()=>{
 const{db,ids}=fixture(),before=getCollectionScheduleManagement(1,db),r=request(db,ids[0])
 assert.equal(listDriverDateRequests(db)[0].evidence.customerDateCommitted,true)
 for(const patch of [{customerPromiseConfirmed:false},{scope:''},{targetDate:'2026-09-12'}])assert.throws(()=>reviewDateWithSystemChange(r.id,'approved',{...approval,...patch},supervisor,db),/CUSTOMER_DATE_/)
 assert.equal(db.prepare('SELECT status FROM driver_date_requests WHERE id=?').get(r.id).status,'pending')
 const out=reviewDateWithSystemChange(r.id,'approved',approval,supervisor,db),id=out.targetStopId
 assert.equal(customerDatePromise(db,id).date,body.targetDate)
 assert.deepEqual(getCollectionScheduleManagement(1,db).weekdays,before.weekdays)
 db.exec("UPDATE dispatches SET driver_id=1 WHERE dispatch_date='2026-09-11'")
 assert.equal(driverToday({...context,today:body.targetDate},db).trips[0].stops.find(s=>s.id===id).customerDatePromise.date,body.targetDate)
 assert.throws(()=>requestDriverDate(id,{...body,targetDate:'2026-09-12'},{...context,today:body.targetDate},db),/CUSTOMER_DATE_LOCKED/)
 assert.throws(()=>changePlannedCustomer(id,{targetDate:'2026-09-12'},supervisor,db),/CUSTOMER_DATE_LOCKED/)
 ensureCustomerDatePromiseSchema(db)
 for(const sql of [
  `UPDATE dispatch_stops SET service_date='2026-09-12' WHERE id=${id}`,
  `UPDATE dispatch_stops SET status='cancelled' WHERE id=${id}`,
  `DELETE FROM dispatch_stops WHERE id=${id}`,
  `UPDATE dispatch_stops SET branch_id=2 WHERE id=${id}`,
  `UPDATE dispatch_days SET dispatch_date='2026-10-11' WHERE dispatch_date='2026-09-11'`,
  `INSERT INTO schedule_exceptions(branch_id,schedule_id,exception_type,original_date,target_date,reason,created_by) VALUES(1,1,'move_date','2026-09-11','2026-09-12','test','test')`
 ])assert.throws(()=>db.exec(sql),/CUSTOMER_DATE_LOCKED/)
 assert.equal(businessError(new Error('CUSTOMER_DATE_LOCKED')).status,409)
 // Normal collection still works, and regeneration cannot lose the commitment.
 generateWeek({startDate:body.targetDate},db)
 db.prepare("UPDATE dispatch_stops SET status='active',arrived_at='2026-09-11T09:00:00+08:00' WHERE id=?").run(id)
 db.prepare("UPDATE dispatch_stops SET status='completed',completed_at='2026-09-11T09:20:00+08:00' WHERE id=?").run(id)
 assert.equal(customerDatePromise(db,id).date,body.targetDate)
 assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);db.close()
})
test('permanent approval updates master atomically, preserves commitment, and failures roll back all writes',()=>{
 const{db,ids}=fixture()
 db.exec("INSERT INTO weekly_route_plan_stops(plan_id,weekday,branch_id,vehicle_registration_number,trip_number,stop_sequence,route_number) VALUES(1,4,1,'V1',1,1,1)")
 const before=getCollectionScheduleManagement(1,db),r=request(db,ids[0]),payload={...approval,scope:'permanent',expectedScheduleUpdatedAt:before.updatedAt}
 db.exec("CREATE TRIGGER promise_fail BEFORE UPDATE ON driver_date_requests WHEN NEW.status='approved' BEGIN SELECT RAISE(ABORT,'test failure'); END")
 assert.throws(()=>reviewDateWithSystemChange(r.id,'approved',payload,supervisor,db),/test failure/)
 assert.deepEqual(getCollectionScheduleManagement(1,db).weekdays,before.weekdays)
 assert.equal(db.prepare('SELECT status FROM driver_date_requests WHERE id=?').get(r.id).status,'pending')
 assert.equal(db.prepare("SELECT COUNT(*) n FROM dispatch_stops WHERE branch_id=1 AND service_date='2026-09-11'").get().n,0)
 db.exec('DROP TRIGGER promise_fail')
 const out=reviewDateWithSystemChange(r.id,'approved',payload,supervisor,db)
 assert.deepEqual(getCollectionScheduleManagement(1,db).weekdays,['Friday'])
 assert.equal(customerDatePromise(db,out.targetStopId).scope,'permanent')
 assert.equal(reviewDateWithSystemChange(r.id,'approved',payload,supervisor,db).idempotent,true)
 assert.equal(db.prepare('SELECT COUNT(*) n FROM customer_date_promises').get().n,1)
 db.close()
})
test('removed reasons rejected for new requests; old evidence remains readable; rejection creates no promise',()=>{
 const{db,ids}=fixture()
 assert.throws(()=>requestDriverDate(ids[0],{...body,reasonCode:'uncontacted'},context,db),/DATE_REASON_CHOICE/)
 const r=request(db,ids[0]);decideDriverDate(r.id,'rejected',{reason:'Cannot commit'},supervisor,db)
 assert.equal(customerDatePromise(db,ids[0]),null)
 const old=requestDriverDate(ids[1],{...body,reasonCode:'time',evidence:{}},context,db)
 db.prepare("UPDATE driver_date_evidence SET reason_code='uncontacted',details_json=? WHERE request_id=?").run(JSON.stringify({reasonCode:'uncontacted'}),old.id)
 assert.equal(listDriverDateRequests(db)[0].evidence.reasonCode,'uncontacted')
 db.close()
})
