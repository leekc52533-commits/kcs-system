import {DatabaseSync,backup} from 'node:sqlite'
import {pathToFileURL} from 'node:url'
import {kuchingDate} from '../shared/kuchingTime.js'
const number='P260921-008',action='kc_hnl_cash_to_credit_20260921'
const reason='KC confirmed Hnl bbs is Credit; temporary intake incorrectly created a new Cash customer. Correct this bill only; canonical B10165 / C10056.'
export function correctHnlCredit(db,{apply=false}={}){
 db.exec('BEGIN IMMEDIATE')
 try{
 const bill=db.prepare('SELECT * FROM purchase_bills WHERE bill_number=?').get(number)
 if(!bill||bill.status!=='issued'||bill.total_cents!==2700||bill.service_date!=='2026-09-21'||bill.dispatch_stop_id!==5032||bill.branch_name_snapshot.trim().toLowerCase()!=='hnl bbs')throw Error('Bill identity/amount/status mismatch; no changes made')
 const stop=db.prepare('SELECT * FROM dispatch_stops WHERE id=?').get(bill.dispatch_stop_id)
 const branch=db.prepare('SELECT * FROM branches WHERE id=?').get(bill.branch_id)
 if(!stop||stop.branch_id!==bill.branch_id||!['B10509','10509'].includes(String(branch?.jodoo_branch_id).toUpperCase()))throw Error('Unexpected branch/stop')
 const prior=db.prepare('SELECT * FROM audit_logs WHERE action=? AND entity_id=?').all(action,String(bill.id))
 const ledger=db.prepare('SELECT * FROM cash_float_transactions WHERE purchase_bill_id=?').all(bill.id)
 if(ledger.length>1)throw Error('Ambiguous ledger')
 const deduction=ledger[0]
 if(deduction&&(deduction.transaction_type!=='cash_purchase'||deduction.amount_cents!==-2700||deduction.employee_id!==bill.driver_employee_id||deduction.voided_at))throw Error('Cash deduction mismatch')
 const reversals=deduction?db.prepare('SELECT * FROM cash_float_transactions WHERE reversed_transaction_id=?').all(deduction.id):[]
 if(prior.length){
 const saved=JSON.parse(prior[0].after_json)
 if(prior.length!==1||bill.payment_method!=='Credit'||stop.payment_status!=='credit'||(deduction?(reversals.length!==1||reversals[0].id!==saved.reversalId||reversals[0].amount_cents!==2700||reversals[0].employee_id!==bill.driver_employee_id):saved.reversalId!==null))throw Error('Prior correction no longer matches; review required')
 db.exec('ROLLBACK');return{mode:apply?'applied':'preview',bill:number,paymentMethod:'Credit',alreadyCorrected:true,stopStatus:stop.status}
 }
 if(bill.payment_method!=='Cash'||reversals.length)throw Error('Unexpected prior payment change/reversal')
 if(db.prepare('SELECT 1 FROM purchase_payment_proofs WHERE purchase_bill_id=?').get(bill.id))throw Error('Cash payment evidence exists; financial review required before changing method')
 if(db.prepare('SELECT 1 FROM purchase_bill_void_requests WHERE purchase_bill_id=? AND status IN (\'pending\',\'approved\')').get(bill.id))throw Error('Pending/approved void requires review')
 let reversalId=null
 const when=new Date().toISOString()
 if(deduction){
 reversalId=Number(db.prepare(`INSERT INTO cash_float_transactions(employee_id,transaction_type,amount_cents,service_date,reversed_transaction_id,payment_channel,description,reference_number,created_by_name_snapshot,created_at) VALUES(?,'reversal',2700,?,?,'System',?,?,?,?)`).run(bill.driver_employee_id,kuchingDate(),deduction.id,reason,number,'KC confirmed correction',when).lastInsertRowid)
 const balance=db.prepare('SELECT COALESCE(SUM(amount_cents),0) n FROM cash_float_transactions WHERE employee_id=?').get(bill.driver_employee_id).n
 const account=db.prepare('SELECT * FROM cash_float_accounts WHERE employee_id=?').get(bill.driver_employee_id)
 if(account)db.prepare(`UPDATE cash_float_alerts SET balance_cents=?,last_checked_at=?,status=CASE WHEN ?=0 OR ?>? THEN 'resolved' ELSE status END,resolved_at=CASE WHEN ?=0 OR ?>? THEN ? ELSE resolved_at END WHERE employee_id=? AND status='active'`).run(balance,when,account.is_active,balance,account.low_balance_threshold_cents,account.is_active,balance,account.low_balance_threshold_cents,when,bill.driver_employee_id)
 }
 db.prepare("UPDATE purchase_bills SET payment_method='Credit',updated_at=CURRENT_TIMESTAMP WHERE id=?").run(bill.id)
 db.prepare("UPDATE dispatch_stops SET payment_status='credit' WHERE id=?").run(stop.id)
 const after={bill:db.prepare('SELECT * FROM purchase_bills WHERE id=?').get(bill.id),stop:db.prepare('SELECT * FROM dispatch_stops WHERE id=?').get(stop.id),reversalId,reason,actor:'KC',canonicalBranch:'B10165',canonicalCustomer:'C10056'}
 db.prepare('INSERT INTO audit_logs(action,entity_type,entity_id,before_json,after_json) VALUES(?,?,?,?,?)').run(action,'purchase_bill',String(bill.id),JSON.stringify({bill,stop,deduction:deduction||null}),JSON.stringify(after))
 if(db.prepare('PRAGMA foreign_key_check').all().length)throw Error('Foreign key check failed')
 db.exec(apply?'COMMIT':'ROLLBACK')
 return{mode:apply?'applied':'preview',bill:number,amountRM:27,paymentMethod:'Credit',cashFloatReversedRM:deduction?27:0,stopStatus:stop.status,completionTimeUnchanged:true,duplicateMergeStillSeparate:true}
 }catch(e){db.exec('ROLLBACK');throw e}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const path=process.argv[2];if(!path)throw Error('Database path required')
 const db=new DatabaseSync(path);db.exec('PRAGMA foreign_keys=ON;PRAGMA busy_timeout=10000')
 try{const apply=process.argv.includes('--apply');if(apply){const file=path+'.before-hnl-credit-'+Date.now()+'.bak';await backup(db,file);console.log('BACKUP='+file)}console.log(JSON.stringify(correctHnlCredit(db,{apply}),null,2))}finally{db.close()}
}
