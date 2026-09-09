import {db as defaultDb} from './database.mjs'
import {kuchingDate} from '../shared/kuchingTime.js'
import {isRouteTrialDate} from '../shared/routeTrial.js'
import {withImmediateTransaction,assertBranchServiceDateAvailable} from './branchServiceDateGuard.mjs'
import {driverToday,createStop,invalidateDispatchDay} from './dispatchService.mjs'

const fail=(code,statusCode=409)=>{throw Object.assign(new Error(code),{code:code.replace('routeTrial.','ROUTE_TRIAL_').toUpperCase(),statusCode})}
const lookup=(db,id)=>db.prepare(`SELECT s.*,t.execution_status,t.id trip_id,t.dispatch_day_id day_id,dd.dispatch_date,dd.status day_status,d.vehicle_id,d.driver_id,b.jodoo_branch_id branch_code,b.branch_name
 FROM dispatch_stops s JOIN dispatch_trips t ON t.id=s.dispatch_trip_id JOIN dispatch_days dd ON dd.id=t.dispatch_day_id JOIN dispatches d ON d.id=s.dispatch_id JOIN branches b ON b.id=s.branch_id WHERE s.id=?`).get(Number(id))
const hasWork=(db,s)=>s.arrived_at||s.completed_at||['active','completed','cancelled'].includes(s.status)||s.override_note==='driver_deferred'||db.prepare('SELECT 1 FROM purchase_bills WHERE dispatch_stop_id=?').get(s.id)||db.prepare('SELECT 1 FROM stop_documents WHERE dispatch_stop_id=?').get(s.id)||db.prepare('SELECT 1 FROM stop_step_records WHERE dispatch_stop_id=?').get(s.id)
const pendingDefer=(db,s)=>db.prepare("SELECT 1 FROM driver_defer_requests WHERE dispatch_stop_id=? AND status='pending'").get(s.id)
function owned(db,id,context){
 const today=context.today||kuchingDate(),s=lookup(db,id)
 if(!s||s.dispatch_date!==today)fail('routeTrial.ownToday',403)
 const view=driverToday({employeeId:context.employeeId,role:context.role,today},db)
 const trip=view.trips.find(t=>t.id===s.trip_id&&t.stops.some(row=>row.id===s.id))
 if(!trip)fail('routeTrial.ownToday',403)
 return{s,trip,today}
}
const audit=(db,s,actor,type,before,after)=>db.prepare(`INSERT INTO dispatch_change_logs(dispatch_day_id,actor,change_type,entity_type,entity_id,before_json,after_json,requires_reapproval) VALUES(?,?,?,'dispatch_stop',?,?,?,0)`).run(s.day_id,String(actor),type,String(s.id),JSON.stringify(before),JSON.stringify(after))

export function reorderDriverStop(id,payload,context={},db=defaultDb){
 return withImmediateTransaction(db,()=>{
  const{s,trip,today}=owned(db,id,context)
  if(!isRouteTrialDate(today))fail('routeTrial.expired',403)
  if(trip.executionStatus!=='in_progress')fail('routeTrial.startFirst')
  if(!['up','down'].includes(payload.direction))fail('routeTrial.invalidDirection',400)
  const rows=db.prepare("SELECT * FROM dispatch_stops WHERE dispatch_trip_id=? AND status<>'cancelled' ORDER BY stop_sequence,id").all(s.trip_id)
  if(JSON.stringify(payload.expectedOrder)!==JSON.stringify(rows.map(r=>r.id)))fail('routeTrial.stale')
  // An arrived customer or pending return-later approval cannot be skipped by reordering.
  if(rows.some(r=>r.status==='active'||pendingDefer(db,r)))fail('routeTrial.finishCurrent')
  const index=rows.findIndex(r=>r.id===s.id),other=rows[index+(payload.direction==='up'?-1:1)]
  if(!other||hasWork(db,s)||hasWork(db,other))fail('routeTrial.protected')
  const before=rows.map(r=>({id:r.id,sequence:r.stop_sequence}))
  // Use a free sequence slot, then swap only the two untouched stops.
  const temporary=db.prepare('SELECT COALESCE(MIN(stop_sequence),0)-1 n FROM dispatch_stops WHERE dispatch_id=?').get(s.dispatch_id).n
  db.prepare('UPDATE dispatch_stops SET stop_sequence=? WHERE id=?').run(temporary,s.id)
  db.prepare('UPDATE dispatch_stops SET stop_sequence=? WHERE id=?').run(s.stop_sequence,other.id)
  db.prepare('UPDATE dispatch_stops SET stop_sequence=? WHERE id=?').run(other.stop_sequence,s.id)
  audit(db,s,context.employeeId,'driver_trial_order_changed',before,{movedStop:s.id,otherStop:other.id,direction:payload.direction,trialStart:'2026-09-10',trialEnd:'2026-09-23'})
  return{ok:true}
 })
}

