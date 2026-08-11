import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {DatabaseSync} from 'node:sqlite'
import {schemaSql,SCHEMA_VERSION} from '../server/schema.mjs'
import {applyV38Migration} from '../server/migrationV38.mjs'
import {setZoneDefaultVehicles} from '../server/defaultVehicleService.mjs'
import {getRouteTemplate,saveRouteTemplate} from '../server/routeTemplateService.mjs'
import {generateDay,getDispatchDay,updateStop} from '../server/dispatchService.mjs'
import {messages} from '../src/translations.js'

function fixture(){
  const db=new DatabaseSync(':memory:')
  db.exec(`PRAGMA foreign_keys=ON;${schemaSql}`)
  db.prepare("INSERT INTO vehicles(id,vehicle_code,registration_number,status,operational_status,is_temporary) VALUES(1,'Lorry 1','QAV3468','available','active',0),(2,'Lorry 2','QAA4293N','available','active',0),(3,'Sold','QTW2704','inactive','sold',0)").run()
  db.prepare("INSERT INTO customers(id,jodoo_customer_id,name) VALUES(1,'C1','Alpha')").run()
  db.prepare("INSERT INTO areas(id,jodoo_area_id,name,zone_group_id,confirmed_zone_group_id,zone_assignment_status) VALUES(20,'A20','Serian A',1,1,'confirmed'),(21,'A21','Serian B',1,1,'confirmed'),(22,'A22','New Area',1,1,'confirmed')").run()
  db.prepare("INSERT INTO branches(id,jodoo_branch_id,customer_id,area_id,branch_name,is_active,collection_frequency) VALUES(30,'B30',1,20,'Branch A',1,'Weekly'),(31,'B31',1,20,'Branch B',1,'Weekly'),(32,'B32',1,20,'New Branch X',1,'Weekly'),(33,'B33',1,21,'Branch C',1,'Weekly')").run()
  db.prepare("INSERT INTO branch_schedules(id,jodoo_schedule_id,branch_id,source_branch_id,frequency,days_of_week,is_active) VALUES(40,'S40',30,'B30','Weekly','Monday',1),(41,'S41',31,'B31','Weekly','Monday',1),(42,'S42',32,'B32','Weekly','Tuesday',1),(43,'S43',33,'B33','Weekly','Monday',1)").run()
  setZoneDefaultVehicles(1,{vehicleIds:[1,2],reason:'Serian route vehicles',changedBy:'Owner Admin'},db)
  return db
}

const templatePayload=(reason='Establish stable route')=>({reason,changedBy:'Supervisor Lee',routes:[
  {vehicleId:1,areas:[{areaId:20,branchIds:[31,30]}]},
  {vehicleId:2,areas:[{areaId:21,branchIds:[33]}]}
]})

test('v37 to v38 is explicit, additive, idempotent and creates no formal Route Template',()=>{
  const db=new DatabaseSync(':memory:')
  db.exec(`PRAGMA foreign_keys=ON;CREATE TABLE schema_meta(version INTEGER PRIMARY KEY);INSERT INTO schema_meta VALUES(37);CREATE TABLE zone_groups(id INTEGER PRIMARY KEY);CREATE TABLE areas(id INTEGER PRIMARY KEY);CREATE TABLE vehicles(id INTEGER PRIMARY KEY);CREATE TABLE branches(id INTEGER PRIMARY KEY);CREATE TABLE dispatches(id INTEGER PRIMARY KEY);CREATE TABLE dispatch_stops(id INTEGER PRIMARY KEY);CREATE TABLE zone_default_vehicles(zone_group_id INTEGER,vehicle_id INTEGER);INSERT INTO zone_groups VALUES(1);INSERT INTO areas VALUES(1);INSERT INTO vehicles VALUES(1);INSERT INTO branches VALUES(1);INSERT INTO dispatches VALUES(1);INSERT INTO dispatch_stops VALUES(1);INSERT INTO zone_default_vehicles VALUES(1,1)`)
  const first=applyV38Migration(db),second=applyV38Migration(db)
  assert.equal(first.schemaVersion,38)
  assert.equal(second.noOp,true)
  assert.deepEqual(first.before,first.after)
  assert.equal(db.prepare('SELECT COUNT(*) n FROM route_templates').get().n,0)
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok')
})

test('Zone defaults become Route Vehicles; Area and Branch order persist after refresh',()=>{
  const db=fixture()
  const saved=saveRouteTemplate(1,templatePayload(),db),refreshed=getRouteTemplate(1,db)
  assert.equal(saved.template.version,1)
  assert.deepEqual(refreshed.routes.map(route=>route.id),[1,2])
  assert.deepEqual(refreshed.routes[0].areas.map(area=>area.id),[20])
  assert.deepEqual(refreshed.routes[0].areas[0].branches.map(branch=>branch.id),[31,30])
  assert.deepEqual(refreshed.unassignedAreas.map(area=>area.id),[22])
  assert.deepEqual(refreshed.routes[0].areas[0].unplacedBranches.map(branch=>branch.id),[32])
})

