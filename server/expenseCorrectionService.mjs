import {refreshAlert} from './cashFloatService.mjs'
const fail=(message,statusCode)=>Object.assign(Error(message),{statusCode})
export function canCorrectExpense(db,account){return Boolean(account?.id&&db.prepare("SELECT 1 FROM auth_accounts WHERE id=? AND is_active=1 AND COALESCE(system_role,role) IN ('office','supervisor','operations_admin','owner_admin')").get(Number(account.id)))}
export function canApproveExpense(db,account){return Boolean(account?.id&&db.prepare("SELECT 1 FROM auth_accounts WHERE id=? AND is_active=1 AND COALESCE(system_role,role) IN ('supervisor','operations_admin','owner_admin')").get(Number(account.id)))}
function requireOffice(db,account){if(!canCorrectExpense(db,account))throw fail('Office access required.',403)}
function record(db,key){
 const match=/^(employee|admin)-(\d+)$/.exec(key);if(!match)throw fail('Expense not found.',404)
 const employee=match[1]==='employee',table=employee?'cash_float_transactions':'admin_expense_records'
 const row=db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(Number(match[2]))
 if(!row||(employee&&(row.transaction_type!=='expense'||row.amount_cents>=0||row.voided_at||db.prepare('SELECT 1 FROM cash_float_transactions WHERE reversed_transaction_id=?').get(row.id))))throw fail('Expense cannot be corrected.',409)
 return {row,table,employee}
}
export function expenseCorrectionHistory(db,account,key){
 requireOffice(db,account);const {row,employee}=record(db,key)
 const history=db.prepare('SELECT id,old_amount_cents oldAmountCents,new_amount_cents newAmountCents,reason,actor_name actorName,created_at createdAt FROM expense_amount_corrections WHERE record_key=? ORDER BY id DESC').all(key)
 return {amountCents:Math.abs(row.amount_cents),revision:history[0]?.id||0,history,employee,serviceDate:row.service_date}
}
function correctExpenseAmount(db,account,key,payload={}){
 requireOffice(db,account)
 const amount=String(payload.amount??'').trim(),reason=String(payload.reason??'').trim()
 if(!/^\d+(\.\d{1,2})?$/.test(amount)||Number(amount)<=0||Number(amount)>1000000||!reason||reason.length>500)throw fail('Enter a valid amount and reason (maximum 500 characters).',400)
 const next=Math.round(Number(amount)*100)
 try{
 const current=expenseCorrectionHistory(db,account,key),{row,table,employee}=record(db,key)
 if(payload.expectedAmountCents!==current.amountCents||payload.revision!==current.revision)throw fail('Record changed. Close and reopen before correcting.',409)
 if(next===current.amountCents)throw fail('Enter a different amount.',400)
 const when=new Date().toISOString()
 db.prepare(`UPDATE ${table} SET amount_cents=? WHERE id=?`).run(employee?-next:next,row.id)
 db.prepare('INSERT INTO expense_amount_corrections(record_key,old_amount_cents,new_amount_cents,reason,account_id,actor_name,created_at) VALUES(?,?,?,?,?,?,?)').run(key,current.amountCents,next,reason,account.id,account.employeeName||account.username||'Owner',when)
 if(employee)refreshAlert(db,row.employee_id,when)
 const result=expenseCorrectionHistory(db,account,key);return result
 }catch(e){throw e}
}
function transaction(db,fn){db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result}catch(e){db.exec('ROLLBACK');throw e}}
export function requestExpenseCorrection(db,account,key,payload={}){
 requireOffice(db,account)
 const amount=String(payload.amount??'').trim(),reason=String(payload.reason??'').trim()
 if(!/^\d+(\.\d{1,2})?$/.test(amount)||Number(amount)<=0||Number(amount)>1000000||!reason||reason.length>500)throw fail('Enter a valid amount and reason.',400)
 return transaction(db,()=>{const current=expenseCorrectionHistory(db,account,key),next=Math.round(Number(amount)*100)
 if(payload.expectedAmountCents!==current.amountCents||payload.revision!==current.revision)throw fail('Record changed. Close and reopen.',409)
 if(next===current.amountCents)throw fail('Enter a different amount.',400)
 if(db.prepare("SELECT 1 FROM expense_correction_requests WHERE record_key=? AND status='pending'").get(key))throw fail('A correction is already awaiting approval.',409)
 const r=db.prepare('INSERT INTO expense_correction_requests(record_key,old_amount_cents,new_amount_cents,expected_revision,reason,requester_account_id,requester_name,created_at) VALUES(?,?,?,?,?,?,?,?)').run(key,current.amountCents,next,current.revision,reason,account.id,account.employeeName||account.username,new Date().toISOString())
 return {...current,requestId:Number(r.lastInsertRowid),status:'pending'}
 })
}
export function decideExpenseCorrection(db,account,id,decision,payload={}){
 if(!canApproveExpense(db,account))throw fail('Supervisor approval required.',403)
 const reason=String(payload.reason||'').trim();if(!['approve','reject'].includes(decision)||!reason||reason.length>500)throw fail('Enter approval or rejection reason.',400)
 return transaction(db,()=>{const r=db.prepare('SELECT * FROM expense_correction_requests WHERE id=?').get(id);if(!r||r.status!=='pending')throw fail('Request already processed or not found.',409)
 let correctionId=null
 if(decision==='approve'){const result=correctExpenseAmount(db,account,r.record_key,{amount:(r.new_amount_cents/100).toFixed(2),expectedAmountCents:r.old_amount_cents,revision:r.expected_revision,reason:r.reason});correctionId=result.revision}
 db.prepare('UPDATE expense_correction_requests SET status=?,reviewer_account_id=?,reviewer_name=?,review_reason=?,reviewed_at=?,correction_id=? WHERE id=?').run(decision==='approve'?'approved':'rejected',account.id,account.employeeName||account.username,reason,new Date().toISOString(),correctionId,id)
 return {status:decision==='approve'?'approved':'rejected'}
 })
}
export function expenseCorrectionCenter(db,account,q=''){
 requireOffice(db,account);q=String(q).trim();if(q.length>100)throw fail('Search is too long.',400)
 const m=/^EXP-([EA])-(\d+)$/i.exec(q);if(m)q=(m[1].toUpperCase()==='E'?'employee':'admin')+'-'+Number(m[2])
 const items=q?db.prepare(`SELECT * FROM (
 SELECT 'employee-'||t.id recordKey,t.service_date serviceDate,e.name employeeName,t.description,ABS(t.amount_cents) amountCents,t.reference_number referenceNumber,t.created_at createdAt FROM cash_float_transactions t JOIN employees e ON e.id=t.employee_id WHERE t.transaction_type='expense' AND t.voided_at IS NULL
 UNION ALL SELECT 'admin-'||id,service_date,'Admin / Company',description,amount_cents,reference_number,created_at FROM admin_expense_records
 ) WHERE lower(recordKey)=lower(?) OR lower(referenceNumber)=lower(?) ORDER BY createdAt DESC LIMIT 51`).all(q,q):[]
 const requests=db.prepare(`SELECT r.*,COALESCE(t.service_date,a.service_date) service_date,COALESCE(e.name,'Admin / Company') employee_name,COALESCE(t.description,a.description) description FROM expense_correction_requests r LEFT JOIN cash_float_transactions t ON r.record_key='employee-'||t.id LEFT JOIN employees e ON e.id=t.employee_id LEFT JOIN admin_expense_records a ON r.record_key='admin-'||a.id ORDER BY CASE r.status WHEN 'pending' THEN 0 ELSE 1 END,r.id DESC LIMIT 100`).all()
 return {items:items.slice(0,50),tooMany:items.length>50,requests,canApprove:canApproveExpense(db,account)}
}
