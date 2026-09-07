import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {readFileSync} from 'node:fs'
import {schemaSql} from '../server/schema.mjs'
import {approveRoute,assignRouteVehicle,assignVehicleDay,carryForwardVehicleDrivers,driverTomorrow,generateWeek} from '../server/dispatchService.mjs'
import {installWeeklyRoutePlan} from '../server/weeklyRoutePlanService.mjs'

function fixture(){
  const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON;'+schemaSql)
  db.prepare("INSERT INTO customers(jodoo_customer_id,name) VALUES('C1','Customer')").run()
  db.prepare("INSERT INTO branches(jodoo_branch_id,customer_id,branch_name,status,lifecycle_status,collection_frequency,assigned_weekdays,latitude,longitude) VALUES('B1',1,'One','active','ACTIVE','Weekly','[\"Monday\",\"Tuesday\"]',1,1)").run()
  db.prepare("INSERT INTO branch_schedules(jodoo_schedule_id,branch_id,source_branch_id,frequency,days_of_week) VALUES('S1',1,'B1','Weekly','Monday,Tuesday')").run()
  db.prepare("INSERT INTO vehicles(vehicle_code,registration_number,status,operational_status) VALUES('Lorry 1','QAV3468','available','active')").run()
  db.prepare("INSERT INTO employees(employee_code,name,job_role,employment_status,is_active) VALUES('D1','Driver One','Driver','active',1),('D2','Driver Two','Driver','active',1),('C1','Crew One','Crew','active',1)").run()
  installWeeklyRoutePlan({name:'Routes',sourceName:'test',entries:[[1,'QAV3468',1,1,'B1','',''],[2,'QAV3468',1,1,'B1','','']]},{},db)
  generateWeek({startDate:'2026-09-07'},db)
  return db
}

test('tomorrow inherits only the latest vehicle driver and exposes its approved Route on mobile',()=>{
  const db=fixture()
  assignRouteVehicle('2026-09-07',1,{vehicleId:1},db)
  assignVehicleDay('2026-09-07',1,{driverId:1,assistantIds:[3]},db)
  assignRouteVehicle('2026-09-08',1,{vehicleId:1},db)
  approveRoute('2026-09-08',1,{approvedBy:'Supervisor'},db)
  const route=driverTomorrow({employeeId:1,role:'driver',now:new Date('2026-09-07T04:00:00Z')},db)
  assert.equal(route.routeAvailable,true)
  assert.equal(route.date,'2026-09-08')
  assert.equal(route.trips[0].registrationNumber,'QAV3468')
  assert.equal(db.prepare(`SELECT COUNT(*) count FROM dispatch_vehicle_assistants dva JOIN dispatch_days dd ON dd.id=dva.dispatch_day_id WHERE dd.dispatch_date='2026-09-08'`).get().count,0)
})

test('repair fills empty future vehicle drivers without replacing an explicit assignment',()=>{
  const db=fixture()
  assignRouteVehicle('2026-09-07',1,{vehicleId:1},db)
  assignVehicleDay('2026-09-07',1,{driverId:1},db)
  assignRouteVehicle('2026-09-08',1,{vehicleId:1},db)
  assignVehicleDay('2026-09-08',1,{driverId:2},db)
  const result=carryForwardVehicleDrivers({startDate:'2026-09-08'},db)
  assert.equal(result.driversCarried,0)
  assert.equal(db.prepare(`SELECT d.driver_id driverId FROM dispatch_trips dt JOIN dispatch_days dd ON dd.id=dt.dispatch_day_id JOIN dispatches d ON d.id=dt.dispatch_id WHERE dd.dispatch_date='2026-09-08' AND d.vehicle_id=1 LIMIT 1`).get().driverId,2)
})

test('mobile day buttons always refetch and both views auto-refresh',()=>{
  const source=readFileSync(new URL('../src/AuthPages.jsx',import.meta.url),'utf8')
  assert.match(source,/setRouteDay\('today'\);loadRouteDay\('today'\)/)
  assert.match(source,/setRouteDay\('tomorrow'\);loadRouteDay\('tomorrow'\)/)
  assert.match(source,/useEffect\(\(\)=>\{const timer=setInterval\(\(\)=>refresh\(\)\.catch/)
})
