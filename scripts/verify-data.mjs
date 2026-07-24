import {db,getSystemStatus} from '../server/database.mjs'

const count=table=>db.prepare(`SELECT COUNT(*) count FROM ${table}`).get().count
const result={
  schemaVersion:getSystemStatus().schemaVersion,
  integrity:db.prepare('PRAGMA integrity_check').get().integrity_check,
  customers:count('customers'),
  branches:count('branches'),
  employees:count('employees'),
  vehicles:count('vehicles'),
  zoneGroups:count('zone_groups'),
  officialGps:db.prepare(`SELECT COUNT(*) count FROM branches WHERE latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180 AND NOT(latitude=0 AND longitude=0)`).get().count,
  authAccounts:count('auth_accounts'),
  kcadmin:db.prepare(`SELECT id,username,role,system_role systemRole,preferred_language preferredLanguage FROM auth_accounts WHERE lower(username)='kcadmin'`).get()||null,
  protectedEmployees:db.prepare(`SELECT id,employee_code employeeCode,name FROM employees WHERE replace(employee_code,'-','') IN ('EMP0001','EMP0002','EMP0003') ORDER BY employee_code`).all()
}
console.log(JSON.stringify(result,null,2))
db.close()
