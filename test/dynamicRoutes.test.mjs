import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {ensureV28Schema} from '../server/migrationV28.mjs'
import {applyV64Migration} from '../server/migrationV64.mjs'
import {schemaSql} from '../server/schema.mjs'
import {applyV86Migration} from '../server/migrationV86.mjs'
import {createRoute,listRoutes,routeExists} from '../server/routeCatalog.mjs'
import {syncScheduleRouteRows} from '../server/routeSchedulePlanning.mjs'
import {driverToday,generateDay,getDispatchDay,assignRouteVehicle,routeApprovalCheck,approveRoute,renameRoute} from '../server/dispatchService.mjs'

function fixture(legacy=false){
 const db=new DatabaseSync(':memory:')
 db.exec('PRAGMA foreign_keys=ON;'+(legacy?schemaSql.replace(/CHECK\(((?:home_|sunday_)?route_number) >= 1\)/g,'CHECK($1 BETWEEN 1 AND 5)'):schemaSql))
 db.exec(`INSERT INTO schema_meta(version) VALUES(85);
 INSERT INTO customers(id,jodoo_customer_id,name) VALUES(1,'C1','Customer');
 INSERT INTO branches(id,jodoo_branch_id,customer_id,branch_name,collection_frequency,assigned_weekdays,latitude,longitude) VALUES(1,'B1',1,'First','Weekly','["Monday"]',1,1);
 INSERT INTO branch_schedules(jodoo_schedule_id,branch_id,source_branch_id,frequency,days_of_week) VALUES('S1',1,'B1','Weekly','Monday');
 INSERT INTO vehicles(id,vehicle_code,registration_number,status,operational_status) VALUES(1,'Lorry 1','QAV3468','available','active');
 INSERT INTO employees(employee_code,name,job_role,employment_status,is_active) VALUES('D1','Driver One','Driver','active',1);
 INSERT INTO weekly_route_plans(id,name,source_name,created_by) VALUES(1,'Test','Test','Tester');
 INSERT INTO weekly_route_definitions(plan_id,route_number,display_name,updated_by) VALUES(1,1,'Old route','Tester');
 INSERT INTO weekly_route_plan_stops(plan_id,weekday,branch_id,vehicle_registration_number,trip_number,stop_sequence,route_number) VALUES(1,1,1,'QAV3468',1,1,1);`)
 ensureV28Schema(db);applyV64Migration(db)
 return db
}

test('legacy migration preserves rows, indexes, triggers, foreign keys and sequences; runs once',()=>{
 const db=fixture(true)
 try{
  generateDay({startDate:'2026-11-09'},db)
  db.exec(`CREATE VIEW route_test_view AS SELECT id,route_number FROM dispatch_stops;
  CREATE INDEX route_test_index ON dispatch_stops(route_number);
  CREATE TRIGGER route_test_trigger AFTER UPDATE OF route_number ON dispatch_stops BEGIN SELECT 1; END;
  UPDATE sqlite_sequence SET seq=1000 WHERE name='dispatch_stops';`)
  const names=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name<>'schema_meta'").all().map(r=>r.name)
  const before=new Map(names.map(name=>[name,db.prepare(`SELECT * FROM "${name}"`).all()]))
  const migrated=applyV86Migration(db)
  assert.ok(migrated.rebuilt.includes('dispatch_stops'))
  for(const name of names)assert.deepEqual(db.prepare(`SELECT * FROM "${name}"`).all(),before.get(name),name)
  assert.equal(db.prepare("SELECT seq FROM sqlite_sequence WHERE name='dispatch_stops'").get().seq,1000)
  for(const name of ['route_test_view','route_test_index','route_test_trigger'])assert.ok(db.prepare('SELECT 1 FROM sqlite_master WHERE name=?').get(name))
  assert.equal(db.prepare('SELECT COUNT(*) n FROM route_test_view').get().n,1)
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[])
  assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys,1)
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok')
  assert.equal(applyV86Migration(db).noOp,true)
  assert.equal(createRoute(db,{name:'Sixth'}).routeNumber,6)
 }finally{db.close()}
})

