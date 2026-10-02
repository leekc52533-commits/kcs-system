import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {ensureRepeatDateSchema} from '../server/repeatDateSchema.mjs'
import {branchRescheduleHistory} from '../server/branchRescheduleHistory.mjs'
import {recordRepeatDateApproval} from '../server/repeatDateGuard.mjs'
import {withImmediateTransaction} from '../server/branchServiceDateGuard.mjs'
function fixture(t){
 const db=new DatabaseSync(':memory:');t.after(()=>db.close())
 db.exec(`CREATE TABLE branches(id INTEGER PRIMARY KEY);INSERT INTO branches VALUES(1),(2);
 CREATE TABLE employees(id INTEGER PRIMARY KEY,name TEXT);INSERT INTO employees VALUES(1,'Driver A'),(2,'Driver B');
 CREATE TABLE dispatch_stops(id INTEGER PRIMARY KEY,branch_id INTEGER,service_date TEXT,status TEXT,completion_outcome TEXT,completed_at TEXT,arrived_at TEXT,arrival_captured_at TEXT,arrived_by_employee_id INTEGER,arrival_accuracy_m REAL,arrival_distance_m REAL);
 INSERT INTO dispatch_stops(id,branch_id,service_date,status) VALUES(1,1,'2026-09-21','cancelled'),(2,1,'2026-09-24','cancelled'),(3,1,'2026-09-28','locked'),(4,2,'2026-09-28','locked');
 CREATE TABLE purchase_bills(id INTEGER PRIMARY KEY,dispatch_stop_id INTEGER,status TEXT);
 CREATE TABLE driver_date_requests(id INTEGER PRIMARY KEY,dispatch_stop_id INTEGER,employee_id INTEGER,status TEXT,source_date TEXT,target_date TEXT,reason TEXT,review_reason TEXT,reviewed_by TEXT,reviewed_at TEXT,requested_at TEXT);
 CREATE TABLE driver_date_reviews(request_id INTEGER PRIMARY KEY,approved_date TEXT);
 INSERT INTO driver_date_requests VALUES(1,1,1,'approved','2026-09-21','2026-09-24','Too late','Checked','Supervisor','2026-09-21 02:00:00','2026-09-21 01:00:00');`)
 db.exec("INSERT INTO driver_date_requests(id,dispatch_stop_id,employee_id,status,source_date,target_date) VALUES(3,3,1,'pending','2026-09-28','2026-10-01'),(7,3,1,'pending','2026-09-28','2026-10-01')")
 ensureRepeatDateSchema(db);return db
}
const actor={employeeId:9,employeeName:'Supervisor',now:new Date('2026-09-28T03:00:00Z')}
const request={id:3,source_date:'2026-09-28',target_date:'2026-10-01',requested_at:'2026-09-28T01:00:00Z'},stop={branch_id:1}
const proof={contactName:'Mr Customer',contactAt:'2026-09-28T02:00:00Z',result:'Customer confirms Thursday collection',photo:{dataUrl:'data:image/png;base64,iVBORw0KGgo='}}
const second=db=>db.exec("INSERT INTO driver_date_requests VALUES(2,2,2,'approved','2026-09-24','2026-09-28','Customer asked','Called','Other supervisor','2026-09-24 02:00:00','2026-09-24 01:00:00')")
test('branch count persists across drivers and weeks, rejected and same-day moves excluded',t=>{
 const db=fixture(t);second(db)
 db.exec("INSERT INTO driver_date_requests VALUES(5,3,1,'rejected','2026-09-28','2026-10-01','','','','2026-09-28 02:00:00','');INSERT INTO driver_date_requests VALUES(6,3,1,'approved','2026-09-28','2026-09-28','','','','2026-09-28 02:00:00','')")
 assert.equal(branchRescheduleHistory(db,1).count,2);assert.equal(branchRescheduleHistory(db,2).count,0)
})
test('second approval requires exact-count confirmation; third requires valid contact proof',t=>{
 const db=fixture(t)
 assert.throws(()=>recordRepeatDateApproval(db,request,stop,{},actor),{code:'REPEAT_DATE_CONFIRM'})
 recordRepeatDateApproval(db,request,stop,{repeatApprovalConfirmed:true,repeatApprovalNumber:2},actor)
 assert.equal(db.prepare('SELECT approval_number FROM driver_date_repeat_reviews').get().approval_number,2)
 second(db)
 const next={...request,id:7}
 assert.throws(()=>recordRepeatDateApproval(db,next,stop,{repeatApprovalConfirmed:true,repeatApprovalNumber:2},actor),{code:'REPEAT_DATE_CONFIRM'})
 assert.throws(()=>recordRepeatDateApproval(db,next,stop,{repeatApprovalConfirmed:true,repeatApprovalNumber:3},actor),{code:'REPEAT_DATE_PROOF'})
 recordRepeatDateApproval(db,next,stop,{repeatApprovalConfirmed:true,repeatApprovalNumber:3,repeatContact:proof},actor)
 const row=db.prepare('SELECT * FROM driver_date_repeat_reviews WHERE request_id=7').get();assert.equal(row.contact_name,'Mr Customer');assert.equal(row.proof.length,8)
 assert.throws(()=>db.exec("UPDATE driver_date_repeat_reviews SET reviewer='Changed'"),/immutable/)
})
test('no-goods visit never resets; real completed collection with issued bill clears reminders; void does not',t=>{
 const db=fixture(t);second(db)
 db.exec("UPDATE dispatch_stops SET status='completed',completion_outcome='no_goods_notice',completed_at='2026-09-25T10:00:00+08:00',arrived_at='2026-09-25T09:00:00+08:00',arrival_captured_at='2026-09-25T01:00:00Z',arrived_by_employee_id=2,arrival_accuracy_m=8,arrival_distance_m=30 WHERE id=3")
 assert.equal(branchRescheduleHistory(db,1).count,2);assert.equal(branchRescheduleHistory(db,1).noGoods.verified,true)
 db.exec("UPDATE dispatch_stops SET completion_outcome='completed' WHERE id=3;INSERT INTO purchase_bills VALUES(1,3,'voided')")
 assert.equal(branchRescheduleHistory(db,1).count,2)
 db.exec("UPDATE purchase_bills SET status='issued'")
 assert.equal(branchRescheduleHistory(db,1).count,0);assert.equal(db.prepare('SELECT COUNT(*) n FROM driver_date_requests WHERE status=\'approved\'').get().n,2)
})
test('approval evidence rolls back with failed decision and schema is repeatable',t=>{
 const db=fixture(t);ensureRepeatDateSchema(db)
 assert.throws(()=>withImmediateTransaction(db,()=>{recordRepeatDateApproval(db,request,stop,{repeatApprovalConfirmed:true,repeatApprovalNumber:2},actor);throw Error('later decision failed')}))
 assert.equal(db.prepare('SELECT COUNT(*) n FROM driver_date_repeat_reviews').get().n,0)
})
