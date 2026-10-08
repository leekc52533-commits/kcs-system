import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {schemaSql} from '../server/schema.mjs'
import {applyV75Migration} from '../server/migrationV75.mjs'
import {attendanceSetup,saveAttendanceSetup,attendanceStatus,clockIn,attendanceDaily,requestAttendance,attendanceRequests,reviewAttendance} from '../server/attendanceService.mjs'
const manager={id:10,role:'owner_admin',employeeId:1},a={id:20,role:'driver',employeeId:2},b={id:30,role:'crew',employeeId:3},now=new Date('2026-09-18T00:00:00Z')
const gps={latitude:1.5,longitude:110.3,accuracyM:10,deviceCapturedAt:now.toISOString()}
function fixture(){const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON;'+schemaSql);db.exec(`INSERT INTO employees(id,name,employment_status,is_active) VALUES(1,'KC','active',1),(2,'A','active',1),(3,'B','active',1);INSERT INTO operational_locations(id,name,location_type,operational_type,latitude,longitude) VALUES(1,'Company','depot','Company Yard',1.5,110.3),(2,'Factory','factory','Buyer',1.5,110.3);`);return db}
const company={mode:'company',locationId:1,radiusM:200,revision:0},home={mode:'home',radiusM:200,revision:0}
test('company geofence validates fresh GPS and saves immutable server time with location snapshot',()=>{const db=fixture();try{
 assert.equal(attendanceStatus(db,a,now).configured,true)
 saveAttendanceSetup(db,manager,2,company,now)
 for(const change of [{latitude:1.51},{longitude:null},{accuracyM:250},{deviceCapturedAt:'2026-09-17T23:00:00Z'},{deviceCapturedAt:'2026-09-18T01:00:00Z'}])assert.throws(()=>clockIn(db,a,{...gps,...change},now))
 assert.equal(db.prepare('SELECT COUNT(*) n FROM attendance_records').get().n,0)
 const r=clockIn(db,a,{...gps,employeeId:3,clockedAt:'2000-01-01'},now).record
 assert.equal(r.clocked_at,now.toISOString());assert.equal(r.work_date,'2026-09-18')
 assert.equal(clockIn(db,a,{},new Date('2026-09-18T01:00:00Z')).record.id,r.id)
 assert.equal(attendanceStatus(db,b,now).record,null)
 db.exec("UPDATE operational_locations SET name='Renamed',latitude=2")
 assert.equal(attendanceSetup(db,manager,2).records[0].location_name,'Company')
 assert.equal(db.prepare('SELECT COUNT(*) n FROM attendance_records').get().n,1)
 }finally{db.close()}})
test('home permits remote GPS, each Kuching date is independent, forged payload mode cannot bypass company',()=>{const db=fixture();try{
 saveAttendanceSetup(db,manager,3,home,now);saveAttendanceSetup(db,manager,2,company,now)
 assert.throws(()=>clockIn(db,a,{...gps,latitude:2,mode:'home'},now),{code:'ATTENDANCE_OUTSIDE'})
 clockIn(db,b,{...gps,latitude:2},now)
 const next=new Date('2026-09-18T16:00:00Z');assert.equal(attendanceStatus(db,b,next).record,null)
 const r=clockIn(db,b,{...gps,latitude:2,deviceCapturedAt:next.toISOString()},next).record
 assert.equal(r.work_date,'2026-09-19');assert.equal(attendanceSetup(db,manager,3).records.length,2)
 assert.equal(attendanceDaily(db,manager,'2026-09-18').items.find(e=>e.employeeId===2).clocked_at,null)
 assert.throws(()=>attendanceDaily(db,manager,'2026-02-31'),{code:'ATTENDANCE_INVALID'})
 }finally{db.close()}})
test('settings permissions, revision, company GPS, inactive employees and audit are enforced',()=>{const db=fixture();try{
 assert.throws(()=>attendanceSetup(db,a,3),{code:'ATTENDANCE_DENIED'})
 assert.throws(()=>saveAttendanceSetup(db,b,3,home),{code:'ATTENDANCE_DENIED'})
 assert.throws(()=>attendanceDaily(db,a),{code:'ATTENDANCE_DENIED'})
 assert.throws(()=>saveAttendanceSetup(db,manager,2,{...company,locationId:2}),{code:'ATTENDANCE_LOCATION'})
 assert.throws(()=>saveAttendanceSetup(db,manager,2,{...company,radiusM:0}),{code:'ATTENDANCE_INVALID'})
 saveAttendanceSetup(db,manager,2,company)
 assert.throws(()=>saveAttendanceSetup(db,manager,2,home),{code:'ATTENDANCE_STALE'})
 assert.equal(db.prepare('SELECT COUNT(*) n FROM attendance_settings_history').get().n,1)
 db.exec("UPDATE employees SET employment_status='inactive',is_active=0 WHERE id=2")
 assert.throws(()=>clockIn(db,a,gps,now),{code:'ATTENDANCE_DENIED'})
 assert.equal(clockIn(db,b,gps,now).record.mode,'company')
 }finally{db.close()}})
test('schema 75 migration repeats safely and keeps attendance and employee data',()=>{const db=fixture();try{
 db.exec('INSERT INTO schema_meta(version) VALUES(74)');applyV75Migration(db);applyV75Migration(db)
 assert.equal(db.prepare('SELECT MAX(version) v FROM schema_meta').get().v,75)
 assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok')
 assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[])
 }finally{db.close()}})

