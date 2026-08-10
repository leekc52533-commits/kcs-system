import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const shared=readFileSync(new URL('../src/SharedGpsInput.jsx',import.meta.url),'utf8')
const mobile=readFileSync(new URL('../src/AuthPages.jsx',import.meta.url),'utf8')
const master=readFileSync(new URL('../src/MasterDataPage.jsx',import.meta.url),'utf8')
const employee=readFileSync(new URL('../src/EmployeeMasterPage.jsx',import.meta.url),'utf8')
const dispatch=readFileSync(new URL('../src/WeeklyDispatchPage.jsx',import.meta.url),'utf8')

test('Shared GPS draft is remounted per entity and stale async geocoding cannot write back',()=>{
  assert.match(shared,/SharedGpsInputState key=\{resetKey\|\|'shared-gps-input'\}/)
  assert.match(shared,/const\[paste,setPaste\]=useState\(''\)/)
  assert.match(shared,/const generation=useRef\(0\)/)
  assert.match(shared,/generation\.current\+=1/)
  assert.ok((shared.match(/requestGeneration!==generation\.current/g)||[]).length>=2)
})

test('Customer branch changes reset every coordinate draft while preserving only its own Address',()=>{
  assert.match(mobile,/resetKey=\{`customer-branch:\$\{selected\.internalId\|\|selected\.branchId\}`\}/)
  assert.match(master,/resetKey=\{`customer-branch:\$\{branchId\}`\}/)
  assert.match(master,/setGps\(\{\.\.\.emptyGpsCapture,address:branch\.address\|\|''\}\)/)
  for(const field of ['latitude','longitude','capturedLatitude','capturedLongitude','locationSource'])assert.match(master,new RegExp(`${field}:''`))
  assert.match(master,/disabled=\{!gps\.latitude\|\|Boolean\(gpsBusy\)\}/)
})

test('Buyer, Employee, Operational Location and Dispatch use isolated GPS entity keys',()=>{
  assert.match(master,/resetKey=\{`buyer-branch:/)
  assert.match(master,/resetKey=\{`operational-location:/)
  assert.match(employee,/resetKey=\{`employee-home:/)
  assert.match(dispatch,/resetKey=\{`dispatch-start:/)
})
