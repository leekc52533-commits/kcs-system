import test from 'node:test'
import assert from 'node:assert/strict'
import {reconcileRouteRows,ROUTE_PLATES,USER_CONFIRMED_OVERRIDES} from '../server/weeklyRoutePlanV50Service.mjs'

test('reconciliation deterministically applies unique candidates and audits conflicts, omissions and extras',()=>{
  const canonical=[
    {stopId:1,weekday:1,branchCode:'B1',plate:ROUTE_PLATES.L2,sequence:9},
    {stopId:2,weekday:1,branchCode:'B2',plate:ROUTE_PLATES.L3,sequence:8},
    {stopId:3,weekday:1,branchCode:'B3',plate:ROUTE_PLATES.L4,sequence:7}
  ]
  const candidates=[
    {weekday:1,branchCode:'B1',plate:ROUTE_PLATES.L5,sequence:1},
    {weekday:1,branchCode:'B2',plate:ROUTE_PLATES.L3,sequence:2},
    {weekday:1,branchCode:'B2',plate:ROUTE_PLATES.L6,sequence:3},
    {weekday:1,branchCode:'B3',plate:ROUTE_PLATES.L2,sequence:4},
    {weekday:1,branchCode:'NEW',plate:ROUTE_PLATES.L2,sequence:5}
  ]
  const result=reconcileRouteRows(canonical,candidates,{confirmed:false})
  assert.equal(result.rows.length,3)
  assert.equal(result.report.extras.length,1)
})

import {DatabaseSync} from 'node:sqlite'
import {schemaSql} from '../server/schema.mjs'
import {installWeeklyRoutePlan} from '../server/weeklyRoutePlanService.mjs'
import {KCS_WEEKLY_ROUTE_PLAN_V49} from '../server/weeklyRoutePlanV49Data.mjs'
import {applyWeeklyRoutePlanV50} from '../server/weeklyRoutePlanV50Service.mjs'

import crypto from 'node:crypto'
import {RAW_CANDIDATE_COUNT,KCS_WEEKLY_ROUTE_PLAN_V50_CANDIDATES} from '../server/weeklyRoutePlanV50CandidateData.mjs'

const sha=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')
const realFixture=()=>{
  const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON;'+schemaSql)
  const insert=db.prepare('INSERT INTO branches(jodoo_branch_id,branch_name) VALUES(?,?)')
  for(const code of new Set([...KCS_WEEKLY_ROUTE_PLAN_V49.entries.map(x=>x[4]),...KCS_WEEKLY_ROUTE_PLAN_V50_CANDIDATES.map(x=>x.branchCode)]))insert.run(code,code)
  installWeeklyRoutePlan(KCS_WEEKLY_ROUTE_PLAN_V49,{},db);db.prepare('INSERT INTO schema_meta(version) VALUES(50)').run();return db
}