test('unconfigured staff default to the sole company, home overrides survive, multiple yards require selection',()=>{const db=fixture();try{
 const setup=attendanceSetup(db,manager,2);assert.equal(setup.mode,'company');assert.equal(setup.locationId,1);assert.equal(setup.radiusM,200)
 assert.equal(attendanceDaily(db,manager,'2026-09-18').items.length,3)
 assert.throws(()=>clockIn(db,a,{...gps,latitude:2},now),{code:'ATTENDANCE_OUTSIDE'})
 assert.equal(clockIn(db,a,gps,now).record.mode,'company')
 saveAttendanceSetup(db,manager,3,home)
 db.exec("INSERT INTO operational_locations(id,name,location_type,operational_type,latitude,longitude) VALUES(3,'Second Company','depot','Company Yard',2,110)")
 assert.equal(attendanceSetup(db,manager,2).locationId,null)
 assert.equal(clockIn(db,b,{...gps,latitude:3},now).record.mode,'home')
 const next=new Date('2026-09-19T00:00:00Z');assert.throws(()=>clockIn(db,a,{...gps,deviceCapturedAt:next.toISOString()},next),{code:'ATTENDANCE_LOCATION'})
 saveAttendanceSetup(db,manager,2,company);assert.equal(attendanceSetup(db,manager,2).locationId,1)
 }finally{db.close()}})

