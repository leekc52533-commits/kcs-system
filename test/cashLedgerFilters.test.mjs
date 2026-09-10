import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import ExcelJS from 'exceljs'
import {listCashFloatTransactions,cashFloatWorkbook} from '../server/cashFloatService.mjs'
test('ledger date/blank/multi filters, signed numeric sorting and Excel agree beyond 2000 rows',async()=>{
 const db=new DatabaseSync(':memory:');db.exec(`CREATE TABLE employees(id,name);INSERT INTO employees VALUES(1,'Employee 2'),(2,'Employee 10');CREATE TABLE purchase_bills(id,bill_number);CREATE TABLE cash_float_transactions(id INTEGER PRIMARY KEY,employee_id,transaction_type,amount_cents,service_date,payment_channel,description,reference_number,proof_storage_key,created_by_name_snapshot,created_at,voided_at,purchase_bill_id);`)
 const insert=db.prepare("INSERT INTO cash_float_transactions(employee_id,transaction_type,amount_cents,service_date,payment_channel,reference_number) VALUES(1,'expense',?,'2000-01-02','Cash',?)")
 for(let i=0;i<2001;i++)insert.run(i===0?0:-i,i===0?null:'PO'+i)
 db.exec("INSERT INTO cash_float_transactions(employee_id,transaction_type,amount_cents,service_date) VALUES(2,'top_up',50000,'2000-02-01')")
 const q={from:'2000-01-01',to:'2000-01-31',columns:JSON.stringify({employeeName:['Employee 2'],transactionTypeLabel:['Expense']}),sortKey:'amountLabel',sortDirection:'asc'}
 const data=listCashFloatTransactions(q,db);assert.equal(data.items.length,2001);assert.equal(data.items[0].amountCents,-2000);assert.equal(data.items.at(-1).amountCents,0)
 assert.equal(listCashFloatTransactions({...q,columns:JSON.stringify({ledgerReference:['']})},db).items.length,1)
 assert.equal(listCashFloatTransactions({...q,columns:JSON.stringify({employeeName:[]})},db).items.length,0)
 assert.equal(listCashFloatTransactions({},db).items.length,2002)
 const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(await cashFloatWorkbook(q,db));assert.equal(workbook.worksheets.length,1);const sheet=workbook.getWorksheet('Cash Float Ledger');assert.equal(sheet.rowCount,2002);assert.equal(sheet.getCell(2,4).value,-20);assert.equal(sheet.getCell(2002,4).value,0)
 await assert.rejects(()=>cashFloatWorkbook({from:'2000-02-01',to:'2000-01-01'},db));db.close()
})
