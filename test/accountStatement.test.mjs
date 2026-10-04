import test from 'node:test'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import {accountStatementBuffer} from '../src/accountStatement.js'
test('statement groups branches, excludes void/cash/out-of-range and preserves item prices and cent totals',async()=>{
 const bill={customerName:'Shop',branchName:'A',status:'issued',paymentMethod:'Credit',serviceDate:'2026-10-04',billNumber:'P1',items:[{quantity:260,unitPrice:0.17,itemTotalCents:4420},{quantity:250,unitPrice:0.19,itemTotalCents:4750}]}
 const rows=[bill,{...bill,branchName:'B',billNumber:'P2'},{...bill,status:'voided'},{...bill,paymentMethod:'Cash'},{...bill,serviceDate:'2026-09-01'}],range={from:'2026-10-01',to:'2026-10-04',paymentMethod:'Credit'}
 const book=new ExcelJS.Workbook();await book.xlsx.load(await accountStatementBuffer(rows,range));assert.equal(book.worksheets.length,2)
 const s=book.worksheets[0];assert.equal(s.rowCount,6);assert.deepEqual(s.getRow(3).values.slice(1),['Date','Purchase No.','Qty','Per/Kg','Amount']);assert.equal(s.getCell('C6').value,510);assert.equal(s.getCell('E6').value,91.7);assert.equal(s.getCell('D5').value,0.19);assert.equal(s.getCell('A4').numFmt,'dd-mmm-yy');assert.ok(s.autoFilter)
 const cash=new ExcelJS.Workbook();await cash.xlsx.load(await accountStatementBuffer(rows,{...range,paymentMethod:'Cash'}));assert.equal(cash.worksheets.length,1)
 await assert.rejects(()=>accountStatementBuffer([] ,range),/EMPTY_STATEMENT/)
})