test('remote request preserves server request time, cannot self approve and unlocks only after approval',()=>{
 const db=fixture();try{
  const p={...gps,latitude:2,reason:'Forgot at the yard',requestedAt:'2000-01-01',employeeId:3}
  const r=requestAttendance(db,a,p,now);assert.equal(r.record,null);assert.equal(r.request.requested_at,now.toISOString())
  assert.equal(requestAttendance(db,a,p,new Date(now.getTime()+60000)).request.id,r.request.id)
  assert.throws(()=>reviewAttendance(db,a,r.request.id,{decision:'approved'}),{code:'ATTENDANCE_DENIED'})
  assert.throws(()=>reviewAttendance(db,{...a,role:'supervisor'},r.request.id,{decision:'approved'}),{code:'ATTENDANCE_DENIED'})
  assert.throws(()=>attendanceRequests(db,a),{code:'ATTENDANCE_DENIED'})
  assert.equal(attendanceRequests(db,{...manager,role:'supervisor'}).items.length,1)
  reviewAttendance(db,{...manager,role:'supervisor'},r.request.id,{decision:'approved'},new Date(now.getTime()+3600000))
  const state=attendanceStatus(db,a,now);assert.equal(state.record.clocked_at,now.toISOString());assert.equal(state.record.mode,'approved')
  assert.equal(attendanceStatus(db,b,now).record,null)
  assert.throws(()=>reviewAttendance(db,manager,r.request.id,{decision:'approved'}),{code:'ATTENDANCE_STALE'})
  const audit=db.prepare('SELECT * FROM attendance_requests').get();assert.equal(audit.reviewed_by,manager.id);assert.notEqual(audit.reviewed_at,audit.requested_at)
 }finally{db.close()}
})
test('rejection stays locked, normal attendance is preserved, and next-day approval does not unlock today',()=>{
 const db=fixture();try{
  assert.throws(()=>requestAttendance(db,a,{...gps,reason:''},now),{code:'ATTENDANCE_REASON'})
  assert.throws(()=>requestAttendance(db,a,{...gps,reason:'x',accuracyM:200},now),{code:'ATTENDANCE_GPS'})
  const r=requestAttendance(db,a,{...gps,reason:'Forgot'},now).request
  reviewAttendance(db,manager,r.id,{decision:'rejected'},now);assert.equal(attendanceStatus(db,a,now).record,null)
  const q=requestAttendance(db,b,{...gps,reason:'Forgot'},now).request
  clockIn(db,b,gps,now);assert.equal(reviewAttendance(db,manager,q.id,{decision:'approved'},now).status,'superseded')
  assert.equal(attendanceStatus(db,b,now).record.mode,'company')
  const tomorrow=new Date('2026-09-19T00:00:00Z'),next=requestAttendance(db,a,{...gps,reason:'Forgot',deviceCapturedAt:tomorrow.toISOString()},tomorrow).request
  const later=new Date('2026-09-20T00:00:00Z');reviewAttendance(db,manager,next.id,{decision:'approved'},later)
  assert.equal(attendanceStatus(db,a,later).record,null);assert.equal(attendanceStatus(db,a,tomorrow).record.clocked_at,tomorrow.toISOString())
 }finally{db.close()}
})
test('standalone archive includes historical records and today missing employees with management authorization',()=>{const db=fixture();try{
 clockIn(db,a,gps,now)
 const archive=attendanceDaily(db,manager,'all')
 assert.equal(archive.items.filter(r=>r.employeeId===2&&r.work_date==='2026-09-18').length,1)
 assert.ok(archive.items.some(r=>r.employeeId===3&&!r.clocked_at&&r.work_date===archive.date))
 assert.throws(()=>attendanceDaily(db,a,'all'),e=>e.statusCode===403)
 assert.equal(attendanceDaily(db,manager,'2026-09-18').items.find(r=>r.employeeId===2).clocked_at,now.toISOString())
 }finally{db.close()}})

function pinOwner(db){db.exec(`INSERT INTO auth_accounts(id,employee_id,username,password_hash,role) VALUES(10,1,'kcadmin','test','admin');CREATE TABLE IF NOT EXISTS company_menu(id INTEGER PRIMARY KEY,owner_account_id INTEGER REFERENCES auth_accounts(id));INSERT INTO company_menu(id,owner_account_id) VALUES(1,10);`)}
test('only pinned owner can grant or cancel exemption, with revision and audit',()=>{const db=fixture();try{
 pinOwner(db)
 for(const role of ['owner_admin','operations_admin']){
  const other={id:99,role,permissions:['employee_manage'],canSetExemption:true}
  assert.equal(attendanceSetup(db,other,2).canSetExemption,false)
  assert.throws(()=>saveAttendanceSetup(db,other,2,{...home,mode:'none'}),{code:'ATTENDANCE_DENIED'})
 }
 assert.equal(attendanceSetup(db,manager,2).canSetExemption,true)
 db.exec('UPDATE operational_locations SET latitude=NULL')
 const saved=saveAttendanceSetup(db,manager,2,{...home,mode:'none'},now)
 assert.equal(saved.mode,'none');assert.equal(saved.revision,1)
 assert.throws(()=>saveAttendanceSetup(db,{id:99,role:'owner_admin'},2,{...home,revision:1}),{code:'ATTENDANCE_DENIED'})
 assert.throws(()=>saveAttendanceSetup(db,manager,2,home),{code:'ATTENDANCE_STALE'})
 const audit=JSON.parse(db.prepare('SELECT payload_json FROM attendance_settings_history').get().payload_json)
 assert.equal(audit.after.mode,'none');assert.equal(audit.before.mode,'company')
 saveAttendanceSetup(db,manager,1,{...home,mode:'none'},now)
 assert.equal(attendanceStatus(db,manager,now).exempt,true)
 saveAttendanceSetup(db,manager,2,{...home,revision:1},now)
 assert.equal(attendanceStatus(db,a,now).exempt,false)
 }finally{db.close()}})
