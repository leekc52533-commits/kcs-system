import {db as defaultDb} from './database.mjs'
import {withImmediateTransaction} from './branchServiceDateGuard.mjs'
import {activeRouteDriver} from './routeDriverAuthorization.mjs'
import {addCalendarDays,kuchingDate} from '../shared/kuchingTime.js'
import {driverPlanState,driverPlanSummary} from './driverPlanState.mjs'
import {invalidateDispatchDay} from './dispatchService.mjs'
const fail=(code,statusCode=409)=>{throw Object.assign(new Error(code),{code,statusCode})}
export function changeTomorrowPlan(tripId,action,payload,context,db=defaultDb){
 return withImmediateTransaction(db,()=>{
  const p=driverPlanState(db,tripId)
  if(!p||context.preview||!activeRouteDriver(db,context.employeeId,context.role)||p.driverId!==Number(context.employeeId))fail('DRIVER_PLAN_FORBIDDEN',403)
  if(p.date!==addCalendarDays(kuchingDate(context.now||new Date()),1))fail('DRIVER_PLAN_DATE')
  if(!p.editable)fail('DRIVER_PLAN_LOCKED')
  if(payload.expectedSignature!==p.signature)fail('DRIVER_PLAN_STALE')
  const protectedStop=db.prepare(`SELECT 1 FROM dispatch_stops s WHERE s.dispatch_trip_id=? AND s.status<>'cancelled' AND
   (s.arrived_at IS NOT NULL OR s.completed_at IS NOT NULL OR s.status IN ('active','completed') OR s.override_note='driver_deferred'
   OR EXISTS(SELECT 1 FROM purchase_bills b WHERE b.dispatch_stop_id=s.id)
   OR EXISTS(SELECT 1 FROM stop_documents b WHERE b.dispatch_stop_id=s.id)
   OR EXISTS(SELECT 1 FROM stop_step_records b WHERE b.dispatch_stop_id=s.id)
   OR EXISTS(SELECT 1 FROM driver_defer_requests b WHERE b.dispatch_stop_id=s.id AND b.status='pending')
   OR EXISTS(SELECT 1 FROM driver_date_requests b WHERE b.dispatch_stop_id=s.id AND b.status='pending')
   OR EXISTS(SELECT 1 FROM driver_arrangement_requests b WHERE b.dispatch_stop_id=s.id AND b.status='pending')) LIMIT 1`).get(p.id)
  if(protectedStop)fail('DRIVER_PLAN_LOCKED')
  if(action==='check'){
   if(!p.checked){
    db.prepare(`INSERT INTO driver_plan_checks(trip_id,employee_id,employee_name,plan_signature) VALUES(?,?,?,?) ON CONFLICT(trip_id) DO UPDATE SET employee_id=excluded.employee_id,employee_name=excluded.employee_name,plan_signature=excluded.plan_signature,checked_at=CURRENT_TIMESTAMP`).run(p.id,p.driverId,p.driverName,p.signature)
    db.prepare("INSERT INTO dispatch_change_logs(dispatch_day_id,actor,change_type,entity_type,entity_id,after_json,requires_reapproval) VALUES(?,?,'driver_plan_checked','dispatch_trip',?,?,0)").run(p.dayId,p.driverName,String(p.id),JSON.stringify({employeeId:p.driverId,signature:p.signature}))
   }
  }else if(action==='order'){
   const rows=p.stops,index=rows.findIndex(s=>s.id===Number(payload.stopId)),other=index+(payload.direction==='up'?-1:1)
   if(!['up','down'].includes(payload.direction)||index<0||other<0||other>=rows.length)fail('DRIVER_PLAN_STALE')
   if(rows[index].sequenceLocked||rows[other].sequenceLocked)fail('DRIVER_PLAN_LOCKED')
   const before=rows.map(s=>s.id),slots=rows.map(s=>s.sequence),next=[...rows];[next[index],next[other]]=[next[other],next[index]]
   // Reuse only this trip's sequence slots: dispatches may contain other trips.
   const base=db.prepare('SELECT MIN(stop_sequence) n FROM dispatch_stops WHERE dispatch_id=?').get(p.dispatchId).n-rows.length-1
   rows.forEach((s,i)=>db.prepare('UPDATE dispatch_stops SET stop_sequence=? WHERE id=?').run(base+i,s.id))
   next.forEach((s,i)=>db.prepare('UPDATE dispatch_stops SET stop_sequence=? WHERE id=?').run(slots[i],s.id))
   for(const route of new Set(rows.map(s=>s.routeNumber))){
    const routeSlots=rows.filter(s=>s.routeNumber===route).map(s=>s.routeSequence).sort((a,b)=>a-b)
    next.filter(s=>s.routeNumber===route).forEach((s,i)=>db.prepare('UPDATE dispatch_stops SET route_stop_sequence=? WHERE id=?').run(routeSlots[i],s.id))
   }
   invalidateDispatchDay(db,p.date,'driver_tomorrow_order_changed','dispatch_trip',p.id,{order:before},{order:next.map(s=>s.id),employeeId:p.driverId},p.driverName)
  }else fail('DRIVER_PLAN_STALE')
  return driverPlanSummary(db,p.id)
 })
}
