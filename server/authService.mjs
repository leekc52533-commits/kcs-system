import crypto from 'node:crypto'
import { db as defaultDb } from './database.mjs'
import { kuchingDate } from '../shared/kuchingTime.js'

export const SYSTEM_ROLES = new Set(['owner_admin','operations_admin','supervisor','office','driver','crew'])
export const LANGUAGES = new Set(['ms','zh','en'])
const SESSION_HOURS = 12
const text = value => String(value ?? '').trim()
const nowIso = () => new Date().toISOString()
const audit = (database,{accountId=null,employeeId=null,username=null,action,success,ipAddress=null,userAgent=null,detail=null,actor=null}) =>
  database.prepare(`INSERT INTO auth_audit_logs(account_id,employee_id,username,action,success,ip_address,user_agent,detail_json,actor) VALUES(?,?,?,?,?,?,?,?,?)`)
    .run(accountId,employeeId,username,action,success?1:0,ipAddress,userAgent,detail?JSON.stringify(detail):null,actor)

const normalizeRole = role => {
  const value = text(role).toLowerCase()
  return value === 'admin' ? 'owner_admin' : value
}
const legacyRole = role => ['owner_admin','operations_admin'].includes(role) ? 'admin' : role
const resolvedRole = row => normalizeRole(row?.system_role || (String(row?.username).toLowerCase()==='kcadmin' ? 'owner_admin' : row?.role))
const language = value => LANGUAGES.has(text(value).toLowerCase()) ? text(value).toLowerCase() : 'en'