test('exemption bypasses GPS without fake records, hides historical archive rows, restores on cancellation',()=>{const db=fixture();try{
 pinOwner(db);clockIn(db,a,gps,now)
 const request=requestAttendance(db,b,{...gps,reason:'Forgot'},now).request
 for(const id of [2,3])saveAttendanceSetup(db,manager,id,{...home,mode:'none'},now)
 assert.equal(clockIn(db,b,{},now).exempt,true)
 assert.equal(requestAttendance(db,b,{},now).exempt,true)
 assert.equal(attendanceStatus(db,b,now).record,null)
 assert.equal(attendanceRequests(db,manager).items.length,0)
 assert.throws(()=>reviewAttendance(db,manager,request.id,{decision:'approved'},now),{code:'ATTENDANCE_STALE'})
 assert.equal(db.prepare('SELECT status FROM attendance_requests WHERE id=?').get(request.id).status,'superseded')
 for(const date of ['all','2026-09-18'])assert.deepEqual(attendanceDaily(db,manager,date).items.map(r=>r.employeeId),[1])
 assert.equal(db.prepare('SELECT COUNT(*) n FROM attendance_records').get().n,1)
 assert.equal(attendanceSetup(db,manager,2).records.length,1)
 saveAttendanceSetup(db,manager,2,{...home,revision:1},now)
 assert.ok(attendanceDaily(db,manager,'all').items.some(r=>r.employeeId===2&&r.work_date==='2026-09-18'))
 assert.equal(attendanceDaily(db,manager,'2026-09-18').items.find(r=>r.employeeId===2).clocked_at,now.toISOString())
 db.exec('INSERT INTO schema_meta(version) VALUES(75)');applyV75Migration(db);applyV75Migration(db)
 assert.equal(attendanceStatus(db,b,now).exempt,true)
 assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[])
 }finally{db.close()}})

test('attendance status uses Kuching cutoff, approved leave/rest and positive work-day evidence',()=>{const db=fixture();try{
 const later=new Date('2026-09-19T00:00:00Z')
 db.exec(`INSERT INTO route_employee_availability(employee_id,availability_date,status,reason,changed_by) VALUES(2,'2026-09-18','available','Work','KC'),(3,'2026-09-18','off_duty','Rest','KC');`)
 let rows=attendanceDaily(db,manager,'2026-09-18',now).items
 assert.equal(rows.find(r=>r.employeeId===2).attendanceStatus,'not_clocked')
 rows=attendanceDaily(db,manager,'2026-09-18',later).items
 assert.equal(rows.find(r=>r.employeeId===2).attendanceStatus,'absent')
 assert.equal(rows.find(r=>r.employeeId===3).attendanceStatus,'rest')
 assert.equal(rows.find(r=>r.employeeId===1).attendanceStatus,'review')
 assert.ok(attendanceDaily(db,manager,'all',later).items.some(r=>r.employeeId===2&&r.work_date==='2026-09-18'&&r.attendanceStatus==='absent'))
 db.exec(`INSERT INTO leave_requests(employee_id,account_id,start_date,end_date,reason,requested_at,status) VALUES(2,20,'2026-09-17','2026-09-18','Leave','2026-09-16','pending')`)
 assert.equal(attendanceDaily(db,manager,'2026-09-18',later).items.find(r=>r.employeeId===2).attendanceStatus,'review')
 db.exec("UPDATE leave_requests SET status='approved'")
 assert.equal(attendanceDaily(db,manager,'2026-09-18',later).items.find(r=>r.employeeId===2).attendanceStatus,'leave')
 assert.ok(attendanceDaily(db,manager,'all',later).items.some(r=>r.employeeId===2&&r.work_date==='2026-09-17'&&r.attendanceStatus==='leave'))
 clockIn(db,a,gps,now)
 assert.equal(attendanceDaily(db,manager,'2026-09-18',later).items.find(r=>r.employeeId===2).attendanceStatus,'on_time')
 const late=new Date(now.getTime()+1000);clockIn(db,b,{...gps,deviceCapturedAt:late.toISOString()},late)
 assert.equal(attendanceDaily(db,manager,'2026-09-18',later).items.find(r=>r.employeeId===3).attendanceStatus,'late')
 db.exec("UPDATE route_employee_availability SET status='available',start_time='09:00',end_time='17:00' WHERE employee_id=3")
 assert.equal(attendanceDaily(db,manager,'2026-09-18',later).items.find(r=>r.employeeId===3).attendanceStatus,'on_time')
 assert.equal(db.prepare('SELECT COUNT(*) n FROM attendance_records').get().n,2)
 }finally{db.close()}})
