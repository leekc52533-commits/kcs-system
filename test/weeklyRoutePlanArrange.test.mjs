import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {schemaSql} from '../server/schema.mjs'
import {KCS_WEEKLY_ROUTE_PLAN_ARRANGE} from '../server/weeklyRoutePlanArrangeData.mjs'
import {KCS_WEEKLY_ROUTE_PLAN_V49} from '../server/weeklyRoutePlanV49Data.mjs'
import {USER_CONFIRMED_OVERRIDES} from '../server/weeklyRoutePlanV50Service.mjs'
import {inspectWeeklyRoutePlan,installWeeklyRoutePlan,validateWeeklyRoutePlan} from '../server/weeklyRoutePlanService.mjs'
import {generateDay,getDispatchDay} from '../server/dispatchService.mjs'
import {SUNDAY_ROUTE_ALTERNATION,sundayRoutePlateForDate} from '../server/weeklyRouteAlternation.mjs'

const counts={QAA4293N:[0,15,19,17,20,18,13],QAB1225B:[0,27,27,24,26,29,25],QM3028M:[4,23,21,22,21,22,24],QM630S:[8,19,22,29,16,19,20],QTY5028:[13,24,23,19,19,19,18]}

test('vehicle-sheet Arrange columns produce the exact 665-stop plan',()=>{
  const checked=validateWeeklyRoutePlan(KCS_WEEKLY_ROUTE_PLAN_ARRANGE)
  assert.equal(KCS_WEEKLY_ROUTE_PLAN_ARRANGE.sourceName,'KCS_7Day_5Vehicle_Route_Plan(2).xlsx [vehicle sheets Arrange + confirmed Sunday alternation]')
  assert.equal(checked.entryCount,665);assert.equal(checked.branchCount,317)
  for(const [plate,expected] of Object.entries(counts))assert.deepEqual([0,1,2,3,4,5,6].map(weekday=>checked.entries.filter(row=>row.plate===plate&&row.weekday===weekday).length),expected)
  const monday=checked.entries.filter(row=>row.plate==='QM630S'&&row.weekday===1).sort((a,b)=>a.sequence-b.sequence)
  assert.equal(monday.length,19);assert.equal(monday[0].branchCode,'B10419');assert.equal(monday[6].branchCode,'B10071');assert.equal(monday[18].branchCode,'B10170')
  const sunday=checked.entries.filter(row=>row.plate==='QTY5028'&&row.weekday===0).sort((a,b)=>a.sequence-b.sequence)
  assert.deepEqual(sunday.map(row=>row.branchCode),SUNDAY_ROUTE_ALTERNATION.branchCodes)
})

test('the complete 13-stop Sunday route alternates weekly between QTY5028 and QAA4293N',()=>{
  assert.equal(sundayRoutePlateForDate('2026-09-06'),'QTY5028')
  assert.equal(sundayRoutePlateForDate('2026-09-13'),'QAA4293N')
  assert.equal(sundayRoutePlateForDate('2026-09-20'),'QTY5028')
  const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON;'+schemaSql)
  db.prepare("INSERT INTO customers(jodoo_customer_id,name) VALUES('C1','Sunday')").run()
  db.prepare("INSERT INTO branches(jodoo_branch_id,customer_id,branch_name,collection_frequency,assigned_weekdays) VALUES('B10151',1,'First','Once a week','[\"Sunday\"]'),('B10204',1,'Fifth','Once a week','[\"Sunday\"]')").run()
  db.prepare("INSERT INTO branch_schedules(jodoo_schedule_id,branch_id,source_branch_id,frequency,days_of_week) VALUES('S1',1,'B10151','Once a week','Sunday'),('S2',2,'B10204','Once a week','Sunday')").run()
  db.prepare("INSERT INTO vehicles(vehicle_code,registration_number,status,operational_status,is_temporary) VALUES('Lorry 2','QAA4293N','available','active',0),('Lorry 5','QTY5028','available','active',0)").run()
  installWeeklyRoutePlan({name:'Sunday alternating route',sourceName:'confirmed',entries:[[0,'QTY5028',1,1,'B10151','',''],[0,'QTY5028',1,2,'B10204','','']]},{},db)
  for(const [date,plate] of [['2026-09-06','QTY5028'],['2026-09-13','QAA4293N'],['2026-09-20','QTY5028']]){
    generateDay({startDate:date},db)
    const day=getDispatchDay(date,db),board=day.vehicleBoards.find(row=>row.registrationNumber===plate)
    assert.deepEqual(board.slots.flatMap(slot=>slot.stops).map(stop=>stop.branchId),['B10151','B10204'])
    assert.equal(day.vehicleBoards.filter(row=>row.registrationNumber!==plate).flatMap(row=>row.slots).flatMap(slot=>slot.stops).length,0)
  }
})

