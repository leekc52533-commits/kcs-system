import crypto from 'node:crypto'
import {DatabaseSync} from 'node:sqlite'
import fs from 'node:fs'
import path from 'node:path'

const args=process.argv.slice(2)
if(args.length!==2||args[0]!=='--snapshot'||!args[1]||args[1].startsWith('--'))throw new Error('Historical v16→v17 rehearsal verifier usage: --snapshot <v16-preflight-json>')
if(!process.env.KCS_DB_PATH)throw new Error('KCS_DB_PATH is required for the rehearsal copy')
const databasePath=path.resolve(process.env.KCS_DB_PATH),snapshotPath=path.resolve(args[1])
if(!fs.existsSync(databasePath)||!fs.existsSync(snapshotPath))throw new Error('Rehearsal database or historical snapshot not found')
const before=JSON.parse(fs.readFileSync(snapshotPath,'utf8'))
const countKeys=['customers','branches','employees','vehicles','zoneGroups','officialGps','authAccounts']
if(!before||before.schemaVersion!==16||before.integrity!=='ok'||!before.counts||!Array.isArray(before.employees)||!Array.isArray(before.authAccounts))throw new Error('Invalid historical v16 preflight snapshot')
for(const key of countKeys)if(!Number.isSafeInteger(before.counts[key])||before.counts[key]<0)throw new Error(`Invalid historical count: ${key}`)
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
for(const account of before.authAccounts){const current=after.accounts.find(item=>item.id===account.id);if(!current||current.employeeId!==account.employeeId||current.username!==account.username||current.isActive!==account.isActive||current.passwordFingerprint!==account.passwordFingerprint)failures.push(`account ${account.id} identity/status/password changed`)}
if(failures.length)throw new Error(`Historical v17 rehearsal verification failed:\n- ${failures.join('\n- ')}`)
console.log(JSON.stringify({ok:true,scope:'historical-v16-to-v17-rehearsal-after',schemaVersion:after.schemaVersion,integrity:after.integrity,beforeCounts:before.counts,afterCounts:after.counts},null,2))
