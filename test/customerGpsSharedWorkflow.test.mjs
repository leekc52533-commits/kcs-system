import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const mobile=readFileSync(new URL('../src/AuthPages.jsx',import.meta.url),'utf8')
const desktop=readFileSync(new URL('../src/MasterDataPage.jsx',import.meta.url),'utf8')
const shared=readFileSync(new URL('../src/SharedGpsInput.jsx',import.meta.url),'utf8')
const css=readFileSync(new URL('../src/SharedGpsInput.css',import.meta.url),'utf8')

test('desktop and mobile Customer collection always mount the same full-width Shared GPS workflow',()=>{
  assert.match(desktop,/SharedGpsInput className="customer-gps-shared" resetKey=\{`customer-branch:\$\{branchId\}`\}/)
  assert.match(mobile,/SharedGpsInput className="customer-gps-shared" resetKey=\{`customer-branch:\$\{selected\.internalId\|\|selected\.branchId\}`\}/)
  assert.match(css,/\.customer-gps-shared\{grid-column:1\/-1;width:100%;max-width:100%/)
  assert.match(css,/@media\(max-width:600px\)\{\.customer-gps-shared \.shared-gps-actions\{grid-template-columns:minmax\(0,1fr\)\}\}/)
})

test('all four Customer GPS actions remain visible without coordinates and only dependent actions disable',()=>{
  for(const label of ['Paste Coordinates','Use Pasted Coordinates','Find on Map','Select on Map'])assert.ok(shared.includes(label))
  assert.match(shared,/disabled=\{!paste\.trim\(\)\|\|Boolean\(busy\)\}/)
  assert.match(shared,/disabled=\{!String\(address\|\|draft\.address\|\|''\)\.trim\(\)\|\|Boolean\(busy\)\}/)
  assert.match(shared,/onClick=\{\(\)=>setPickerOpen\(true\)\}>Select on Map/)
  assert.match(desktop,/onClick=\{getCurrentLocation\}/)
  assert.match(mobile,/onClick=\{getBranchLocation\}/)
})

test('Branch switching, direct entry and Remaining list cannot select a legacy Customer form',()=>{
  assert.match(desktop,/initialBranchId/)
  assert.match(desktop,/onSelect=\{selectCollectionBranch\}/)
  assert.match(desktop,/setGps\(\{\.\.\.emptyGpsCapture,address:branch\.address\|\|''\}\)/)
  assert.match(desktop,/resetKey=\{`customer-branch:/)
  assert.ok(mobile.indexOf("if(tab==='gps')return")<mobile.indexOf('SharedGpsInput className="customer-gps-shared"'))
})
