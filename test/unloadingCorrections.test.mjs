import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import ExcelJS from 'exceljs'
import {schemaSql} from '../server/schema.mjs'
import {applyV70Migration} from '../server/migrationV70.mjs'
import {unloadingCorrectionCenter,unloadingCorrectionDetail,requestUnloadingCorrection,decideUnloadingCorrection} from '../server/unloadingCorrectionService.mjs'
import {listUnloadingArchive,unloadingArchiveWorkbook} from '../server/unloadingArchiveService.mjs'
const today='2026-09-03'
function fixture(){
  const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON;'+schemaSql)
  db.prepare("INSERT INTO weekly_dispatch_plans(week_start,status) VALUES(?,'approved')").run(today)
  db.prepare("INSERT INTO dispatch_days(weekly_plan_id,dispatch_date,status) VALUES(1,?,'in_progress')").run(today)
  db.prepare("INSERT INTO vehicles(vehicle_code,registration_number,status,operational_status) VALUES('Lorry 2','QAA4293N','available','active')").run()
  db.prepare("INSERT INTO employees(employee_code,name,job_role,employment_status,is_active) VALUES('D1','Driver One','Driver','active',1)").run()
  db.prepare("INSERT INTO dispatches(dispatch_date,vehicle_id,driver_id,end_location_name,end_address,status) VALUES(?,1,1,'Main Factory','Factory Road','in_progress')").run(today)
  db.prepare("INSERT INTO dispatch_trips(dispatch_day_id,dispatch_id,trip_number,execution_status,started_at) VALUES(1,1,1,'in_progress',?)").run(`${today}T08:00:00+08:00`)
  return db
}


