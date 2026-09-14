import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {myBills,myBillProof} from '../server/myBillsService.mjs'
test('history always scopes to authenticated issuer, preserves old and voided bills, filters and paginates',()=>{
 const db=new DatabaseSync(':memory:')
 db.exec(`CREATE TABLE employees(id,is_active,employment_status);INSERT INTO employees VALUES(1,1,'active'),(2,1,'active');CREATE TABLE purchase_bills(id,bill_number,service_date,customer_name_snapshot,branch_name_snapshot,driver_name_snapshot,vehicle_code_snapshot,registration_number_snapshot,total_cents,payment_method,status,issued_at,driver_employee_id);CREATE TABLE purchase_bill_items(id,purchase_bill_id,product_name_snapshot,short_form_snapshot,unit_snapshot,quantity,unit_price_cents,line_total_cents);CREATE TABLE purchase_payment_proofs(id,purchase_bill_id,storage_key,content_type);`)
 const insert=db.prepare("INSERT INTO purchase_bills VALUES(?,?,'2026-09-10','Company','Branch','Driver','V1','CAR1',100,'Cash',?,'2026-09-10T10:00:00+08:00',?)")
 for(let id=1;id<=52;id++)insert.run(id,'P'+id,id===1?'voided':'issued',1)
 insert.run(99,'OTHER','issued',2)
 db.exec("INSERT INTO purchase_bill_items VALUES(1,1,'Paper','OCC','kg',5,20,100);INSERT INTO purchase_payment_proofs VALUES(1,1,'own.png','image/png'),(2,99,'other.png','image/png')")
 try{
  const first=myBills({employeeId:2,scope:'all'},{employeeId:1},db);assert.equal(first.total,52);assert.equal(first.items.length,50);assert(first.hasMore);assert(first.items.every(b=>b.id!==99))
  const second=myBills({page:1},{employeeId:1},db);assert.equal(second.items.length,2);assert.equal(second.hasMore,false)
  const one=myBills({search:'P1',from:'2026-09-10',to:'2026-09-10'},{employeeId:1},db).items.find(b=>b.id===1);assert.equal(one.status,'voided');assert.equal(one.items[0].item,'Paper');assert.equal(one.hasProof,1);assert(!('canRequest'in one));assert(!('canReissue'in one))
  assert.equal(myBills({from:'2026-09-11'},{employeeId:1},db).total,0)
  assert.equal(myBillProof(99,{employeeId:1},db),null);assert.equal(myBillProof(1,{employeeId:1},db).storageKey,'own.png')
  assert.throws(()=>myBills({from:'2026-02-30'},{employeeId:1},db),e=>e.statusCode===400)
  db.exec('UPDATE employees SET is_active=0 WHERE id=1');assert.throws(()=>myBills({},{employeeId:1},db),e=>e.statusCode===403)
 }finally{db.close()}
})
