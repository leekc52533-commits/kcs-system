import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const source=fs.readFileSync(new URL('../src/AccountManagementPage.jsx',import.meta.url),'utf8')

test('Create Account使用独立空白username与固定temporary password state',()=>{
  assert.match(source,/emptyCreateForm=\(\)=>\(\{employeeId:'',username:'',role:'office',password:temporaryPassword\}\)/)
  assert.match(source,/const temporaryPassword='12345678'/)
  assert.doesNotMatch(source,/username:account\.(?:username|name)/)
})

test('切换Employee以Employee Code建议username并彻底reset credentials',()=>{
  assert.match(source,/username:employee\?\.employeeCode\|\|''/)
  assert.match(source,/setCreateForm\(emptyCreateForm\(\)\)/)
  assert.match(source,/open=item=>\{resetCreate\(\)/)
  assert.match(source,/setMessage\(t\('account\.created'\)\);resetCreate\(\)/)
})

test('Create Account阻止登录凭据autofill且Login autocomplete不受影响',()=>{
  assert.match(source,/<form className="account-create"[^>]+autoComplete="off"/)
  assert.match(source,/name="new-account-username" autoComplete="off"/)
  assert.match(source,/name="new-account-temporary-password" autoComplete="new-password"/)
  const auth=fs.readFileSync(new URL('../src/AuthPages.jsx',import.meta.url),'utf8')
  assert.match(auth,/autoComplete="username"/)
  assert.match(auth,/autoComplete=\{setup\?\.needsSetup\?'new-password':'current-password'\}/)
})
