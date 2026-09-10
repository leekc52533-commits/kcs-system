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
 const expenseItems=groupExpenses(db.prepare(`SELECT t.description,t.amount_cents,x.category FROM cash_float_transactions t LEFT JOIN expense_details x ON x.employee_transaction_id=t.id WHERE t.employee_id=? AND t.service_date=? AND t.transaction_type='expense' ORDER BY t.id`).all(employeeId,date))
 return {...r,date,expenseItems}
}
function groupExpenses(rows){
 const groups=new Map()
 for(const item of rows){
  const category=item.category||(vehicleExpenseCategories.includes(item.description)?item.description:'Other')
  const description=category==='Other'?(String(item.description||'').trim()||'Other'):''
  const key=JSON.stringify([category,description]),group=groups.get(key)||{key,category,description,amountCents:0}
  group.amountCents-=item.amount_cents;groups.set(key,group)
 }
 return [...groups.values()].filter(item=>item.amountCents!==0)
}

export function employeeSpending(db,from,to){
 const bills=db.prepare(`SELECT COALESCE(SUM(total_cents),0) purchaseCents,
 COALESCE(SUM(CASE WHEN status='voided' THEN total_cents ELSE 0 END),0) voidCents
 FROM purchase_bills WHERE payment_method='Cash' AND service_date BETWEEN ? AND ?`).get(from,to)
 const expenseItems=groupExpenses(db.prepare(`SELECT t.description,t.amount_cents,x.category FROM cash_float_transactions t LEFT JOIN expense_details x ON x.employee_transaction_id=t.id WHERE t.transaction_type='expense' AND t.voided_at IS NULL AND t.service_date BETWEEN ? AND ? ORDER BY t.id`).all(from,to))
 const expenseCents=expenseItems.reduce((sum,item)=>sum+item.amountCents,0)
 return{from,to,...bills,expenseCents,expenseItems,totalCents:bills.purchaseCents+expenseCents-bills.voidCents}
}

export function dailyEmployeeSpending(db,month){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(month)))throw Object.assign(Error('CASH_DATE_INVALID'),{code:'CASH_DATE_INVALID',statusCode:400})
 const from=month+'-01',last=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).getUTCDate(),to=month+'-'+last
 const days=new Map(Array.from({length:last},(_,i)=>{const date=month+'-'+String(i+1).padStart(2,'0');return[date,{date,purchaseCents:0,voidCents:0,expenseCents:0,totalCents:0}]}))
 for(const row of db.prepare(`SELECT service_date date,SUM(total_cents) purchaseCents,SUM(CASE WHEN status='voided' THEN total_cents ELSE 0 END) voidCents FROM purchase_bills WHERE payment_method='Cash' AND service_date BETWEEN ? AND ? GROUP BY service_date`).all(from,to)){if(days.has(row.date))Object.assign(days.get(row.date),row)}
 for(const row of db.prepare(`SELECT service_date date,-SUM(amount_cents) expenseCents FROM cash_float_transactions WHERE transaction_type='expense' AND voided_at IS NULL AND service_date BETWEEN ? AND ? GROUP BY service_date`).all(from,to)){if(days.has(row.date))Object.assign(days.get(row.date),row)}
 return{month,items:[...days.values()].reverse().map(row=>({...row,totalCents:row.purchaseCents+row.expenseCents-row.voidCents}))}
}
