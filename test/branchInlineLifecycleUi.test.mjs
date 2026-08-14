import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import {messages} from '../src/translations.js'

const source=file=>fs.readFileSync(new URL(`../${file}`,import.meta.url),'utf8')

test('dense table uses a single-open accordion and resets on data or filter changes',()=>{
  const table=source('src/CompactDataTable.jsx')
  assert.match(table,/current\.has\(key\)\?new Set\(\):new Set\(\[key\]\)/)
  assert.match(table,/setExpanded\(new Set\(\)\).*\[items,filters\]/)
  assert.match(table,/aria-expanded=\{open\}/)
})

test('Branch name clearly opens edit or read-only detail without a right-side action',()=>{
  const master=source('src/MasterDataPage.jsx'),css=source('src/MasterDataPage.css')
  assert.match(master,/branch-name-entry.*title=\{t\(actor\.canManageMaster\?'branchEditor\.editBranch':'branchEditor\.viewBranch'\)\}.*entity-edit-icon/s)
  assert.match(master,/actor\.canManageMaster\)void setEditing\(item\);else void viewBranch\(item\)/)
  assert.doesNotMatch(master,/type==='branch'.*renderActions=/s)
  assert.match(css,/\.branch-name-entry:hover\{text-decoration:underline\}/)
})

test('Branch lifecycle is inline, conditional and saved with the Branch payload once',()=>{
  const editor=source('src/BranchEditor.jsx'),master=source('src/MasterDataPage.jsx')
  assert.match(editor,/className="branch-lifecycle-inline"/)
  assert.doesNotMatch(editor,/lifecycle-dialog|aria-modal="true"[^]*changeStatus/)
  assert.doesNotMatch(master,/BranchLifecyclePanel|lifecycle-dialog/)
  assert.match(editor,/lifecycle\.status==='TEMPORARILY_PAUSED'\|\|lifecycle\.status==='NOT_COLLECTING'/)
  assert.match(editor,/lifecycle\.status==='ACTIVE'&&initialStatus!=='ACTIVE'/)
  assert.match(editor,/lifecycle\.status!=='CLOSED'/)
  assert.match(editor,/lifecycle\.status==='DUPLICATE_REPLACED'&&!lifecycle\.replacementId/)
  assert.match(editor,/payload\.lifecycle=\{lifecycleStatus:lifecycle\.status,reason:lifecycle\.reason,replacedByBranchId:lifecycle\.replacementId\}/)
  assert.match(editor,/const result=await onSave\(payload\)/)
  assert.match(editor,/setSaved\(true\).*window\.setTimeout\(onClose,1400\)/s)
  assert.match(editor,/className="lifecycle-history"/)
})

test('Branch PATCH keeps backend permission and authenticated-session actor protection',()=>{
  const server=source('server/index.mjs')
  assert.match(server,/PATCH.*\/api\/master\/branches.*canManageBranches\(session\).*updateBranchWithLifecycle/s)
  assert.match(server,/actor=\{changedBy:session\.employeeName\|\|session\.username\|\|`Account \$\{session\.id\}`.*accountId:session\.id\}/s)
})

test('new Branch lifecycle labels are complete in English, Bahasa Melayu and Chinese',()=>{
  const keys=['branchEditor.editBranch','branchEditor.viewBranch','branchEditor.readOnly','branchEditor.addBranch','branchEditor.saveBranch','branchLifecycle.restoreReasonRequired','branchLifecycle.reasonRequired','branchLifecycle.replacementRequired','branchLifecycle.closedStandardReason','branchLifecycle.viewHistory']
  for(const language of ['en','ms','zh'])for(const key of keys)assert.ok(messages[language][key],`${language}: ${key}`)
  for(const key of keys)assert.notEqual(messages.ms[key],messages.en[key],`Malay fallback: ${key}`)
})
