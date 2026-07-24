import crypto from 'node:crypto'
import {DatabaseSync} from 'node:sqlite'
import fs from 'node:fs'
import path from 'node:path'

const args=process.argv.slice(2)
const value=name=>{const index=args.indexOf(name);return index>=0?args[index+1]:null}
const mode=value('--mode')
const snapshotPath=value('--snapshot')
const databasePath=path.resolve(process.env.KCS_DB_PATH||'')
if(!['before','after'].includes(mode)||!snapshotPath||!process.env.KCS_DB_PATH)throw new Error('Usage: KCS_DB_PATH=/var/lib/kcs/data/kcs-dispatch.db node scripts/cloud-preflight.mjs --mode before|after --snapshot <absolute-json-path>')
if(!fs.existsSync(databasePath))throw new Error(`Production database not found: ${databasePath}`)

const db=new DatabaseSync(databasePath,{readOnly:true})
const tableCount=table=>db.prepare(`SELECT COUNT(*) count FROM ${table}`).get().count
const hasColumn=(table,column)=>db.prepare(`PRAGMA table_info(${table})`).all().some(item=>item.name===column)
const employeeRows=db.prepare(`SELECT id,employee_code employeeCode,name,employment_status employmentStatus,is_active isActive FROM employees ORDER BY id`).all()
const accountRows=db.prepare(`SELECT a.id,a.employee_id employeeId,a.username,a.role,a.is_active isActive,a.password_hash passwordHash,e.employee_code employeeCode,e.name employeeName FROM auth_accounts a JOIN employees e ON e.id=a.employee_id ORDER BY a.id`).all()
const publicAccounts=accountRows.map(item=>({
  id:item.id,
  employeeId:item.employeeId,
  username:item.username,
  role:item.role,
  isActive:item.isActive,
  employeeCode:item.employeeCode,
  employeeName:item.employeeName
}))
const protectedAccounts=accountRows.map(item=>({...publicAccounts.find(account=>account.id===item.id),passwordFingerprint:crypto.createHash('sha256').update(item.passwordHash).digest('hex')}))
const normalize=value=>String(value||'').replaceAll('-','').toUpperCase()
const emp0003=employeeRows.find(item=>normalize(item.employeeCode)==='EMP0003')||null
const emp0003Account=emp0003?publicAccounts.find(item=>item.employeeId===emp0003.id)||null:null
const state={
  capturedAt:new Date().toISOString(),
  databasePath,
  schemaVersion:Number(db.prepare('SELECT COALESCE(MAX(version),0) version FROM schema_meta').get().version),
  integrity:db.prepare('PRAGMA integrity_check').get().integrity_check,
  counts:{
    customers:tableCount('customers'),branches:tableCount('branches'),employees:employeeRows.length,
    vehicles:tableCount('vehicles'),zoneGroups:tableCount('zone_groups'),
    officialGps:db.prepare(`SELECT COUNT(*) count FROM branches WHERE latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180 AND NOT(latitude=0 AND longitude=0)`).get().count,
    authAccounts:accountRows.length
  },
  employees:employeeRows,
  authAccounts:protectedAccounts,
  emp0003,
  emp0003Account,
  kcadmin:publicAccounts.find(item=>String(item.username).toLowerCase()==='kcadmin')||null,
  v17Columns:{systemRole:hasColumn('auth_accounts','system_role'),preferredLanguage:hasColumn('auth_accounts','preferred_language')}
}
db.close()
if(state.integrity!=='ok')throw new Error(`Production integrity check failed: ${state.integrity}`)
if(!state.kcadmin)throw new Error('Preflight blocked: kcadmin is missing')
if(!state.emp0003||state.emp0003.name!=='SUNDARAMUTI BIN MOHAMMAD')throw new Error('Preflight blocked: EMP0003 / SUNDARAMUTI BIN MOHAMMAD is missing or mismatched')
if(!state.emp0003Account)throw new Error('Preflight blocked: EMP0003 login account is missing')

if(mode==='before'){
  if(state.schemaVersion!==16)throw new Error(`Preflight blocked: expected production schema v16 before deployment, found v${state.schemaVersion}`)
  fs.mkdirSync(path.dirname(path.resolve(snapshotPath)),{recursive:true})
  fs.writeFileSync(path.resolve(snapshotPath),JSON.stringify(state,null,2),{encoding:'utf8',flag:'wx',mode:0o600})
  console.log(JSON.stringify({...state,authAccounts:publicAccounts},null,2))
}else{
  const before=JSON.parse(fs.readFileSync(path.resolve(snapshotPath),'utf8'))
  const failures=[]
  for(const [key,count] of Object.entries(before.counts))if(state.counts[key]<count)failures.push(`${key} decreased from ${count} to ${state.counts[key]}`)
  for(const employee of before.employees){const current=state.employees.find(item=>item.id===employee.id);if(!current)failures.push(`employee id ${employee.id} missing`);else if(current.employeeCode!==employee.employeeCode||current.name!==employee.name||current.isActive!==employee.isActive)failures.push(`employee id ${employee.id} identity/status changed`)}
  for(const account of before.authAccounts){const current=state.authAccounts.find(item=>item.id===account.id);if(!current)failures.push(`auth account id ${account.id} missing`);else if(current.employeeId!==account.employeeId||current.username!==account.username||current.isActive!==account.isActive||current.passwordFingerprint!==account.passwordFingerprint)failures.push(`auth account id ${account.id} identity/status/password changed`)}
  if(state.schemaVersion<17)failures.push(`schema version is ${state.schemaVersion}, expected at least 17`)
  if(!state.v17Columns.systemRole||!state.v17Columns.preferredLanguage)failures.push('v17 auth columns are missing')
  if(failures.length)throw new Error(`Postflight preservation check failed:\n- ${failures.join('\n- ')}`)
  console.log(JSON.stringify({ok:true,preserved:true,beforeCounts:before.counts,afterCounts:state.counts,emp0003:state.emp0003,emp0003Account:state.emp0003Account,kcadmin:state.kcadmin,schemaVersion:state.schemaVersion,integrity:state.integrity},null,2))
}
