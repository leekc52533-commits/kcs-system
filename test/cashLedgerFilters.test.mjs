import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import ExcelJS from 'exceljs'
import {listCashFloatTransactions,cashFloatWorkbook,cashFloatProofFile} from '../server/cashFloatService.mjs'
test('ledger date/blank/multi filters, signed numeric sorting and Excel agree beyond 2000 rows',async()=>{
 const db=new DatabaseSync(':memory:');db.exec(`CREATE TABLE employees(id,name);INSERT INTO employees VALUES(1,'Employee 2'),(2,'Employee 10');CREATE TABLE purchase_bills(id,bill_number);CREATE TABLE purchase_payment_proofs(id,purchase_bill_id,storage_key,content_type);CREATE TABLE cash_float_transactions(id INTEGER PRIMARY KEY,employee_id,transaction_type,amount_cents,service_date,payment_channel,description,reference_number,proof_storage_key,proof_content_type,created_by_name_snapshot,created_at,voided_at,purchase_bill_id);`)
 const insert=db.prepare("INSERT INTO cash_float_transactions(employee_id,transaction_type,amount_cents,service_date,payment_channel,reference_number) VALUES(1,'expense',?,'2000-01-02','Cash',?)")
 for(let i=0;i<2001;i++)insert.run(i===0?0:-i,i===0?null:'PO'+i)
 db.exec("INSERT INTO cash_float_transactions(employee_id,transaction_type,amount_cents,service_date) VALUES(2,'top_up',50000,'2000-02-01')")
 const q={from:'2000-01-01',to:'2000-01-31',columns:JSON.stringify({employeeName:['Employee 2'],transactionTypeLabel:['Expense']}),sortKey:'amountLabel',sortDirection:'asc'}
 const data=listCashFloatTransactions(q,db);assert.equal(data.items.length,2001);assert.equal(data.items[0].amountCents,-2000);assert.equal(data.items.at(-1).amountCents,0)
 assert.equal(listCashFloatTransactions({...q,columns:JSON.stringify({ledgerReference:['']})},db).items.length,1)
 assert.equal(listCashFloatTransactions({...q,columns:JSON.stringify({employeeName:[]})},db).items.length,0)
 assert.equal(listCashFloatTransactions({},db).items.length,2002)
 const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(await cashFloatWorkbook(q,db));assert.equal(workbook.worksheets.length,1);const sheet=workbook.getWorksheet('Cash Float Ledger');assert.equal(sheet.rowCount,2002);assert.equal(sheet.getCell(2,4).value,-20);assert.equal(sheet.getCell(2002,4).value,0)
 db.exec("INSERT INTO purchase_bills VALUES(10,'P10'),(11,'P11');INSERT INTO purchase_payment_proofs VALUES(1,10,'purchase/original.png','image/png'),(2,11,'purchase/replacement.jpg','image/jpeg');INSERT INTO cash_float_transactions(id,employee_id,transaction_type,amount_cents,service_date,purchase_bill_id) VALUES(3001,1,'cash_purchase',-100,'2000-01-03',10),(3002,1,'cash_purchase',-200,'2000-01-03',11),(3003,1,'cash_purchase',-300,'2000-01-03',12);UPDATE cash_float_transactions SET proof_storage_key='topup.png',proof_content_type='image/png' WHERE transaction_type='top_up'")
 assert.equal(listCashFloatTransactions({},db).items.find(x=>x.id===3001).hasProof,true)
 assert.equal(listCashFloatTransactions({},db).items.find(x=>x.id===3003).hasProof,false)
 assert.deepEqual({...cashFloatProofFile(3001,db)},{storageKey:'purchase/original.png',contentType:'image/png'})
 assert.equal(cashFloatProofFile(3002,db).storageKey,'purchase/replacement.jpg')
 assert.equal(cashFloatProofFile(3003,db),null)
 assert.equal(cashFloatProofFile(2002,db).storageKey,'topup.png')
 await assert.rejects(()=>cashFloatWorkbook({from:'2000-02-01',to:'2000-01-01'},db));db.close()
})
