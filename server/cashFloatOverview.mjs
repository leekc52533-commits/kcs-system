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
 return {...r,date}
}
export function employeeSpending(db,from,to){
 const bills=db.prepare(`SELECT COALESCE(SUM(total_cents),0) purchaseCents,
 COALESCE(SUM(CASE WHEN status='voided' THEN total_cents ELSE 0 END),0) voidCents,
 COALESCE(SUM(CASE WHEN status='issued' AND payment_method='Credit' THEN total_cents ELSE 0 END),0) creditCents
 FROM purchase_bills WHERE service_date BETWEEN ? AND ?`).get(from,to)
 const expense=db.prepare("SELECT COALESCE(-SUM(amount_cents),0) expenseCents FROM cash_float_transactions WHERE transaction_type='expense' AND voided_at IS NULL AND service_date BETWEEN ? AND ?").get(from,to)
 return{from,to,...bills,...expense,totalCents:bills.purchaseCents+expense.expenseCents-bills.voidCents}
}
