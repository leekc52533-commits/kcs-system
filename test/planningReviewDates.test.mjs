import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {schemaSql} from '../server/schema.mjs'
import {installWeeklyRoutePlan} from '../server/weeklyRoutePlanService.mjs'
import {generateDay} from '../server/dispatchService.mjs'
import {routeScheduleProposals} from '../server/routeSchedulePlanning.mjs'
import {uploadedRouteEvidence} from '../server/routePlanningEvidence.mjs'
import {planningDate} from '../shared/planningDates.js'
import {synchronizeRouteScheduleBaseline} from '../server/routeScheduleBaselineService.mjs'
import {getCollectionScheduleManagement,saveCollectionScheduleManagement} from '../server/collectionScheduleManagementService.mjs'
function fixture(){const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON;'+schemaSql);db.prepare("INSERT INTO customers(jodoo_customer_id,name) VALUES('C','Customer')").run();db.prepare("INSERT INTO branches(jodoo_branch_id,customer_id,branch_name,status,collection_frequency,assigned_weekdays,latitude,longitude) VALUES('B1',1,'One','active','Weekly','[\"Monday\"]',1,1),('B2',1,'Two','active','Weekly','[\"Monday\"]',1,1),('B3',1,'Three','active','Weekly','[\"Monday\"]',1,1)").run();db.prepare("INSERT INTO branch_schedules(jodoo_schedule_id,branch_id,source_branch_id,frequency,days_of_week) VALUES('S1',1,'B1','Weekly','Monday'),('S2',2,'B2','Weekly','Monday'),('S3',3,'B3','Weekly','Monday')").run();db.prepare("INSERT INTO vehicles(vehicle_code,registration_number,status,operational_status) VALUES('Lorry 2','QAA4293N','available','active'),('Lorry 3','QAB1225B','available','active')").run();db.prepare("INSERT INTO employees(employee_code,name,job_role,employment_status,is_active) VALUES('D1','Driver One','Driver','active',1),('D2','Driver Two','Driver','active',1)").run();installWeeklyRoutePlan({name:'Routes',sourceName:'test',entries:[[1,'QAA4293N',1,1,'B1','',''],[1,'QAA4293N',1,2,'B2','',''],[1,'QAB1225B',1,1,'B3','','']]},{},db);generateDay({startDate:'2026-09-07'},db);return db}

test('legacy ISO dates normalize while malformed dates never roll over or become NaN',()=>{
 assert.equal(planningDate('2026-07-31T00:11:59.999Z'),'2026-07-31')
 assert.equal(planningDate('2026-02-05T00:00:00.000Z'),'2026-02-05')
 assert.equal(planningDate('2028-02-29'),'2028-02-29')
 for(const v of ['NaN-NaN-NaN','2026-02-30','2026-13-01','2026-07-31Tgarbage','7/8/2026',null,46900])assert.equal(planningDate(v),null)
})

test('old ISO anchor retains its cycle but next collection is in the current/future window',()=>{const db=fixture();try{
 db.exec("UPDATE weekly_route_plan_stops SET weekday=4 WHERE branch_id=1; UPDATE branch_schedules SET frequency='Every 2 Weeks',days_of_week='Thursday',next_take_date='2026-02-05T00:00:00.000Z' WHERE branch_id=1")
 const before=db.prepare('SELECT * FROM branch_schedules').all(),r=routeScheduleProposals(db,'2026-09-08').find(r=>r.branchId==='B1')
 assert.equal(r.proposal.anchorDate,'2026-02-05');assert.equal(r.nextCollectionDate,'2026-09-17');assert.equal(r.basedOn,'existing_schedule');assert.deepEqual(db.prepare('SELECT * FROM branch_schedules').all(),before)
}finally{db.close()}})

test('wrong weekday ISO date aligns only after normalization and explicitly warns',()=>{const db=fixture();try{
 db.exec("UPDATE weekly_route_plan_stops SET weekday=4 WHERE branch_id=1; UPDATE branch_schedules SET frequency='Every 3 Weeks',next_take_date='2026-07-31T00:11:59.999Z' WHERE branch_id=1")
 const r=routeScheduleProposals(db,'2026-09-08').find(r=>r.branchId==='B1')
 assert.equal(r.originalAnchorDate,'2026-07-31');assert.equal(r.proposal.anchorDate,'2026-08-06');assert.equal(r.nextCollectionDate,'2026-09-17');assert.ok(r.dateWarnings.length);assert.equal(r.automatic,false)
}finally{db.close()}})