export function requestDriverDate(id,payload,context={},db=defaultDb){
 return withImmediateTransaction(db,()=>{
  const{s,today}=owned(db,id,context),target=String(payload.targetDate||''),reason=String(payload.reason||'').trim()
  if(!/^\d{4}-\d{2}-\d{2}$/.test(target)||!Number.isFinite(Date.parse(target+'T00:00:00Z'))||new Date(target+'T00:00:00Z').toISOString().slice(0,10)!==target||target<=today||!reason||reason.length>1000)fail('routeTrial.dateReason',400)
  if(hasWork(db,s)||pendingDefer(db,s))fail('routeTrial.protected')
  const existing=db.prepare("SELECT * FROM driver_date_requests WHERE dispatch_stop_id=? AND status='pending'").get(s.id)
  if(existing){if(existing.target_date===target&&existing.reason===reason)return{id:existing.id,status:'pending'};fail('routeTrial.pending')}
  const result=db.prepare('INSERT INTO driver_date_requests(dispatch_stop_id,employee_id,source_date,target_date,reason) VALUES(?,?,?,?,?)').run(s.id,context.employeeId,today,target,reason)
  audit(db,s,context.employeeId,'driver_date_requested',null,{requestId:Number(result.lastInsertRowid),targetDate:target,reason})
  return{id:Number(result.lastInsertRowid),status:'pending'}
 })
}

export function listDriverDateRequests(db=defaultDb){
 const routes=db.prepare('SELECT r.route_number routeNumber,r.display_name name FROM weekly_route_definitions r JOIN weekly_route_plans p ON p.id=r.plan_id WHERE p.is_active=1 ORDER BY r.route_number').all()
 return db.prepare(`SELECT r.id,r.source_date sourceDate,r.target_date targetDate,r.reason,r.status,e.name employeeName,b.jodoo_branch_id branchId,b.branch_name branchName,s.route_number routeNumber,v.registration_number plate FROM driver_date_requests r JOIN dispatch_stops s ON s.id=r.dispatch_stop_id JOIN branches b ON b.id=s.branch_id JOIN employees e ON e.id=r.employee_id JOIN dispatches d ON d.id=s.dispatch_id LEFT JOIN vehicles v ON v.id=d.vehicle_id WHERE r.status='pending' ORDER BY r.requested_at,r.id`).all().map(r=>({...r,routes}))
}

