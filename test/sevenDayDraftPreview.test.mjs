import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {DatabaseSync} from 'node:sqlite'
import {schemaSql} from '../server/schema.mjs'
import {generateWeek} from '../server/dispatchService.mjs'
import {listBranchServiceDateConflicts} from '../server/branchServiceDateGuard.mjs'

function fixture(){
  const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON;'+schemaSql)
  db.exec(`
    INSERT INTO customers(jodoo_customer_id,name,is_active) VALUES('C1','Customer',1);
    INSERT INTO branches(jodoo_branch_id,customer_id,branch_name,status,is_active,latitude,longitude,time_restriction,collection_frequency)
      VALUES('B1',1,'Missing GPS Branch','active',1,NULL,NULL,'Before 10:00','Weekly'),('B2',1,'Missing Weight Branch','active',1,1.55,110.35,NULL,'Weekly'),('B3',1,'Inactive Branch','inactive',0,1.55,110.35,NULL,'Weekly'),('B4',1,'Superseded Schedule Branch','active',1,1.55,110.35,NULL,'Weekly');
    INSERT INTO branch_schedules(jodoo_schedule_id,branch_id,source_branch_id,frequency,days_of_week,is_active)
      VALUES('S1',1,'B1','Weekly','Monday',1),('S2',2,'B2','Weekly','Monday',1),('S3',3,'B3','Weekly','Monday',1),('S4',4,'B4','Weekly','Monday',0);
    INSERT INTO weekly_dispatch_plans(week_start,generated_by) VALUES('2026-07-01','Fixture');
    INSERT INTO dispatch_days(weekly_plan_id,dispatch_date,status) VALUES(1,'2026-07-01','completed');
    INSERT INTO dispatches(dispatch_date,status) VALUES('2026-07-01','completed');
    INSERT INTO dispatch_trips(dispatch_day_id,dispatch_id,trip_number) VALUES(1,1,1);
    INSERT INTO dispatch_stops(dispatch_id,branch_id,stop_sequence,status,dispatch_trip_id,source_schedule_id,service_date,dedupe_enforced,estimated_weight_kg,completed_at)
      VALUES(1,1,1,'completed',1,1,'2026-07-01',1,125,'2026-07-01T08:00:00Z');
  `)
  return db
}

test('seven-day draft uses Kuching calendar dates, preserves warnings, and is idempotent',()=>{
  const db=fixture(),beforeCompleted=db.prepare("SELECT * FROM dispatch_stops WHERE status='completed'").get()
  const first=generateWeek({startDate:'2026-08-03',generatedBy:'Supervisor'},db)
  assert.equal(first.days.length,7);assert.deepEqual(first.days.map(day=>day.dispatch_date),['2026-08-03','2026-08-04','2026-08-05','2026-08-06','2026-08-07','2026-08-08','2026-08-09'])
  assert.equal(first.createdStops,2);assert.equal(first.reusedStops,0);assert.equal(first.protectedDays.length,0)
  const monday=first.days[0];assert.equal(monday.previewSummary.stopCount,2);assert.equal(monday.previewSummary.estimatedWeightKg,125);assert.equal(monday.previewSummary.weightedStopCount,1);assert.equal(monday.previewSummary.missingWeightCount,1);assert.equal(monday.previewSummary.missingGpsCount,1);assert.equal(monday.previewSummary.timeRestrictionCount,1);assert.equal(monday.previewSummary.unassignedCount,2);assert.equal(monday.previewSummary.warningCount,3)
  assert.equal(monday.stops.find(stop=>stop.branchId==='B1').timeRestriction,'Before 10:00');assert.equal(monday.stops.find(stop=>stop.branchId==='B1').estimatedWeightKg,125)
  assert.equal(monday.stops.some(stop=>['B3','B4'].includes(stop.branchId)),false)
  const second=generateWeek({startDate:'2026-08-03',generatedBy:'Supervisor'},db)
  assert.equal(second.createdStops,0);assert.equal(second.reusedStops,2);assert.equal(second.duplicateStops.length,0);assert.equal(listBranchServiceDateConflicts(db).length,0)
  assert.deepEqual(db.prepare("SELECT * FROM dispatch_stops WHERE status='completed'").get(),beforeCompleted)
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok')
})

