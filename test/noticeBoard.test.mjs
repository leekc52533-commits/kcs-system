import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {schemaSql} from '../server/schema.mjs'
import {applyV65Migration} from '../server/migrationV65.mjs'
import {noticeRecipients,publishNotice,employeeNotices,acknowledgeNotice,noticeManagement,noticeReadStatus} from '../server/noticeBoardService.mjs'
const manager={employeeId:1,role:'supervisor'},driver={employeeId:2,role:'driver'},crew={employeeId:3,role:'crew'}
const draft={title:'Tomorrow departure',body:'Please arrive at 07:45.\nBring the documents.',audience:'selected',employeeIds:[2],priority:'urgent',requestKey:'notice-publish-test-0001'}
function fixture(t){const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON;'+schemaSql);db.exec("INSERT INTO employees(id,employee_code,name,job_role,employment_status,is_active) VALUES(1,'S1','Supervisor','Supervisor','active',1),(2,'D1','Driver','Driver','active',1),(3,'C1','Crew','Crew','active',1),(4,'D2','Former Driver','Driver','inactive',0)");t.after(()=>db.close());return db}
test('only management publishes and sees all recipients and read statuses',t=>{
 const db=fixture(t);assert.deepEqual(noticeRecipients(manager,db).map(e=>e.id).sort(),[1,2,3])
 for(const ctx of [driver,crew]){assert.throws(()=>publishNotice(draft,ctx,db),{code:'NOTICE_ACCESS'});assert.throws(()=>noticeManagement(ctx,db),{code:'NOTICE_ACCESS'});assert.throws(()=>noticeReadStatus(1,ctx,db),{code:'NOTICE_ACCESS'})}
 assert.equal(db.prepare('SELECT COUNT(*) n FROM employee_notices').get().n,0)
})
test('targeted notice is private; reading the page does not acknowledge; acknowledgement persists idempotently',t=>{
 const db=fixture(t),r=publishNotice(draft,manager,db)
 assert.equal(employeeNotices(crew,db).length,0);assert.throws(()=>acknowledgeNotice(r.id,crew,db),{code:'NOTICE_ACCESS'})
 assert.equal(employeeNotices(driver,db)[0].readAt,null);assert.equal(noticeManagement(manager,db)[0].readCount,0)
 const read=acknowledgeNotice(r.id,driver,db);assert(read.readAt);assert.equal(acknowledgeNotice(r.id,driver,db).readAt,read.readAt)
 assert.equal(employeeNotices({...driver},db)[0].readAt,read.readAt)
 assert.equal(noticeReadStatus(r.id,manager,db)[0].employeeName,'Driver');assert.equal(noticeManagement(manager,db)[0].readCount,1)
 assert.equal(employeeNotices(driver,db).length,1)
})
test('all snapshots current active staff; later hires do not change the original recipients',t=>{
 const db=fixture(t),r=publishNotice({...draft,audience:'all'},manager,db)
 assert.equal(r.recipientCount,3);assert.equal(employeeNotices(crew,db).length,1)
 db.exec("INSERT INTO employees(id,employee_code,name,job_role,employment_status,is_active) VALUES(5,'N1','New Hire','Driver','active',1);UPDATE employees SET name='Renamed Driver' WHERE id=2")
 assert.equal(employeeNotices({employeeId:5},db).length,0);assert.equal(noticeReadStatus(r.id,manager,db).length,3)
 assert.equal(noticeReadStatus(r.id,manager,db).find(e=>e.employeeId===2).employeeName,'Driver')
 assert.throws(()=>employeeNotices({employeeId:4},db),{code:'NOTICE_ACCESS'})
})
test('publish retry makes one record, preserves acknowledgement and rejects altered retry contents',t=>{
 const db=fixture(t),r=publishNotice(draft,manager,db);acknowledgeNotice(r.id,driver,db)
 assert.equal(publishNotice(draft,manager,db).id,r.id);assert.equal(noticeManagement(manager,db).length,1)
 assert.equal(noticeManagement(manager,db)[0].readCount,1)
 assert.throws(()=>publishNotice({...draft,body:'Different message'},manager,db),{code:'NOTICE_RETRY'})
 assert.equal(employeeNotices(driver,db)[0].body,draft.body)
})
test('invalid or departed recipients and empty/oversized content reject atomically',t=>{
 const db=fixture(t)
 for(const extra of [{employeeIds:[]},{employeeIds:[2,4]},{employeeIds:[999]},{title:' '},{body:'x'.repeat(5001)},{audience:'invalid'}])assert.throws(()=>publishNotice({...draft,...extra},manager,db))
 assert.equal(db.prepare('SELECT COUNT(*) n FROM employee_notices').get().n,0)
 db.exec("CREATE TRIGGER receipt_failure BEFORE INSERT ON employee_notice_receipts WHEN NEW.employee_id=3 BEGIN SELECT RAISE(ABORT,'injected'); END")
 assert.throws(()=>publishNotice({...draft,audience:'all'},manager,db),/injected/)
 assert.equal(db.prepare('SELECT COUNT(*) n FROM employee_notices').get().n,0);assert.equal(db.prepare('SELECT COUNT(*) n FROM employee_notice_receipts').get().n,0)
})
test('distinct notices remain in history, acknowledgements are per notice and per employee; departed employee cannot acknowledge',t=>{
 const db=fixture(t),first=publishNotice({...draft,audience:'all'},manager,db),second=publishNotice({...draft,audience:'all',requestKey:'notice-publish-test-0002'},manager,db)
 acknowledgeNotice(first.id,driver,db);assert.equal(employeeNotices(driver,db).filter(i=>!i.readAt).length,1);assert.equal(employeeNotices(crew,db).filter(i=>!i.readAt).length,2)
 db.exec("UPDATE employees SET employment_status='inactive',is_active=0 WHERE id=2")
 assert.throws(()=>acknowledgeNotice(second.id,driver,db),{code:'NOTICE_ACCESS'})
 assert.equal(noticeReadStatus(first.id,manager,db).find(e=>e.employeeId===2).readAt!=null,true)
})
test('schema 64 to 65 is repeatable and keeps notice and acknowledgement data',t=>{
 const db=fixture(t),r=publishNotice(draft,manager,db),read=acknowledgeNotice(r.id,driver,db)
 db.exec('DELETE FROM schema_meta; INSERT INTO schema_meta(version) VALUES(64)');applyV65Migration(db);applyV65Migration(db)
 assert.equal(db.prepare('SELECT MAX(version) v FROM schema_meta').get().v,65)
 assert.equal(employeeNotices(driver,db)[0].readAt,read.readAt);assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0)
})
