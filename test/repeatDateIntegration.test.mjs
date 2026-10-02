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
const order=(db,trip)=>db.prepare("SELECT id FROM dispatch_stops WHERE dispatch_trip_id=? AND status<>'cancelled' ORDER BY stop_sequence,id").all(trip).map(s=>s.id)
const request=(db,id)=>requestDriverDate(id,{targetDate:'2026-09-11',reason:'Customer requests Friday',reasonCode:'time',evidence:{details:'Insufficient time on assigned route'}},context,db)
const approve=(db,id)=>decideDriverDate(id,'approved',{routeNumber:1,reason:'Confirmed with customer'},supervisor,db)

test('real date approval enforces second confirmation and records it atomically',()=>{
 const{db,ids}=fixture()
 try{
  db.prepare("INSERT INTO driver_date_requests(dispatch_stop_id,employee_id,source_date,target_date,reason,status,reviewed_at) VALUES(?,1,'2026-09-07','2026-09-10','Previous delay','approved','2026-09-07 02:00:00')").run(ids[0])
  const r=request(db,ids[0])
  assert.equal(listDriverDateRequests(db).find(x=>x.id===r.id).rescheduleHistory.count,1)
  assert.throws(()=>approve(db,r.id),{code:'REPEAT_DATE_CONFIRM'})
  assert.equal(db.prepare('SELECT status FROM driver_date_requests WHERE id=?').get(r.id).status,'pending')
  decideDriverDate(r.id,'approved',{routeNumber:1,reason:'Customer contacted',repeatApprovalConfirmed:true,repeatApprovalNumber:2},supervisor,db)
  assert.equal(db.prepare('SELECT approval_number FROM driver_date_repeat_reviews WHERE request_id=?').get(r.id).approval_number,2)
  assert.equal(driverToday(context,db).trips.flatMap(x=>x.stops).some(x=>x.id===ids[0]),false)
 }finally{db.close()}
})
