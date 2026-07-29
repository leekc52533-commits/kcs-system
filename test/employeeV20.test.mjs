import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {schemaSql} from '../server/schema.mjs'
import {applyV20Migration} from '../server/migrationV20.mjs'
import {accountCan,roleCan} from '../server/authService.mjs'
import {createEmployee,updateEmployee} from '../server/resourceService.mjs'
import {masterExport,previewMasterImport} from '../server/masterTransferService.mjs'

const database=()=>{const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON;'+schemaSql);return db}

test('v20 migration adds licence expiry columns without changing employee rows',()=>{
  const db=database();db.exec('DELETE FROM schema_meta;INSERT INTO schema_meta(version) VALUES(19)')
  const before=db.prepare('SELECT COUNT(*) count FROM employees').get().count,result=applyV20Migration(db)
  assert.equal(result.schemaVersion,20);assert.equal(db.prepare('SELECT MAX(version) version FROM schema_meta').get().version,20)
  assert.equal(db.prepare('SELECT COUNT(*) count FROM employees').get().count,before)
  const columns=new Set(db.prepare('PRAGMA table_info(employees)').all().map(row=>row.name))
  assert.ok(columns.has('driving_licence_expiry_date'));assert.ok(columns.has('gdl_expiry_date'))
})

test('owner_admin has employee_manage permission',()=>{
  const db=database()
  assert.equal(roleCan('owner_admin','employee_manage'),true);assert.equal(roleCan('operations_admin','employee_manage'),true)
  assert.equal(roleCan('driver','employee_manage'),false);assert.equal(accountCan({role:'owner_admin'},'employee_manage',db),true)
})

test('licence dates save, audit, export and import preview correctly',()=>{
  const db=database(),employee=createEmployee({name:'Licensed Driver',jobRole:'Driver',drivingLicenceExpiryDate:'2027-01-10',gdlExpiryDate:'2027-02-20',changedBy:'Owner'},db)
  assert.equal(employee.drivingLicenceExpiryDate,'2027-01-10');assert.equal(employee.gdlExpiryDate,'2027-02-20')
  updateEmployee(employee.id,{drivingLicenceExpiryDate:'2028-01-10',reason:'Licence renewed',changedBy:'Owner'},db)
  assert.equal(db.prepare("SELECT new_value FROM employee_change_history WHERE employee_id=? AND field_name='driving_licence_expiry_date' ORDER BY id DESC").get(employee.id).new_value,'2028-01-10')
  const exported=masterExport('employee',{},db).rows[0]
  assert.equal(exported['Driving Licence Expiry Date'],'2028-01-10');assert.equal(exported['GDL Expiry Date'],'2027-02-20')
  const preview=previewMasterImport({module:'employee',fileName:'employee.xlsx',rows:[{...exported,'Driving Licence Expiry Date':'2029-01-10'}]},db)
  assert.equal(preview.summary.update,1);assert.equal(preview.rows[0].normalized.drivingLicenceExpiryDate,'2029-01-10')
})
