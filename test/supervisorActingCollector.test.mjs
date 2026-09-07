import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {readFileSync} from 'node:fs'
import {schemaSql} from '../server/schema.mjs'
import {actingCollectorOptions,claimActingCollectorVehicle} from '../server/actingCollectorService.mjs'
import {approveRoute,assignRouteVehicle,driverToday,generateDay} from '../server/dispatchService.mjs'
import {startDriverTrip} from '../server/driverExecutionService.mjs'
import {installWeeklyRoutePlan} from '../server/weeklyRoutePlanService.mjs'
import {listPendingDeferRequests} from '../server/deferApprovalService.mjs'

function fixture(){
  const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON;'+schemaSql)
  db.prepare("INSERT INTO customers(jodoo_customer_id,name) VALUES('C1','Customer One')").run()
  db.prepare("INSERT INTO branches(jodoo_branch_id,customer_id,branch_name,status,lifecycle_status,collection_frequency,assigned_weekdays,latitude,longitude) VALUES('B1',1,'Branch One','active','ACTIVE','Weekly','[\"Monday\"]',1,1)").run()
  db.prepare("INSERT INTO branch_schedules(jodoo_schedule_id,branch_id,source_branch_id,frequency,days_of_week) VALUES('S1',1,'B1','Weekly','Monday')").run()
  db.prepare("INSERT INTO vehicles(vehicle_code,registration_number,status,operational_status) VALUES('Lorry 1','QAV3468','available','active')").run()
  db.prepare("INSERT INTO employees(employee_code,name,job_role,employment_status,is_active) VALUES('D1','Normal Driver','Driver','active',1),('S1','Duty Supervisor','Supervisor','active',1)").run()
  installWeeklyRoutePlan({name:'Routes',sourceName:'test',entries:[[1,'QAV3468',1,1,'B1','','']]},{},db)
  generateDay({startDate:'2026-09-07'},db);assignRouteVehicle('2026-09-07',1,{vehicleId:1},db);db.prepare('UPDATE dispatches SET driver_id=1').run();approveRoute('2026-09-07',1,{approvedBy:'Supervisor'},db)
  return db
}

test('supervisor can inspect then take over one approved vehicle for today and operate it',()=>{
  const db=fixture(),context={employeeId:2,employeeName:'Duty Supervisor',role:'supervisor',date:'2026-09-07'}
  const before=actingCollectorOptions(context,db)
  assert.equal(before.vehicles[0].registrationNumber,'QAV3468');assert.equal(before.vehicles[0].driverName,'Normal Driver');assert.equal(before.vehicles[0].stops[0].customerName,'Customer One')
  assert.equal(claimActingCollectorVehicle(1,context,db).temporary,true)
  const route=driverToday({employeeId:2,role:'supervisor',today:'2026-09-07'},db)
  assert.equal(route.routeAvailable,true);assert.equal(route.totalStops,1);assert.equal(startDriverTrip(route.trips[0].id,{employeeId:2,role:'supervisor',today:'2026-09-07'},db).status,'in_progress')
  assert.equal(db.prepare("SELECT COUNT(*) count FROM dispatch_change_logs WHERE change_type='supervisor_acting_driver' AND requires_reapproval=0").get().count,1)
})

test('collector menu and supervisor-to-mobile switch are wired without changing account role',()=>{
  const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8'),page=readFileSync(new URL('../src/ActingCollectorPage.jsx',import.meta.url),'utf8')
  assert.match(app,/nav\.actingCollector/);assert.match(app,/kcs_acting_collector_mode/);assert.match(page,/api\/acting-collector\/vehicle/);assert.match(page,/acting\.inspectRoute/);assert.match(page,/acting\.takeOver/)
})

test('dashboard approval queue returns a pending employee request immediately',()=>{
  const db=fixture(),row=db.prepare('SELECT ds.id stopId,dt.id tripId,dd.id dayId FROM dispatch_stops ds JOIN dispatch_trips dt ON dt.id=ds.dispatch_trip_id JOIN dispatch_days dd ON dd.id=dt.dispatch_day_id LIMIT 1').get()
  db.prepare("INSERT INTO driver_defer_requests(dispatch_stop_id,dispatch_trip_id,dispatch_day_id,driver_employee_id,reason,expected_return_time,expected_return_at,requested_at) VALUES(?,?,?,?,?,?,?,?)").run(row.stopId,row.tripId,row.dayId,1,'customer_requested_return','14:30','2026-09-07T14:30:00+08:00','2026-09-07T12:00:00+08:00')
  const items=listPendingDeferRequests(db)
  assert.equal(items.length,1);assert.equal(items[0].driverName,'Normal Driver');assert.equal(items[0].registrationNumber,'QAV3468');assert.equal(items[0].branchId,'B1')
})
