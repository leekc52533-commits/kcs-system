import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {cashDay,employeeSpending} from '../server/cashFloatOverview.mjs'
test('daily arithmetic reconciles and spending excludes topups/admin with no ledger limit',()=>{
 const db=new DatabaseSync(':memory:');db.exec(`CREATE TABLE cash_float_transactions(employee_id,service_date,transaction_type,amount_cents,voided_at);CREATE TABLE purchase_bills(service_date,total_cents,status,payment_method);CREATE TABLE admin_expense_records(amount_cents);INSERT INTO admin_expense_records VALUES(999999);INSERT INTO cash_float_transactions VALUES(1,'2026-09-09','opening_balance',30000,NULL),(1,'2026-09-10','top_up',10000,NULL),(1,'2026-09-10','cash_purchase',-12000,NULL),(1,'2026-09-10','expense',-3000,NULL),(1,'2026-09-10','reversal',2000,NULL),(1,'2026-09-11','top_up',99999,NULL);INSERT INTO purchase_bills VALUES('2026-09-10',12000,'issued','Cash'),('2026-09-10',2000,'voided','Cash'),('2026-09-10',4000,'issued','Credit');`)
 const d=cashDay(db,1,'2026-09-10');assert.equal(d.closingCents,27000);assert.equal(d.openingCents+d.topUpCents-d.purchaseCents-d.expenseCents+d.otherCents,d.closingCents)
 const total=employeeSpending(db,'2026-09-10','2026-09-10');assert.equal(total.totalCents,19000);assert.equal(total.creditCents,4000);assert.equal(total.voidCents,2000)
 const insert=db.prepare("INSERT INTO cash_float_transactions VALUES(2,'2026-09-10','expense',-1,NULL)");for(let i=0;i<2001;i++)insert.run();assert.equal(employeeSpending(db,'2026-09-10','2026-09-10').expenseCents,5001);db.close()
})