test('approved and in-progress route days are reused without adding Stops',()=>{
  for(const mode of ['approved','in_progress']){
    const db=fixture();generateWeek({startDate:'2026-08-03'},db)
    db.exec("INSERT INTO branches(jodoo_branch_id,customer_id,branch_name,status,is_active,collection_frequency) VALUES('B5',1,'Late Schedule','active',1,'Weekly'); INSERT INTO branch_schedules(jodoo_schedule_id,branch_id,source_branch_id,frequency,days_of_week,is_active) VALUES('S5',5,'B5','Weekly','Monday',1)")
    if(mode==='approved')db.prepare("UPDATE dispatch_days SET status='approved' WHERE dispatch_date='2026-08-03'").run()
    else db.prepare("UPDATE dispatches SET status='in_progress' WHERE id IN(SELECT dispatch_id FROM dispatch_trips dt JOIN dispatch_days dd ON dd.id=dt.dispatch_day_id WHERE dd.dispatch_date='2026-08-03')").run()
    const before=db.prepare('SELECT COUNT(*) n FROM dispatch_stops').get().n,result=generateWeek({startDate:'2026-08-03'},db)
    assert.equal(result.protectedDays.length,1);assert.equal(db.prepare('SELECT COUNT(*) n FROM dispatch_stops').get().n,before);assert.equal(db.prepare("SELECT COUNT(*) n FROM dispatch_stops ds JOIN branches b ON b.id=ds.branch_id WHERE b.jodoo_branch_id='B5'").get().n,0)
  }
})

test('seven-day generation rolls back the whole range when one Stop fails',()=>{
  const db=fixture();db.exec("DELETE FROM dispatch_stops; DELETE FROM dispatch_trips; DELETE FROM dispatches; DELETE FROM dispatch_days; DELETE FROM weekly_dispatch_plans; DELETE FROM schedule_occurrences; CREATE TRIGGER fail_second_preview_stop BEFORE INSERT ON dispatch_stops WHEN NEW.branch_id=2 BEGIN SELECT RAISE(ABORT,'forced seven-day failure'); END")
  assert.throws(()=>generateWeek({startDate:'2026-08-03'},db),/forced seven-day failure/)
  for(const table of ['weekly_dispatch_plans','dispatch_days','dispatches','dispatch_trips','dispatch_stops','schedule_occurrences'])assert.equal(db.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n,0,table)
})

test('Supervisor preview keeps week mode for a selected start date and renders route warnings and totals',()=>{
  const source=readFileSync(new URL('../src/WeeklyDispatchPage.jsx',import.meta.url),'utf8')
  assert.match(source,/7-day start date/);assert.doesNotMatch(source,/onChange=\{e=>\{setSelectedDate\(e\.target\.value\);setViewMode\('single'\)\}\}/)
  for(const text of ['7-day draft ready:','Weight missing','GPS missing','Time restriction:','Trip {slot.tripNumber}','Unassigned customer pool'])assert.match(source,new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')))
  const css=readFileSync(new URL('../src/Planner.css',import.meta.url),'utf8');assert.match(css,/preview-metrics/);assert.match(css,/@media\(max-width:760px\)/)
  const routes=readFileSync(new URL('../server/index.mjs',import.meta.url),'utf8');assert.match(routes,/generate-week'\) \{if\(!canManageSchedules\(session\)\)/)
})

test('Supervisor daily planner treats a missing dispatch day as empty and exits loading after other failures',()=>{
  const source=readFileSync(new URL('../src/WeeklyDispatchPage.jsx',import.meta.url),'utf8')
  assert.match(source,/setData\(\{days:\[\],vehicles:\[\],employees:\[\],locations:\[\],areas:\[\]\}\);if\(!\(viewMode==='single'&&e\.status===404&&e\.code==='NOT_FOUND'\)\)setError\(e\.message\)/)
  assert.doesNotMatch(source,/e\.message==='Dispatch day not found'/)
})
