import test from 'node:test'
import assert from 'node:assert/strict'
import {applyArchiveColumns,archiveKeys} from '../shared/archiveColumns.mjs'
test('multi-select is OR within columns and AND across columns; blank differs from zero and select-none',()=>{
 const rows=[{customerName:'A',branchName:null},{customerName:'B',branchName:'X'},{customerName:'C',branchName:'X'},{customerName:'A',branchName:'   '}]
 const q={columns:JSON.stringify({customerName:['A','B'],branchName:['']})}
 assert.deepEqual(applyArchiveColumns('purchase',rows,q).items,[rows[0],rows[3]])
 assert.equal(applyArchiveColumns('purchase',rows,{columns:'{"customerName":[]}'}).items.length,0)
 assert.equal(applyArchiveColumns('purchase',rows,{columns:'{"customerName":null}'}).items.length,4)
 assert.deepEqual(applyArchiveColumns('expense',[{odometerKm:0},{odometerKm:null}],{columns:'{"odometerKm":[""]}'}).items,[{odometerKm:null}])
 assert.equal(applyArchiveColumns('purchase',rows,{columns:'not JSON'}).items.length,4)
 assert.deepEqual(applyArchiveColumns('purchase',rows,q).filterOptions.customerName,['','A','B','C'])
})
test('sort real dates across months/years, numeric money and natural identifiers without mutating source',()=>{
 const rows=[{id:1,serviceDate:'2026-10-01',billNumber:'PO10',totalCents:10000,registrationNumber:'Q10'},{id:2,serviceDate:'2026-09-30',billNumber:'PO2',totalCents:900,registrationNumber:'Q2'},{id:3,serviceDate:'2027-01-01',billNumber:'PO20',totalCents:100000,registrationNumber:'Q20'}]
 for(const key of ['serviceDateLabel','billNumber','totalLabel','car']){
  assert.deepEqual(applyArchiveColumns('purchase',rows,{sortKey:key,sortDirection:'asc'}).items.map(r=>r.id),[2,1,3])
  assert.deepEqual(applyArchiveColumns('purchase',rows,{sortKey:key,sortDirection:'desc'}).items.map(r=>r.id),[3,1,2])
 }
 assert.deepEqual(rows.map(r=>r.id),[1,2,3])
 for(const kind of ['expense','purchase'])for(const key of archiveKeys[kind])assert.doesNotThrow(()=>applyArchiveColumns(kind,[],{sortKey:key,sortDirection:'asc'}))
})
