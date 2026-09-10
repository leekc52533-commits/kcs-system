import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import ExcelJS from 'exceljs'
import {cashDailyWorkbook} from '../server/cashDailyWorkbook.mjs'
test('daily workbook exports exact cross-month cash totals and expense categories',async()=>{
 const db=new DatabaseSync(':memory:');db.exec(`CREATE TABLE purchase_bills(service_date,total_cents,status,payment_method);CREATE TABLE cash_float_transactions(id INTEGER PRIMARY KEY,service_date,transaction_type,amount_cents,voided_at,description);CREATE TABLE expense_details(employee_transaction_id,category);INSERT INTO purchase_bills VALUES('2000-01-31',10000,'issued','Cash'),('2000-02-01',4000,'voided','Cash'),('2000-02-01',99999,'issued','Credit');INSERT INTO cash_float_transactions VALUES(1,'2000-02-01','expense',-500,NULL,'Fuel'),(2,'2000-02-01','top_up',88888,NULL,'');`)
 const book=new ExcelJS.Workbook();await book.xlsx.load(await cashDailyWorkbook(db,{from:'2000-01-31',to:'2000-02-01'}));const daily=book.getWorksheet('Daily Cash Spending');assert.equal(daily.rowCount,4);assert.equal(daily.getCell('E2').value,100);assert.equal(daily.getCell('E3').value,5);assert.equal(daily.getCell('E4').value,105);assert.equal(book.getWorksheet('Employee Expense Items').getCell('A2').value,'Fuel');assert.equal(book.getWorksheet('Employee Expense Items').getCell('C2').value,5)
 const single=new ExcelJS.Workbook();await single.xlsx.load(await cashDailyWorkbook(db,{from:'2000-02-01',to:'2000-02-01'}));assert.equal(single.getWorksheet(1).rowCount,3)
 await assert.rejects(cashDailyWorkbook(db,{from:'2000-02-02',to:'2000-02-01'}));await assert.rejects(cashDailyWorkbook(db,{from:'2000-02-30',to:'2000-03-01'}));db.close()
})
