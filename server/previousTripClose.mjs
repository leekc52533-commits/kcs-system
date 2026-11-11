import {kuchingDate} from '../shared/kuchingTime.js'
import {activeRouteDriver} from './routeDriverAuthorization.mjs'
import {withImmediateTransaction} from './branchServiceDateGuard.mjs'

const fail=(code,statusCode=409)=>{throw Object.assign(Error(code),{code,statusCode})}
const candidates=`SELECT t.id tripId,t.trip_number tripNumber,dd.dispatch_date date,d.driver_id driverId,
 e.name driverName,v.registration_number plate,r.id requestId,r.submitted_stops_json snapshot
 FROM dispatch_trips t JOIN dispatch_days dd ON dd.id=t.dispatch_day_id JOIN dispatches d ON d.id=t.dispatch_id
 JOIN employees e ON e.id=d.driver_id LEFT JOIN vehicles v ON v.id=d.vehicle_id
 LEFT JOIN trip_work_close_requests r ON r.trip_id=t.id AND r.employee_id=d.driver_id AND r.status='pending'
 WHERE dd.dispatch_date<? AND (t.execution_status='in_progress' OR
 (t.execution_status='not_started' AND EXISTS(SELECT 1 FROM dispatch_stops s WHERE s.dispatch_trip_id=t.id AND s.status NOT IN ('completed','cancelled')
 AND (dd.status IN ('approved','published') OR EXISTS(SELECT 1 FROM daily_route_approvals a WHERE a.dispatch_day_id=dd.id AND a.route_number=s.route_number)))))`
export function outstandingClosures(db,date,employeeId=null){
 const rows=db.prepare(candidates+(employeeId==null?'':' AND d.driver_id=?')+' ORDER BY dd.dispatch_date,t.id').all(date,...(employeeId==null?[]:[employeeId]))
 const result=[]
 for(const {snapshot,requestId,...trip} of rows){
  const stops=db.prepare(`SELECT s.id,b.jodoo_branch_id branchCode,b.branch_name name,s.override_note='driver_deferred' deferred
   FROM dispatch_stops s JOIN branches b ON b.id=s.branch_id WHERE s.dispatch_trip_id=? AND s.status NOT IN ('completed','cancelled') ORDER BY s.stop_sequence,s.id`).all(trip.tripId)
  const reported=new Map(JSON.parse(snapshot||'[]').filter(s=>s.driverReason).map(s=>[s.id,s.driverReason]))
  if(requestId&&reported.size&&stops.every(s=>reported.has(s.id)))continue
  result.push({...trip,stops})
 }
 return result
}
export function driverClosures(ctx,db){
 return activeRouteDriver(db,ctx.employeeId,ctx.role)?outstandingClosures(db,ctx.today||kuchingDate(),ctx.employeeId):[]
}
// Caller has verified ownership or supervisor access, service date and trip state.
export function finishPriorTrip(db,id,ctx){
 const t=db.prepare('SELECT * FROM dispatch_trips WHERE id=?').get(id)
 if(db.prepare("SELECT 1 FROM dispatch_stops WHERE dispatch_trip_id=? AND status NOT IN ('completed','cancelled')").get(id))fail('WORK_CLOSE_STALE')
 db.prepare("UPDATE dispatch_trips SET execution_status='completed',completed_at=CURRENT_TIMESTAMP,completed_by_employee_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(ctx.employeeId,id)
 if(!db.prepare("SELECT 1 FROM dispatch_trips WHERE dispatch_id=? AND execution_status<>'completed'").get(t.dispatch_id))db.prepare("UPDATE dispatches SET status='completed',updated_at=CURRENT_TIMESTAMP WHERE id=?").run(t.dispatch_id)
 if(!db.prepare("SELECT 1 FROM dispatch_trips t WHERE t.dispatch_day_id=? AND t.execution_status<>'completed' AND (t.execution_status='in_progress' OR EXISTS(SELECT 1 FROM dispatch_stops s WHERE s.dispatch_trip_id=t.id AND s.status<>'cancelled'))").get(t.dispatch_day_id))db.prepare("UPDATE dispatch_days SET status='completed',updated_at=CURRENT_TIMESTAMP WHERE id=?").run(t.dispatch_day_id)
}
export function submitPriorTrip(id,payload,ctx,db){
 return withImmediateTransaction(db,()=>{
  const trip=driverClosures(ctx,db).find(t=>t.tripId===id)
  if(!trip)fail('WORK_CLOSE_STALE')
  const reasons=payload?.reasons
  if(!Array.isArray(reasons)||reasons.length!==trip.stops.length||!trip.stops.every(s=>reasons.some(r=>r?.stopId===s.id&&typeof r.reason==='string'&&r.reason.trim()&&r.reason.trim().length<=500)))fail('WORK_CLOSE_REASON',400)
  const rows=trip.stops.map(s=>({...s,driverReason:reasons.find(r=>r.stopId===s.id).reason.trim()}))
  const pending=db.prepare("SELECT id FROM trip_work_close_requests WHERE trip_id=? AND employee_id=? AND status='pending'").get(id,ctx.employeeId)
  if(!rows.length){
   finishPriorTrip(db,id,ctx)
   if(pending)db.prepare("UPDATE trip_work_close_requests SET status='approved',review_reason='No outstanding stops',reviewed_at=CURRENT_TIMESTAMP WHERE id=?").run(pending.id)
  }else if(pending)db.prepare('UPDATE trip_work_close_requests SET submitted_stops_json=? WHERE id=?').run(JSON.stringify(rows),pending.id)
  else db.prepare("INSERT INTO trip_work_close_requests(trip_id,employee_id,service_date,reason,submitted_stops_json) VALUES(?,?,?,'',?)").run(id,ctx.employeeId,trip.date,JSON.stringify(rows))
  db.prepare(`INSERT INTO dispatch_change_logs(dispatch_day_id,actor,change_type,entity_type,entity_id,after_json,requires_reapproval)
   SELECT dispatch_day_id,?,?,'dispatch_trip',?,?,0 FROM dispatch_trips WHERE id=?`).run(String(ctx.employeeId),rows.length?'prior_trip_reasons_submitted':'prior_trip_closed',String(id),JSON.stringify(rows),id)
  return {status:rows.length?'pending':'completed'}
 })
}
