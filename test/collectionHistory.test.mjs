import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {schemaSql} from '../server/schema.mjs'
import {saveCustomerWorkspace} from '../server/customerWorkspaceService.mjs'
import {collectionHistory,collectionSnapshot} from '../server/collectionHistoryService.mjs'
import {randomUUID} from 'node:crypto'
const actor={role:'owner_admin',employeeName:'KC',id:1}
function fixture(){const db=new DatabaseSync(':memory:');db.exec(schemaSql);const result=saveCustomerWorkspace({requestId:randomUUID(),reason:'setup',customer:{customerName:'Company',defaultPaymentType:'Cash'},branch:{branchName:'One'},schedule:{frequency:'On Call',weekdays:[],routeNumber:'',effectiveDate:'2026-01-01'}},actor,db);return{db,result}}
test('all saved dates, scoped to branch, projected before/after and read only',()=>{
 const{db,result}=fixture(),code=result.branch.branchId,s=db.prepare('SELECT * FROM branch_schedules').get();
 db.prepare("INSERT INTO master_change_history(entity_type,entity_id,change_type,before_json,after_json,reason,changed_by,changed_at) VALUES('branch_schedule',?,'collection_schedule_updated',?,?,?,'KC','2026-01-01 17:00:00')").run(String(s.id),JSON.stringify({weekdays:['Monday'],phone:'secret'}),JSON.stringify({weekdays:['Thursday'],effectiveDate:'2026-01-03',materialPricing:[1]}),'customer asked');
 db.prepare("INSERT INTO master_change_history(entity_type,entity_id,change_type,field_name,old_value,new_value,changed_by) VALUES('branch','B99999','updated','time_restriction','8am','9am','Other')").run();
 const before=db.prepare('SELECT total_changes() n').get().n,r=collectionHistory({branchId:code},actor,db);
 assert.ok(r.history.some(e=>e.reason==='customer asked'));assert.ok(!JSON.stringify(r).includes('secret'));assert.ok(!JSON.stringify(r).includes('Other'));assert.equal(r.current[0].nextFixedDate,null);assert.equal(db.prepare('SELECT total_changes() n').get().n,before);
 const dated=collectionHistory({branchId:code,from:'2026-01-02',to:'2026-01-02'},actor,db);assert.equal(dated.history.length,1);assert.deepEqual(dated.history[0].before,{weekdays:['Monday']});assert.deepEqual(dated.history[0].after,{weekdays:['Thursday'],effectiveDate:'2026-01-03'});
 assert.throws(()=>collectionHistory({branchId:code},{role:'driver'},db),e=>e.statusCode===403);assert.throws(()=>collectionHistory({branchId:'B99999'},actor,db),e=>e.statusCode===404);
 db.exec("UPDATE customers SET status='paused'");assert.equal(collectionHistory({branchId:code},actor,db).branch.enabled,false);db.close()
})
test('snapshot only exposes collection fields',()=>{assert.deepEqual(collectionSnapshot({days_of_week:'Monday,Friday',collectionTimeConstraint:'9 am',phone:'secret',password:'hidden'}),{weekdays:['Monday','Friday'],timeConstraint:'9 am'})})

test('request outcomes, fixed dates, exceptions and dispatch changes stay attached to the correct branch',()=>{
 const{db,result}=fixture(),b=result.branch.internalId,code=result.branch.branchId;
 db.prepare("INSERT INTO employees(id,name) VALUES(999,'Driver')").run();db.prepare("INSERT INTO dispatches(id,dispatch_date) VALUES(999,'2026-10-01')").run();db.prepare("INSERT INTO dispatch_stops(id,dispatch_id,branch_id,stop_sequence) VALUES(999,999,?,1)").run(b);
 db.prepare("INSERT INTO driver_date_requests(id,dispatch_stop_id,employee_id,source_date,target_date,reason,status,reviewed_by,reviewed_at) VALUES(999,999,999,'2026-10-01','2026-10-02','Holiday','approved','KC','2026-09-17 12:00:00')").run();
 db.prepare("INSERT INTO driver_date_reviews(request_id,branch_id,approved_date,route_number,scope,schedule_before_json,schedule_after_json) VALUES(999,?,'2026-10-03',1,'once','{}','{}')").run(b);
 db.prepare("INSERT INTO schedule_exceptions(branch_id,exception_type,original_date,target_date,reason,created_by,created_at) VALUES(?,'move_date','2026-10-01','2026-10-03','Holiday','KC','2026-09-17 12:00:00')").run(b);
 db.prepare("INSERT INTO dispatch_change_logs(actor,change_type,entity_type,entity_id,before_json,after_json) VALUES('KC','driver_date_approved','dispatch_stop','999','{\"serviceDate\":\"2026-10-01\"}','{\"targetDate\":\"2026-10-03\"}')").run();
 db.exec("UPDATE branch_schedules SET frequency='Once a week',recurrence_type='weekly',days_of_week='Monday',effective_date='2026-01-01'");
 const r=collectionHistory({branchId:code},actor,db),request=r.history.find(e=>e.type==='request');assert.equal(request.actor,'Driver');assert.equal(request.reviewer,'KC');assert.equal(request.after.requestedDate,'2026-10-02');assert.equal(request.after.approvedDate,'2026-10-03');assert.equal(r.history.filter(e=>e.type==='exception').length,0);assert.equal(r.history.filter(e=>e.type==='dispatch').length,1);assert.ok(r.current[0].nextFixedDate);
 db.exec("UPDATE driver_date_requests SET status='rejected'; DELETE FROM driver_date_reviews");const rejected=collectionHistory({branchId:code},actor,db).history.find(e=>e.type==='request');assert.equal(rejected.after.approvedDate,undefined);db.close()
})