export function decideDriverDate(id,decision,payload,context={},db=defaultDb){
 if(!['owner','owner_admin','operations_admin','supervisor'].includes(context.role))fail('routeTrial.supervisorOnly',403)
 if(!['approved','rejected'].includes(decision)||!String(payload.reason||'').trim())fail('routeTrial.reviewReason',400)
 return withImmediateTransaction(db,()=>{
  const r=db.prepare('SELECT * FROM driver_date_requests WHERE id=?').get(Number(id))
  if(!r)fail('routeTrial.notFound',404)
  if(r.status!=='pending'){if(r.status===decision)return{id:r.id,status:r.status,idempotent:true};fail('routeTrial.stale')}
  const s=lookup(db,r.dispatch_stop_id),actor=context.employeeName||String(context.employeeId),reason=String(payload.reason).trim()
  let targetStop=null
  if(decision==='approved'){
   if(!s||s.dispatch_date!==r.source_date||hasWork(db,s)||pendingDefer(db,s))fail('routeTrial.protected')
   if(r.source_date<(context.today||kuchingDate())||r.target_date<=(context.today||kuchingDate()))fail('routeTrial.stale')
   const target=db.prepare('SELECT * FROM dispatch_days WHERE dispatch_date=?').get(r.target_date)
   if(!target||!['draft','reapproval_required','approved'].includes(target.status))fail('routeTrial.targetNotReady')
   const route=Number(payload.routeNumber),definition=db.prepare('SELECT r.route_number FROM weekly_route_definitions r JOIN weekly_route_plans p ON p.id=r.plan_id WHERE p.is_active=1 AND r.route_number=?').get(route)
   const assignment=db.prepare('SELECT vehicle_id FROM daily_route_assignments WHERE dispatch_day_id=? AND route_number=?').get(target.id,route)
   if(!definition||!assignment?.vehicle_id)fail('routeTrial.chooseRoute')
   if(!db.prepare("SELECT 1 FROM vehicles WHERE id=? AND operational_status IN ('available','active') AND status IN ('available','assigned') AND (is_temporary=0 OR temporary_date=?)").get(assignment.vehicle_id,r.target_date))fail('routeTrial.targetNotReady')
   const protectedVehicle=db.prepare("SELECT 1 FROM dispatch_trips t JOIN dispatches d ON d.id=t.dispatch_id WHERE t.dispatch_day_id=? AND d.vehicle_id=? AND (t.execution_status<>'not_started' OR d.status IN ('released','in_progress','completed'))").get(target.id,assignment.vehicle_id)
   if(protectedVehicle)fail('routeTrial.targetNotReady')
   assertBranchServiceDateAvailable(db,s.branch_id,r.target_date,{entryPoint:'driver_date_approval'})
   const created=createStop({date:r.target_date,branchId:s.branch_code,vehicleId:assignment.vehicle_id,tripNumber:1,estimatedWeightKg:s.estimated_weight_kg,changedBy:actor},db)
   const routeSequence=db.prepare('SELECT COALESCE(MAX(s.route_stop_sequence),0)+1 n FROM dispatch_stops s JOIN dispatch_trips t ON t.id=s.dispatch_trip_id WHERE t.dispatch_day_id=? AND s.route_number=?').get(target.id,route).n
   db.prepare('UPDATE dispatch_stops SET source_schedule_id=?,route_number=?,route_stop_sequence=? WHERE id=?').run(s.source_schedule_id,route,routeSequence,created.id)
   targetStop=created.id
   db.prepare("UPDATE dispatch_stops SET status='cancelled',override_reason=?,override_note='driver_date_approved',override_at=CURRENT_TIMESTAMP WHERE id=?").run(reason,s.id)
   db.prepare("UPDATE schedule_occurrences SET status='cancelled',updated_at=CURRENT_TIMESTAMP WHERE dispatch_stop_id=?").run(s.id)
   if(s.source_schedule_id)db.prepare("INSERT INTO schedule_exceptions(branch_id,schedule_id,exception_type,original_date,target_date,permanent,reason,created_by) VALUES(?,?,'move_date',?,?,0,?,?)").run(s.branch_id,s.source_schedule_id,r.source_date,r.target_date,reason,actor)
   if(!db.prepare("SELECT 1 FROM dispatch_stops WHERE dispatch_trip_id=? AND status<>'cancelled'").get(s.trip_id)&&s.execution_status==='in_progress'){
    db.prepare("UPDATE dispatch_trips SET execution_status='completed',completed_at=CURRENT_TIMESTAMP,completed_by_employee_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(context.employeeId,s.trip_id)
    db.prepare("UPDATE dispatches SET status='completed',updated_at=CURRENT_TIMESTAMP WHERE id=?").run(s.dispatch_id)
    audit(db,s,actor,'empty_trip_closed_after_date_approval',{status:'in_progress'},{status:'completed',tripId:s.trip_id})
   }
   invalidateDispatchDay(db,r.source_date,'driver_date_approved','dispatch_stop',s.id,{status:s.status},{status:'cancelled',targetStopId:targetStop,targetDate:r.target_date},actor)
  }
  db.prepare('UPDATE driver_date_requests SET status=?,reviewed_by=?,review_reason=?,reviewed_at=CURRENT_TIMESTAMP,target_stop_id=? WHERE id=?').run(decision,actor,reason,targetStop,r.id)
  audit(db,s,actor,'driver_date_request_'+decision,{requestId:r.id,status:'pending'},{status:decision,targetStopId:targetStop,reason})
  return{id:r.id,status:decision,targetStopId:targetStop}
 })
}
