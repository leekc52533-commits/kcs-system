import crypto from 'node:crypto'
import {DatabaseSync} from 'node:sqlite'
import fs from 'node:fs'
import path from 'node:path'

const EXPECTED_SCHEMA_VERSION=41
const SNAPSHOT_FORMAT_VERSION=1
const COUNT_KEYS=['customers','branches','employees','authAccounts','vehicles','zoneGroups','officialGps']
const args=process.argv.slice(2)
const option=name=>{const indexes=args.flatMap((item,index)=>item===name?[index]:[]);if(indexes.length!==1||!args[indexes[0]+1]||args[indexes[0]+1].startsWith('--'))throw new Error(`Exactly one ${name} value is required`);return args[indexes[0]+1]}
if(!process.env.KCS_DB_PATH)throw new Error('KCS_DB_PATH is required; no database path is inferred')
const mode=option('--mode'),snapshotPath=path.resolve(option('--snapshot'))
if(!['before','after'].includes(mode))throw new Error('--mode must be before or after')
const requestedDatabasePath=path.resolve(process.env.KCS_DB_PATH)
if(!fs.existsSync(requestedDatabasePath))throw new Error(`Database not found: ${requestedDatabasePath}`)
const databasePath=fs.realpathSync.native(requestedDatabasePath)
if(mode==='after'&&!fs.existsSync(snapshotPath))throw new Error(`Before snapshot not found: ${snapshotPath}`)

const db=new DatabaseSync(databasePath,{readOnly:true})
const scalar=sql=>Number(db.prepare(sql).get().count)
const fingerprint=value=>crypto.createHash('sha256').update(String(value)).digest('hex')
let state
try{
  const employees=db.prepare('SELECT id, employee_code AS employeeCode, name, employment_status AS employmentStatus, is_active AS isActive FROM employees ORDER BY id').all()
  const accounts=db.prepare('SELECT id, employee_id AS employeeId, username, role, is_active AS isActive, password_hash AS passwordHash FROM auth_accounts ORDER BY id').all()
  state={
    formatVersion:SNAPSHOT_FORMAT_VERSION,capturedAt:new Date().toISOString(),databasePath,
    schemaVersion:Number(db.prepare('SELECT COALESCE(MAX(version),0) AS version FROM schema_meta').get().version),
    integrity:db.prepare('PRAGMA integrity_check').get().integrity_check,
    counts:{
      customers:scalar('SELECT COUNT(*) AS count FROM customers'),branches:scalar('SELECT COUNT(*) AS count FROM branches'),
      employees:employees.length,authAccounts:accounts.length,vehicles:scalar('SELECT COUNT(*) AS count FROM vehicles'),
      zoneGroups:scalar('SELECT COUNT(*) AS count FROM zone_groups'),
      officialGps:scalar("SELECT COUNT(*) AS count FROM branches WHERE latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180 AND NOT(latitude=0 AND longitude=0)")
    },
    employeeSentinels:employees,
    accountSentinels:accounts.map(({passwordHash,...account})=>({...account,passwordFingerprint:fingerprint(passwordHash)}))
  }
}finally{db.close()}

if(state.integrity!=='ok')throw new Error(`Integrity check failed: ${state.integrity}`)
if(state.schemaVersion!==EXPECTED_SCHEMA_VERSION)throw new Error(`Schema mismatch: code-only deployment requires v${EXPECTED_SCHEMA_VERSION}, found v${state.schemaVersion}`)

