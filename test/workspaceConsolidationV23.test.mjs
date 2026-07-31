import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read=name=>fs.readFileSync(new URL(`../src/${name}`,import.meta.url),'utf8')

test('OCC detail has one price-group return and no legacy OCC cards',()=>{
  const source=read('MaterialsPricesPage.jsx')
  assert.match(source,/← OCC Price Groups/)
  assert.match(source,/isOcc\?<OccPriceGroups/)
  assert.match(source,/Select current results \(\$\{filtered\.length\}\)/)
  assert.match(source,/All \$\{filtered\.length\} selected/)
  assert.doesNotMatch(source,/<span>\{selected\.length\} selected<\/span>/)
})

test('OCC table alone owns horizontal overflow',()=>{
  const css=read('MasterDataPage.css')
  assert.match(css,/\.occ-group-detail\{[^}]*overflow:visible/)
  assert.match(css,/\.occ-branch-table\{[^}]*overflow-x:auto/)
})

test('employee create uses full drawer mode and separate optional account',()=>{
  const source=read('EmployeeMasterPage.jsx')
  assert.match(source,/EmployeeCreateDetail/)
  assert.doesNotMatch(source,/className="employee-create-form"/)
  assert.match(source,/Employee record only/)
  assert.match(source,/A system account is optional/)
  assert.match(source,/employee-detail-actions/)
  assert.match(source,/You have unsaved changes\. Leave without saving\?/)
})

test('workspace navigation consolidates related pages and maps legacy entries',()=>{
  const app=read('App.jsx'),hub=read('WorkspaceHub.jsx')
  for(const page of ['operations','customers','location-zone','vehicles','materials','staff'])assert.match(app,new RegExp(`'${page}'`))
  assert.match(app,/dispatch:\['operations','weekly'\]/)
  assert.match(app,/schedule:\['operations','schedules'\]/)
  assert.match(app,/'gps-migration':\['location-zone','legacy-gps'\]/)
  assert.match(hub,/WeeklyDispatchPage/)
  assert.match(hub,/SchedulesPage/)
  assert.match(hub,/Employee Records|hub\.employeeRecords/)
  assert.match(hub,/System Accounts|hub\.systemAccounts/)
  assert.match(hub,/Data tools/)
})
