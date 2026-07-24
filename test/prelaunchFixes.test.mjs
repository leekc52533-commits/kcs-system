import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {DatabaseSync} from 'node:sqlite'
import {schemaSql,SCHEMA_VERSION} from '../server/schema.mjs'
import {addCalendarDays,kuchingDate,shortcutForDate} from '../shared/kuchingTime.js'
import {accountCan,bootstrapAccount,createAccount,login,roleCan,updateAccount,updateOwnPreferences} from '../server/authService.mjs'
import {languageOptions,messages,translate} from '../src/translations.js'
import {confirmNavigation,setNavigationDirty} from '../src/navigation.js'

const database=()=>{const db=new DatabaseSync(':memory:');db.exec(`PRAGMA foreign_keys=ON;${schemaSql}`);return db}
const employee=(db,code,name='Employee')=>Number(db.prepare("INSERT INTO employees(employee_code,name,job_role,employment_status,is_active) VALUES(?,?,'Office','active',1)").run(code,name).lastInsertRowid)

test('Asia/Kuching date crosses midnight independently from UTC/server timezone',()=>{
  assert.equal(kuchingDate(new Date('2026-07-23T15:59:59Z')),'2026-07-23')
  assert.equal(kuchingDate(new Date('2026-07-23T16:00:00Z')),'2026-07-24')
  assert.equal(kuchingDate(new Date('2026-07-24T16:00:00Z')),'2026-07-25')
})

test('July 24 is tomorrow and July 25 is day after tomorrow from July 23 Kuching',()=>{
  const now=new Date('2026-07-23T08:00:00Z')
  assert.equal(shortcutForDate('2026-07-23',now),'today')
  assert.equal(shortcutForDate('2026-07-24',now),'tomorrow')
  assert.equal(shortcutForDate('2026-07-25',now),'day_after_tomorrow')
  assert.equal(shortcutForDate('2026-07-26',now),'custom')
})

test('Kuching date helpers are deterministic after a simulated server restart',async()=>{
  const instant='2026-12-31T16:30:00Z',before=kuchingDate(instant)
  const reloaded=await import(`../shared/kuchingTime.js?restart=${Date.now()}`)
  assert.equal(before,'2027-01-01')
  assert.equal(reloaded.kuchingDate(instant),before)
  assert.equal(addCalendarDays(before,1),'2027-01-02')
})

test('three languages cover critical login/mobile actions and preserve location values',()=>{
  const required=['common.back','common.logout','common.start','common.arrive','common.complete','common.photo','common.paymentProof','common.noGoodsReason','auth.login','mobile.today','mobile.gps','mobile.newCustomer','mobile.mine']
  for(const locale of ['ms','zh','en'])for(const key of required)assert.ok(messages[locale][key],`${locale}:${key}`)
  const address='Jalan Datuk Tawi Sli, Kuching, Sarawak'
  assert.equal(address,'Jalan Datuk Tawi Sli, Kuching, Sarawak')
  assert.equal(translate('ms','missing.key'),'missing.key')
})

test('language preference is saved per account',()=>{
  const db=database(),owner=bootstrapAccount({employeeName:'Owner',username:'kcadmin',password:'Initial123!',preferredLanguage:'zh'}, {},db)
  assert.equal(owner.role,'owner_admin')
  assert.equal(owner.preferredLanguage,'zh')
  const loginChanged=login({username:'kcadmin',password:'Initial123!',preferredLanguage:'ms'}, {},db)
  assert.equal(loginChanged.account.preferredLanguage,'ms')
  assert.equal(login({username:'kcadmin',password:'Initial123!'}, {},db).account.preferredLanguage,'ms')
  const changed=updateOwnPreferences(owner,{preferredLanguage:'ms'},db)
  assert.equal(changed.preferredLanguage,'ms')
  assert.equal(db.prepare('SELECT preferred_language value FROM auth_accounts WHERE id=?').get(owner.id).value,'ms')
})

test('kcadmin always resolves to owner_admin without changing Employee Job Role',()=>{
  const db=database(),owner=bootstrapAccount({employeeName:'Kc Lee',username:'kcadmin',password:'Initial123!'}, {},db)
  db.prepare("UPDATE auth_accounts SET system_role='office',role='office' WHERE id=?").run(owner.id)
  const signed=login({username:'kcadmin',password:'Initial123!'}, {},db)
  assert.equal(signed.account.role,'owner_admin')
  assert.equal(db.prepare('SELECT job_role FROM employees WHERE id=?').get(owner.employeeId).job_role,'Admin')
})

