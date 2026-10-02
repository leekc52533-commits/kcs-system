import {db as defaultDb} from './database.mjs'
import {kuchingDate} from '../shared/kuchingTime.js'
import {activeRouteDriver} from './routeDriverAuthorization.mjs'
import {withImmediateTransaction} from './branchServiceDateGuard.mjs'
const fail=(code,statusCode=409)=>{throw Object.assign(Error(code),{code,statusCode})}
export const gpsTrialOpen=(now=new Date())=>kuchingDate(now)==='2026-10-05'
const manager=ctx=>{if(!['supervisor','operations_admin','owner_admin'].includes(ctx.role))fail('GPS_RELEASE_ACCESS',403)}
const lookup=(db,id)=>db.prepare(`SELECT s.*,t.execution_status,t.completed_at trip_completed_at,t.dispatch_day_id day_id,
 d.driver_id,d.vehicle_id,dd.dispatch_date,dd.status day_status,b.status branch_status
 FROM dispatch_stops s JOIN dispatch_trips t ON t.id=s.dispatch_trip_id JOIN dispatches d ON d.id=t.dispatch_id
 JOIN dispatch_days dd ON dd.id=t.dispatch_day_id JOIN branches b ON b.id=s.branch_id WHERE s.id=?`).get(Number(id))
function eligible(db,id,employeeId,role,now){
 if(!gpsTrialOpen(now))fail('GPS_RELEASE_EXPIRED')
 if(!activeRouteDriver(db,employeeId,role))fail('GPS_RELEASE_ACCESS',403)
 const s=lookup(db,id)
 if(!s||s.driver_id!==Number(employeeId)||s.dispatch_date!==kuchingDate(now))fail('GPS_RELEASE_ACCESS',403)
 if(s.execution_status!=='in_progress'||s.trip_completed_at||s.day_status!=='in_progress'||s.branch_status!=='active'||s.arrived_at||s.completed_at||['active','completed','cancelled'].includes(s.status))fail('GPS_RELEASE_STALE')
 const approvals=db.prepare('SELECT route_number FROM daily_route_approvals WHERE dispatch_day_id=?').all(s.day_id)
 if(approvals.length&&!approvals.some(r=>Number(r.route_number)===Number(s.route_number)))fail('GPS_RELEASE_STALE')
 const current=db.prepare("SELECT id FROM dispatch_stops WHERE dispatch_trip_id=? AND status NOT IN ('completed','cancelled') AND COALESCE(override_note,'')<>'driver_deferred' ORDER BY stop_sequence,id LIMIT 1").get(s.dispatch_trip_id)
 if(current?.id!==s.id)fail('GPS_RELEASE_ORDER')
 if(db.prepare('SELECT 1 FROM purchase_bills WHERE dispatch_stop_id=?').get(s.id)||db.prepare("SELECT 1 FROM driver_defer_requests WHERE dispatch_trip_id=? AND status='pending'").get(s.dispatch_trip_id))fail('GPS_RELEASE_STALE')
 return s
}
const audit=(db,s,actor,type,details)=>db.prepare("INSERT INTO dispatch_change_logs(dispatch_day_id,actor,change_type,entity_type,entity_id,after_json,requires_reapproval) VALUES(?,?,?,'dispatch_stop',?,?,0)").run(s.day_id,String(actor),type,String(s.id),JSON.stringify(details))
export function requestGpsRelease(id,payload,ctx,db=defaultDb){return withImmediateTransaction(db,()=>{
 const reason=String(payload.reason||'').trim();if(!reason||reason.length>1000)fail('GPS_RELEASE_REASON',400)
 const s=eligible(db,id,ctx.employeeId,ctx.role,ctx.now||new Date())
 const previous=db.prepare("SELECT * FROM gps_arrival_requests WHERE stop_id=? AND status='pending'").get(s.id)
 if(previous){if(previous.employee_id!==Number(ctx.employeeId)||previous.trip_id!==s.dispatch_trip_id||previous.vehicle_id!==s.vehicle_id)fail('GPS_RELEASE_STALE');return{id:previous.id,status:'pending',idempotent:true}}
 const requestId=Number(db.prepare('INSERT INTO gps_arrival_requests(stop_id,service_date,employee_id,employee_role,trip_id,vehicle_id,reason) VALUES(?,?,?,?,?,?,?)').run(s.id,s.dispatch_date,ctx.employeeId,ctx.role,s.dispatch_trip_id,s.vehicle_id,reason).lastInsertRowid)
 audit(db,s,ctx.employeeId,'gps_release_requested',{requestId,reason})
 return{id:requestId,status:'pending'}
})}
export function listGpsReleases(ctx,db=defaultDb){manager(ctx);return db.prepare(`SELECT r.*,b.branch_name branchName,e.name employeeName,v.registration_number plate
 FROM gps_arrival_requests r JOIN dispatch_stops s ON s.id=r.stop_id JOIN branches b ON b.id=s.branch_id
 JOIN employees e ON e.id=r.employee_id JOIN vehicles v ON v.id=r.vehicle_id WHERE r.status='pending' ORDER BY r.id`).all()}
export function reviewGpsRelease(id,payload,ctx,db=defaultDb){manager(ctx);return withImmediateTransaction(db,()=>{
 const reason=String(payload.reason||'').trim(),decision=payload.decision
 if(!reason||reason.length>1000||!['approved','rejected'].includes(decision))fail('GPS_RELEASE_REASON',400)
 const r=db.prepare('SELECT * FROM gps_arrival_requests WHERE id=?').get(Number(id));if(!r)fail('GPS_RELEASE_STALE')
 if(r.status===decision)return{ok:true,idempotent:true};if(r.status!=='pending')fail('GPS_RELEASE_STALE')
 const now=ctx.now||new Date(),actor=ctx.employeeName||String(ctx.employeeId)
 let s=lookup(db,r.stop_id)
 if(decision==='approved'){
  s=eligible(db,r.stop_id,r.employee_id,r.employee_role,now)
  if(s.dispatch_trip_id!==r.trip_id||s.vehicle_id!==r.vehicle_id||s.dispatch_date!==r.service_date)fail('GPS_RELEASE_STALE')
  // Explicit supervisor release, not fabricated verified GPS. No coordinates are invented.
  db.prepare("UPDATE dispatch_stops SET status='active',arrived_at=?,arrived_by_employee_id=? WHERE id=?").run(new Date(now).toISOString(),r.employee_id,s.id)
 }
 db.prepare('UPDATE gps_arrival_requests SET status=?,reviewed_at=?,reviewed_by=?,review_reason=? WHERE id=?').run(decision,new Date(now).toISOString(),actor,reason,r.id)
 audit(db,s,actor,'gps_release_'+decision,{requestId:r.id,reason,employeeId:r.employee_id,gpsVerified:false})
 return{ok:true}
})}
export function withGpsReleaseState(view,db=defaultDb){return{...view,gpsReleaseAvailable:gpsTrialOpen(),trips:view.trips?.map(trip=>({...trip,stops:trip.stops.map(stop=>({...stop,gpsRelease:db.prepare('SELECT status,reason,review_reason reviewReason FROM gps_arrival_requests WHERE stop_id=? ORDER BY id DESC LIMIT 1').get(stop.id)||null}))}))}}
