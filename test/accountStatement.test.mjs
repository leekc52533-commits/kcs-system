import test from 'node:test'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import {accountStatementBuffer} from '../src/accountStatement.js'
test('statement groups branches, excludes void/cash/out-of-range and preserves item prices and cent totals',async()=>{
 const bill={customerName:'Shop',branchName:'B',status:'issued',paymentMethod:'Credit',serviceDate:'2026-10-04',billNumber:'P1',items:[{quantity:260,unitPrice:0.17,itemTotalCents:4420},{quantity:250,unitPrice:0.19,itemTotalCents:4750}]}
 const rows=[bill,{...bill,branchName:'A',billNumber:'P2'},{...bill,status:'voided'},{...bill,paymentMethod:'Cash'},{...bill,serviceDate:'2026-09-01'}],range={from:'2026-10-01',to:'2026-10-04',paymentMethod:'Credit'}
 const book=new ExcelJS.Workbook();await book.xlsx.load(await accountStatementBuffer(rows,range));assert.equal(book.worksheets.length,1)
 const s=book.worksheets[0];assert.equal(s.name,'Shop');assert.deepEqual(s.getRow(3).values.slice(1),['Outlet','Qty','Per/Kg','Amount']);assert.equal(s.getCell('A4').value,'A');assert.equal(s.getCell('A5').value,'B');assert.equal(s.getCell('B6').value,1020);assert.equal(s.getCell('C4').value,'0.17/0.19');assert.equal(s.getCell('D4').value,91.7);assert.equal(s.getCell('D6').value,183.4)
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

test('summary deduplicates and sorts actual prices and sums recorded cents for each branch',async()=>{
 const bill={customerName:'Shop',branchName:'Outlet',status:'issued',paymentMethod:'Credit',serviceDate:'2026-10-04',billNumber:'P1',items:[{quantity:100,unitPrice:0.19,itemTotalCents:1900},{quantity:100,unitPrice:0.18,itemTotalCents:1800},{quantity:100,unitPrice:0.185,itemTotalCents:1850},{quantity:0.5,unitPrice:0.18,itemTotalCents:9}]}
 const book=new ExcelJS.Workbook();await book.xlsx.load(await accountStatementBuffer([bill,{...bill,branchName:'Single',billNumber:'P2',items:[{quantity:10,unitPrice:0.18,itemTotalCents:180}]}],{from:'2026-10-01',to:'2026-10-31',paymentMethod:'Credit'}))
 const s=book.worksheets[0]
 assert.equal(s.getCell('C4').value,'0.18/0.185/0.19')
 assert.equal(s.getCell('B4').value,300.5)
 assert.equal(s.getCell('D4').value,55.59)
 assert.equal(s.getCell('C5').value,'0.18')
 assert.equal(s.getCell('D5').value,1.8)
 assert.equal(s.getCell('D6').value,57.39)
 assert.equal(s.getCell('D6').numFmt,'#,##0.00')
 assert.ok(s.getColumn(3).width>='0.18/0.185/0.19'.length+3)
})

test('FARLEY appendix combines daily quantities, splits actual amounts and preserves account numbers',async()=>{
 const make=(branchName,billNumber,serviceDate,quantity,unitPrice,itemTotalCents)=>({customerName:'FARLEY',branchName,status:'issued',paymentMethod:'Credit',serviceDate,billNumber,items:[{quantity,unitPrice,itemTotalCents}]})
 const rows=[
  make('FARLEY MALL','P1','2026-10-01',100,0.18,1800),
  make('FARLEY MALL GF','P2','2026-10-01',200,0.19,3800),
  make('FARLEY MALL','P3','2026-10-03',10,0.185,185),
  make('FARLEY SAMARAHAN','P4','2026-10-02',100,0.23,2300),
  make('FARLEY OTHER','P5','2026-10-01',100,0.50,5000),
  {...make('FARLEY MALL','P6','2026-10-01',999,1,99900),status:'voided'},
  {...make('FARLEY MALL','P7','2026-10-01',999,1,99900),paymentMethod:'Cash'},
  make('FARLEY MALL','P8','2026-09-30',999,1,99900),
 ]
 const book=new ExcelJS.Workbook()
 await book.xlsx.load(await accountStatementBuffer(rows,{from:'2026-10-01',to:'2026-10-04',paymentMethod:'Credit'}))
 const s=book.worksheets[0]
 const find=label=>{let found;s.eachRow(row=>{if(row.getCell(1).value===label)found=row});assert.ok(found,label);return found}
 const title=find('Farley')
 assert.ok(title.number>find('Grand Total').number)
 const first=s.getRow(title.number+3)
 assert.equal(first.getCell(1).value.toISOString().slice(0,10),'2026-10-01')
 assert.equal(first.getCell(2).value,null)
 assert.equal(first.getCell(3).value,300)
 assert.equal(s.getRow(first.number+1).getCell(2).value,100)
 assert.equal(s.getRow(first.number+3).getCell(3).value,null)
 assert.equal(find('Total Qty').getCell(3).value,310)
 assert.equal(find('Amount (RM)').getCell(2).value,23)
 assert.equal(find('Amount (RM)').getCell(3).value,57.85)
 assert.equal(find('Per/Kg').getCell(3).value,'0.18/0.185/0.19')
 assert.equal(find('F.Mall').getCell(2).value,'3225689676')
 assert.equal(find('F.Bakery').getCell(2).value,'8881048659504')
 const allocation=['F.Mall','F.Bakery','F.Cafe','F.H/M','F.App','F.In/Ch','F.Shoe']
 assert.equal(allocation.reduce((sum,label)=>sum+Math.round(find(label).getCell(3).value*100),0),5785)
 assert.equal(find('Allocation Total').getCell(3).value,57.85)
 assert.ok(s.pageSetup.printArea.endsWith('E'+s.rowCount))
 s.eachRow(row=>{assert.equal(row.height,15);row.eachCell(cell=>assert.equal(cell.font.size,10))})
})
