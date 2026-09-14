import test from 'node:test'
import assert from 'node:assert/strict'
import {JSDOM} from 'jsdom'
import {customerReceiptHtml} from '../shared/customerReceipt.js'
import {applyArchiveColumns} from '../shared/archiveColumns.mjs'
const bill={billNumber:'P-1',serviceDate:'2026-09-14',customerName:'Original <Customer>',branchName:'Branch & Co',vehicleCode:'QAA4293N',registrationNumber:'QAA4293N',issuedBy:'Driver',issuedAt:'2026-09-14T10:00:00+08:00',paymentMethod:'Cash',totalCents:665,status:'issued',items:[{item:'Paper <script>alert(1)</script>',quantity:35,unit:'kg',unitPriceCents:19,itemTotalCents:665}]}
test('receipt preserves bill snapshots, prices and names, escapes content and marks voids',()=>{
 const html=customerReceiptHtml(bill),dom=new JSDOM(html),doc=dom.window.document
 assert.match(doc.body.textContent,/Original <Customer>/);assert.match(doc.body.textContent,/35 kg/);assert.match(doc.body.textContent,/RM 0.19/);assert.match(doc.body.textContent,/Total: RM 6.65/)
 assert.equal(doc.querySelector('script'),null);assert.equal(doc.querySelector('.void'),null)
 assert.match(customerReceiptHtml({...bill,status:'voided'}),/VOIDED — NOT VALID/)
 assert.equal(bill.status,'issued');dom.window.close()
})
test('customer receipt column supports selections and empty selection',()=>{
 const rows=[bill,{...bill,billNumber:'P-2'}]
 assert.equal(applyArchiveColumns('purchase',rows,{columns:JSON.stringify({customerReceipt:['P-2']})}).items[0].billNumber,'P-2')
 assert.equal(applyArchiveColumns('purchase',rows,{columns:JSON.stringify({customerReceipt:[]})}).items.length,0)
})