test('Area may be reassigned once, while invalid vehicles and duplicate placements roll back fully',()=>{
  const db=fixture()
  saveRouteTemplate(1,templatePayload(),db)
  saveRouteTemplate(1,{reason:'Rebalance Serian',changedBy:'Owner Admin',routes:[{vehicleId:1,areas:[]},{vehicleId:2,areas:[{areaId:21,branchIds:[33]},{areaId:20,branchIds:[30,31]}]}]},db)
  assert.deepEqual(getRouteTemplate(1,db).routes[1].areas.map(area=>area.id),[21,20])
  const before=db.prepare('SELECT version FROM route_templates WHERE zone_group_id=1').get().version
  assert.throws(()=>saveRouteTemplate(1,{reason:'Invalid',changedBy:'Owner',routes:[{vehicleId:3,areas:[{areaId:20,branchIds:[30]}]}]},db),/Zone Default Vehicle/)
  assert.throws(()=>saveRouteTemplate(1,{reason:'Duplicate',changedBy:'Owner',routes:[{vehicleId:1,areas:[{areaId:20,branchIds:[30]}]},{vehicleId:2,areas:[{areaId:20,branchIds:[31]}]}]},db),/only one Route Vehicle/)
  assert.equal(db.prepare('SELECT version FROM route_templates WHERE zone_group_id=1').get().version,before)
})

test('Daily Draft uses fixed responsibility/order, skips absent Branches, and keeps duplicate protection',()=>{
  const db=fixture()
  saveRouteTemplate(1,templatePayload(),db)
  db.prepare("INSERT INTO branch_schedules(jodoo_schedule_id,branch_id,source_branch_id,frequency,days_of_week,is_active) VALUES('S44',31,'B31','Weekly','Monday',1)").run()
  generateDay({startDate:'2026-08-17'},db)
  const vehicleOne=db.prepare(`SELECT ds.branch_id branchId FROM dispatch_stops ds JOIN dispatches d ON d.id=ds.dispatch_id WHERE d.dispatch_date='2026-08-17' AND d.vehicle_id=1 ORDER BY ds.stop_sequence`).all().map(row=>row.branchId)
  const vehicleTwo=db.prepare(`SELECT ds.branch_id branchId FROM dispatch_stops ds JOIN dispatches d ON d.id=ds.dispatch_id WHERE d.dispatch_date='2026-08-17' AND d.vehicle_id=2 ORDER BY ds.stop_sequence`).all().map(row=>row.branchId)
  assert.deepEqual(vehicleOne,[31,30])
  assert.deepEqual(vehicleTwo,[33])
  assert.equal(db.prepare("SELECT COUNT(*) n FROM dispatch_stops ds JOIN dispatches d ON d.id=ds.dispatch_id WHERE d.dispatch_date='2026-08-17' AND ds.branch_id=31").get().n,1)
})

test('Daily override and later template edits never rewrite the long-term template or historical Dispatch',()=>{
  const db=fixture()
  saveRouteTemplate(1,templatePayload(),db)
  generateDay({startDate:'2026-08-17'},db)
  const day=getDispatchDay('2026-08-17',db),stop=day.stops.find(item=>item.branchId==='B31'),historicalCount=db.prepare('SELECT COUNT(*) n FROM dispatch_stops').get().n
  updateStop(stop.id,{date:'2026-08-17',vehicleId:2,tripNumber:1,changedBy:'Supervisor'},db)
  assert.deepEqual(getRouteTemplate(1,db).routes[0].areas[0].branches.map(branch=>branch.id),[31,30])
  saveRouteTemplate(1,{reason:'Permanent route change',changedBy:'Owner Admin',routes:[{vehicleId:1,areas:[{areaId:20,branchIds:[30,31]}]},{vehicleId:2,areas:[{areaId:21,branchIds:[33]}]}]},db)
  assert.equal(db.prepare('SELECT COUNT(*) n FROM dispatch_stops').get().n,historicalCount)
  assert.equal(db.prepare('SELECT vehicle_id FROM dispatches WHERE id=(SELECT dispatch_id FROM dispatch_stops WHERE id=?)').get(stop.id).vehicle_id,2)
})

test('Route Template audit preserves reason, actor and complete before/after',()=>{
  const db=fixture()
  saveRouteTemplate(1,templatePayload('Supervisor approved fixed route'),db)
  const audit=db.prepare("SELECT * FROM master_change_history WHERE entity_type='route_template'").get()
  assert.equal(audit.changed_by,'Supervisor Lee')
  assert.equal(audit.reason,'Supervisor approved fixed route')
  assert.deepEqual(JSON.parse(audit.before_json),{routes:[{vehicleId:1,areas:[]},{vehicleId:2,areas:[]}]})
  assert.equal(JSON.parse(audit.after_json).routes[0].areas[0].branchIds[0],31)
})

test('Session permission, mobile fallback controls and trilingual labels are wired without English Malay fallback',()=>{
  assert.equal(SCHEMA_VERSION,38)
  const api=fs.readFileSync(new URL('../server/index.mjs',import.meta.url),'utf8'),ui=fs.readFileSync(new URL('../src/ZoneGroupManager.jsx',import.meta.url),'utf8')
  assert.match(api,/route-template/)
  assert.match(api,/canManageSchedules\(session\)/)
  for(const token of ['routeTemplate.up','routeTemplate.down','routeTemplate.updated','formatBranchId'])assert.match(ui,new RegExp(token.replace('.','\\.')))
  const keys=['title','manage','assignedVehicle','areaOrder','branchOrder','unassignedArea','notPlaced','up','down','update','updated']
  for(const language of ['en','ms','zh'])for(const key of keys)assert.ok(messages[language][`routeTemplate.${key}`])
  for(const key of keys)assert.notEqual(messages.ms[`routeTemplate.${key}`],messages.en[`routeTemplate.${key}`])
})