export function hashPassword(password){
  if(String(password||'').length<8) throw new Error('密码至少需要 8 个字符')
  const salt=crypto.randomBytes(16),derived=crypto.scryptSync(String(password),salt,64)
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`
}

export function verifyPassword(password,stored){
  const [method,saltHex,hashHex]=String(stored||'').split('$')
  if(method!=='scrypt'||!saltHex||!hashHex)return false
  const expected=Buffer.from(hashHex,'hex'),actual=crypto.scryptSync(String(password||''),Buffer.from(saltHex,'hex'),expected.length)
  return expected.length===actual.length&&crypto.timingSafeEqual(expected,actual)
}

const publicAccount=row=>row&&({
  id:row.id,employeeId:row.employee_id,employeeCode:row.employee_code,employeeName:row.employee_name,
  username:row.username,role:resolvedRole(row),preferredLanguage:language(row.preferred_language),
  isActive:Boolean(row.is_active),mustChangePassword:Boolean(row.must_change_password),lastLoginAt:row.last_login_at,
  passwordChangedAt:row.password_changed_at,failedLoginCount:row.failed_login_count,lockedUntil:row.locked_until,
  createdAt:row.created_at,disabledAt:row.disabled_at
})
const accountSql=`SELECT a.*,e.employee_code,e.name employee_name,e.employment_status FROM auth_accounts a JOIN employees e ON e.id=a.employee_id`
const permissionsFor=(accountId,database)=>database.prepare('SELECT permission FROM auth_account_permissions WHERE account_id=? ORDER BY permission').all(accountId).map(item=>item.permission)
const withPermissions=(account,database)=>account&&({...account,permissions:permissionsFor(account.id,database)})
const change = (database,target,field,oldValue,newValue,actor) => {
  if(String(oldValue??'')===String(newValue??'')) return
  database.prepare(`INSERT INTO auth_account_change_history(target_account_id,field_name,old_value,new_value,changed_by_account_id,changed_by) VALUES(?,?,?,?,?,?)`)
    .run(target.id,field,String(oldValue??''),String(newValue??''),actor?.id||null,actor?.username||actor?.employeeName||'System')
}
const isOwner = account => normalizeRole(account?.role)==='owner_admin'||(!account?.role&&['admin','kcadmin'].includes(String(account?.username||'').toLowerCase()))
const isOperations = account => normalizeRole(account?.role)==='operations_admin'
const assertManageable = (actor,target) => {
  const targetRole=resolvedRole(target)
  if(isOwner(actor)) return
  if(!isOperations(actor) || ['owner_admin','operations_admin'].includes(targetRole)) throw new Error('没有权限管理此账号')
}

export function setupStatus(database=defaultDb){return{needsSetup:database.prepare('SELECT COUNT(*) count FROM auth_accounts').get().count===0}}

export function bootstrapAccount(payload,meta={},database=defaultDb){
  if(!setupStatus(database).needsSetup)throw new Error('系统已经建立管理员账号')
  const name=text(payload.employeeName)||'System Administrator',code=text(payload.employeeCode)||'ADMIN-001',username=text(payload.username)
  if(!username)throw new Error('请输入用户名')
  database.exec('BEGIN IMMEDIATE')
  try{
    const startDate=kuchingDate()
    const employee=database.prepare(`INSERT INTO employees(employee_code,name,job_role,employment_status,employment_detail_status,employment_type,employment_start_date,is_active) VALUES(?,?,'Admin','active','active','Permanent',?,1)`).run(code,name,startDate)
    database.prepare(`INSERT INTO employee_job_roles(employee_id,role,is_primary,created_by) VALUES(?,'Admin',1,'Initial Setup')`).run(employee.lastInsertRowid)
    database.prepare(`INSERT INTO employee_employment_history(employee_id,start_date,employment_status,employment_type,primary_job_role,rehire_flag,created_by) VALUES(?,?,'active','Permanent','Admin',0,'Initial Setup')`).run(employee.lastInsertRowid,startDate)
    const account=database.prepare(`INSERT INTO auth_accounts(employee_id,username,password_hash,role,system_role,preferred_language,must_change_password,created_by) VALUES(?,?,?,?,?,?,1,?)`)
      .run(employee.lastInsertRowid,username,hashPassword(payload.password),'admin','owner_admin',language(payload.preferredLanguage||'zh'),'Initial Setup')
    audit(database,{accountId:Number(account.lastInsertRowid),employeeId:Number(employee.lastInsertRowid),username,action:'account_bootstrap',success:true,...meta,actor:'Initial Setup'})
    database.exec('COMMIT')
    return publicAccount(database.prepare(`${accountSql} WHERE a.id=?`).get(account.lastInsertRowid))
  }catch(error){database.exec('ROLLBACK');throw error}
}

export function createAccount(payload,actor,meta={},database=defaultDb){
  const role=normalizeRole(payload.role),username=text(payload.username),employeeId=Number(payload.employeeId)
  if(!SYSTEM_ROLES.has(role))throw new Error('无效账号角色')
  if(!isOwner(actor)&&!(isOperations(actor)&&!['owner_admin','operations_admin'].includes(role)))throw new Error('没有权限建立此角色账号')
  const employee=employeeId?database.prepare("SELECT id,job_role FROM employees WHERE id=? AND employment_status='active' AND is_active=1").get(employeeId):null
  if(!employee)throw new Error('员工不存在或当前不是Active状态')
  if(!username)throw new Error('请输入用户名')
  if(database.prepare('SELECT 1 FROM auth_accounts WHERE username=? COLLATE NOCASE').get(username))throw new Error('用户名已经使用')
  const result=database.prepare(`INSERT INTO auth_accounts(employee_id,username,password_hash,role,system_role,preferred_language,must_change_password,created_by) VALUES(?,?,?,?,?,?,1,?)`)
    .run(employeeId,username,hashPassword(payload.password),legacyRole(role),role,language(payload.preferredLanguage||(['driver','crew'].includes(role)||['Driver','Attendant / Crew'].includes(employee.job_role)?'ms':'en')),actor?.username||actor?.employeeName||'Admin')
  audit(database,{accountId:Number(result.lastInsertRowid),employeeId,username,action:'account_created',success:true,...meta,actor:actor?.username,detail:{systemRole:role}})
  return publicAccount(database.prepare(`${accountSql} WHERE a.id=?`).get(result.lastInsertRowid))
}

export function listAccounts(database=defaultDb){return database.prepare(`${accountSql} ORDER BY e.name`).all().map(row=>withPermissions(publicAccount(row),database))}

export function updateAccount(id,payload,actor,meta={},database=defaultDb){
  const current=database.prepare(`${accountSql} WHERE a.id=?`).get(id)
  if(!current)throw new Error('账号不存在')
  assertManageable(actor,current)
  const currentRole=resolvedRole(current)
  const requestedRole=payload.role==null?currentRole:normalizeRole(payload.role)
  if(!SYSTEM_ROLES.has(requestedRole))throw new Error('无效账号角色')
  const requestedUsername=payload.username==null?current.username:text(payload.username)
  const changesIdentity=requestedRole!==currentRole||requestedUsername.toLowerCase()!==String(current.username).toLowerCase()
  if(changesIdentity&&!isOwner(actor))throw new Error('只有Owner Admin可以修改System Role或Username')
  if(currentRole==='owner_admin'&&(requestedRole!=='owner_admin'||requestedUsername.toLowerCase()!==String(current.username).toLowerCase()))throw new Error('Owner Admin账号受保护')
  if(requestedRole==='owner_admin'&&currentRole!=='owner_admin')throw new Error('不可把普通账号提升为Owner Admin')
  if(!requestedUsername)throw new Error('请输入用户名')
  const duplicate=database.prepare('SELECT id FROM auth_accounts WHERE username=? COLLATE NOCASE AND id<>?').get(requestedUsername,id)
  if(duplicate)throw new Error('用户名已经使用')
  const isActive=payload.isActive==null?current.is_active:(payload.isActive?1:0)
  database.exec('BEGIN IMMEDIATE')
  try{
    change(database,current,'username',current.username,requestedUsername,actor)
    change(database,current,'system_role',currentRole,requestedRole,actor)
    database.prepare(`UPDATE auth_accounts SET username=?,role=?,system_role=?,is_active=?,disabled_at=CASE WHEN ?=0 THEN CURRENT_TIMESTAMP ELSE NULL END,failed_login_count=CASE WHEN ? THEN 0 ELSE failed_login_count END,locked_until=CASE WHEN ? THEN NULL ELSE locked_until END,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .run(requestedUsername,legacyRole(requestedRole),requestedRole,isActive,isActive,payload.unlock?1:0,payload.unlock?1:0,id)
    if(payload.password)database.prepare(`UPDATE auth_accounts SET password_hash=?,must_change_password=1,password_changed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(hashPassword(payload.password),id)
    if(Array.isArray(payload.permissions)){
      if(!isOwner(actor))throw new Error('只有Owner Admin可以修改额外权限')
      database.prepare('DELETE FROM auth_account_permissions WHERE account_id=?').run(id)
      const insert=database.prepare('INSERT INTO auth_account_permissions(account_id,permission,granted_by) VALUES(?,?,?)')
      for(const permission of [...new Set(payload.permissions.map(text).filter(Boolean))])insert.run(id,permission,actor?.username||'Owner Admin')
    }
    audit(database,{accountId:id,employeeId:current.employee_id,username:requestedUsername,action:isActive?'account_updated':'account_disabled',success:true,...meta,actor:actor?.username,detail:{systemRole:requestedRole,isActive:Boolean(isActive),unlocked:Boolean(payload.unlock)}})
    database.exec('COMMIT')
  }catch(error){database.exec('ROLLBACK');throw error}
  return withPermissions(publicAccount(database.prepare(`${accountSql} WHERE a.id=?`).get(id)),database)
}

export function updateOwnPreferences(session,payload,database=defaultDb){
  const preferredLanguage=language(payload.preferredLanguage)
  if(!LANGUAGES.has(preferredLanguage))throw new Error('不支持的语言')
  database.prepare('UPDATE auth_accounts SET preferred_language=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(preferredLanguage,session.id)
  audit(database,{accountId:session.id,employeeId:session.employeeId,username:session.username,action:'preferences_updated',success:true,actor:session.username,detail:{preferredLanguage}})
  return publicAccount(database.prepare(`${accountSql} WHERE a.id=?`).get(session.id))
}

export function login(payload,meta={},database=defaultDb){
  const username=text(payload.username),row=database.prepare(`${accountSql} WHERE a.username=? COLLATE NOCASE`).get(username)
  const locked=row?.locked_until&&new Date(row.locked_until)>new Date()
  if(!row||!row.is_active||row.employment_status!=='active'||locked||!verifyPassword(payload.password,row.password_hash)){
    if(row&&!locked){const failures=row.failed_login_count+1;const lockUntil=failures>=5?new Date(Date.now()+15*60_000).toISOString():null;database.prepare('UPDATE auth_accounts SET failed_login_count=?,locked_until=COALESCE(?,locked_until),updated_at=CURRENT_TIMESTAMP WHERE id=?').run(failures,lockUntil,row.id)}
    audit(database,{accountId:row?.id,employeeId:row?.employee_id,username,action:'login',success:false,...meta,detail:{reason:!row?'unknown_user':locked?'locked':!row.is_active?'disabled':'invalid_credentials'}})
    throw new Error('用户名或密码错误，或账号暂时被锁定')
  }
  const token=crypto.randomBytes(32).toString('base64url'),tokenHash=crypto.createHash('sha256').update(token).digest('hex'),expiresAt=new Date(Date.now()+SESSION_HOURS*3600_000).toISOString().replace('T',' ').slice(0,19)
  database.exec('BEGIN IMMEDIATE')
  try{
    database.prepare('UPDATE auth_accounts SET failed_login_count=0,locked_until=NULL,last_login_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(row.id)
    database.prepare('INSERT INTO auth_sessions(account_id,token_hash,ip_address,user_agent,expires_at) VALUES(?,?,?,?,?)').run(row.id,tokenHash,meta.ipAddress||null,meta.userAgent||null,expiresAt)
    audit(database,{accountId:row.id,employeeId:row.employee_id,username:row.username,action:'login',success:true,...meta})
    database.exec('COMMIT')
  }catch(error){database.exec('ROLLBACK');throw error}
  return{token,expiresAt,account:publicAccount({...row,last_login_at:nowIso()})}
}

export function getSession(token,database=defaultDb){
  if(!token)return null
  const hash=crypto.createHash('sha256').update(token).digest('hex')
  const row=database.prepare(`${accountSql} JOIN auth_sessions s ON s.account_id=a.id WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>CURRENT_TIMESTAMP AND a.is_active=1 AND e.employment_status='active'`).get(hash)
  if(!row)return null
  database.prepare(`UPDATE auth_sessions SET last_seen_at=CURRENT_TIMESTAMP WHERE token_hash=?`).run(hash)
  return{...publicAccount(row),sessionTokenHash:hash}
}

export function logout(session,database=defaultDb){if(session?.sessionTokenHash)database.prepare('UPDATE auth_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE token_hash=?').run(session.sessionTokenHash)}

export function changePassword(session,payload,database=defaultDb){
  const row=database.prepare('SELECT * FROM auth_accounts WHERE id=?').get(session.id)
  if(!row||!verifyPassword(payload.currentPassword,row.password_hash))throw new Error('当前密码不正确')
  database.prepare(`UPDATE auth_accounts SET password_hash=?,must_change_password=0,password_changed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(hashPassword(payload.newPassword),row.id)
  audit(database,{accountId:row.id,employeeId:row.employee_id,username:row.username,action:'password_changed',success:true,actor:row.username})
  return{ok:true}
}

export function listAuthAudit(params={},database=defaultDb){
  const limit=Math.min(500,Math.max(1,Number(params.limit)||100))
  return database.prepare('SELECT * FROM auth_audit_logs ORDER BY created_at DESC,id DESC LIMIT ?').all(limit).map(row=>({...row,detail:row.detail_json?JSON.parse(row.detail_json):null}))
}

export function roleCan(role,permission){
  const normalized=normalizeRole(role)
  const map={
    owner_admin:new Set(['desktop','accounts','account_identity','sensitive_data','system_security','gps_review','gps_migration','gps_migration_approve','mobile']),
    operations_admin:new Set(['desktop','accounts','employee_manage','vehicle_manage','schedule_manage','gps_review','gps_migration','gps_migration_approve','mobile']),
    supervisor:new Set(['desktop','gps_review','gps_migration','gps_migration_approve','mobile']),
    office:new Set(['desktop','gps_migration','mobile']),
    driver:new Set(['mobile','gps_capture']),
    crew:new Set(['mobile','gps_capture'])
  }
  return Boolean(map[normalized]?.has(permission))
}

export function accountCan(account,permission,database=defaultDb){
  return roleCan(account?.role,permission)||Boolean(account?.id&&database.prepare('SELECT 1 FROM auth_account_permissions WHERE account_id=? AND permission=?').get(account.id,permission))
}
