import crypto from 'node:crypto'
import {DatabaseSync} from 'node:sqlite'
import fs from 'node:fs'
import path from 'node:path'

const args=process.argv.slice(2)
if(args.length!==2||args[0]!=='--snapshot'||!args[1]||args[1].startsWith('--'))throw new Error('Historical v16→v17 postflight verifier usage: --snapshot <v16-preflight-json>')
if(!process.env.KCS_DB_PATH)throw new Error('KCS_DB_PATH is required for the migrated v17 database')
const databasePath=path.resolve(process.env.KCS_DB_PATH),snapshotPath=path.resolve(args[1])
if(!fs.existsSync(databasePath)||!fs.existsSync(snapshotPath))throw new Error('Migrated v17 database or historical snapshot not found')
const before=JSON.parse(fs.readFileSync(snapshotPath,'utf8'))
const countKeys=['customers','branches','employees','vehicles','zoneGroups','officialGps','authAccounts']
const isRecord=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)
if(!isRecord(before)||before.schemaVersion!==16||before.integrity!=='ok'||!isRecord(before.counts))throw new Error('Invalid historical v16 preflight snapshot')
for(const key of countKeys)if(!Number.isSafeInteger(before.counts[key])||before.counts[key]<0)throw new Error(`Invalid historical count: ${key}`)
if(!Array.isArray(before.employees)||before.employees.length===0)throw new Error('Invalid historical snapshot: employees must be a non-empty array')
if(!Array.isArray(before.authAccounts)||before.authAccounts.length===0)throw new Error('Invalid historical snapshot: authAccounts must be a non-empty array')
for(const employee of before.employees)if(!isRecord(employee)||!Number.isSafeInteger(employee.id)||typeof employee.employeeCode!=='string'||typeof employee.name!=='string'||typeof employee.employmentStatus!=='string'||![0,1].includes(employee.isActive))throw new Error('Invalid historical snapshot: malformed employee sentinel')
for(const account of before.authAccounts)if(!isRecord(account)||!Number.isSafeInteger(account.id)||!Number.isSafeInteger(account.employeeId)||typeof account.username!=='string'||typeof account.role!=='string'||![0,1].includes(account.isActive)||!/^[a-f0-9]{64}$/.test(account.passwordFingerprint))throw new Error('Invalid historical snapshot: malformed account sentinel')
const fingerprint=value=>crypto.createHash('sha256').update(String(value)).digest('hex')
const db=new DatabaseSync(databasePath,{readOnly:true})
let after
try{
  const scalar=sql=>Number(db.prepare(sql).get().count)
  const employees=db.prepare('SELECT id,employee_code employeeCode,name,employment_status employmentStatus,is_active isActive FROM employees ORDER BY id').all()
  const accounts=db.prepare('SELECT id,employee_id employeeId,username,role,is_active isActive,password_hash passwordHash FROM auth_accounts ORDER BY id').all().map(({passwordHash,...account})=>({...account,passwordFingerprint:fingerprint(passwordHash)}))
  after={schemaVersion:Number(db.prepare('SELECT COALESCE(MAX(version),0) version FROM schema_meta').get().version),integrity:db.prepare('PRAGMA integrity_check').get().integrity_check,employees,accounts,counts:{customers:scalar('SELECT COUNT(*) count FROM customers'),branches:scalar('SELECT COUNT(*) count FROM branches'),employees:employees.length,vehicles:scalar('SELECT COUNT(*) count FROM vehicles'),zoneGroups:scalar('SELECT COUNT(*) count FROM zone_groups'),officialGps:scalar("SELECT COUNT(*) count FROM branches WHERE latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180 AND NOT(latitude=0 AND longitude=0)"),authAccounts:accounts.length}}
}finally{db.close()}
const failures=[]
if(after.schemaVersion!==17)failures.push(`schema is v${after.schemaVersion}, expected v17`)
if(after.integrity!=='ok')failures.push(`integrity is ${after.integrity}`)
for(const key of countKeys)if(after.counts[key]<before.counts[key])failures.push(`${key} decreased from ${before.counts[key]} to ${after.counts[key]}`)
for(const employee of before.employees){const current=after.employees.find(item=>item.id===employee.id);if(!current||JSON.stringify(current)!==JSON.stringify(employee))failures.push(`employee ${employee.id} missing or changed`)}
for(const account of before.authAccounts){const current=after.accounts.find(item=>item.id===account.id);if(!current||current.employeeId!==account.employeeId||current.username!==account.username||current.role!==account.role||current.isActive!==account.isActive||current.passwordFingerprint!==account.passwordFingerprint)failures.push(`account ${account.id} identity/role/status/password changed`)}
if(failures.length)throw new Error(`Historical v17 postflight verification failed:\n- ${failures.join('\n- ')}`)
console.log(JSON.stringify({ok:true,scope:'historical-v16-to-v17-postflight',schemaVersion:after.schemaVersion,integrity:after.integrity,beforeCounts:before.counts,afterCounts:after.counts},null,2))
