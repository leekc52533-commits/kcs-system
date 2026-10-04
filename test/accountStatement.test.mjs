import test from 'node:test'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import {accountStatementBuffer} from '../src/accountStatement.js'
test('statement groups branches, excludes void/cash/out-of-range and preserves item prices and cent totals',async()=>{
 const bill={customerName:'Shop',branchName:'B',status:'issued',paymentMethod:'Credit',serviceDate:'2026-10-04',billNumber:'P1',items:[{quantity:260,unitPrice:0.17,itemTotalCents:4420},{quantity:250,unitPrice:0.19,itemTotalCents:4750}]}
 const rows=[bill,{...bill,branchName:'A',billNumber:'P2'},{...bill,status:'voided'},{...bill,paymentMethod:'Cash'},{...bill,serviceDate:'2026-09-01'}],range={from:'2026-10-01',to:'2026-10-04',paymentMethod:'Credit'}
 const book=new ExcelJS.Workbook();await book.xlsx.load(await accountStatementBuffer(rows,range));assert.equal(book.worksheets.length,1)
 const s=book.worksheets[0];assert.equal(s.name,'Shop');assert.deepEqual(s.getRow(3).values.slice(1),['Outlet','Qty']);assert.equal(s.getCell('A4').value,'A');assert.equal(s.getCell('A5').value,'B');assert.equal(s.getCell('B6').value,1020)
 const last=s.getRow(s.rowCount);assert.equal(last.getCell(3).value,1020);assert.equal(last.getCell(5).value,183.4);assert.ok(s.autoFilter)
 s.eachRow({includeEmpty:true},r=>{assert.equal(r.height,15);r.eachCell(c=>assert.equal(c.font.size,10))})
 assert.ok(s.getColumn(2).width<22);assert.ok((s.getColumn(3).width??9)<14)
 assert.equal(s.getCell('A8').value,'A');assert.equal(s.getCell('A14').value,'B')
 for(const address of ['B4','B5','B6','C10','C11','C12','C16','C17','C18','C19'])assert.equal(s.getCell(address).numFmt,'#,##0')
 assert.equal(s.getCell('D10').numFmt,'0.000');assert.equal(s.getCell('E10').numFmt,'#,##0.00')

 const cash=new ExcelJS.Workbook();await cash.xlsx.load(await accountStatementBuffer(rows,{...range,paymentMethod:'Cash'}));assert.equal(cash.worksheets.length,1)
 await assert.rejects(()=>accountStatementBuffer([] ,range),/EMPTY_STATEMENT/)
})

test('statement widths grow with branch names, bill numbers and formatted numeric totals',async()=>{
 const range={from:'2026-10-01',to:'2026-10-04',paymentMethod:'Credit'}
 const bill={customerName:'Shop',branchName:'A',status:'issued',paymentMethod:'Credit',serviceDate:'2026-10-04',billNumber:'P1',items:[{quantity:1,unitPrice:0.17,itemTotalCents:17}]}
 async function sheet(b){const book=new ExcelJS.Workbook();await book.xlsx.load(await accountStatementBuffer([b],range));return book.worksheets[0]}
 const short=await sheet(bill),long=await sheet({...bill,branchName:'EVERRISE SUPERMARKET SAMARAHAN BRANCH',billNumber:'PURCHASE-20261004-123456789',items:[{quantity:1234567890,unitPrice:123456.789,itemTotalCents:123456789012}]})
 for(const column of [1,2,3,4,5])assert.ok(long.getColumn(column).width>short.getColumn(column).width)
 assert.ok(long.getColumn(3).width>='1,234,567,890'.length+3)
 assert.ok(long.getColumn(5).width>='1,234,567,890.12'.length+3)
})