const assertSafeSnapshotDirectory=directory=>{
  if(!fs.existsSync(directory)){fs.mkdirSync(directory,{recursive:true,mode:0o700});return}
  const stat=fs.statSync(directory)
  if(!stat.isDirectory()||(stat.mode&0o077)!==0)throw new Error(`Snapshot directory must be a private directory (0700 or stricter): ${directory}`)
}
const isRecord=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)
const validateSnapshot=before=>{
  if(!isRecord(before))throw new Error('Malformed snapshot: root must be an object')
  if(before.formatVersion!==SNAPSHOT_FORMAT_VERSION)throw new Error(`Unsupported snapshot formatVersion: ${before.formatVersion}`)
  if(typeof before.databasePath!=='string')throw new Error('Malformed snapshot: databasePath is required')
  let beforeDatabasePath
  try{beforeDatabasePath=fs.realpathSync.native(before.databasePath)}catch{throw new Error('Malformed snapshot: databasePath does not exist')}
  if(beforeDatabasePath!==databasePath)throw new Error(`Snapshot databasePath mismatch: expected ${databasePath}, found ${beforeDatabasePath}`)
  if(before.schemaVersion!==EXPECTED_SCHEMA_VERSION)throw new Error(`Malformed snapshot: schemaVersion must be ${EXPECTED_SCHEMA_VERSION}`)
  if(before.integrity!=='ok')throw new Error('Malformed snapshot: integrity must be ok')
  if(!isRecord(before.counts))throw new Error('Malformed snapshot: counts is required')
  for(const key of COUNT_KEYS)if(!Number.isSafeInteger(before.counts[key])||before.counts[key]<0)throw new Error(`Malformed snapshot: counts.${key} must be a non-negative integer`)
  if(!Array.isArray(before.employeeSentinels)||before.employeeSentinels.length===0)throw new Error('Malformed snapshot: employeeSentinels must be a non-empty array')
  if(!Array.isArray(before.accountSentinels)||before.accountSentinels.length===0)throw new Error('Malformed snapshot: accountSentinels must be a non-empty array')
  for(const employee of before.employeeSentinels)if(!isRecord(employee)||!Number.isSafeInteger(employee.id)||typeof employee.employeeCode!=='string'||typeof employee.name!=='string'||typeof employee.employmentStatus!=='string'||![0,1].includes(employee.isActive))throw new Error('Malformed snapshot: invalid employee sentinel')
  for(const account of before.accountSentinels)if(!isRecord(account)||!Number.isSafeInteger(account.id)||!Number.isSafeInteger(account.employeeId)||typeof account.username!=='string'||typeof account.role!=='string'||![0,1].includes(account.isActive)||!/^[a-f0-9]{64}$/.test(account.passwordFingerprint))throw new Error('Malformed snapshot: invalid account sentinel')
  return before
}

if(mode==='before'){
  assertSafeSnapshotDirectory(path.dirname(snapshotPath))
  fs.writeFileSync(snapshotPath,`${JSON.stringify(state,null,2)}\n`,{encoding:'utf8',flag:'wx',mode:0o600})
  console.log(JSON.stringify({ok:true,mode,snapshotPath,...state},null,2))
}else{
  let before
  try{before=validateSnapshot(JSON.parse(fs.readFileSync(snapshotPath,'utf8')))}catch(error){if(error instanceof SyntaxError)throw new Error(`Malformed snapshot JSON: ${error.message}`);throw error}
  const failures=[]
  for(const key of COUNT_KEYS)if(state.counts[key]<before.counts[key])failures.push(`${key} count decreased from ${before.counts[key]} to ${state.counts[key]}`)
  for(const employee of before.employeeSentinels){const current=state.employeeSentinels.find(item=>item.id===employee.id);if(!current)failures.push(`employee ${employee.id} is missing`);else if(JSON.stringify(current)!==JSON.stringify(employee))failures.push(`employee ${employee.id} identity/status changed`)}
  for(const account of before.accountSentinels){const current=state.accountSentinels.find(item=>item.id===account.id);if(!current)failures.push(`account ${account.id} is missing`);else if(JSON.stringify(current)!==JSON.stringify(account))failures.push(`account ${account.id} identity/status/password fingerprint changed`)}
  if(failures.length)throw new Error(`Code-only preservation check failed:\n- ${failures.join('\n- ')}`)
  console.log(JSON.stringify({ok:true,mode,preserved:true,schemaVersion:state.schemaVersion,integrity:state.integrity,beforeCounts:before.counts,afterCounts:state.counts},null,2))
}
