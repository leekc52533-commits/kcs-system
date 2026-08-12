import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {schemaSql} from '../server/schema.mjs'
import {createEmployee,endEmployeeEmployment,listResources,rehireEmployee,updateEmployee} from '../server/resourceService.mjs'
import {employeeDirectoryValue} from '../src/employeeMasterState.js'
import {translate} from '../src/translations.js'

function database(){const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON;'+schemaSql);return db}

test('Current Start Date saves to the current Employment Period and all three views reload the same value',()=>{
  const db=database(),employee=createEmployee({name:'Current Worker',jobRole:'Driver',employmentStartDate:'2026-01-01',changedBy:'Owner'},db)
  const updated=updateEmployee(employee.id,{employmentStartDate:'2026-04-07',reason:'Correct confirmed start date',changedBy:'Owner'},db)
  const stored=db.prepare('SELECT employment_start_date value FROM employees WHERE id=?').get(employee.id).value
  const period=db.prepare("SELECT * FROM employee_employment_history WHERE employee_id=? AND end_date IS NULL AND employment_status='active'").get(employee.id)
  assert.equal(stored,'2026-04-07')
  assert.equal(period.start_date,'2026-04-07')
  assert.equal(updated.employmentStartDate,'2026-04-07')
  assert.equal(updated.employmentPeriods[0].startDate,'2026-04-07')
  assert.equal(employeeDirectoryValue(updated,'currentStartDate'),'2026-04-07')
  const audit=db.prepare("SELECT * FROM employee_change_history WHERE field_name LIKE 'employment_period_start_date:%' ORDER BY id DESC").get()
  assert.equal(audit.old_value,'2026-01-01');assert.equal(audit.new_value,'2026-04-07');assert.equal(audit.reason,'Correct confirmed start date');assert.equal(audit.changed_by,'Owner')
})

test('an active employee without a current Period gets exactly one current Period when Start Date is saved',()=>{
  const db=database(),employee=createEmployee({name:'Missing Period',jobRole:'Office',changedBy:'Owner'},db)
  db.prepare('DELETE FROM employee_employment_history WHERE employee_id=?').run(employee.id)
  updateEmployee(employee.id,{employmentStartDate:'2026-04-07',reason:'Create missing current period',changedBy:'Owner'},db)
  const periods=db.prepare('SELECT * FROM employee_employment_history WHERE employee_id=?').all(employee.id)
  assert.equal(periods.length,1);assert.equal(periods[0].start_date,'2026-04-07');assert.equal(periods[0].employment_status,'active')
})

test('updating a rehired employee changes only the current Period and preserves closed history',()=>{
  const db=database(),employee=createEmployee({name:'Rehire Worker',jobRole:'Driver',employmentStartDate:'2024-01-10',changedBy:'Owner'},db)
  endEmployeeEmployment(employee.id,{employmentStatus:'contract_end',lastWorkingDay:'2024-12-30',employmentEndDate:'2024-12-31',resignationTerminationReason:'Contract complete',changedBy:'Owner'},db)
  const closed={...db.prepare('SELECT * FROM employee_employment_history WHERE employee_id=? ORDER BY id').get(employee.id)}
  rehireEmployee(employee.id,{employmentStartDate:'2025-02-01',jobRole:'Driver',employmentType:'Permanent',reason:'Approved rehire',changedBy:'Owner'},db)
  updateEmployee(employee.id,{employmentStartDate:'2025-02-03',reason:'Correct rehire date',changedBy:'Owner'},db)
  const periods=db.prepare('SELECT * FROM employee_employment_history WHERE employee_id=? ORDER BY id').all(employee.id)
  assert.deepEqual({...periods[0]},closed)
  assert.equal(periods[1].start_date,'2025-02-03')
})

test('empty current date remains empty and directory reports no current date',()=>{
  const db=database(),employee=createEmployee({name:'No Date',jobRole:'Other',changedBy:'Owner'},db)
  const listed=listResources(db).employees.find(item=>item.id===employee.id)
  assert.equal(listed.employmentStartDate,null)
  assert.equal(employeeDirectoryValue(listed,'currentStartDate'),'')
})

test('the active Employment Period is the read source and unrelated edits do not silently rewrite compatibility data',()=>{
  const db=database(),employee=createEmployee({name:'Source Worker',jobRole:'Driver',employmentStartDate:'2026-01-01',changedBy:'Owner'},db)
  db.prepare('UPDATE employees SET employment_start_date=NULL WHERE id=?').run(employee.id)
  let listed=listResources(db).employees.find(item=>item.id===employee.id)
  assert.equal(listed.employmentStartDate,'2026-01-01')
  updateEmployee(employee.id,{phone:'0101234567',reason:'Update phone only',changedBy:'Owner'},db)
  assert.equal(db.prepare('SELECT employment_start_date value FROM employees WHERE id=?').get(employee.id).value,null)
  listed=listResources(db).employees.find(item=>item.id===employee.id)
  assert.equal(listed.employmentStartDate,'2026-01-01')
})

test('period audit failure rolls back both compatibility field and current Period update',()=>{
  const db=database(),employee=createEmployee({name:'Rollback Worker',jobRole:'Driver',employmentStartDate:'2026-01-01',changedBy:'Owner'},db)
  db.exec("CREATE TRIGGER fail_period_start_audit BEFORE INSERT ON employee_change_history WHEN NEW.field_name LIKE 'employment_period_start_date:%' BEGIN SELECT RAISE(ABORT,'period audit failure'); END")
  assert.throws(()=>updateEmployee(employee.id,{employmentStartDate:'2026-04-07',reason:'Will roll back',changedBy:'Owner'},db),/period audit failure/)
  assert.equal(db.prepare('SELECT employment_start_date value FROM employees WHERE id=?').get(employee.id).value,'2026-01-01')
  assert.equal(db.prepare('SELECT start_date value FROM employee_employment_history WHERE employee_id=?').get(employee.id).value,'2026-01-01')
})

test('Current Start Date and Employment Period labels are complete in EN, BM and ZH',()=>{
  for(const language of ['en','ms','zh'])for(const key of ['employee.startDate','employee.period','employee.periodStartDate','employee.periodCurrent','employee.periodClosed','employee.present','common.notProvided'])assert.notEqual(translate(language,key),key)
  assert.notEqual(translate('ms','employee.periodStartDate'),translate('en','employee.periodStartDate'))
  assert.notEqual(translate('zh','employee.periodStartDate'),translate('en','employee.periodStartDate'))
})
