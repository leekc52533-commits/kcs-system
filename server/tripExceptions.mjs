import {db as defaultDb} from './database.mjs'
import {withImmediateTransaction} from './branchServiceDateGuard.mjs'
import {canManageDispatch} from '../shared/dispatchAccess.js'
import {kuchingDate} from '../shared/kuchingTime.js'
const fail=(code,statusCode=409)=>Object.assign(new Error(code),{code,statusCode})
function access(ctx){if(!canManageDispatch(ctx))throw fail('PERMISSION_DENIED',403)}
function reasonOf(payload){const reason=String(payload.reason||'').trim();if(!reason||reason.length>500)throw fail('REQUIRED_FIELD',400);return reason}
const tripQuery=`SELECT t.*,dd.dispatch_date,d.vehicle_id,v.registration_number, e.name driver_name
 FROM dispatch_trips t JOIN dispatch_days dd ON dd.id=t.dispatch_day_id JOIN dispatches d ON d.id=t.dispatch_id
 LEFT JOIN vehicles v ON v.id=d.vehicle_id LEFT JOIN employees e ON e.id=d.driver_id`
function stopRows(db,tripId){return db.prepare(`SELECT s.*, b.branch_name,b.status branch_status,
 EXISTS(SELECT 1 FROM purchase_bills p WHERE p.dispatch_stop_id=s.id) has_bill,
 EXISTS(SELECT 1 FROM purchase_bills p WHERE p.dispatch_stop_id=s.id AND p.status='issued') issued_bill,
 EXISTS(SELECT 1 FROM purchase_bills p WHERE p.dispatch_stop_id=s.id AND p.status='issued' AND p.payment_method='Cash' AND NOT EXISTS(SELECT 1 FROM purchase_payment_proofs pp WHERE pp.purchase_bill_id=p.id)) missing_proof,
 (EXISTS(SELECT 1 FROM driver_defer_requests r WHERE r.dispatch_stop_id=s.id AND r.status='pending') OR
 EXISTS(SELECT 1 FROM driver_date_requests r WHERE r.dispatch_stop_id=s.id AND r.status='pending') OR
 EXISTS(SELECT 1 FROM driver_arrangement_requests r WHERE r.dispatch_stop_id=s.id AND r.status='pending')) pending_approval,
 (EXISTS(SELECT 1 FROM stop_step_records r WHERE r.dispatch_stop_id=s.id) OR EXISTS(SELECT 1 FROM driver_no_goods_proofs r WHERE r.dispatch_stop_id=s.id) OR EXISTS(SELECT 1 FROM no_goods_notices r WHERE r.dispatch_stop_id=s.id)) has_evidence
 FROM dispatch_stops s LEFT JOIN branches b ON b.id=s.branch_id WHERE s.dispatch_trip_id=? AND s.status NOT IN ('completed','cancelled') ORDER BY s.stop_sequence,s.id`).all(tripId).map(s=>{
 const closed=String(s.branch_status).toLowerCase()==='closed'
 const canCancel=closed&&['locked','available'].includes(s.status)&&!s.arrived_at&&!s.arrival_captured_at&&s.arrival_latitude==null&&s.arrival_longitude==null&&!s.arrived_by_employee_id&&!s.payment_status&&!s.completed_at&&!s.completion_outcome&&!s.override_note&&!s.invoice_number&&s.collected_weight_kg==null&&!s.has_bill&&!s.pending_approval&&!s.has_evidence
 const issue=canCancel?'closed_unused':s.pending_approval?'approval':closed?'closed_protected':s.branch_status!=='active'?'inactive':s.missing_proof?'proof':!s.arrived_at?'arrival':!s.issued_bill?'bill':'finish_stop'
 return{...s,canCancel,issue}
 })}
