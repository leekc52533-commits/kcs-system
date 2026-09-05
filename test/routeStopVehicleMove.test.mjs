import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {DatabaseSync} from 'node:sqlite'
import {schemaSql} from '../server/schema.mjs'
import {approveDay,generateDay,getDispatchDay,moveRouteStop,reopenDay,updateStop} from '../server/dispatchService.mjs'

function fixture(){
  const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON;'+schemaSql)
  db.prepare("INSERT INTO areas(jodoo_area_id,name) VALUES('A1','North')").run()
  db.prepare("INSERT INTO customers(jodoo_customer_id,name,payment_type,occ_price) VALUES('C1','Alpha','Cash',0.55)").run()
  db.prepare("INSERT INTO branches(jodoo_branch_id,customer_id,area_id,branch_name,address,latitude,longitude) VALUES('B1',1,1,'One','Address',3.1,101.6),('B2',1,1,'Two','Address',3.2,101.7)").run()
  db.prepare("INSERT INTO branch_schedules(jodoo_schedule_id,branch_id,source_branch_id,frequency,days_of_week) VALUES('S1',1,'B1','Weekly','Monday'),('S2',2,'B2','Weekly','Monday')").run()
  db.prepare("INSERT INTO employees(employee_code,name,job_role) VALUES('D1','Driver One','driver'),('D2','Driver Two','driver')").run()
  db.prepare("INSERT INTO vehicles(vehicle_code,registration_number,official_sequence) VALUES('Lorry 2','QAA4293N',2),('Lorry 7','NEW7000',7),('Paused','OFF1',8)").run()
  generateDay({startDate:'2026-07-20'},db)
  let day=getDispatchDay('2026-07-20',db)
  for(const stop of day.stops)updateStop(stop.id,{vehicleId:1,tripNumber:1,estimatedWeightKg:stop.id===day.stops[0].id?100:null},db)
  db.prepare("INSERT INTO route_vehicle_availability(vehicle_id,availability_date,status,reason,changed_by) VALUES(3,'2026-07-20','off_duty','paused today','Supervisor')").run()
  return db
}

test('single-stop move preserves Zone, appends to a dynamic vehicle, and recomputes both boards',()=>{const db=fixture();let day=getDispatchDay('2026-07-20',db),stop=day.stops[0],zone=stop.zoneGroupId,revision=day.revision;const result=moveRouteStop(stop.id,{targetVehicleId:2,expectedRevision:revision,changedBy:'Supervisor'},db);day=getDispatchDay('2026-07-20',db);assert.equal(result.revision,revision+1);assert.equal(day.stops.find(row=>row.id===stop.id).zoneGroupId,zone);assert.equal(day.stops.filter(row=>row.vehicleId===2).length,1);assert.equal(day.stops.filter(row=>row.vehicleId===1).length,1);assert.equal(day.vehicleBoards.find(row=>row.id===2).customerCount,1);assert.equal(day.vehicleBoards.find(row=>row.id===2).estimatedWeightKg,100);assert.equal(day.vehicleBoards.find(row=>row.id===1).missingWeightCount,1);assert.equal(db.prepare("SELECT COUNT(*) n FROM dispatch_change_logs WHERE change_type='route_stop_vehicle_moved'").get().n,1)})
test('same Zone may span vehicles while paused vehicles are absent',()=>{const db=fixture(),day=getDispatchDay('2026-07-20',db);moveRouteStop(day.stops[0].id,{targetVehicleId:2,expectedRevision:day.revision},db);const after=getDispatchDay('2026-07-20',db);assert.equal(new Set(after.stops.map(row=>row.zoneGroupId)).size,1);assert.deepEqual(after.vehicleBoards.map(row=>row.vehicle),['Lorry 2','Lorry 7'])})
test('approved move is blocked, withdrawal enables it, and stale revisions leave stops untouched',()=>{const db=fixture();let day=getDispatchDay('2026-07-20',db);db.prepare('UPDATE dispatches SET driver_id=1 WHERE vehicle_id=1').run();approveDay('2026-07-20',{reason:'Ready'},db);assert.throws(()=>moveRouteStop(day.stops[0].id,{targetVehicleId:2,expectedRevision:day.revision},db),/Withdraw Approval/);reopenDay('2026-07-20',{reason:'Adjust route'},db);day=getDispatchDay('2026-07-20',db);const before=db.prepare('SELECT id,dispatch_trip_id trip FROM dispatch_stops ORDER BY id').all();assert.throws(()=>moveRouteStop(day.stops[0].id,{targetVehicleId:2,expectedRevision:day.revision-1},db),/another supervisor/);assert.deepEqual(db.prepare('SELECT id,dispatch_trip_id trip FROM dispatch_stops ORDER BY id').all(),before);moveRouteStop(day.stops[0].id,{targetVehicleId:2,expectedRevision:day.revision},db);assert.equal(db.prepare('SELECT COUNT(*) n FROM dispatch_stops').get().n,2)})
test('UI dynamically renders jump and move controls and API enforces schedule permission',()=>{const ui=fs.readFileSync(new URL('../src/WeeklyDispatchPage.jsx',import.meta.url),'utf8'),api=fs.readFileSync(new URL('../server/index.mjs',import.meta.url),'utf8');assert.match(ui,/VehicleJumpBar/);assert.match(ui,/scrollIntoView\(\{behavior:'smooth'/);assert.match(ui,/boards\.map/);assert.doesNotMatch(ui,/QAA4293N|QAB1225B|QM3028M|QTY5028|QM630S/);assert.match(ui,/day\.status!=='draft'/);assert.match(api,/move-vehicle[\s\S]{0,180}canManageSchedules\(session\)/)})
