import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {DatabaseSync} from 'node:sqlite'
import {schemaSql} from '../server/schema.mjs'
import {adoptBranchGps,captureBranchGps} from '../server/customerMasterService.mjs'
import {reviewTemporaryLocation} from '../server/specialRequestService.mjs'

function fixture(){
  const db=new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys=ON;'+schemaSql)
  const customer=db.prepare("INSERT INTO customers(jodoo_customer_id,name,status,is_active) VALUES('C1','Customer','active',1)").run()
  db.prepare("INSERT INTO branches(jodoo_branch_id,customer_id,branch_name,status,is_active) VALUES('B1',?,'Branch','active',1)").run(customer.lastInsertRowid)
  const employee=db.prepare("INSERT INTO employees(employee_code,name,job_role) VALUES('SUP-1','Review Supervisor','Supervisor')").run()
  const account=db.prepare("INSERT INTO auth_accounts(employee_id,username,password_hash,role,system_role,must_change_password) VALUES(?,'reviewer','hash','supervisor','supervisor',0)").run(employee.lastInsertRowid)
  return{db,reviewerAccountId:Number(account.lastInsertRowid)}
}

function pending(db){return captureBranchGps('B1',{latitude:1.5685719,longitude:110.3024682,accuracyM:10,capturedBy:'Field Driver',gpsRemark:'Receiving entrance'},db)}

test('Adopt stores one authenticated reviewer and one reason consistently across all four audit surfaces',()=>{
  const{db,reviewerAccountId}=fixture(),temporary=pending(db),reason='主管现场资料确认'
  adoptBranchGps(temporary.id,{adoptedBy:'Review Supervisor',adoptedByAccountId:reviewerAccountId,reason},db)
  const reviewed=db.prepare('SELECT * FROM temporary_locations WHERE id=?').get(temporary.id)
  assert.equal(reviewed.verification_status,'adopted')
  assert.equal(reviewed.reviewed_by_account_id,reviewerAccountId)
  assert.equal(reviewed.reviewed_by,'Review Supervisor')
  assert.equal(reviewed.review_reason,reason)
  assert.ok(reviewed.reviewed_at)
  assert.equal(reviewed.captured_by,'Field Driver')
  const gpsHistory=db.prepare("SELECT * FROM branch_gps_history WHERE branch_id=1 AND action='approved'").get()
  assert.equal(gpsHistory.actor,'Review Supervisor')
  assert.equal(gpsHistory.reason,reason)
  const master=db.prepare("SELECT * FROM master_change_history WHERE entity_id='B1' AND change_type='official_gps_adopted'").get()
  assert.equal(master.changed_by,'Review Supervisor')
  assert.equal(master.reason,reason)
  const audit=db.prepare("SELECT * FROM audit_logs WHERE action='temporary_gps_reviewed'").get(),details=JSON.parse(audit.after_json)
  assert.equal(details.temporaryLocationId,temporary.id)
  assert.equal(details.decidedBy,'Review Supervisor')
  assert.equal(details.reviewedByAccountId,reviewerAccountId)
  assert.equal(details.reason,reason)
  assert.deepEqual(new Set([reviewed.review_reason,gpsHistory.reason,master.reason,details.reason]),new Set([reason]))
})

test('Adopt audit failure rolls back Official GPS, Temporary status, history and master audit together',()=>{
  const{db,reviewerAccountId}=fixture(),temporary=pending(db)
  db.exec("CREATE TRIGGER reject_gps_audit BEFORE INSERT ON audit_logs WHEN NEW.action='temporary_gps_reviewed' BEGIN SELECT RAISE(ABORT,'audit failed'); END")
  assert.throws(()=>adoptBranchGps(temporary.id,{adoptedBy:'Review Supervisor',adoptedByAccountId:reviewerAccountId,reason:'Verified'},db),/audit failed/)
  const branch=db.prepare("SELECT latitude,longitude FROM branches WHERE jodoo_branch_id='B1'").get(),reviewed=db.prepare('SELECT verification_status,reviewed_at FROM temporary_locations WHERE id=?').get(temporary.id)
  assert.equal(branch.latitude,null)
  assert.equal(branch.longitude,null)
  assert.equal(reviewed.verification_status,'pending_supervisor')
  assert.equal(reviewed.reviewed_at,null)
  assert.equal(db.prepare('SELECT COUNT(*) n FROM branch_gps_history').get().n,0)
  assert.equal(db.prepare("SELECT COUNT(*) n FROM master_change_history WHERE change_type='official_gps_adopted'").get().n,0)
})

test('Reject remains transactional and records authenticated reviewer separately from capturer',()=>{
  const{db,reviewerAccountId}=fixture(),temporary=pending(db)
  const result=reviewTemporaryLocation(temporary.id,{decision:'reject',reason:'Wrong entrance',reviewedBy:'Review Supervisor',reviewedByAccountId:reviewerAccountId},db)
  assert.equal(result.verification_status,'rejected')
  assert.equal(result.reviewed_by_account_id,reviewerAccountId)
  assert.equal(result.reviewed_by,'Review Supervisor')
  assert.equal(result.captured_by,'Field Driver')
  assert.equal(db.prepare("SELECT latitude FROM branches WHERE jodoo_branch_id='B1'").get().latitude,null)
  assert.equal(JSON.parse(db.prepare("SELECT after_json FROM audit_logs WHERE action='temporary_gps_reviewed'").get().after_json).reason,'Wrong entrance')
})

test('GPS adopt route forwards authenticated Session account id and never accepts a frontend reviewer id',()=>{
  const source=readFileSync(new URL('../server/index.mjs',import.meta.url),'utf8')
  assert.match(source,/adoptedBy:session\.employeeName,adoptedByAccountId:session\.id,changedBy:session\.employeeName/)
})