test('invalid legacy anchors yield a clearly unconfirmed valid first-date proposal',()=>{const db=fixture();try{
 db.exec("UPDATE weekly_route_plan_stops SET weekday=4 WHERE branch_id=1; UPDATE branch_schedules SET frequency='Every 2 Weeks',anchor_date='NaN-NaN-NaN',next_take_date='2026-02-30' WHERE branch_id=1")
 const r=routeScheduleProposals(db,'2026-09-08').find(r=>r.branchId==='B1');assert.equal(r.proposal.anchorDate,'2026-09-10');assert.equal(r.nextCollectionDate,'2026-09-10');assert.equal(r.basedOn,'proposed_first_date');assert.equal(r.dateWarnings.length,2);assert.equal(r.automatic,false)
 const item=getCollectionScheduleManagement('B1',db);assert.throws(()=>saveCollectionScheduleManagement('B1',{frequency:'Every 2 Weeks',weekdays:['Thursday'],anchorDate:'2026-02-30',expectedUpdatedAt:item.updatedAt,reason:'test'},db),/valid calendar date/)
}finally{db.close()}})

test('monthly fifth weekday is proposed as last weekday rather than an earlier fourth weekday',()=>{const db=fixture();try{
 db.exec("UPDATE weekly_route_plan_stops SET weekday=5 WHERE branch_id=1; UPDATE branch_schedules SET frequency='Monthly',days_of_week='Friday',take_date='2026-07-31T00:11:59.999Z' WHERE branch_id=1")
 const r=routeScheduleProposals(db,'2026-09-08').find(r=>r.branchId==='B1');assert.equal(r.proposal.monthlyOccurrence,-1);assert.equal(r.nextCollectionDate,'2026-09-25')
}finally{db.close()}})

test('five weekdays from uploaded active plan are supported and synchronize exactly five days',()=>{const db=fixture();try{
 for(const weekday of [2,3,4,5])db.prepare("INSERT INTO weekly_route_plan_stops(plan_id,weekday,branch_id,vehicle_registration_number,trip_number,stop_sequence,route_number) VALUES(1,?,1,'QAA4293N',1,1,1)").run(weekday)
 const r=routeScheduleProposals(db,'2026-09-08').find(r=>r.branchId==='B1');assert.equal(r.proposal.frequency,'5 times a week');assert.equal(r.automatic,true)
 synchronizeRouteScheduleBaseline(db,{today:'2026-09-08'});assert.deepEqual(getCollectionScheduleManagement('B1',db).weekdays,['Monday','Tuesday','Wednesday','Thursday','Friday'])
}finally{db.close()}})

test('missing current Route presents previous upload evidence without restoring it automatically',()=>{const db=fixture();try{
 db.exec("UPDATE branches SET jodoo_branch_id='B10454' WHERE id=1; DELETE FROM weekly_route_plan_stops WHERE branch_id=1")
 const changes=db.prepare('SELECT total_changes() n').get().n,r=routeScheduleProposals(db,'2026-09-08').find(r=>r.branchId==='B10454')
 assert.ok(r.routeEvidence.uploaded.some(s=>s.source.includes('(1).xlsx')));assert.ok(!r.automatic);assert.equal(db.prepare('SELECT total_changes() n').get().n,changes)
 assert.deepEqual(uploadedRouteEvidence('B10456'),[])
}finally{db.close()}})

test('duplicate schedules are displayed individually without deleting or selecting one',()=>{const db=fixture();try{
 db.exec("INSERT INTO branch_schedules(jodoo_schedule_id,branch_id,source_branch_id,frequency,days_of_week) VALUES('DUP',1,'B1','Weekly','Tuesday')")
 const r=routeScheduleProposals(db,'2026-09-08').find(r=>r.branchId==='B1');assert.equal(r.blocked,true);assert.equal(r.scheduleEvidence.length,2);assert.equal(db.prepare('SELECT COUNT(*) n FROM branch_schedules WHERE branch_id=1').get().n,2)
}finally{db.close()}})
