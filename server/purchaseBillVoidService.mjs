import {db as defaultDb} from './database.mjs'
import {withImmediateTransaction} from './branchServiceDateGuard.mjs'
import {reverseVoidedPurchase} from './cashFloatService.mjs'

const reviewers=['owner','owner_admin','operations_admin','supervisor']
const viewers=[...reviewers,'office','dispatcher']
const fail=(code,statusCode=409)=>Object.assign(new Error(code),{code,statusCode})
export function voidActor(context,db){
 const person=db.prepare("SELECT id,name FROM employees WHERE id=? AND is_active=1 AND employment_status='active'").get(Number(context.employeeId))
 if(!person)throw fail('PERMISSION_DENIED',403)
 return {...context,employeeId:Number(person.id),employeeName:person.name}
}
export function voidEvent(db,id,action,actor,detail={}){
 db.prepare('INSERT INTO purchase_bill_void_events(request_id,action,actor_id,actor_name,created_at,detail_json) VALUES(?,?,?,?,?,?)').run(id,action,actor.employeeId,actor.employeeName,new Date(actor.now||Date.now()).toISOString(),JSON.stringify(detail))
}
export function listBillVoids(query={},context={},db=defaultDb){
 const actor=voidActor(context,db),all=viewers.includes(actor.role)&&query.scope!=='own',search=String(query.search||'').trim().toLowerCase()
 const items=db.prepare(`SELECT b.*,p.id proofId FROM purchase_bills b LEFT JOIN purchase_payment_proofs p ON p.purchase_bill_id=b.id WHERE (?=1 OR b.driver_employee_id=?) ORDER BY b.id DESC`).all(all?1:0,actor.employeeId).filter(b=>!search||[b.bill_number,b.customer_name_snapshot,b.branch_name_snapshot,b.branch_code_snapshot,b.driver_name_snapshot].some(x=>String(x||'').toLowerCase().includes(search))).map(b=>{
  const requests=db.prepare('SELECT * FROM purchase_bill_void_requests WHERE purchase_bill_id=? ORDER BY id DESC').all(b.id)
  return {...b,canViewReplacement:b.driver_employee_id===actor.employeeId&&requests.some(r=>r.status==='approved'&&r.replacement_bill_id),items:db.prepare('SELECT product_name_snapshot,quantity,unit_snapshot,line_total_cents FROM purchase_bill_items WHERE purchase_bill_id=? ORDER BY id').all(b.id),requests,canRequest:b.status==='issued'&&b.driver_employee_id===actor.employeeId&&!requests.some(r=>r.status==='pending'),canReissue:b.driver_employee_id===actor.employeeId&&b.status==='voided'&&requests.some(r=>r.status==='approved'&&!r.replacement_bill_id)}
 })
 return {items,canReview:reviewers.includes(actor.role)}
}
export function requestBillVoid(billId,payload={},context={},db=defaultDb){
 return withImmediateTransaction(db,()=>{
  const actor=voidActor(context,db),b=db.prepare('SELECT * FROM purchase_bills WHERE id=?').get(Number(billId))
  if(!b)throw fail('NOT_FOUND',404)
  if(b.driver_employee_id!==actor.employeeId)throw fail('PERMISSION_DENIED',403)
  if(b.status!=='issued')throw fail('VOID_STATE_CONFLICT')
  const reason=String(payload.reason||'').trim()
  if(!reason||reason.length>2000)throw fail('VOID_REASON_REQUIRED',400)
  const existing=db.prepare("SELECT * FROM purchase_bill_void_requests WHERE purchase_bill_id=? AND status='pending'").get(b.id)
  if(existing)return {...existing,idempotent:true}
  const result=db.prepare('INSERT INTO purchase_bill_void_requests(purchase_bill_id,requested_by,requested_name,reason,requested_at) VALUES(?,?,?,?,?)').run(b.id,actor.employeeId,actor.employeeName,reason,new Date(actor.now||Date.now()).toISOString())
  const id=Number(result.lastInsertRowid);voidEvent(db,id,'requested',actor,{billNumber:b.bill_number,reason})
  return {id,status:'pending'}
 })
}
export function decideBillVoid(requestId,decision,payload={},context={},db=defaultDb){
 return withImmediateTransaction(db,()=>{
  const actor=voidActor(context,db)
  if(!reviewers.includes(actor.role))throw fail('PERMISSION_DENIED',403)
  if(!['approved','rejected'].includes(decision))throw fail('VOID_STATE_CONFLICT')
  const r=db.prepare('SELECT * FROM purchase_bill_void_requests WHERE id=?').get(Number(requestId))
  if(!r)throw fail('NOT_FOUND',404)
  if(r.status===decision)return {...r,idempotent:true}
  if(r.status!=='pending')throw fail('VOID_STATE_CONFLICT')
  const note=String(payload.note||'').trim()
  if(note.length>2000||(decision==='rejected'&&!note))throw fail('VOID_REASON_REQUIRED',400)
  const b=db.prepare('SELECT * FROM purchase_bills WHERE id=?').get(r.purchase_bill_id)
  if(b.status!=='issued')throw fail('VOID_STATE_CONFLICT')
  const snapshot=db.prepare('SELECT * FROM dispatch_stops WHERE id=?').get(b.dispatch_stop_id)
  let reversal=null
  if(decision==='approved'){
   reversal=reverseVoidedPurchase(b,actor,db)
   db.prepare("UPDATE purchase_bills SET status='voided',updated_at=? WHERE id=?").run(new Date(actor.now||Date.now()).toISOString(),b.id)
   db.prepare("UPDATE dispatch_stops SET payment_status='voided' WHERE id=? AND invoice_number=?").run(b.dispatch_stop_id,b.bill_number)
  }
  db.prepare('UPDATE purchase_bill_void_requests SET status=?,reviewed_by=?,reviewed_name=?,reviewed_at=?,review_note=?,reversal_transaction_id=?,stop_snapshot_json=? WHERE id=?').run(decision,actor.employeeId,actor.employeeName,new Date(actor.now||Date.now()).toISOString(),note,reversal,JSON.stringify(snapshot),r.id)
  voidEvent(db,r.id,decision,actor,{billNumber:b.bill_number,note,reversalTransactionId:reversal})
  return db.prepare('SELECT * FROM purchase_bill_void_requests WHERE id=?').get(r.id)
 })
}