function dateOf(date){if(!/^\d{4}-\d{2}-\d{2}$/.test(date||'')||!Number.isFinite(Date.parse(date+'T00:00:00Z'))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)throw fail('REQUIRED_FIELD',400);return date}
function writableTrip(db,id,ctx){const t=db.prepare(tripQuery+' WHERE t.id=?').get(Number(id));if(!t)throw fail('NOT_FOUND',404);if(t.execution_status!=='in_progress'||t.dispatch_date>(ctx.today||kuchingDate()))throw fail('INVALID_STATUS');return t}
function audit(db,t,ctx,type,id,before,after){db.prepare(`INSERT INTO dispatch_change_logs(dispatch_day_id,actor,change_type,entity_type,entity_id,before_json,after_json,requires_reapproval) VALUES(?,?,?,?,?,?,?,0)`).run(t.dispatch_day_id,String(ctx.employeeId),type,type==='trip_exception_cancel'?'dispatch_stop':'dispatch_trip',String(id),JSON.stringify(before),JSON.stringify(after))}
export function listTripExceptions(date,ctx={},db=defaultDb){
 access(ctx);dateOf(date)
 const items=db.prepare(tripQuery+" WHERE dd.dispatch_date=? AND t.execution_status='in_progress' ORDER BY v.registration_number,t.trip_number,t.id").all(date).map(t=>{const stops=stopRows(db,t.id);return{...t,stops,canComplete:!stops.length&&date<=(ctx.today||kuchingDate())}})
 const history=db.prepare("SELECT l.actor,l.change_type,l.entity_id,l.after_json,l.created_at FROM dispatch_change_logs l JOIN dispatch_days d ON d.id=l.dispatch_day_id WHERE d.dispatch_date=? AND l.change_type IN ('trip_exception_cancel','trip_exception_complete') ORDER BY l.id DESC LIMIT 200").all(date).map(r=>({...r,details:JSON.parse(r.after_json)}))
 return{date,items,history}
}
export function cancelExceptionStop(id,payload,ctx={},db=defaultDb){access(ctx);const reason=reasonOf(payload);return withImmediateTransaction(db,()=>{
 const row=db.prepare('SELECT dispatch_trip_id FROM dispatch_stops WHERE id=?').get(Number(id));if(!row)throw fail('NOT_FOUND',404)
 const t=writableTrip(db,row.dispatch_trip_id,ctx),s=stopRows(db,t.id).find(s=>s.id===Number(id));if(!s?.canCancel)throw fail('CONFLICT')
 db.prepare("UPDATE dispatch_stops SET status='cancelled',override_note='closed_branch_exception',override_reason=?,override_at=CURRENT_TIMESTAMP WHERE id=?").run(reason,s.id)
 audit(db,t,ctx,'trip_exception_cancel',s.id,{status:s.status,branchId:s.branch_id},{status:'cancelled',reason,tripId:t.id,actorName:ctx.employeeName||''})
 return{status:'cancelled',tripId:t.id}
 })}
export function completeExceptionTrip(id,payload,ctx={},db=defaultDb){access(ctx);const reason=reasonOf(payload);return withImmediateTransaction(db,()=>{
 const t=writableTrip(db,id,ctx);if(stopRows(db,t.id).length)throw fail('CONFLICT')
 db.prepare("UPDATE dispatch_trips SET execution_status='completed',completed_at=CURRENT_TIMESTAMP,completed_by_employee_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(ctx.employeeId,t.id)
 if(!db.prepare("SELECT 1 FROM dispatch_trips WHERE dispatch_id=? AND execution_status<>'completed'").get(t.dispatch_id))db.prepare("UPDATE dispatches SET status='completed',updated_at=CURRENT_TIMESTAMP WHERE id=?").run(t.dispatch_id)
 if(!db.prepare("SELECT 1 FROM dispatch_trips WHERE dispatch_day_id=? AND execution_status<>'completed' AND (execution_status='in_progress' OR EXISTS(SELECT 1 FROM dispatch_stops s WHERE s.dispatch_trip_id=dispatch_trips.id AND s.status<>'cancelled'))").get(t.dispatch_day_id))db.prepare("UPDATE dispatch_days SET status='completed',updated_at=CURRENT_TIMESTAMP WHERE id=?").run(t.dispatch_day_id)
 audit(db,t,ctx,'trip_exception_complete',t.id,{status:t.execution_status},{status:'completed',tripId:t.id,reason,actorName:ctx.employeeName||''})
 return{status:'completed',tripId:t.id}
 })}
