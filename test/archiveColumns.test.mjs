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

test('historical date and document columns bypass the page range while ordinary filters and clearing preserve it',()=>{
 const rows=[{billNumber:'P-OLD',serviceDate:'2006-09-28',customerName:'A'},{billNumber:'P-NEW',serviceDate:'2026-09-28',customerName:'B'}],q={from:'2026-09-01',to:'2026-09-30'}
 const base=applyArchiveColumns('purchase',rows,q);assert.deepEqual(base.items.map(r=>r.billNumber),['P-NEW']);assert.ok(base.filterOptions.billNumber.includes('P-OLD'));assert.deepEqual(base.filterOptions.serviceDateLabel,['28/09/2026','28/09/2006',''])
 for(const columns of [{billNumber:['P-OLD']},{serviceDateLabel:['28/09/2006']}])assert.deepEqual(applyArchiveColumns('purchase',rows,{...q,columns}).items.map(r=>r.billNumber),['P-OLD'])
 assert.equal(applyArchiveColumns('purchase',rows,{...q,columns:{billNumber:['P-OLD'],customerName:['B']}}).items.length,0)
 assert.deepEqual(applyArchiveColumns('purchase',rows,{...q,columns:{billNumber:null}}).items.map(r=>r.billNumber),['P-NEW'])
 assert.equal(applyArchiveColumns('purchase',rows,{...q,columns:{billNumber:[]}}).items.length,0)
})

test('explicit export range intersects historical header selections',()=>{const rows=[{billNumber:'OLD',serviceDate:'2006-09-28'},{billNumber:'NEW',serviceDate:'2026-09-28'}];assert.deepEqual(applyArchiveColumns('purchase',rows,{from:'2026-09-01',to:'2026-09-30',exportRange:'1',columns:{billNumber:['OLD','NEW']}}).items.map(r=>r.billNumber),['NEW'])})

test('purchase explicit all dates differs from initial range and keeps other filters and export bounds',()=>{
 const rows=[{id:1,serviceDate:'2026-10-05',paymentMethod:'Cash'},{id:2,serviceDate:'2026-09-08',paymentMethod:'Cash'},{id:3,serviceDate:'2026-09-07',paymentMethod:'Credit'}]
 const q={from:'2026-10-05',to:'2026-10-05'},ids=query=>applyArchiveColumns('purchase',rows,query).items.map(r=>r.id)
 assert.deepEqual(ids(q),[1])
 assert.deepEqual(ids({...q,columns:JSON.stringify({serviceDateLabel:null})}),[1,2,3])
 assert.deepEqual(ids({...q,columns:{serviceDateLabel:null,paymentMethod:['Cash']}}),[1,2])
 assert.deepEqual(ids({...q,columns:{serviceDateLabel:[]}}),[])
 assert.deepEqual(ids({...q,columns:{serviceDateLabel:['08/09/2026']}}),[2])
 assert.deepEqual(ids({...q,exportRange:'1',columns:{serviceDateLabel:null}}),[1])
 assert.deepEqual(applyArchiveColumns('expense',rows,{...q,columns:{serviceDateLabel:null}}).items.map(r=>r.id),[1])
})

test('purchase number sorts globally across old and new formats independently of service date',()=>{
 const rows=[
  {id:1,billNumber:'P20260914-00304',serviceDate:'2026-09-14'},
  {id:2,billNumber:'P261105-064',serviceDate:'2026-10-21'},
  {id:3,billNumber:'P260914-002',serviceDate:'2026-09-14'},
  {id:4,billNumber:'P261105-063',serviceDate:'2026-11-05'},
  {id:5,billNumber:'P260914-001',serviceDate:'2026-09-14'},
  {id:6,billNumber:'P260915-001',serviceDate:'2026-09-15'},
  {id:7,billNumber:'P20260914-00003',serviceDate:'2026-09-14'}
 ],snapshot=structuredClone(rows),ascending=[5,3,7,1,6,4,2]
 for(const sortKey of ['billNumber','customerReceipt']){
  const asc=applyArchiveColumns('purchase',rows,{sortKey,sortDirection:'asc'})
  assert.deepEqual(asc.items.map(x=>x.id),ascending)
  assert.deepEqual(asc.filterOptions[sortKey],['',...ascending.map(id=>rows.find(x=>x.id===id).billNumber)])
  assert.deepEqual(applyArchiveColumns('purchase',rows,{sortKey,sortDirection:'desc'}).items.map(x=>x.id),[...ascending].reverse())
 }
 assert.equal(applyArchiveColumns('purchase',rows,{sortKey:'serviceDateLabel',sortDirection:'desc'}).items[0].id,4)
 assert.equal(applyArchiveColumns('purchase',rows,{sortKey:'serviceDateLabel',sortDirection:'asc'}).items.at(-1).id,4)
 assert.deepEqual(applyArchiveColumns('purchase',rows,{columns:{billNumber:['P20260914-00304']},sortKey:'billNumber',sortDirection:'desc'}).items.map(x=>x.id),[1])
 assert.deepEqual(rows,snapshot)
})
