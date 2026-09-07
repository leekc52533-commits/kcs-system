import {db as defaultDb} from './database.mjs'
import {withImmediateTransaction} from './branchServiceDateGuard.mjs'

const fail=(message,code='INVALID_STATUS',statusCode=409)=>{const error=new Error(message);error.code=code;error.statusCode=statusCode;return error}
const nowKuching=(input=new Date())=>{const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kuching',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(input)).map(part=>[part.type,part.value]));return`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}+08:00`}
const supervisorRoles=new Set(['owner','owner_admin','operations_admin','supervisor'])

export function listDeferRequestsForDay(dayId,database=defaultDb){
  return database.prepare(`SELECT r.id,r.dispatch_stop_id stopId,r.dispatch_trip_id tripId,r.driver_employee_id driverEmployeeId,r.reason,r.expected_return_time expectedReturnTime,r.expected_return_at expectedReturnAt,r.status,r.requested_at requestedAt,r.reviewed_by_name_snapshot reviewedBy,r.review_reason reviewReason,r.reviewed_at reviewedAt,
    ds.stop_sequence stopSequence,b.jodoo_branch_id branchId,b.branch_name branchName,c.name customerName,e.name driverName,v.vehicle_code vehicleName,v.registration_number registrationNumber
    FROM driver_defer_requests r JOIN dispatch_stops ds ON ds.id=r.dispatch_stop_id JOIN branches b ON b.id=ds.branch_id LEFT JOIN customers c ON c.id=b.customer_id JOIN employees e ON e.id=r.driver_employee_id JOIN dispatch_trips dt ON dt.id=r.dispatch_trip_id JOIN dispatches d ON d.id=dt.dispatch_id LEFT JOIN vehicles v ON v.id=d.vehicle_id
    WHERE r.dispatch_day_id=? ORDER BY CASE r.status WHEN 'pending' THEN 0 ELSE 1 END,r.requested_at DESC,r.id DESC`).all(Number(dayId))
}

export function listPendingDeferRequests(database=defaultDb){
  return database.prepare(`SELECT r.id,r.dispatch_stop_id stopId,r.dispatch_trip_id tripId,r.driver_employee_id driverEmployeeId,r.reason,r.expected_return_time expectedReturnTime,r.expected_return_at expectedReturnAt,r.status,r.requested_at requestedAt,
    dd.dispatch_date dispatchDate,ds.stop_sequence stopSequence,b.jodoo_branch_id branchId,b.branch_name branchName,c.name customerName,e.name driverName,v.vehicle_code vehicleName,v.registration_number registrationNumber
    FROM driver_defer_requests r JOIN dispatch_days dd ON dd.id=r.dispatch_day_id JOIN dispatch_stops ds ON ds.id=r.dispatch_stop_id JOIN branches b ON b.id=ds.branch_id LEFT JOIN customers c ON c.id=b.customer_id JOIN employees e ON e.id=r.driver_employee_id JOIN dispatch_trips dt ON dt.id=r.dispatch_trip_id JOIN dispatches d ON d.id=dt.dispatch_id LEFT JOIN vehicles v ON v.id=d.vehicle_id
    WHERE r.status='pending' ORDER BY r.requested_at DESC,r.id DESC`).all()
}

export function decideDeferRequest(id,decision,context={},database=defaultDb){
  const normalized=String(decision||'').toLowerCase()
  if(!['approved','rejected'].includes(normalized))throw fail('Approval decision must be approved or rejected.','INVALID_DECISION',400)
  if(!supervisorRoles.has(String(context.role||'').toLowerCase()))throw fail('Only a supervisor can decide a return-later request.','PERMISSION_DENIED',403)
  const reviewerName=String(context.employeeName||'Supervisor').trim(),reviewReason=String(context.reason||'').trim()
  if(!reviewReason)throw fail('Supervisor review reason is required.','REVIEW_REASON_REQUIRED',400)
  return withImmediateTransaction(database,()=>{
    const request=database.prepare(`SELECT r.*,ds.status stop_status,ds.override_note,ds.arrived_at,ds.stop_sequence,dt.execution_status,dd.status day_status
      FROM driver_defer_requests r JOIN dispatch_stops ds ON ds.id=r.dispatch_stop_id JOIN dispatch_trips dt ON dt.id=r.dispatch_trip_id JOIN dispatch_days dd ON dd.id=r.dispatch_day_id WHERE r.id=?`).get(Number(id))
    if(!request)throw fail('Return-later request not found.','NOT_FOUND',404)
    if(request.status===normalized)return{id:Number(request.id),status:normalized,idempotent:true}
    if(request.status!=='pending')throw fail(`This request is already ${request.status}.`,'REQUEST_ALREADY_DECIDED',409)
    if(request.execution_status!=='in_progress'||request.day_status!=='in_progress'||request.stop_status!=='active'||!request.arrived_at||request.override_note==='driver_deferred')throw fail('The customer is no longer waiting for this approval.','STALE_DEFER_REQUEST',409)
    const current=database.prepare("SELECT id FROM dispatch_stops WHERE dispatch_trip_id=? AND status NOT IN ('cancelled','completed') AND COALESCE(override_note,'')<>'driver_deferred' ORDER BY stop_sequence,id LIMIT 1").get(request.dispatch_trip_id)
    if(Number(current?.id)!==Number(request.dispatch_stop_id))throw fail('The route has changed; this request can no longer be approved.','STALE_DEFER_REQUEST',409)
    if(normalized==='approved'&&database.prepare("SELECT 1 FROM purchase_bills WHERE dispatch_stop_id=? AND status='issued'").get(request.dispatch_stop_id))throw fail('This customer already has an electronic Bill and cannot be deferred.','BILL_ALREADY_CREATED',409)
    const reviewedAt=nowKuching(context.now)
    database.prepare('UPDATE driver_defer_requests SET status=?,reviewed_by_employee_id=?,reviewed_by_name_snapshot=?,review_reason=?,reviewed_at=? WHERE id=? AND status=\'pending\'').run(normalized,context.employeeId||null,reviewerName,reviewReason,reviewedAt,request.id)
    if(normalized==='approved')database.prepare("UPDATE dispatch_stops SET status='available',override_reason=?,override_note='driver_deferred',override_at=?,arrived_at=NULL,arrival_latitude=NULL,arrival_longitude=NULL,arrival_accuracy_m=NULL,arrival_distance_m=NULL,arrival_captured_at=NULL,arrived_by_employee_id=NULL WHERE id=?").run(request.reason,reviewedAt,request.dispatch_stop_id)
    database.prepare(`INSERT INTO dispatch_change_logs(dispatch_day_id,actor,change_type,entity_type,entity_id,before_json,after_json,requires_reapproval) VALUES(?,?,?,?,?,?,?,0)`).run(request.dispatch_day_id,reviewerName,normalized==='approved'?'driver_stop_defer_approved':'driver_stop_defer_rejected','driver_defer_request',String(request.id),JSON.stringify({status:'pending',stopId:Number(request.dispatch_stop_id)}),JSON.stringify({status:normalized,stopId:Number(request.dispatch_stop_id),expectedReturnTime:request.expected_return_time,reviewReason,reviewedAt}))
    const next=normalized==='approved'?database.prepare("SELECT id FROM dispatch_stops WHERE dispatch_trip_id=? AND status NOT IN ('cancelled','completed') AND COALESCE(override_note,'')<>'driver_deferred' ORDER BY stop_sequence,id LIMIT 1").get(request.dispatch_trip_id):null
    return{id:Number(request.id),stopId:Number(request.dispatch_stop_id),status:normalized,expectedReturnTime:request.expected_return_time,nextStopId:next?.id||null,idempotent:false}
  })
}
