import test from 'node:test'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import {accountStatementBuffer} from '../src/accountStatement.js'
test('statement groups branches, excludes void/cash/out-of-range and preserves item prices and cent totals',async()=>{
 const bill={customerName:'Shop',branchName:'A',status:'issued',paymentMethod:'Credit',serviceDate:'2026-10-04',billNumber:'P1',items:[{quantity:260,unitPrice:0.17,itemTotalCents:4420},{quantity:250,unitPrice:0.19,itemTotalCents:4750}]}
 const rows=[bill,{...bill,branchName:'B',billNumber:'P2'},{...bill,status:'voided'},{...bill,paymentMethod:'Cash'},{...bill,serviceDate:'2026-09-01'}],range={from:'2026-10-01',to:'2026-10-04',paymentMethod:'Credit'}
 const book=new ExcelJS.Workbook();await book.xlsx.load(await accountStatementBuffer(rows,range));assert.equal(book.worksheets.length,1)
 const s=book.worksheets[0];assert.equal(s.name,'Shop');assert.deepEqual(s.getRow(3).values.slice(1),['Outlet','Qty']);assert.equal(s.getCell('A4').value,'A');assert.equal(s.getCell('A5').value,'B');assert.equal(s.getCell('B6').value,1020)
 const last=s.getRow(s.rowCount);assert.equal(last.getCell(3).value,1020);assert.equal(last.getCell(5).value,183.4);assert.ok(s.autoFilter)
 s.eachRow({includeEmpty:true},r=>{assert.equal(r.height,15);r.eachCell(c=>assert.equal(c.font.size,10))})
 assert.ok(s.getColumn(2).width>=22)

 const cash=new ExcelJS.Workbook();await cash.xlsx.load(await accountStatementBuffer(rows,{...range,paymentMethod:'Cash'}));assert.equal(cash.worksheets.length,1)
 await assert.rejects(()=>accountStatementBuffer([] ,range),/EMPTY_STATEMENT/)
})
