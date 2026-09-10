import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {dailyEmployeeSpending,cashDay} from '../server/cashFloatOverview.mjs'
import {rolloverCashFilters,nextKuchingMidnight,expenseServiceDate} from '../shared/cashCalendar.js'
test('Kuching midnight advances today mode and preserves historical selections',()=>{
 const now=Date.parse('2026-09-26T15:59:59Z');assert.equal(nextKuchingMidnight(now),1050)
 assert.deepEqual(rolloverCashFilters({from:'2026-09-26',to:'2026-09-26'},'2026-09-26','2026-09-27'),{from:'2026-09-27',to:'2026-09-27'})
 const history={from:'2026-09-01',to:'2026-09-25'};assert.equal(rolloverCashFilters(history,'2026-09-26','2026-09-27'),history)
 const context={now:'2026-09-27T02:00:00Z'};assert.equal(expenseServiceDate('2026-09-26',context),'2026-09-26');assert.throws(()=>expenseServiceDate('2026-09-26',{...context,allowPast:false}),e=>e.statusCode===403);assert.throws(()=>expenseServiceDate('2026-02-30',context));assert.throws(()=>expenseServiceDate('2026-09-28',context))
})
test('daily history excludes credit and late expense updates past total and next opening balance',()=>{
 const db=new DatabaseSync(':memory:');db.exec(`CREATE TABLE cash_float_transactions(id INTEGER PRIMARY KEY,employee_id,service_date,transaction_type,amount_cents,voided_at,description);CREATE TABLE expense_details(employee_transaction_id,category);CREATE TABLE purchase_bills(service_date,total_cents,status,payment_method);INSERT INTO cash_float_transactions VALUES(1,1,'2026-09-25','opening_balance',100000,NULL,''),(2,1,'2026-09-26','cash_purchase',-50000,NULL,''),(3,1,'2026-09-26','expense',-10000,NULL,'Fuel');INSERT INTO purchase_bills VALUES('2026-09-26',50000,'issued','Cash'),('2026-09-26',70000,'issued','Credit');`)
 const before=dailyEmployeeSpending(db,'2026-09');assert.equal(before.items.find(x=>x.date==='2026-09-26').totalCents,60000)
 db.exec("INSERT INTO cash_float_transactions VALUES(4,1,'2026-09-26','expense',-5000,NULL,'Repair')")
 assert.equal(dailyEmployeeSpending(db,'2026-09').items.find(x=>x.date==='2026-09-26').totalCents,65000);assert.equal(cashDay(db,1,'2026-09-27').openingCents,35000);assert.equal(cashDay(db,1,'2026-09-27').expenseCents,0)
 db.exec("UPDATE purchase_bills SET status='voided' WHERE payment_method='Cash'");assert.equal(dailyEmployeeSpending(db,'2026-09').items.find(x=>x.date==='2026-09-26').totalCents,15000)
 assert.equal(dailyEmployeeSpending(db,'2024-02').items.length,29);assert.throws(()=>dailyEmployeeSpending(db,'2026-13'));db.close()
})
