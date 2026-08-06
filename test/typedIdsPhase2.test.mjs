import test from 'node:test'
import assert from 'node:assert/strict'
import {formatBranchId,formatCustomerId,parseTypedId} from '../shared/typedIds.js'
import fs from 'node:fs'

test('typed IDs format raw database identifiers without changing them',()=>{
  assert.equal(formatCustomerId(235),'C235')
  assert.equal(formatBranchId('10500'),'B10500')
})

test('typed IDs accept numeric and case-insensitive matching prefixes',()=>{
  assert.equal(parseTypedId('235','customer'),'235')
  assert.equal(parseTypedId(' c235 ','customer'),'235')
  assert.equal(parseTypedId('B10500','branch'),'10500')
  assert.throws(()=>parseTypedId('B10500','customer'),/Customer ID/)
  assert.throws(()=>parseTypedId('C235','branch'),/Branch ID/)
})

test('customer, GPS, zones and supervisor scheduling use shared typed-ID formatters',()=>{for(const file of ['src/MasterDataPage.jsx','src/ZoneGroupManager.jsx','src/WeeklyDispatchPage.jsx']){const source=fs.readFileSync(new URL(`../${file}`,import.meta.url),'utf8');assert.match(source,/shared\/typedIds\.js/);assert.match(source,/formatBranchId|formatCustomerId/)}const transfer=fs.readFileSync(new URL('../server/masterTransferService.mjs',import.meta.url),'utf8');assert.match(transfer,/formatCustomerId/);assert.match(transfer,/formatBranchId/);assert.match(transfer,/parseTypedId/)})

test('remaining mobile, special request, GPS migration and collector views display typed IDs',()=>{
  const auth=fs.readFileSync(new URL('../src/AuthPages.jsx',import.meta.url),'utf8')
  const special=fs.readFileSync(new URL('../src/SpecialRequestsPage.jsx',import.meta.url),'utf8')
  const migration=fs.readFileSync(new URL('../src/GpsMigrationPage.jsx',import.meta.url),'utf8')
  const master=fs.readFileSync(new URL('../src/MasterDataPage.jsx',import.meta.url),'utf8')
  assert.match(auth,/formatCustomerId\(branch\.customerId\).*formatBranchId\(branch\.branchId\)/)
  assert.match(auth,/formatBranchId\(selected\.branchId\)/)
  assert.match(special,/formatCustomerId\(x\.customerId\).*formatBranchId\(x\.branchId\)/)
  assert.match(special,/formatCustomerId\(selected\.customerId\).*formatBranchId\(selected\.branchId\)/)
  assert.match(special,/formatCustomerId\(item\.customerId\).*formatBranchId\(item\.branchId\)/)
  assert.match(migration,/row\.displayBranchId/)
  assert.match(migration,/row\.displayCustomerId/)
  assert.match(master,/formatBranchId\(item\.branchId\).*item\.branchName/)
})

test('employee import and GPS recommendation writes use Session permission guards',()=>{const source=fs.readFileSync(new URL('../server/index.mjs',import.meta.url),'utf8');assert.match(source,/module==='employee'&&!canManageEmployees\(session\)/);assert.match(source,/module==='employee'&&!canManageEmployees\(session\).*没有 Employee 导入权限/);assert.match(source,/gps-zone-recommendations\/recalculate.*accountCan\(session,'gps_review'\)/);assert.match(source,/gps-zone-recommendations\/bulk-confirm-high.*accountCan\(session,'gps_review'\)/);assert.match(source,/gps-zone-recommendations.*decision.*accountCan\(session,'gps_review'\)/)})
