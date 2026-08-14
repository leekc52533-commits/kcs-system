import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {messages} from '../src/translations.js'

const source=file=>fs.readFileSync(new URL(`../${file}`,import.meta.url),'utf8')

test('Branch editor keeps sticky back and close controls with dirty-only protection',()=>{
  const page=source('src/MasterDataPage.jsx'),css=source('src/MasterDataPage.css'),hub=source('src/WorkspaceHub.jsx')
  assert.match(page,/className="branch-editor-sticky"/)
  assert.match(page,/JSON\.stringify\(form\)!==JSON\.stringify\(initialDraftRef\.current\)/)
  assert.match(page,/window\.confirm\(t\('branchEditor\.unsavedLeave'\)\)/)
  assert.match(page,/onClick=\{leave\} disabled=\{saving\}>\{t\('common\.close'\)\}/)
  const branchEditor=page.slice(page.indexOf('function BranchEditor'),page.indexOf('export function Editor'))
  assert.doesNotMatch(branchEditor,/>Cancel<\/button>/)
  assert.match(css,/\.branch-editor-sticky\{position:sticky!important;top:0/)
  assert.match(hub,/branchEditorFrom:source\|\|undefined/)
  assert.match(hub,/source==='branch-review'\?'branch-review':'branches'/)
})

test('dense tables move ID copy actions to details and retain useful copy feedback',()=>{
  const master=source('src/MasterDataPage.jsx'),review=source('src/BranchLifecycleReviewPage.jsx'),accounts=source('src/AccountManagementPage.jsx'),compact=source('src/CompactDataTable.jsx')
  assert.match(master,/key:'branchId'.*value:item=>displayId\(item\)\}/)
  assert.match(master,/key:'customerId'.*value:item=>displayId\(item\)\}/)
  assert.match(review,/key:'branchId'.*value:item=>formatBranchId\(item\.branchId\)\}/)
  assert.match(accounts,/key:'employeeCode',label:t\('list\.employeeId'\)\}/)
  assert.match(master,/<dt>\{t\('list\.branchId'\)\}<\/dt><dd><CopyValue/)
  assert.match(compact,/✓ \$\{copiedLabel\}/)
})

test('single-action sorts close while filters and column chooser remain multi-select',()=>{
  const compact=source('src/CompactDataTable.jsx'),employee=source('src/EmployeeMasterPage.jsx')
  assert.match(compact,/applySort=.*removeAttribute\('open'\)/)
  assert.match(employee,/setDirection=.*removeAttribute\('open'\)/)
  assert.doesNotMatch(compact,/toggleFilter=.*removeAttribute\('open'\)/)
  assert.match(compact,/className="column-chooser"/)
  assert.match(compact,/window\.localStorage\.setItem\(storageKey\(preferenceKey\)/)
  assert.match(compact,/resetColumns/)
  assert.match(compact,/if\(column\.required\)return/)
})

test('export is compact and GPS keeps every capability in one Branch selection step',()=>{
  const page=source('src/MasterDataPage.jsx'),css=source('src/MasterDataPage.css')
  assert.match(page,/className="compact-export"/)
  assert.match(page,/menuRef\.current\?\.removeAttribute\('open'\)/)
  assert.match(page,/className="gps-branch-picker"/)
  for(const token of ['getCurrentLocation','SharedGpsInput','gps.saveTemporary','gps.capturedLatitude','gps.locationSource','gps.gpsRemark'])assert.match(page,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')))
  assert.match(css,/\.gps-branch-picker\{display:grid/)
  assert.match(css,/@media\(max-width:700px\).*\.gps-branch-picker\{grid-template-columns:1fr\}/s)
})

test('new closeout labels are complete without Bahasa Melayu fallback',()=>{
  const keys=['list.columns','list.closeColumns','list.resetColumns','list.copied','branchEditor.unsavedLeave','gps.chooseBranchStep','gps.matchingBranches']
  for(const language of ['en','ms','zh'])for(const key of keys)assert.ok(messages[language][key],`${language} ${key}`)
  for(const key of keys)assert.notEqual(messages.ms[key],messages.en[key],`Malay fallback: ${key}`)
})
