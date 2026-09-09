import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {schemaSql} from '../server/schema.mjs'
import {createEmployeeWithAccount} from '../server/employeeAccountService.mjs'
import {endEmployeeEmployment,rehireEmployee} from '../server/resourceService.mjs'
import {login,getSession,updateAccount} from '../server/authService.mjs'
const owner={username:'Admin',role:'owner_admin'}
const payload={name:'Test employee',jobRole:'Driver',employmentStatus:'active',employmentStartDate:'2026-01-01',loginAccount:{username:'test-employee',password:'TestPass123!',role:'driver'}}
function db(){const d=new DatabaseSync(':memory:');d.exec('PRAGMA foreign_keys=ON;'+schemaSql);return d}
test('employee and optional account commit together; rejected account rolls back employee/history',()=>{
 const d=db();const one=createEmployeeWithAccount(payload,owner,{},d);assert.ok(one.accountId)
 assert.throws(()=>createEmployeeWithAccount({...payload,name:'Duplicate login'},owner,{},d))
 assert.equal(d.prepare('SELECT COUNT(*) n FROM employees').get().n,1)
 assert.equal(d.prepare('SELECT COUNT(*) n FROM employee_employment_history').get().n,1)
 assert.throws(()=>createEmployeeWithAccount({...payload,name:'Unauthorized'}, {role:'office'}, {},d))
 assert.equal(d.prepare('SELECT COUNT(*) n FROM employees').get().n,1);d.close()
})
test('departure immediately disables login and revokes all sessions; rehire never revives old tokens',()=>{
 const d=db(),e=createEmployeeWithAccount(payload,owner,{},d)
 const first=login({username:'test-employee',password:'TestPass123!'}, {},d),second=login({username:'test-employee',password:'TestPass123!'}, {},d)
 assert.ok(getSession(first.token,d))
 endEmployeeEmployment(e.id,{employmentStatus:'resigned',lastWorkingDay:'2026-09-09',employmentEndDate:'2026-09-09',resignationTerminationReason:'Confirmed departure',changedBy:'Admin'},d)
 assert.equal(getSession(first.token,d),null);assert.equal(getSession(second.token,d),null)
 assert.equal(d.prepare('SELECT COUNT(*) n FROM auth_sessions WHERE revoked_at IS NULL').get().n,0)
 assert.throws(()=>login({username:'test-employee',password:'TestPass123!'}, {},d))
 assert.throws(()=>updateAccount(e.accountId,{isActive:true},owner,{},d),/STAFF_ACCOUNT_INELIGIBLE/)
 assert.equal(d.prepare('SELECT COUNT(*) n FROM employees').get().n,1)
 rehireEmployee(e.id,{employmentStartDate:'2026-09-10',reason:'Rehired',reactivateAccount:true},d)
 assert.equal(getSession(first.token,d),null)
 assert.ok(login({username:'test-employee',password:'TestPass123!'}, {},d).token)
 assert.equal(d.prepare('SELECT COUNT(*) n FROM employee_employment_history').get().n,2);d.close()
})
test('manual disable and password reset revoke old login tokens',()=>{
 const d=db(),e=createEmployeeWithAccount(payload,owner,{},d),one=login({username:'test-employee',password:'TestPass123!'}, {},d)
 updateAccount(e.accountId,{isActive:false},owner,{},d);updateAccount(e.accountId,{isActive:true},owner,{},d);assert.equal(getSession(one.token,d),null)
 const two=login({username:'test-employee',password:'TestPass123!'}, {},d);updateAccount(e.accountId,{password:'NewPass123!'},owner,{},d);assert.equal(getSession(two.token,d),null);d.close()
})
