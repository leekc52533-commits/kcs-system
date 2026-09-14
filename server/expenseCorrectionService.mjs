import {refreshAlert} from './cashFloatService.mjs'
const fail=(message,statusCode)=>Object.assign(Error(message),{statusCode})
export function canCorrectExpense(db,account){return Boolean(account?.id&&db.prepare('SELECT 1 FROM company_menu m JOIN auth_accounts a ON a.id=m.owner_account_id WHERE m.id=1 AND a.id=? AND a.is_active=1').get(Number(account.id)))}
function requireOwner(db,account){if(!canCorrectExpense(db,account))throw fail('Owner account only.',403)}
function record(db,key){
 const match=/^(employee|admin)-(\d+)$/.exec(key);if(!match)throw fail('Expense not found.',404)
 const employee=match[1]==='employee',table=employee?'cash_float_transactions':'admin_expense_records'
 const row=db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(Number(match[2]))
 if(!row||(employee&&(row.transaction_type!=='expense'||row.amount_cents>=0||row.voided_at||db.prepare('SELECT 1 FROM cash_float_transactions WHERE reversed_transaction_id=?').get(row.id))))throw fail('Expense cannot be corrected.',409)
 return {row,table,employee}
}
export function expenseCorrectionHistory(db,account,key){
 requireOwner(db,account);const {row,employee}=record(db,key)
 const history=db.prepare('SELECT id,old_amount_cents oldAmountCents,new_amount_cents newAmountCents,reason,actor_name actorName,created_at createdAt FROM expense_amount_corrections WHERE record_key=? ORDER BY id DESC').all(key)
 return {amountCents:Math.abs(row.amount_cents),revision:history[0]?.id||0,history,employee,serviceDate:row.service_date}
}
export function correctExpenseAmount(db,account,key,payload={}){
 requireOwner(db,account)
 const amount=String(payload.amount??'').trim(),reason=String(payload.reason??'').trim()
 if(!/^\d+(\.\d{1,2})?$/.test(amount)||Number(amount)<=0||Number(amount)>1000000||!reason||reason.length>500)throw fail('Enter a valid amount and reason (maximum 500 characters).',400)
 const next=Math.round(Number(amount)*100)
 db.exec('BEGIN IMMEDIATE');try{
 const current=expenseCorrectionHistory(db,account,key),{row,table,employee}=record(db,key)
 if(payload.expectedAmountCents!==current.amountCents||payload.revision!==current.revision)throw fail('Record changed. Close and reopen before correcting.',409)
 if(next===current.amountCents)throw fail('Enter a different amount.',400)
 const when=new Date().toISOString()
 db.prepare(`UPDATE ${table} SET amount_cents=? WHERE id=?`).run(employee?-next:next,row.id)
 db.prepare('INSERT INTO expense_amount_corrections(record_key,old_amount_cents,new_amount_cents,reason,account_id,actor_name,created_at) VALUES(?,?,?,?,?,?,?)').run(key,current.amountCents,next,reason,account.id,account.employeeName||account.username||'Owner',when)
 if(employee)refreshAlert(db,row.employee_id,when)
 const result=expenseCorrectionHistory(db,account,key);db.exec('COMMIT');return result
 }catch(e){db.exec('ROLLBACK');throw e}
}
