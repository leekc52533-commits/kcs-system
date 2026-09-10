import {vehicleExpenseCategories} from './expenseDetails.mjs'
// Integer-cent aggregates are not affected by ledger pagination or hidden cards.
export function cashDay(db,employeeId,date){
 const r=db.prepare(`SELECT
 COALESCE(SUM(CASE WHEN service_date<? THEN amount_cents ELSE 0 END),0) openingCents,
 COALESCE(SUM(CASE WHEN service_date<=? THEN amount_cents ELSE 0 END),0) closingCents,
 COALESCE(SUM(CASE WHEN service_date=? AND transaction_type='top_up' THEN amount_cents ELSE 0 END),0) topUpCents,
 COALESCE(-SUM(CASE WHEN service_date=? AND transaction_type='cash_purchase' THEN amount_cents ELSE 0 END),0) purchaseCents,
 COALESCE(-SUM(CASE WHEN service_date=? AND transaction_type='expense' THEN amount_cents ELSE 0 END),0) expenseCents,
 COALESCE(SUM(CASE WHEN service_date=? AND transaction_type NOT IN ('top_up','cash_purchase','expense') THEN amount_cents ELSE 0 END),0) otherCents
 FROM cash_float_transactions WHERE employee_id=?`).get(date,date,date,date,date,date,employeeId)
 const groups=new Map()
 for(const item of db.prepare(`SELECT t.description,t.amount_cents,x.category FROM cash_float_transactions t LEFT JOIN expense_details x ON x.employee_transaction_id=t.id WHERE t.employee_id=? AND t.service_date=? AND t.transaction_type='expense' ORDER BY t.id`).all(employeeId,date)){
  const category=item.category||(vehicleExpenseCategories.includes(item.description)?item.description:'Other')
  const description=category==='Other'?(String(item.description||'').trim()||'Other'):''
  const key=JSON.stringify([category,description]),group=groups.get(key)||{key,category,description,amountCents:0}
  group.amountCents-=item.amount_cents;groups.set(key,group)
 }
 return {...r,date,expenseItems:[...groups.values()].filter(item=>item.amountCents!==0)}
}
export function employeeSpending(db,from,to){
 const bills=db.prepare(`SELECT COALESCE(SUM(total_cents),0) purchaseCents,
 COALESCE(SUM(CASE WHEN status='voided' THEN total_cents ELSE 0 END),0) voidCents,
 COALESCE(SUM(CASE WHEN status='issued' AND payment_method='Credit' THEN total_cents ELSE 0 END),0) creditCents
 FROM purchase_bills WHERE service_date BETWEEN ? AND ?`).get(from,to)
 const expense=db.prepare("SELECT COALESCE(-SUM(amount_cents),0) expenseCents FROM cash_float_transactions WHERE transaction_type='expense' AND voided_at IS NULL AND service_date BETWEEN ? AND ?").get(from,to)
 return{from,to,...bills,...expense,totalCents:bills.purchaseCents+expense.expenseCents-bills.voidCents}
}
