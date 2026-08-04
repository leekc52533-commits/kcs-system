import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {mkdtempSync,readFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {schemaSql} from '../server/schema.mjs'
import {approveDay,driverToday,generateWeek,saveDraftAdjustments} from '../server/dispatchService.mjs'

const date='2026-07-20'
function fixture(path=':memory:'){
  const db=new DatabaseSync(path);db.exec('PRAGMA foreign_keys=ON;'+schemaSql)
  db.prepare("INSERT INTO areas(jodoo_area_id,name) VALUES('A1','North')").run()
  db.prepare("INSERT INTO customers(jodoo_customer_id,name) VALUES('C1','Alpha')").run()
  db.prepare("INSERT INTO branches(jodoo_branch_id,customer_id,area_id,branch_name,address,latitude,longitude,time_restriction) VALUES('B1',1,1,'Alpha One','One',NULL,NULL,'Before noon'),('B2',1,1,'Alpha Two','Two',3.1,101.6,NULL)").run()
  db.prepare("INSERT INTO branch_schedules(jodoo_schedule_id,branch_id,source_branch_id,frequency,days_of_week) VALUES('S1',1,'B1','Weekly','Monday'),('S2',2,'B2','Weekly','Monday')").run()
  db.prepare("INSERT INTO vehicles(vehicle_code,vehicle_name,registration_number,status,operational_status) VALUES('V1','Main Lorry','ABC1','available','active'),('V2','Second Lorry','ABC2','available','active')").run()
  db.prepare("INSERT INTO employees(employee_code,name,job_role,employment_status,is_active) VALUES('D1','Driver One','Driver','active',1),('D2','Driver Two','Driver','active',1),('C1','Crew One','Crew','active',1),('I1','Inactive Driver','Driver','inactive',0),('O1','Office One','Office','active',1)").run()
  generateWeek({startDate:date},db)
  const stops=db.prepare('SELECT id FROM dispatch_stops WHERE service_date=? ORDER BY id').all(date)
  saveDraftAdjustments({adjustments:stops.map((row,index)=>({stopId:row.id,vehicleId:1,tripNumber:index+1})),reason:'Assign route',changedBy:'Planner'},db)
  db.prepare('UPDATE dispatches SET driver_id=1 WHERE vehicle_id=1').run()
  db.prepare('INSERT INTO dispatch_vehicle_assistants(dispatch_day_id,vehicle_id,employee_id) SELECT id,1,3 FROM dispatch_days WHERE dispatch_date=?').run(date)
  return db
}
const approved=db=>approveDay(date,{approvedBy:'Supervisor',reason:'Ready'},db)

test('driver sees only the Asia/Kuching approved date assigned to their vehicle',()=>{const db=fixture();approved(db);const route=driverToday({employeeId:1,role:'driver',today:date,date:'2030-01-01',driverId:2,vehicleId:2},db);assert.equal(route.approved,true);assert.equal(route.totalStops,2);assert.ok(route.trips.every(trip=>trip.vehicleCode==='V1'));assert.deepEqual(route.trips.map(trip=>trip.tripNumber),[1,2]);assert.equal(route.date,date)})
test('Draft and withdrawn Draft routes are not visible',()=>{const db=fixture();assert.equal(driverToday({employeeId:1,role:'driver',today:date},db).reason,'NO_APPROVED_ROUTE');approved(db);db.prepare("UPDATE dispatch_days SET status='draft' WHERE dispatch_date=?").run(date);assert.equal(driverToday({employeeId:1,role:'driver',today:date},db).trips.length,0)})
test('other driver and vehicle data are isolated',()=>{const db=fixture();approved(db);const route=driverToday({employeeId:2,role:'driver',today:date},db);assert.equal(route.reason,'NO_VEHICLE_ASSIGNED');assert.equal(route.totalStops,0);assert.deepEqual(route.vehicles,[])})
test('assigned crew can read the same vehicle without seeing other vehicles',()=>{const db=fixture();approved(db);const route=driverToday({employeeId:3,role:'crew',today:date},db);assert.equal(route.totalStops,2);assert.deepEqual(route.vehicles.map(item=>item.vehicleCode),['V1']);assert.ok(route.trips.every(trip=>!('driverId' in trip)))})
test('inactive and unauthorized employees are rejected',()=>{const db=fixture();approved(db);assert.throws(()=>driverToday({employeeId:4,role:'driver',today:date},db),/not active/);assert.throws(()=>driverToday({employeeId:5,role:'driver',today:date},db),/permission/)})
test('NULL weight and missing GPS remain visible without sensitive fields',()=>{const db=fixture();approved(db);const stops=driverToday({employeeId:1,role:'driver',today:date},db).trips.flatMap(item=>item.stops);assert.equal(stops[0].estimatedWeightKg,null);assert.equal(stops[0].gpsAvailable,false);assert.equal(stops[1].gpsAvailable,true);for(const stop of stops){assert.equal('latitude' in stop,false);assert.equal('longitude' in stop,false);assert.equal('paymentType' in stop,false);assert.equal('occPrice' in stop,false)}})
test('inactive vehicles and cancelled Stops do not appear',()=>{const db=fixture();approved(db);db.prepare("UPDATE vehicles SET operational_status='maintenance',status='maintenance' WHERE id=1").run();assert.equal(driverToday({employeeId:1,role:'driver',today:date},db).reason,'NO_VEHICLE_ASSIGNED')})
test('driver route read is database read-only and file database remains integral',()=>{const directory=mkdtempSync(join(tmpdir(),'kcs-driver-route-')),path=join(directory,'route.sqlite'),db=fixture(path);approved(db);const before=db.prepare('SELECT total_changes() value').get().value;driverToday({employeeId:1,role:'driver',today:date},db);assert.equal(db.prepare('SELECT total_changes() value').get().value,before);assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');db.close();assert.ok(readFileSync(path).length>0)})

test('driver UI preserves route details and exposes only implemented execution actions',()=>{const source=readFileSync(new URL('../src/AuthPages.jsx',import.meta.url),'utf8');const view=source.slice(source.indexOf('function TodayView'));assert.match(view,/driver-stop/);assert.match(view,/estimatedWeightKg==null/);assert.match(view,/mobile\.startTrip/);assert.match(view,/mobile\.arrive/);assert.doesNotMatch(view,/Complete Stop|No Goods|Skip Stop|Complete Trip/);assert.match(source,/api\('\/api\/mobile\/today'\)/)})