function setup(t){const db=fixture();t.after(()=>db.close());db.exec("INSERT INTO schema_meta(version) VALUES(69)");applyV70Migration(db)
 for(const [id,role]of [[2,'office'],[3,'supervisor'],[4,'driver'],[5,'crew']]){db.prepare("INSERT INTO employees(id,employee_code,name,job_role,employment_status,is_active) VALUES(?,?,?,'Driver','active',1)").run(id,'E'+id,'Employee '+id);db.prepare("INSERT INTO auth_accounts(id,employee_id,username,password_hash,role,system_role) VALUES(?,?,?,'unused',?,?)").run(id,id,'Account'+id,role,role)}
 db.exec("INSERT INTO vehicles(vehicle_code,registration_number,status,operational_status) VALUES('V2','QTY5028','available','active')")
 db.prepare(`INSERT INTO unloading_weight_records(dispatch_trip_id,dispatch_day_id,vehicle_id,driver_employee_id,service_date,trip_number,vehicle_code_snapshot,registration_number_snapshot,driver_name_snapshot,unloading_location_name_snapshot,confirmed_weight_kg,photo_storage_key,photo_original_name,photo_content_type,photo_size_bytes,weighed_at,status,ocr_text) VALUES(1,1,1,1,?,1,'Lorry 2','QAA4293N','Driver One','Factory',1500,'proof.png','proof.png','image/png',10,?,'confirmed','Original OCR')`).run(today,today+'T10:00:00+08:00')
 return{db,office:{id:2,username:'Office'},supervisor:{id:3,username:'Supervisor'}}
}
test('unloading corrections require approval, preserve source ownership and update archive/export with audit',async t=>{
 const{db,office,supervisor}=setup(t),original=db.prepare('SELECT * FROM unloading_weight_records').get(),detail=unloadingCorrectionDetail(db,office,1)
 const values={...detail.values,weighedAt:'2026-09-04T11:30:00+08:00',tripNumber:2,vehicleCode:'V2',registrationNumber:'QTY5028',driverName:'Employee 4',crew:'Employee 5',locationName:'Other Factory',address:'Factory Road',estimatedWeightKg:200,grossWeightKg:550,tareWeightKg:400,confirmedWeightKg:150}
 const r=requestUnloadingCorrection(db,office,1,{values,revision:detail.revision,reason:'Entry mistake'})
 assert.deepEqual(db.prepare('SELECT * FROM unloading_weight_records').get(),original)
 assert.throws(()=>decideUnloadingCorrection(db,office,r.requestId,'approve',{reason:'Checked'}),e=>e.statusCode===403)
 decideUnloadingCorrection(db,supervisor,r.requestId,'approve',{reason:'Proof checked'})
 const current=db.prepare('SELECT * FROM unloading_weight_records').get();assert.equal(current.confirmed_weight_kg,150);assert.equal(current.driver_name_snapshot,'Employee 4');assert.equal(current.registration_number_snapshot,'QTY5028')
 for(const k of ['service_date','driver_employee_id','vehicle_id','dispatch_trip_id','photo_storage_key','ocr_text'])assert.equal(current[k],original[k])
 const d=unloadingCorrectionDetail(db,office,1);assert.equal(d.code,detail.code);assert.equal(d.history.length,1);assert.notEqual(d.revision,detail.revision)
 const rows=listUnloadingArchive({},db).items;assert.equal(rows[0].date,'2026-09-04');assert.equal(rows[0].correctedCount,1)
 const book=new ExcelJS.Workbook();await book.xlsx.load(await unloadingArchiveWorkbook({order:JSON.stringify(['correctedCount','confirmedWeightKg']),language:'en'},db));assert.equal(book.worksheets[0].getCell('A2').value,1);assert.equal(book.worksheets[0].getCell('B2').value,150)
 assert.throws(()=>db.exec("UPDATE unloading_corrections SET reason='changed'"),/immutable/)
 assert.throws(()=>db.exec('DELETE FROM unloading_corrections'),/immutable/)
 assert.throws(()=>decideUnloadingCorrection(db,supervisor,r.requestId,'approve',{reason:'Again'}),e=>e.code==='CONFLICT')
 assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[])
})
test('denies unauthorized users, invalid weights, arbitrary columns and duplicate requests',t=>{
 const{db,office}=setup(t),d=unloadingCorrectionDetail(db,office,1),p={revision:d.revision,reason:'fix',values:{...d.values,confirmedWeightKg:150}}
 for(const id of [4,5]){assert.throws(()=>unloadingCorrectionCenter(db,{id},d.code),e=>e.statusCode===403);assert.throws(()=>requestUnloadingCorrection(db,{id},1,p),e=>e.statusCode===403)}
 for(const values of [{confirmedWeightKg:-1},{confirmedWeightKg:0},{confirmedWeightKg:'bad'},{weighedAt:'2026-02-30T10:00:00+08:00'},{driver_employee_id:5},{tripNumber:9},{grossWeightKg:5,tareWeightKg:10}])assert.throws(()=>requestUnloadingCorrection(db,office,1,{...p,values:{...p.values,...values}}),e=>e.statusCode===400)
 assert.throws(()=>requestUnloadingCorrection(db,office,1,{...p,reason:''}),e=>e.statusCode===400)
 requestUnloadingCorrection(db,office,1,p);assert.throws(()=>requestUnloadingCorrection(db,office,1,p),e=>e.code==='CONFLICT')
 assert.equal(unloadingCorrectionCenter(db,office,'UL-20200101-000001').item,null)
})
test('stale approvals are rejected; rejection preserves source; audit failure rolls everything back',t=>{
 const{db,office,supervisor}=setup(t),d=unloadingCorrectionDetail(db,office,1)
 const r=requestUnloadingCorrection(db,office,1,{revision:d.revision,reason:'fix',values:{...d.values,confirmedWeightKg:150}})
 db.exec("UPDATE unloading_weight_records SET crew_names_snapshot='Changed later'")
 assert.throws(()=>decideUnloadingCorrection(db,supervisor,r.requestId,'approve',{reason:'ok'}),e=>e.code==='CONFLICT')
 decideUnloadingCorrection(db,supervisor,r.requestId,'reject',{reason:'stale'});assert.equal(db.prepare('SELECT confirmed_weight_kg n FROM unloading_weight_records').get().n,1500)
 const fresh=unloadingCorrectionDetail(db,office,1),r2=requestUnloadingCorrection(db,office,1,{revision:fresh.revision,reason:'fix',values:{...fresh.values,confirmedWeightKg:150}})
 db.exec("CREATE TRIGGER fail_audit BEFORE INSERT ON unloading_corrections BEGIN SELECT RAISE(ABORT,'audit failure'); END")
 assert.throws(()=>decideUnloadingCorrection(db,supervisor,r2.requestId,'approve',{reason:'ok'}),/audit failure/)
 assert.equal(db.prepare('SELECT confirmed_weight_kg n FROM unloading_weight_records').get().n,1500);assert.equal(db.prepare('SELECT status FROM unloading_correction_requests WHERE id=?').get(r2.requestId).status,'pending')
 applyV70Migration(db);assert.equal(db.prepare('SELECT MAX(version) v FROM schema_meta').get().v,70)
})
