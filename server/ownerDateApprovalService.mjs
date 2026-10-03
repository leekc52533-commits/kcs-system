import {db as defaultDb} from './database.mjs'
import {canDirectApproveDate} from './ownerDateApprovalAccess.mjs'
import {withImmediateTransaction} from './branchServiceDateGuard.mjs'
import {decideDriverDate} from './driverRouteAdjustmentService.mjs'
const fail=(code,statusCode=409)=>{throw Object.assign(new Error(code),{code,statusCode})}
export function ownerApproveDate(id,actor,db=defaultDb){
 if(!canDirectApproveDate(db,actor))fail('OWNER_DATE_APPROVAL_ONLY',403)
 return withImmediateTransaction(db,()=>{
  const r=db.prepare(`SELECT r.*,s.route_number FROM driver_date_requests r JOIN dispatch_stops s ON s.id=r.dispatch_stop_id WHERE r.id=?`).get(Number(id))
  if(!r)fail('SYSTEM_REVIEW_NOT_FOUND',404)
  if(db.prepare("SELECT 1 FROM driver_date_system_reviews WHERE request_id=? AND status='pending'").get(r.id))fail('OWNER_DATE_SYSTEM_PENDING')
  if(r.status==='approved')return{id:r.id,status:'approved',idempotent:true}
  const result=decideDriverDate(r.id,'approved',{ownerDirectApproval:true,targetDate:r.target_date,routeNumber:r.route_number,scope:'once',reason:'Designated owner direct approval; review fields waived'},actor,db)
  db.prepare("INSERT INTO audit_logs(action,entity_type,entity_id,after_json) VALUES('owner_date_direct_approved','driver_date_request',?,?)").run(String(r.id),JSON.stringify({accountId:actor.id,employeeId:actor.employeeId,targetDate:r.target_date,routeNumber:r.route_number,waived:['review_reason','evidence_check','repeat_confirmation','customer_contact','contact_proof'],targetStopId:result.targetStopId}))
  return result
 })
}
