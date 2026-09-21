import {createHash} from 'node:crypto'
import {db as defaultDb} from './database.mjs'
import {withImmediateTransaction} from './branchServiceDateGuard.mjs'
import {canManageDispatch} from '../shared/dispatchAccess.js'
import {kuchingDate} from '../shared/kuchingTime.js'
import {changePlannedCustomer} from './driverRouteAdjustmentService.mjs'
import {collectExistingCustomer,reviewCustomerTransfer} from './existingCustomerPickupService.mjs'
import {completeExceptionTrip} from './tripExceptions.mjs'
const fail=(code,statusCode=409)=>{throw Object.assign(Error(code),{code,statusCode})}
const today=ctx=>ctx.today||kuchingDate()
const reasonOf=p=>{const s=String(p.reason||'').trim();if(!s||s.length>500)fail('WORK_CLOSE_REASON',400);return s}
const manager=ctx=>{if(!canManageDispatch(ctx))fail('PERMISSION_DENIED',403)}
const trip=(db,id)=>db.prepare(`SELECT t.*,d.driver_id,dd.dispatch_date,e.name driverName,v.registration_number plate
 FROM dispatch_trips t JOIN dispatches d ON d.id=t.dispatch_id JOIN dispatch_days dd ON dd.id=t.dispatch_day_id
 LEFT JOIN employees e ON e.id=d.driver_id LEFT JOIN vehicles v ON v.id=d.vehicle_id WHERE t.id=?`).get(Number(id))
