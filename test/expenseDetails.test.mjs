import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import ExcelJS from 'exceljs'
import {schemaSql} from '../server/schema.mjs'
import {applyV56Migration} from '../server/migrationV56.mjs'
import {normalizeExpenseDetails,expenseVehicles} from '../server/expenseDetails.mjs'
import {parseExpenseReceipt,recognizeExpenseReceipt} from '../server/expenseReceiptOcr.mjs'
import {configureCashFloat,addCashFloatExpense,addAdminExpense,listExpenseRecords,expenseRecordsWorkbook,mobileCashFloat} from '../server/cashFloatService.mjs'
const proof={name:'receipt.png',dataUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='}
function fixture(){const d=new DatabaseSync(':memory:');d.exec('PRAGMA foreign_keys=ON;'+schemaSql);d.exec("INSERT INTO employees(id,employee_code,name,job_role,employment_status,is_active) VALUES(1,'E1','Test','Driver','active',1);INSERT INTO vehicles(id,vehicle_code,registration_number,operational_status) VALUES(1,'V1','QAB123','active'),(2,'V2','QAB456','sold')");return d}
const full={category:'Fuel',description:'Fuel',amount:12.30,vehicleId:1,odometerKm:15001,referenceNumber:'INV-99',companyName:'Test Shop',tinNumber:'C123',remarks:'Test note',proof,paymentMethod:'Cash'}
test('vehicle expenses require all requested fields; Other requires merchant and invoice but allows blank vehicle and description',()=>{const d=fixture();for(const key of ['vehicleId','odometerKm','referenceNumber','companyName'])assert.throws(()=>normalizeExpenseDetails({...full,[key]:''},d),/EXPENSE_DETAILS_INVALID/);assert.equal(normalizeExpenseDetails({category:'Other',description:'',companyName:'Shop',referenceNumber:'INV'},d).description,'Other');for(const key of ['referenceNumber','companyName'])assert.throws(()=>normalizeExpenseDetails({...full,category:'Other',[key]:'   '},d),/EXPENSE_DETAILS_INVALID/);assert.doesNotThrow(()=>normalizeExpenseDetails({...full,tinNumber:'',remarks:''},d));assert.throws(()=>normalizeExpenseDetails({...full,vehicleId:2},d));assert.throws(()=>normalizeExpenseDetails({...full,odometerKm:-1},d));d.exec("INSERT INTO vehicles(vehicle_code,registration_number,operational_status) VALUES('NEW','QNEW','active')");assert.ok(expenseVehicles(d).some(v=>v.registrationNumber==='QNEW'));d.close()})
test('employee/admin details persist, ledger deducts once, search/export retain invoice and merchant data',async()=>{const d=fixture(),root=fs.mkdtempSync(path.join(os.tmpdir(),'kcs-exp-test-')),context={employeeId:1,employeeName:'Test'};try{configureCashFloat(1,{targetFloat:500,lowBalanceThreshold:100,currentBalance:500},context,d);addCashFloatExpense(1,full,context,d,{uploadsRoot:root});addAdminExpense({...full,remarks:'Admin note'},context,d,{uploadsRoot:root});assert.equal(mobileCashFloat(1,d).balanceCents,48770);const rows=listExpenseRecords({search:'Test Shop'},d).items;assert.equal(rows.length,2);for(const r of rows){assert.equal(r.vehiclePlate,'QAB123');assert.equal(r.odometerKm,15001);assert.equal(r.referenceNumber,'INV-99');assert.equal(r.tinNumber,'C123')};const buffer=await expenseRecordsWorkbook({},d,{uploadsRoot:root}),book=new ExcelJS.Workbook();await book.xlsx.load(buffer);assert.ok(book.worksheets[0].getRow(1).values.includes('Odometer (km)'));assert.ok(book.worksheets[0].getRow(2).values.includes('Test Shop'));addCashFloatExpense(1,{category:'Other',amount:1,proof,companyName:'Shop',referenceNumber:'INV'},context,d,{uploadsRoot:root});assert.equal(listExpenseRecords({category:'Other'},d).items[0].description,'Other');assert.equal(d.prepare('PRAGMA foreign_key_check').get(),undefined)}finally{d.close();fs.rmSync(root,{recursive:true,force:true})}})
test('v56 migration is additive and repeatable',()=>{const d=fixture();d.exec('DROP TABLE expense_details;INSERT INTO schema_meta(version) VALUES(55)');applyV56Migration(d);applyV56Migration(d);assert.equal(d.prepare('SELECT MAX(version) v FROM schema_meta').get().v,56);assert.equal(d.prepare('SELECT COUNT(*) n FROM employees').get().n,1);d.close()})
test('receipt parser uses explicit labels and known vehicle, never guesses absent meter',()=>{const result=parseExpenseReceipt('Test Petrol SDN BHD\nSUBTOTAL 10.00\nTOTAL RM 12.30\nInvoice No: INV-99\nTIN: C123\nOdometer: 15,001 km\nCar No: QAB123',[{id:1,registrationNumber:'QAB123'}]);assert.deepEqual(result,{amount:'12.30',referenceNumber:'INV-99',companyName:'Test Petrol SDN BHD',tinNumber:'C123',odometerKm:'15001',vehicleId:'1'});assert.deepEqual(parseExpenseReceipt('SUBTOTAL 22.00\n12 99\nTHANK YOU'),{})})
test('unavailable OCR preserves manual workflow and malformed images are rejected',async()=>{const old=process.env.KCS_TESSERACT_PATH;process.env.KCS_TESSERACT_PATH='/does-not-exist/kcs-ocr';try{assert.equal((await recognizeExpenseReceipt(proof)).status,'unavailable');await assert.rejects(()=>recognizeExpenseReceipt({dataUrl:'not-an-image'}))}finally{if(old===undefined)delete process.env.KCS_TESSERACT_PATH;else process.env.KCS_TESSERACT_PATH=old}})

test('expense multi-select and blanks apply before totals and Excel generation',async()=>{
 const d=fixture(),root=fs.mkdtempSync(path.join(os.tmpdir(),'kcs-exp-filter-')),context={employeeId:1,employeeName:'Test'}
 try{
 addAdminExpense({...full,referenceNumber:'INV-10',amount:100},context,d,{uploadsRoot:root})
 addAdminExpense({...full,referenceNumber:'INV-2',amount:9,tinNumber:''},context,d,{uploadsRoot:root})
 const query={columns:JSON.stringify({referenceNumber:['INV-2','INV-10'],tinNumber:['']}),sortKey:'amountLabel',sortDirection:'asc'}
 const result=listExpenseRecords(query,d);assert.equal(result.items.length,1);assert.equal(result.totalCents,900)
 const book=new ExcelJS.Workbook();await book.xlsx.load(await expenseRecordsWorkbook(query,d,{uploadsRoot:root}))
 assert.equal(book.worksheets[0].rowCount,3);assert.equal(book.worksheets[0].getCell('G3').value,9);assert.ok(book.worksheets[0].getRow(2).values.includes('INV-2'))
 assert.deepEqual(listExpenseRecords({sortKey:'referenceNumber',sortDirection:'asc'},d).items.map(x=>x.referenceNumber),['INV-2','INV-10'])
 }finally{d.close();fs.rmSync(root,{recursive:true,force:true})}
})
