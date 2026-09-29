import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {attendanceSchema} from '../server/migrationV75.mjs'
import {ownLeave,requestLeave,pendingLeave,reviewLeave} from '../server/leaveService.mjs'
const a={id:1,employeeId:1,role:'driver'},b={id:2,employeeId:2,role:'crew'},boss={id:3,employeeId:3,role:'supervisor'}
function fixture(){const db=new DatabaseSync(':memory:');db.exec("CREATE TABLE employees(id INTEGER PRIMARY KEY,name TEXT,is_active INTEGER,employment_status TEXT);INSERT INTO employees VALUES(1,'A',1,'active'),(2,'B',1,'active'),(3,'Boss',1,'active');"+attendanceSchema);return db}
const p={startDate:'2026-09-29',endDate:'2026-09-30',reason:'Family'}
test('leave belongs to session employee; duplicates and overlaps do not create extra requests',()=>{const db=fixture();try{
 const r=requestLeave(db,a,{...p,employeeId:2});assert.equal(r.items[0].employee_id,1);assert.equal(ownLeave(db,b).items.length,0)
 requestLeave(db,a,p);assert.equal(ownLeave(db,a).items.length,1)
 assert.throws(()=>requestLeave(db,a,{...p,startDate:'2026-09-30'}),{code:'LEAVE_OVERLAP'})
 for(const change of [{startDate:'2026-02-30'},{endDate:'2026-09-28'},{reason:''}])assert.throws(()=>requestLeave(db,a,{...p,...change}),{code:'LEAVE_INVALID'})
 assert.throws(()=>pendingLeave(db,a),{code:'LEAVE_DENIED'})
}finally{db.close()}})
test('only managers decide once, with audit, no self approval and preserved history',()=>{const db=fixture();try{
 const id=requestLeave(db,a,p).items[0].id
 assert.throws(()=>reviewLeave(db,b,id,{decision:'approved'}),{code:'LEAVE_DENIED'})
 assert.throws(()=>reviewLeave(db,{...a,role:'supervisor'},id,{decision:'approved'}),{code:'LEAVE_DENIED'})
 assert.equal(pendingLeave(db,boss).items.length,1)
 reviewLeave(db,boss,id,{decision:'approved'});const saved=ownLeave(db,a).items[0];assert.equal(saved.status,'approved');assert.equal(saved.reviewed_by,3);assert(saved.reviewed_at)
 assert.equal(pendingLeave(db,boss).items.length,0);assert.throws(()=>reviewLeave(db,boss,id,{decision:'rejected'}),{code:'LEAVE_STALE'})
 const other=requestLeave(db,b,p).items[0];reviewLeave(db,boss,other.id,{decision:'rejected'});assert.equal(ownLeave(db,b).items[0].status,'rejected')
 db.exec(attendanceSchema);assert.equal(ownLeave(db,a).items.length,1)
}finally{db.close()}})
test('management archive retains reviewed requests and denies employee access',()=>{const db=fixture();try{
 const r=requestLeave(db,a,p).items[0];reviewLeave(db,boss,r.id,{decision:'approved'})
 assert.equal(pendingLeave(db,boss).items.length,0)
 assert.equal(pendingLeave(db,boss,true).items[0].status,'approved')
 assert.throws(()=>pendingLeave(db,a,true),e=>e.statusCode===403)
 }finally{db.close()}})