function owner(db,t,ctx){
 if(!t||ctx.role!=='driver'||t.driver_id!==Number(ctx.employeeId)||t.dispatch_date!==today(ctx)||!db.prepare("SELECT 1 FROM employees WHERE id=? AND is_active=1 AND employment_status='active'").get(ctx.employeeId))fail('PERMISSION_DENIED',403)
}
function stops(db,id){return db.prepare(`SELECT s.*,b.branch_name name,b.jodoo_branch_id branchCode,b.status branchStatus,b.is_active branchActive,b.lifecycle_status lifecycle,
 EXISTS(SELECT 1 FROM purchase_bills p WHERE p.dispatch_stop_id=s.id) hasBill,
 EXISTS(SELECT 1 FROM purchase_bills p WHERE p.dispatch_stop_id=s.id AND p.status='issued' AND p.payment_method='Cash' AND NOT EXISTS(SELECT 1 FROM purchase_payment_proofs pp WHERE pp.purchase_bill_id=p.id)) missingProof
 FROM dispatch_stops s JOIN branches b ON b.id=s.branch_id WHERE s.dispatch_trip_id=? AND s.status NOT IN ('completed','cancelled') ORDER BY s.id`).all(id).map(s=>{
 const pending=['driver_defer_requests','driver_date_requests','driver_arrangement_requests','customer_transfer_requests'].some(table=>db.prepare(`SELECT 1 FROM ${table} WHERE dispatch_stop_id=? AND status='pending'`).get(s.id))
 const evidence=['stop_documents','stop_step_records','driver_no_goods_proofs','no_goods_notices'].some(table=>db.prepare(`SELECT 1 FROM ${table} WHERE dispatch_stop_id=?`).get(s.id))
 const worked=!['locked','available'].includes(s.status)||s.arrived_at||s.arrival_captured_at||s.arrival_latitude!=null||s.arrival_longitude!=null||s.arrived_by_employee_id||s.completed_at||s.completion_outcome||s.payment_status||s.invoice_number||s.collected_weight_kg!=null||s.override_note==='driver_deferred'||evidence
 const issue=s.missingProof?'proof':s.hasBill?'bill':worked?'work':pending?'approval':s.branchStatus!=='active'||!s.branchActive||s.lifecycle!=='ACTIVE'?'inactive':null
 return{id:s.id,branchId:s.branch_id,branchCode:s.branchCode,name:s.name,routeNumber:s.route_number,issue,canArrange:!issue,status:s.status}
})}
const version=rows=>createHash('sha256').update(JSON.stringify(rows)).digest('hex')
function view(db,t){const rows=stops(db,t.id);return{tripId:t.id,date:t.dispatch_date,driverName:t.driverName,plate:t.plate,tripStatus:t.execution_status,stops:rows,version:version(rows)}}
function audit(db,t,ctx,type,data){db.prepare("INSERT INTO dispatch_change_logs(dispatch_day_id,actor,change_type,entity_type,entity_id,after_json,requires_reapproval) VALUES(?,?,?,'dispatch_trip',?,?,0)").run(t.dispatch_day_id,String(ctx.employeeName||ctx.employeeId),type,String(t.id),JSON.stringify(data))}
export function getWorkClose(id,ctx={},db=defaultDb){const t=trip(db,id);owner(db,t,ctx);return{...view(db,t),request:db.prepare('SELECT id,status,reason,review_reason reviewReason FROM trip_work_close_requests WHERE trip_id=? ORDER BY id DESC LIMIT 1').get(t.id)||null}}
export function requestWorkClose(id,payload={},ctx={},db=defaultDb){return withImmediateTransaction(db,()=>{
 const t=trip(db,id);owner(db,t,ctx);const reason=reasonOf(payload)
 if(t.execution_status!=='in_progress')fail('WORK_CLOSE_STATE')
 const old=db.prepare("SELECT id,status FROM trip_work_close_requests WHERE trip_id=? AND status='pending'").get(t.id);if(old)return old
 const data=view(db,t);if(payload.version!==data.version)fail('WORK_CLOSE_STALE')
 const result=db.prepare('INSERT INTO trip_work_close_requests(trip_id,employee_id,service_date,reason,submitted_stops_json) VALUES(?,?,?,?,?)').run(t.id,ctx.employeeId,t.dispatch_date,reason,JSON.stringify(data.stops))
 const requestId=Number(result.lastInsertRowid);audit(db,t,ctx,'work_close_requested',{requestId,reason,stops:data.stops});return{id:requestId,status:'pending'}
})}
export function listWorkClose(ctx={},db=defaultDb){manager(ctx);return db.prepare("SELECT * FROM trip_work_close_requests WHERE status='pending' ORDER BY id").all().map(r=>({...view(db,trip(db,r.trip_id)),id:r.id,reason:r.reason,requestedAt:r.requested_at}))}
export function workCloseTargets(ctx={},db=defaultDb){manager(ctx);return db.prepare(`SELECT t.id tripId,v.registration_number plate,e.name driverName FROM dispatch_trips t JOIN dispatch_days dd ON dd.id=t.dispatch_day_id JOIN dispatches d ON d.id=t.dispatch_id JOIN vehicles v ON v.id=d.vehicle_id JOIN employees e ON e.id=d.driver_id WHERE dd.dispatch_date=? AND dd.status='in_progress' AND t.execution_status='in_progress' AND t.completed_at IS NULL AND e.is_active=1 AND e.employment_status='active' AND (LOWER(TRIM(e.job_role))='driver' OR EXISTS(SELECT 1 FROM employee_job_roles er WHERE er.employee_id=e.id AND er.role='Driver' AND er.is_active=1)) AND v.operational_status IN ('active','available') AND v.status IN ('available','assigned') ORDER BY v.registration_number,t.id`).all(today(ctx))}
export function reviewWorkClose(id,payload={},ctx={},db=defaultDb){manager(ctx);const reason=reasonOf(payload),decision=payload.decision
 if(!['approved','rejected'].includes(decision))fail('WORK_CLOSE_STATE',400)
 return withImmediateTransaction(db,()=>{
  const r=db.prepare('SELECT * FROM trip_work_close_requests WHERE id=?').get(Number(id));if(!r)fail('NOT_FOUND',404)
  if(r.status===decision)return{id:r.id,status:decision,idempotent:true};if(r.status!=='pending')fail('WORK_CLOSE_STALE')
  const t=trip(db,r.trip_id);let actions=[]
  if(decision==='approved'){
   if(!t||t.driver_id!==r.employee_id||t.dispatch_date!==r.service_date||!['in_progress','completed'].includes(t.execution_status))fail('WORK_CLOSE_STALE')
   const data=view(db,t);if(payload.version!==data.version)fail('WORK_CLOSE_STALE')
   if(data.stops.some(s=>!s.canArrange))fail('WORK_CLOSE_PROTECTED')
   actions=payload.actions
   if(!Array.isArray(actions)||actions.length!==data.stops.length||new Set(actions.map(a=>Number(a.stopId))).size!==actions.length||actions.some(a=>!data.stops.some(s=>s.id===Number(a.stopId))))fail('WORK_CLOSE_ACTIONS',400)
   for(const a of actions){
    const s=data.stops.find(s=>s.id===Number(a.stopId))
    if(a.kind==='reschedule'){
     // Only this reviewed batch can move a prior-day untouched stop; ordinary date requests retain their guard.
     if(String(a.targetDate||'')<=today(ctx))fail('WORK_CLOSE_DATE',400)
     changePlannedCustomer(s.id,{reason,targetDate:a.targetDate,routeNumber:a.routeNumber,scope:'once'},ctx,db,{workClose:true})
    }else if(a.kind==='transfer'){
     const target=workCloseTargets(ctx,db).find(x=>x.tripId===Number(a.tripId)&&x.tripId!==t.id)
     if(!target||t.dispatch_date!==today(ctx))fail('WORK_CLOSE_TARGET')
     const targetRow=trip(db,target.tripId)
     const result=collectExistingCustomer({branchId:s.branchId,tripId:target.tripId,reason},{employeeId:targetRow.driver_id,role:'driver',today:today(ctx)},db,{actor:ctx.employeeName||ctx.employeeId,supervisor:true})
     if(result.pending)reviewCustomerTransfer(result.requestId,{decision:'approved',reason},ctx,db)
     if(db.prepare('SELECT dispatch_trip_id FROM dispatch_stops WHERE id=?').get(s.id).dispatch_trip_id!==target.tripId)fail('WORK_CLOSE_STALE')
    }else fail('WORK_CLOSE_ACTIONS',400)
   }
   if(stops(db,t.id).length)fail('WORK_CLOSE_PROTECTED')
   if(t.execution_status!=='completed')completeExceptionTrip(t.id,{reason},ctx,db)
  }
  db.prepare('UPDATE trip_work_close_requests SET status=?,reviewed_at=CURRENT_TIMESTAMP,reviewed_by=?,review_reason=?,actions_json=? WHERE id=?').run(decision,String(ctx.employeeName||ctx.employeeId),reason,JSON.stringify(actions),r.id)
  audit(db,t,ctx,'work_close_'+decision,{requestId:r.id,reason,actions});return{id:r.id,status:decision}
 })
}
