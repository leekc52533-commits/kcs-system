import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {schemaSql} from '../server/schema.mjs'
import {applyV75Migration} from '../server/migrationV75.mjs'
import {attendanceSetup,saveAttendanceSetup,attendanceStatus,clockIn,attendanceDaily} from '../server/attendanceService.mjs'
const manager={id:10,role:'owner_admin',employeeId:1},a={id:20,role:'driver',employeeId:2},b={id:30,role:'crew',employeeId:3},now=new Date('2026-09-18T00:00:00Z')
const gps={latitude:1.5,longitude:110.3,accuracyM:10,deviceCapturedAt:now.toISOString()}
function fixture(){const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON;'+schemaSql);db.exec(`INSERT INTO employees(id,name,employment_status,is_active) VALUES(1,'KC','active',1),(2,'A','active',1),(3,'B','active',1);INSERT INTO operational_locations(id,name,location_type,operational_type,latitude,longitude) VALUES(1,'Company','depot','Company Yard',1.5,110.3),(2,'Factory','factory','Buyer',1.5,110.3);`);return db}
const company={mode:'company',locationId:1,radiusM:200,revision:0},home={mode:'home',radiusM:200,revision:0}
test('company geofence validates fresh GPS and saves immutable server time with location snapshot',()=>{const db=fixture();try{
 assert.equal(attendanceStatus(db,a,now).configured,false)
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
 assert.throws(()=>clockIn(db,b,gps,now),{code:'ATTENDANCE_SETUP'})
 }finally{db.close()}})
test('schema 75 migration repeats safely and keeps attendance and employee data',()=>{const db=fixture();try{
 db.exec('INSERT INTO schema_meta(version) VALUES(74)');applyV75Migration(db);applyV75Migration(db)
 assert.equal(db.prepare('SELECT MAX(version) v FROM schema_meta').get().v,75)
 assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok')
 assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[])
 }finally{db.close()}})