test('new fixed route accepts first customer, generates and assigns without granting approval',()=>{
 const db=fixture()
 try{
  const six=createRoute(db,{name:'New fixed route',changedBy:'Supervisor'})
  assert.equal(six.routeNumber,6)
  assert.equal(listRoutes(db).length,6)
  assert.throws(()=>createRoute(db,{name:' new FIXED route '}),/ROUTE_NAME_EXISTS/)
  assert.throws(()=>createRoute(db,{name:' '}),/ROUTE_NAME_INVALID/)
  assert.equal(routeExists(db,99),false)
  syncScheduleRouteRows(db,1,{weekdays:['Monday'],recurrenceType:'weekly',sundayRouteNumber:null},6)
  assert.equal(db.prepare('SELECT route_number FROM weekly_route_plan_stops WHERE branch_id=1').get().route_number,6)
  generateDay({startDate:'2026-11-09'},db)
  let route=getDispatchDay('2026-11-09',db).routeBoards.find(r=>r.routeNumber===6)
  assert.equal(route.customerCount,1);assert.equal(route.vehicleId,null);assert.equal(route.approvalStatus,'pending')
  assert.equal(routeApprovalCheck('2026-11-09',6,db).ok,false)
  assignRouteVehicle('2026-11-09',6,{vehicleId:1},db)
  assert.equal(routeApprovalCheck('2026-11-09',6,db).ok,true)
  db.exec('UPDATE dispatches SET driver_id=1 WHERE vehicle_id=1')
  approveRoute('2026-11-09',6,{approvedBy:'Supervisor'},db)
  route=getDispatchDay('2026-11-09',db).routeBoards.find(r=>r.routeNumber===6)
  assert.equal(route.approvalStatus,'approved')
  const mobile=driverToday({employeeId:1,role:'driver',today:'2026-11-09'},db)
  assert.equal(mobile.totalStops,1);assert.equal(mobile.routeAvailable,true)
  assert.equal(mobile.trips[0].stops[0].routeNumber,6)
  renameRoute(6,{name:'New name'},db)
  assert.equal(listRoutes(db).at(-1).name,'New name')
  assert.equal(createRoute(db,{name:'Seventh'}).routeNumber,7)
  assert.equal(routeApprovalCheck('2026-11-09',99,db).ok,false)
 }finally{db.close()}
})

test('first unscheduled branch can join an empty route, with no guessed vehicle and invalid routes roll back',()=>{
 const db=fixture()
 try{
  createRoute(db,{name:'Empty route'})
  db.exec("INSERT INTO branches(id,jodoo_branch_id,customer_id,branch_name) VALUES(2,'B2',1,'New customer')")
  syncScheduleRouteRows(db,2,{weekdays:['Tuesday','Friday'],recurrenceType:'weekly',sundayRouteNumber:null},6)
  assert.deepEqual(db.prepare('SELECT weekday,route_number FROM weekly_route_plan_stops WHERE branch_id=2 ORDER BY weekday').all().map(r=>({...r})),[{weekday:2,route_number:6},{weekday:5,route_number:6}])
  const before=db.prepare('SELECT * FROM weekly_route_plan_stops').all()
  assert.throws(()=>syncScheduleRouteRows(db,2,{weekdays:['Monday'],recurrenceType:'weekly'},99),/Invalid Route/)
  assert.deepEqual(db.prepare('SELECT * FROM weekly_route_plan_stops').all(),before)
  assert.equal(db.prepare('SELECT COUNT(*) n FROM daily_route_assignments').get().n,0)
  assert.equal(db.prepare('SELECT COUNT(*) n FROM daily_route_approvals').get().n,0)
 }finally{db.close()}
})

test('failed route audit rolls back route creation',()=>{
 const db=fixture()
 try{
  db.exec("CREATE TRIGGER reject_route_audit BEFORE INSERT ON master_change_history WHEN NEW.change_type='CREATE' BEGIN SELECT RAISE(ABORT,'audit unavailable'); END")
  assert.throws(()=>createRoute(db,{name:'Not saved'}),/audit unavailable/)
  assert.equal(listRoutes(db).length,5)
 }finally{db.close()}
})
