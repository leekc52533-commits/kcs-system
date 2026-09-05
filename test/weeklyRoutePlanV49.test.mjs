import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {schemaSql} from '../server/schema.mjs'
import {applyV49Migration} from '../server/migrationV49.mjs'
import {installWeeklyRoutePlan,validateWeeklyRoutePlan} from '../server/weeklyRoutePlanService.mjs'
import {KCS_WEEKLY_ROUTE_PLAN_V49} from '../server/weeklyRoutePlanV49Data.mjs'
import {generateDay,getDispatchDay} from '../server/dispatchService.mjs'

const smallPlan={name:'Test weekday plan',sourceName:'test.xlsx',sourceStartDate:'2026-09-07',entries:[[1,'ABC1',1,2,'B1','Zone','North'],[1,'QM3028M',1,1,'B2','Zone','North']]}

function fixture(){
  const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON;'+schemaSql)
  db.prepare("INSERT INTO areas(jodoo_area_id,name) VALUES('A1','North')").run()
  db.prepare("INSERT INTO customers(jodoo_customer_id,name) VALUES('C1','Alpha')").run()
  db.prepare("INSERT INTO branches(jodoo_branch_id,customer_id,area_id,branch_name) VALUES('B1',1,1,'One'),('B2',1,1,'Two')").run()
  db.prepare("INSERT INTO branch_schedules(jodoo_schedule_id,branch_id,source_branch_id,frequency,days_of_week) VALUES('S1',1,'B1','Weekly','Monday'),('S2',2,'B2','Weekly','Monday')").run()
  db.prepare("INSERT INTO vehicles(vehicle_code,registration_number,status,operational_status,is_temporary) VALUES('Truck 1','ABC1','available','active',0)").run()
  return db
}

test('v49 migration is additive and idempotent',()=>{
  const db=fixture();db.prepare('INSERT INTO schema_meta(version) VALUES(48)').run()
  const first=applyV49Migration(db),second=applyV49Migration(db)
  assert.equal(first.schemaVersion,49);assert.deepEqual(first.before,first.after);assert.equal(second.noOp,true)
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok')
})

test('approved workbook contains 691 valid weekday route entries',()=>{
  const result=validateWeeklyRoutePlan(KCS_WEEKLY_ROUTE_PLAN_V49)
  assert.equal(result.entryCount,691);assert.equal(result.branchCount,328);assert.deepEqual(result.vehiclePlates,['QAA4293N','QAB1225B','QM3028M','QM630S','QTY5028'])
  assert.equal(result.entries.filter(item=>item.plate==='QM3028M').length,137)
})

test('all 691 workbook rows import atomically when their 328 Branch IDs exist',()=>{
  const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON;'+schemaSql)
  const codes=[...new Set(KCS_WEEKLY_ROUTE_PLAN_V49.entries.map(item=>item[4]))],insert=db.prepare('INSERT INTO branches(jodoo_branch_id,branch_name) VALUES(?,?)')
  for(const code of codes)insert.run(code,code)
  const result=installWeeklyRoutePlan(KCS_WEEKLY_ROUTE_PLAN_V49,{changedBy:'Owner'},db)
  assert.equal(result.entryCount,691);assert.equal(result.branchCount,328);assert.equal(db.prepare('SELECT COUNT(*) n FROM weekly_route_plan_stops').get().n,691)
  assert.deepEqual(result.pendingVehiclePlates,['QAA4293N','QAB1225B','QM3028M','QM630S','QTY5028'])
  assert.equal(db.prepare('PRAGMA foreign_key_check').get(),undefined)
})

test('weekday plan assigns an available plate and holds a missing plate unassigned until added',()=>{
  const db=fixture(),installed=installWeeklyRoutePlan(smallPlan,{changedBy:'Owner'},db)
  assert.deepEqual(installed.pendingVehiclePlates,['QM3028M'])
  generateDay({startDate:'2026-09-07'},db)
  let day=getDispatchDay('2026-09-07',db)
  assert.equal(day.stops.find(stop=>stop.branchId==='B1').vehicleId,1)
  assert.equal(day.stops.find(stop=>stop.branchId==='B1').stopSequence,1)
  assert.equal(day.stops.find(stop=>stop.branchId==='B2').vehicleId,null)
  db.prepare("INSERT INTO vehicles(vehicle_code,registration_number,status,operational_status,is_temporary) VALUES('Truck 2','QM 3028 M','available','active',0)").run()
  generateDay({startDate:'2026-09-07'},db)
  day=getDispatchDay('2026-09-07',db)
  assert.equal(day.stops.find(stop=>stop.branchId==='B2').vehicleId,2)
  assert.equal(day.stops.find(stop=>stop.branchId==='B2').stopSequence,1)
})

test('route refresh does not change a protected day',()=>{
  const db=fixture();installWeeklyRoutePlan(smallPlan,{},db);generateDay({startDate:'2026-09-07'},db)
  const before=db.prepare('SELECT dispatch_id,stop_sequence FROM dispatch_stops WHERE branch_id=1').get()
  db.prepare("UPDATE dispatch_days SET status='approved' WHERE dispatch_date='2026-09-07'").run()
  db.prepare("UPDATE vehicles SET registration_number='CHANGED'").run()
  const result=generateDay({startDate:'2026-09-07'},db),after=db.prepare('SELECT dispatch_id,stop_sequence FROM dispatch_stops WHERE branch_id=1').get()
  assert.deepEqual({...after},{...before});assert.equal(result.protectedDays.length,1)
})
