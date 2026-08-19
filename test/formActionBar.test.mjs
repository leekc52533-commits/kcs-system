import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8')

test('FormActionBar keeps Cancel before Save in one right-aligned sticky action bar',()=>{
  const component=read('src/FormActionBar.jsx')
  assert.match(component,/\['form-action-bar',sticky&&'form-action-bar--sticky'/)
  assert.match(component,/<footer className=\{classes\}>\{children\}<\/footer>/)
  const css=read('src/interactive.css')
  assert.match(css,/\.form-action-bar\s*\{[^}]*justify-content:\s*flex-end/s)
  assert.match(css,/\.form-action-bar--sticky\s*\{[^}]*position:\s*sticky/s)
})

test('Customer and Branch editors use the standard action bar',()=>{
  const customer=read('src/MasterDataPage.jsx')
  const branch=read('src/BranchEditor.jsx')
  assert.match(customer,/import FormActionBar/)
  assert.match(customer,/<FormActionBar><button type="button" onClick=\{onClose\} disabled=\{saving\}>\{t\('common\.cancel'\)\}<\/button><button className="primary"/)
  assert.match(branch,/import FormActionBar/)
  assert.match(branch,/<FormActionBar><button type="button" onClick=\{leave\} disabled=\{saving\}>\{t\('common\.cancel'\)\}<\/button><button className="primary"/)
})

test('Save and confirmation dialogs share the standard action bar',()=>{
  for(const path of [
    'src/BranchLifecycleReviewPage.jsx',
    'src/UnlinkedBranchesPage.jsx',
    'src/SharedGpsInput.jsx',
    'src/WeeklyDispatchPage.jsx',
    'src/ZoneGroupManager.jsx',
    'src/MaterialsPricesPage.jsx',
    'src/EmployeeMasterPage.jsx',
  ]){
    const source=read(path)
    assert.match(source,/import FormActionBar/,path)
    assert.match(source,/<FormActionBar/,path)
  }
})
