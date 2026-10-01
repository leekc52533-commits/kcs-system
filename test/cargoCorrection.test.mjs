import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {spawnSync} from 'node:child_process'
import {cargoBatchSchema} from '../server/migrationV71.mjs'
import {earningsSchema} from '../server/migrationV72.mjs'
import {earningsReport} from '../server/earningsService.mjs'
const names=['PHANG KHONG YEN','QAIRUL HIQMAH BIN ABDULL','AHAZHAR BIN BADOR','MOHD AZIZUL BIN SAMI','ALDYFERNENDES IVAN AK DIANA']
const plans=[
 [1,'QM3028M','H260922-011','2026-09-22',[[157,'154566',1400],[160,'154636',1160]]],
 [2,'QAV3468','H260919-006','2026-09-19',[[158,'154571',1290],[159,'154614',1010]]],
 [3,'QAA4293N','H260919-007','2026-09-19',[[161,'154625',1080],[162,'154570',1010],[163,'154584',760]]],
 [4,'QM630S','H260919-008','2026-09-19',[[164,'154605',890],[165,'15483',1320],[166,'154567',1490]]]
]
function fixture(){
 const dir=mkdtempSync(join(tmpdir(),'kcs-cargo-')),path=join(dir,'test.db'),db=new DatabaseSync(path)
 db.exec(`PRAGMA foreign_keys=ON;
 CREATE TABLE employees(id INTEGER PRIMARY KEY,name,job_role,is_active,employment_status);
 CREATE TABLE employee_job_roles(employee_id,role);
 CREATE TABLE vehicles(id INTEGER PRIMARY KEY);
 CREATE TABLE dispatch_trips(id INTEGER PRIMARY KEY);
 CREATE TABLE unloading_weight_records(id INTEGER PRIMARY KEY,vehicle_id,driver_employee_id,driver_name_snapshot,registration_number_snapshot,service_date,status,confirmed_weight_kg);
 CREATE TABLE audit_logs(action,entity_type,entity_id,after_json);
 CREATE TABLE sales_settlements(id INTEGER PRIMARY KEY,vehicle_id,lines_json,revision,bill_number);
 `+cargoBatchSchema+earningsSchema)
 names.forEach((name,i)=>db.prepare("INSERT INTO employees VALUES(?,?,?,1,'active')").run(i+1,name,i===4?'crew':'driver'))
 for(const [id,plate,code,date,records] of plans){
  db.prepare('INSERT INTO vehicles VALUES(?)').run(id)
  db.prepare("INSERT INTO cargo_batches(id,code,vehicle_id,plate_snapshot,status,created_by_employee_id,collection_date,driver_employee_id,driver_name_snapshot) VALUES(?,?,?,?,'active',1,?,?,?)").run(id,code,id,plate,date,id===2?1:id,names[id===2?0:id-1])
  db.prepare("INSERT INTO cargo_batch_members(batch_id,employee_id,name_snapshot,role) VALUES(?,?,?,'driver')").run(id,id===2?1:id,names[id===2?0:id-1])
  if(id===1||id===3)db.prepare("INSERT INTO cargo_batch_members(batch_id,employee_id,name_snapshot,role) VALUES(?,?,?,'crew')").run(id,id===1?2:5,names[id===1?1:4])
  for(const [rid,tn,kg] of records){
   db.prepare("INSERT INTO unloading_weight_records VALUES(?,?,?,?,?,'2026-10-01','confirmed',?)").run(rid,id,id,names[id-1],plate,kg)
   db.prepare("INSERT INTO cargo_batch_unloads(record_id,batch_id,ticket_number,mode,submitted_by_employee_id) VALUES(?,?,?,'partial',?)").run(rid,id,tn,id)
  }
 }
 db.exec("INSERT INTO unloading_weight_records VALUES(100,1,1,'PHANG KHONG YEN','QM3028M','2026-09-22','confirmed',500);INSERT INTO cargo_batch_unloads(record_id,batch_id,ticket_number,mode,submitted_by_employee_id) VALUES(100,1,'OLD','partial',1)")
 const invoke=(apply=true)=>spawnSync('python3',['scripts/correct-cargo-20261001.py','--db',path,...(apply?['--apply']:[])],{cwd:new URL('..',import.meta.url),encoding:'utf8'})
 return{db,invoke,close(){db.close();rmSync(dir,{recursive:true,force:true})}}
}
const ctx={role:'owner_admin',employeeId:1}
test('approved correction preserves source links, moves only ten weights, assigns actual crew and is replay safe',()=>{
 const f=fixture(),{db}=f;try{
  const originals=db.prepare('SELECT * FROM cargo_batch_unloads').all()
  assert.equal(earningsReport(db,ctx,'2026-10-01').pendingCompanyKg,0)
  let result=f.invoke(false);assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/PREVIEW OK/)
  assert.equal(db.prepare('SELECT COUNT(*) n FROM cargo_unload_corrections').get().n,0)
  result=f.invoke();assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/SUCCESS/)
  assert.deepEqual(db.prepare('SELECT * FROM cargo_batch_unloads').all(),originals)
  const oct=earningsReport(db,ctx,'2026-10-01');assert.equal(oct.pendingCompanyKg,11410)
  for(const [id,weight] of [[1,2560],[2,2300],[3,2850],[4,3700],[5,2850]])assert.equal(oct.items.find(e=>e.employeeId===id).pendingKg,weight)
  assert.equal(earningsReport(db,ctx,'2026-09-30').pendingCompanyKg,500)
  result=f.invoke();assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/ALREADY APPLIED/)
  assert.equal(db.prepare('SELECT COUNT(*) n FROM cargo_batches').get().n,8)
  assert.equal(db.prepare('SELECT COUNT(*) n FROM audit_logs').get().n,10)
  assert.throws(()=>db.exec('UPDATE cargo_unload_corrections SET batch_id=1'))
  db.prepare("INSERT INTO sales_settlements VALUES(1,999,?,1,'CP-TEST')").run(JSON.stringify([{slipNumber:'TN154571',weightKg:1270}]))
  const q=earningsReport(db,ctx,'2026-10-01').items.find(e=>e.employeeId===2)
  assert.equal(q.driverKg,1270);assert.equal(q.pendingKg,1010)
  assert.equal(earningsReport(db,{employeeId:2},'2026-10-01',{personal:true}).items.length,1)
 }finally{f.close()}
})
test('changed source, paid period and audit failure each refuse or roll back all correction writes',()=>{
 for(const mutation of ["UPDATE unloading_weight_records SET confirmed_weight_kg=1 WHERE id=157", "INSERT INTO earnings_payments VALUES('2026-09-16',1,'{}',1,CURRENT_TIMESTAMP)","CREATE TRIGGER reject_audit BEFORE INSERT ON audit_logs BEGIN SELECT RAISE(ABORT,'test failure'); END;"]){
  const f=fixture();try{f.db.exec(mutation);const r=f.invoke();assert.notEqual(r.status,0);assert.match(r.stderr,/STOPPED - NO CHANGES/);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM cargo_unload_corrections').get().n,0);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM cargo_batches').get().n,4)}finally{f.close()}
 }
})
