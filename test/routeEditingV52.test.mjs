import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {DatabaseSync} from 'node:sqlite'
import {schemaSql} from '../server/schema.mjs'
import {applyV52Migration} from '../server/migrationV52.mjs'
import {generateDay,getDispatchDay,renameRoute,reorderRouteStop} from '../server/dispatchService.mjs'
import {installWeeklyRoutePlan} from '../server/weeklyRoutePlanService.mjs'

function fixture(){
  const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON;'+schemaSql)
  db.prepare("INSERT INTO customers(jodoo_customer_id,name) VALUES('C1','Customer')").run()
  db.prepare("INSERT INTO branches(jodoo_branch_id,customer_id,branch_name,collection_frequency,assigned_weekdays) VALUES('B1',1,'First','Weekly','[\"Monday\"]'),('B2',1,'Second','Weekly','[\"Monday\"]'),('B3',1,'Third','Weekly','[\"Monday\"]')").run()
  db.prepare("INSERT INTO branch_schedules(jodoo_schedule_id,branch_id,source_branch_id,frequency,days_of_week) VALUES('S1',1,'B1','Weekly','Monday'),('S2',2,'B2','Weekly','Monday'),('S3',3,'B3','Weekly','Monday')").run()
  installWeeklyRoutePlan({name:'Routes',sourceName:'test',entries:[[1,'AAA1',1,1,'B1','',''],[1,'AAA1',1,2,'B2','',''],[1,'AAA1',1,3,'B3','','']]},{},db)
  return db
}

test('Route name is editable and persists in every day board',()=>{const db=fixture();generateDay({startDate:'2026-09-07'},db);renameRoute(1,{name:'Samarahan Route',changedBy:'Planner'},db);assert.equal(getDispatchDay('2026-09-07',db).routeBoards[0].name,'Samarahan Route');assert.throws(()=>renameRoute(2,{name:'Samarahan Route'},db),/already used/)})

test('moving a customer changes this weekday template and future editable Mondays',()=>{const db=fixture();generateDay({startDate:'2026-09-07'},db);generateDay({startDate:'2026-09-14'},db);let day=getDispatchDay('2026-09-07',db),third=day.routeBoards[0].stops[2];reorderRouteStop('2026-09-07',1,{stopId:third.id,direction:'up',changedBy:'Planner'},db);assert.deepEqual(getDispatchDay('2026-09-07',db).routeBoards[0].stops.map(row=>row.branchId),['B1','B3','B2']);assert.deepEqual(getDispatchDay('2026-09-14',db).routeBoards[0].stops.map(row=>row.branchId),['B1','B3','B2']);db.prepare("UPDATE dispatch_days SET status='approved' WHERE dispatch_date='2026-09-07'").run();day=getDispatchDay('2026-09-07',db);assert.throws(()=>reorderRouteStop('2026-09-07',1,{stopId:day.routeBoards[0].stops[1].id,direction:'up'},db),/protected/)})

test('v52 migration is additive and idempotent',()=>{const db=fixture();db.exec('DROP TABLE weekly_route_definitions;DELETE FROM schema_meta;INSERT INTO schema_meta(version) VALUES(51)');const first=applyV52Migration(db),second=applyV52Migration(db);assert.equal(first.schemaVersion,52);assert.equal(second.noOp,true);assert.equal(db.prepare('SELECT COUNT(*) n FROM weekly_route_definitions').get().n,1);assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok')})

test('API and planner expose rename and move controls',()=>{const server=fs.readFileSync(new URL('../server/index.mjs',import.meta.url),'utf8'),ui=fs.readFileSync(new URL('../src/WeeklyDispatchPage.jsx',import.meta.url),'utf8');assert.match(server,/dispatch\\\/routes/);assert.match(server,/reorderRouteStop/);const customerList=fs.readFileSync(new URL('../src/RouteCustomerList.jsx',import.meta.url),'utf8');assert.match(ui,/改名/);for(const label of ['上移','下移'])assert.match(customerList,new RegExp(label))})