test('confirmed duplicate allocations and the future Lorry 4 plan are preserved',()=>{
  const checked=validateWeeklyRoutePlan(KCS_WEEKLY_ROUTE_PLAN_ARRANGE)
  for(const [key,plate] of USER_CONFIRMED_OVERRIDES){const [weekday,branchCode]=key.split(':');assert.equal(checked.entries.find(row=>row.weekday===Number(weekday)&&row.branchCode===branchCode)?.plate,plate)}
  assert.equal(checked.entries.filter(row=>row.weekday===1&&row.branchCode==='B10136'&&row.plate==='QAA4293N').length,1)
  assert.equal(checked.entries.find(row=>row.weekday===1&&row.branchCode==='B10426')?.plate,'QTY5028')
  assert.equal(checked.entries.find(row=>row.weekday===1&&row.branchCode==='B10289')?.plate,'QTY5028')
  assert.equal(checked.entries.find(row=>row.weekday===3&&row.branchCode==='B10198')?.plate,'QTY5028')
  const sort=(a,b)=>a[0]-b[0]||a[2]-b[2]||a[3]-b[3]
  const l4=checked.entries.filter(row=>row.plate==='QM3028M').map(row=>[row.weekday,row.plate,row.trip,row.sequence,row.branchCode,row.zoneName,row.areaName]).sort(sort)
  assert.deepEqual(l4,KCS_WEEKLY_ROUTE_PLAN_V49.entries.filter(row=>row[1]==='QM3028M').toSorted(sort))
})

test('Arrange plan replaces the previous plan atomically and is idempotent',()=>{
  const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON;'+schemaSql)
  const codes=[...new Set([...KCS_WEEKLY_ROUTE_PLAN_V49.entries,...KCS_WEEKLY_ROUTE_PLAN_ARRANGE.entries].map(row=>row[4]))],insert=db.prepare('INSERT INTO branches(jodoo_branch_id,branch_name) VALUES(?,?)')
  for(const code of codes)insert.run(code,code)
  installWeeklyRoutePlan(KCS_WEEKLY_ROUTE_PLAN_V49,{},db)
  const installed=installWeeklyRoutePlan(KCS_WEEKLY_ROUTE_PLAN_ARRANGE,{changedBy:'Owner Admin'},db)
  assert.equal(installed.noOp,false);assert.equal(installed.entryCount,665);assert.equal(inspectWeeklyRoutePlan(KCS_WEEKLY_ROUTE_PLAN_ARRANGE,db).matchesExact,true)
  assert.equal(installWeeklyRoutePlan(KCS_WEEKLY_ROUTE_PLAN_ARRANGE,{},db).noOp,true)
  assert.equal(db.prepare('PRAGMA foreign_key_check').get(),undefined)
})

test('daily refresh keeps non-plan stops but removes them from arranged vehicles',()=>{
  const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON;'+schemaSql)
  db.prepare("INSERT INTO areas(jodoo_area_id,name) VALUES('A1','North')").run()
  db.prepare("INSERT INTO customers(jodoo_customer_id,name) VALUES('C1','Alpha')").run()
  db.prepare("INSERT INTO branches(jodoo_branch_id,customer_id,area_id,branch_name) VALUES('B1',1,1,'Arranged'),('BX',1,1,'Extra')").run()
  db.prepare("INSERT INTO branch_schedules(jodoo_schedule_id,branch_id,source_branch_id,frequency,days_of_week) VALUES('S1',1,'B1','Weekly','Monday'),('SX',2,'BX','Weekly','Monday')").run()
  db.prepare("INSERT INTO vehicles(vehicle_code,registration_number,status,operational_status,is_temporary) VALUES('Truck 1','ABC1','available','active',0)").run()
  db.prepare('UPDATE areas SET default_vehicle_id=1 WHERE id=1').run()
  installWeeklyRoutePlan({name:'Arrange test',sourceName:'test.xlsx',entries:[[1,'ABC1',1,1,'B1','Zone','North']]},{},db)
  generateDay({startDate:'2026-09-07'},db)
  const day=getDispatchDay('2026-09-07',db),vehicle=day.vehicleBoards.find(row=>row.registrationNumber==='ABC1')
  assert.deepEqual(vehicle.slots.flatMap(slot=>slot.stops).map(stop=>stop.branchId),['B1'])
  assert.deepEqual(day.unassignedStops.map(stop=>stop.branchId),['BX'])
})
