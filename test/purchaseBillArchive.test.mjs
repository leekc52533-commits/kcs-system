import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import ExcelJS from 'exceljs'
import {schemaSql} from '../server/schema.mjs'
import {listPurchaseBillArchive,purchaseBillRows,purchaseBillsWorkbook,purchaseProofsZip} from '../server/purchaseBillArchiveService.mjs'

function fixture(){
  const db=new DatabaseSync(':memory:');db.exec(schemaSql);db.exec('PRAGMA foreign_keys=OFF')
  const bill=`INSERT INTO purchase_bills(id,bill_number,dispatch_stop_id,dispatch_trip_id,dispatch_day_id,branch_id,customer_id,driver_employee_id,vehicle_id,service_date,customer_name_snapshot,branch_code_snapshot,branch_name_snapshot,driver_name_snapshot,vehicle_code_snapshot,registration_number_snapshot,payment_method,weight_method,print_choice,subtotal_cents,total_cents,status,issued_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  db.prepare(bill).run(1,'P20260902-000001',1,1,1,1,1,7,1,'2026-09-02','ECO','10108','ECO QSR SERIAN','FAIS','L2','QAA4293N','Cash','on_site','print',800,800,'issued','2026-09-02T10:00:00+08:00')
  db.prepare(bill).run(2,'P20260903-000002',2,1,1,2,2,8,1,'2026-09-03','HNL','10117','HNL SERIAN','BOBOY','L2','QAA4293N','Credit','factory','no_print',2200,2200,'issued','2026-09-03T10:00:00+08:00')
  const item=db.prepare(`INSERT INTO purchase_bill_items(purchase_bill_id,product_id,product_code_snapshot,product_name_snapshot,short_form_snapshot,unit_snapshot,quantity,unit_price_cents,line_total_cents) VALUES(?,?,?,?,?,?,?,?,?)`)
  item.run(1,1,'OCC','Old Corrugated Cardboard','OCC','kg',10,20,200);item.run(1,2,'G1','Grade 1','G1','kg',10,60,600);item.run(2,1,'OCC','Old Corrugated Cardboard','OCC','kg',100,22,2200)
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'kcs-archive-'));fs.mkdirSync(path.join(root,'payment-proofs'));fs.writeFileSync(path.join(root,'payment-proofs','cash.png'),Buffer.from([137,80,78,71]))
  db.prepare(`INSERT INTO purchase_payment_proofs(id,purchase_bill_id,uploaded_by_employee_id,storage_key,original_name,content_type,size_bytes,created_at) VALUES(1,1,7,'payment-proofs/cash.png','cash.png','image/png',4,'2026-09-02T10:01:00+08:00')`).run()
  return{db,root}
}

test('Purchase Bill archive filters Bills and keeps multi-item rows under the same PO No.',()=>{const{db,root}=fixture();const archive=listPurchaseBillArchive({month:'2026-09',paymentMethod:'Cash'},db),flat=purchaseBillRows({month:'2026-09'},db);assert.equal(archive.items.length,1);assert.equal(archive.items[0].items.length,2);assert.equal(flat.rows.length,3);assert.equal(flat.rows[1]['PO No.'],flat.rows[2]['PO No.']);assert.equal(flat.rows[0]['Payment Gambar'],'');fs.rmSync(root,{recursive:true,force:true})})

test('monthly Excel has the accounting evidence columns and numeric amounts',async()=>{const{db,root}=fixture(),file=await purchaseBillsWorkbook({month:'2026-09'},db),workbook=new ExcelJS.Workbook();await workbook.xlsx.load(file.buffer);const sheet=workbook.worksheets[0];assert.deepEqual(sheet.getRow(1).values.slice(1),['Date','PO No.','Total','PaymentMethod','Customer Name','Branch','Item','Quantity','Price','Item Total','Issued By','Payment Gambar','Void No.']);assert.equal(sheet.getCell('B2').value,'P20260903-000002');assert.equal(sheet.getCell('C2').value,22);assert.equal(sheet.rowCount,4);fs.rmSync(root,{recursive:true,force:true})})

test('monthly proof ZIP contains Cash evidence named with its PO No.',()=>{const{db,root}=fixture(),file=purchaseProofsZip({month:'2026-09'},db,{uploadsRoot:root});assert.equal(file.fileCount,1);assert.equal(file.buffer.readUInt32LE(0),0x04034b50);assert.match(file.buffer.toString('latin1'),/P20260902-000001_001\.png/);fs.rmSync(root,{recursive:true,force:true})})

test('admin UI excludes print status and provides separate Excel and proof ZIP downloads',()=>{const source=fs.readFileSync(new URL('../src/PurchaseBillsPage.jsx',import.meta.url),'utf8');assert.match(source,/Monthly Purchase Bill Records/);assert.match(source,/Download Monthly Excel/);assert.match(source,/Download Payment Proofs ZIP/);assert.doesNotMatch(source,/Print Choice|Whether Printed|Daily Summary|Employee Summary/)})