test('complete Excel transcription and reconciliation output are stable',()=>{
  assert.equal(RAW_CANDIDATE_COUNT,552);assert.equal(KCS_WEEKLY_ROUTE_PLAN_V50_CANDIDATES.length,551)
  assert.equal(KCS_WEEKLY_ROUTE_PLAN_V50_CANDIDATES.filter(x=>x.weekday===1&&x.branchCode==='B10136'&&x.plate===ROUTE_PLATES.L2).length,1)
  assert.equal(KCS_WEEKLY_ROUTE_PLAN_V50_CANDIDATES.find(x=>x.weekday===1&&x.branchCode==='B10136'&&x.plate===ROUTE_PLATES.L2).sequence,12)
  for(const [branch,days] of Object.entries({B10108:[1,3],B10059:[1,3],B10207:[1,3,5]}))assert.deepEqual(KCS_WEEKLY_ROUTE_PLAN_V50_CANDIDATES.filter(x=>x.branchCode===branch&&x.plate===ROUTE_PLATES.L6).map(x=>x.weekday),days)
  const db=realFixture(),dry=applyWeeklyRoutePlanV50(KCS_WEEKLY_ROUTE_PLAN_V50_CANDIDATES,{},db)
  assert.equal(dry.changed,501);assert.equal(dry.inserted,7);assert.equal(dry.moved,9);assert.equal(dry.beforeRoutesUnchanged,true)
  assert.deepEqual([dry.report.conflicts.length,dry.report.omissions.length,dry.report.extras.length],[23,170,0])
  assert.ok(dry.report.conflicts.every(x=>x.resolution==='user-confirmed-override'))
  assert.equal(sha(dry.report),'3cac5b4d43218abccd8b943531898cc3605b5f0a6c1dd3c4d1476fbe294ed494')
  applyWeeklyRoutePlanV50(KCS_WEEKLY_ROUTE_PLAN_V50_CANDIDATES,{apply:true},db)
  const rows=db.prepare('SELECT s.rowid id,s.weekday,b.jodoo_branch_id branch,s.vehicle_registration_number plate,s.trip_number trip,s.stop_sequence sequence FROM weekly_route_plan_stops s JOIN branches b ON b.id=s.branch_id ORDER BY s.rowid').all()
  assert.equal(rows.length,698);assert.equal(new Set(rows.map(x=>x.id)).size,698);assert.equal(new Set(rows.map(x=>`${x.weekday}:${x.branch}`)).size,698);assert.equal(new Set(rows.map(x=>`${x.weekday}:${x.plate}:${x.trip}:${x.sequence}`)).size,698)
  assert.equal(rows.filter(x=>x.plate===ROUTE_PLATES.L4).length,137);
  assert.equal(USER_CONFIRMED_OVERRIDES.size,23);for(const [routeKey,plate] of USER_CONFIRMED_OVERRIDES){const [weekday,branch]=routeKey.split(':');assert.equal(rows.find(x=>x.weekday===Number(weekday)&&x.branch===branch)?.plate,plate)}assert.equal(rows.filter(x=>x.plate==='QAV3468').length,0)
  const counts=Object.fromEntries(Object.values(ROUTE_PLATES).map(plate=>[plate,[0,1,2,3,4,5,6].map(day=>rows.filter(x=>x.plate===plate&&x.weekday===day).length)]))
  assert.deepEqual(counts,{QAA4293N:[1,15,19,17,20,18,13],QAB1225B:[2,27,27,24,27,29,25],QM3028M:[4,23,21,22,21,22,24],QTY5028:[17,26,23,19,19,19,21],QM630S:[8,22,26,31,19,24,23]})
  assert.equal(sha(rows),'4ebff0e186e013f7bb363368bbca542f7441222f30e386b0f7ebeeed30b66155')
  assert.deepEqual(Object.fromEntries([['B10242',572],['B10373',574],['B10438',576],['B10071',204],['B10058',206],['B10320',208],['B10049',209],['B10113',218],['B10074',219]].map(([branch])=>[branch,rows.find(x=>x.branch===branch&&((['B10242','B10373','B10438'].includes(branch)&&x.weekday===2)||x.weekday===3))?.id])),{B10242:572,B10373:574,B10438:576,B10071:204,B10058:206,B10320:208,B10049:209,B10113:218,B10074:219})
  assert.equal(rows.filter(x=>x.id>691).length,7)
  const second=applyWeeklyRoutePlanV50(KCS_WEEKLY_ROUTE_PLAN_V50_CANDIDATES,{apply:true},db);assert.equal(second.noOp,true);assert.equal(second.changed,0);assert.equal(second.inserted,0);assert.equal(second.moved,0)
})


test('confirmed additions roll back moves and inserts when one insert fails',()=>{
  const db=realFixture(),before=JSON.stringify(db.prepare('SELECT * FROM weekly_route_plan_stops ORDER BY rowid').all())
  db.exec("CREATE TRIGGER fail_v50_add BEFORE INSERT ON weekly_route_plan_stops BEGIN SELECT RAISE(ABORT,'injected failure'); END")
  assert.throws(()=>applyWeeklyRoutePlanV50(KCS_WEEKLY_ROUTE_PLAN_V50_CANDIDATES,{apply:true},db),/injected failure/)
  assert.equal(JSON.stringify(db.prepare('SELECT * FROM weekly_route_plan_stops ORDER BY rowid').all()),before)
})