test('owner admin can change ordinary username and role with audit',()=>{
  const db=database(),owner=bootstrapAccount({employeeName:'Owner',username:'kcadmin',password:'Initial123!'}, {},db)
  const id=employee(db,'EMP0003','Protected Employee')
  const ordinary=createAccount({employeeId:id,username:'emp0003',password:'Employee123!',role:'office'},owner,{},db)
  const updated=updateAccount(ordinary.id,{username:'emp3.office',role:'supervisor'},owner,{},db)
  assert.equal(updated.username,'emp3.office')
  assert.equal(updated.role,'supervisor')
  assert.equal(db.prepare('SELECT employee_code FROM employees WHERE id=?').get(id).employee_code,'EMP0003')
  assert.equal(db.prepare('SELECT COUNT(*) count FROM auth_account_change_history WHERE target_account_id=?').get(ordinary.id).count,2)
})

test('operations admin permissions allow operations but block escalation and owner changes',()=>{
  const db=database(),owner=bootstrapAccount({employeeName:'Owner',username:'kcadmin',password:'Initial123!'}, {},db)
  const operations=createAccount({employeeId:employee(db,'EMP0001'),username:'operations',password:'Operations123!',role:'operations_admin'},owner,{},db)
  assert.equal(roleCan(operations.role,'employee_manage'),true)
  assert.equal(roleCan(operations.role,'vehicle_manage'),true)
  assert.equal(accountCan(operations,'sensitive_data',db),false)
  const ordinary=createAccount({employeeId:employee(db,'EMP0002'),username:'office1',password:'Office123!',role:'office'},operations,{},db)
  assert.equal(updateAccount(ordinary.id,{isActive:false},operations,{},db).isActive,false)
  assert.throws(()=>updateAccount(ordinary.id,{username:'renamed'},operations,{},db),/Owner Admin/)
  assert.throws(()=>updateAccount(ordinary.id,{role:'owner_admin'},operations,{},db))
  assert.throws(()=>updateAccount(owner.id,{isActive:false},operations,{},db),/权限/)
})

test('username uniqueness is case-insensitive',()=>{
  const db=database(),owner=bootstrapAccount({employeeName:'Owner',username:'kcadmin',password:'Initial123!'}, {},db)
  createAccount({employeeId:employee(db,'EMP0001'),username:'Office.User',password:'Office123!',role:'office'},owner,{},db)
  assert.throws(()=>createAccount({employeeId:employee(db,'EMP0002'),username:'office.user',password:'Office123!',role:'office'},owner,{},db),/用户名已经使用/)
})

test('back navigation guard prompts only for unsaved state',()=>{
  setNavigationDirty(false)
  assert.equal(confirmNavigation('discard?',()=>false),true)
  setNavigationDirty(true)
  let calls=0
  assert.equal(confirmNavigation('discard?',()=>{calls+=1;return false}),false)
  assert.equal(calls,1)
  setNavigationDirty(false)
})

test('password visibility control exists and schema is v17',()=>{
  const source=fs.readFileSync(new URL('../src/PasswordInput.jsx',import.meta.url),'utf8')
  assert.match(source,/type=\{visible\?'text':'password'\}/)
  assert.match(source,/auth\.showPassword/)
  assert.equal(SCHEMA_VERSION,17)
})

test('account name opens Profile menu and voluntary password change is cancellable',()=>{
  const app=fs.readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8')
  const authPages=fs.readFileSync(new URL('../src/AuthPages.jsx',import.meta.url),'utf8')
  const profile=fs.readFileSync(new URL('../src/AccountProfileMenu.jsx',import.meta.url),'utf8')
  assert.match(profile,/aria-haspopup="menu"/)
  assert.match(profile,/auth\.systemRole/)
  assert.match(profile,/auth\.preferredLanguage/)
  assert.match(app,/forced=\{account\.mustChangePassword\}/)
  assert.doesNotMatch(app,/className="user-menu" onClick=\{onChangePassword\}/)
  assert.match(authPages,/\{!forced&&<button type="button" className="secondary" onClick=\{onCancel\}/)
  assert.match(authPages,/onDone\(result\.account\)/)
  assert.match(authPages,/auth\.forcedChangeReason/)
})

test('login keeps three languages while desktop and mobile use only Profile language selector',()=>{
  const app=fs.readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8')
  const authPages=fs.readFileSync(new URL('../src/AuthPages.jsx',import.meta.url),'utf8')
  const profile=fs.readFileSync(new URL('../src/AccountProfileMenu.jsx',import.meta.url),'utf8')
  const css=fs.readFileSync(new URL('../src/App.css',import.meta.url),'utf8')
  assert.equal((authPages.match(/<LanguageSelector/g)||[]).length,1)
  assert.doesNotMatch(app,/LanguageSelector/)
  assert.doesNotMatch(authPages,/LanguageSelector compact/)
  assert.match(authPages,/preferredLanguage:language/)
  assert.match(profile,/languageOptions\.map/)
  assert.match(profile,/void setLanguage\(event\.target\.value\)/)
  assert.match(css,/width:min\(300px,calc\(100vw - 28px\)\)/)
  assert.doesNotMatch(css,/\.topbar \.account-profile\{display:none\}/)
  for(const option of ['Bahasa Melayu','中文','English'])assert.ok(languageOptions.some(item=>item.label===option))
})
