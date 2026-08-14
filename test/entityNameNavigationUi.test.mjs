import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const source=file=>fs.readFileSync(new URL(`../${file}`,import.meta.url),'utf8')

test('customer and branch names are primary actions while the quick preview remains available',()=>{
  const master=source('src/MasterDataPage.jsx'),table=source('src/CompactDataTable.jsx')
  assert.match(master,/key:'customerName'.*className="entity-name-link".*openFromName/s)
  assert.match(master,/key:'branchName'.*className="entity-name-link branch-name-entry".*openFromName.*entity-edit-icon/s)
  assert.match(master,/type==='branch'.*actor\.canManageMaster\)void setEditing\(item\);else void viewBranch\(item\)/)
  assert.match(master,/BranchReadOnlyDetail/)
  assert.doesNotMatch(master,/renderActions=\{item=><button[^>]*>\{t\('common\.edit'\)\}/)
  assert.match(table,/className="compact-expand"/)
  assert.match(table,/renderDetails\(item\)/)
})

test('branch default columns contain only high-frequency identity and lifecycle fields',()=>{
  const master=source('src/MasterDataPage.jsx'),table=source('src/CompactDataTable.jsx')
  assert.match(table,/defaultColumnKeys=columns=>columns\.filter\(column=>column\.required\|\|column\.defaultVisible!==false\)/)
  for(const key of ['branchId','branchName'])assert.match(master,new RegExp(`key:'${key}'[^}]*required:true`))
  for(const key of ['gps','materialCount','paymentType'])assert.match(master,new RegExp(`key:'${key}'.{0,900}defaultVisible:false`,'s'))
  assert.match(master,/list\.materialsCount.*item\.materialCount/s)
  assert.match(master,/list\.payment.*item\.paymentType/s)
})

test('expand control stays near the selection and entity columns and actions render only when needed',()=>{
  const table=source('src/CompactDataTable.jsx'),css=source('src/CompactDataTable.css')
  assert.match(table,/compact-check[\s\S]*compact-expand-heading[\s\S]*visibleColumns\.map/)
  assert.match(table,/\{renderActions&&<th>/)
  assert.match(table,/kcs\.table-columns\.v2/)
  assert.match(css,/\.compact-data-table\{width:100%;min-width:680px/)
  assert.match(css,/box-shadow:inset -10px 0/)
})

test('employee, account and inactive branch names open their existing details directly',()=>{
  const employee=source('src/EmployeeMasterPage.jsx'),accounts=source('src/AccountManagementPage.jsx'),review=source('src/BranchLifecycleReviewPage.jsx')
  assert.match(employee,/className="entity-name-link"[^>]*onClick=\{event=>\{event\.stopPropagation\(\);openEmployee\(item\.id\)\}\}/)
  assert.match(accounts,/key:'employeeName'.*className="entity-name-link".*open\(item\)/s)
  assert.match(review,/key:'branchName'.*className="entity-name-link".*onOpenBranch/s)
  assert.doesNotMatch(accounts,/renderActions=.*common\.edit/)
  assert.doesNotMatch(review,/branchLifecycle\.viewEdit/)
})

test('vehicle and buyer surfaces retain their already-direct card navigation',()=>{
  const vehicles=source('src/ResourcePage.jsx'),buyers=source('src/MasterDataPage.jsx')
  assert.match(vehicles,/vehicle-master-card[^\n]*onClick=\{event=>openCard\(event,item\.id\)\}/)
  assert.match(buyers,/className="interactive-card" role="button"[^\n]*onClick=\{\(\)=>open\(item\)\}/)
  assert.match(buyers,/buyer-branch-card[^\n]*onClick=\{\(\)=>openBranch\(branch\)\}/)
})
