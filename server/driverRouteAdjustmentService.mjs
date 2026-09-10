import {canManageDispatch} from '../shared/dispatchAccess.js'
import {getCollectionScheduleManagement,saveCollectionScheduleManagement} from './collectionScheduleManagementService.mjs'
import {weekdayName} from '../shared/scheduleRecurrence.js'
import {planningDate} from '../shared/planningDates.js'
import {db as defaultDb} from './database.mjs'
import {kuchingDate} from '../shared/kuchingTime.js'
import {isRouteTrialDate} from '../shared/routeTrial.js'
import {withImmediateTransaction,assertBranchServiceDateAvailable,findBranchServiceDateStop} from './branchServiceDateGuard.mjs'
import {driverToday,createStop,invalidateDispatchDay,syncReviewedBranchSchedule,placeReviewedScheduledStop,generateDay} from './dispatchService.mjs'

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

// A route can be planned before its date, vehicle or driver has been prepared.
export function driverDateReviewOptions(date,db=defaultDb){
 if(!planningDate(date)||planningDate(date)!==date)fail('routeTrial.invalidReviewDate',400)
 const day=db.prepare('SELECT * FROM dispatch_days WHERE dispatch_date=?').get(date)
 const routes=db.prepare(`SELECT r.route_number routeNumber,r.display_name name,a.vehicle_id vehicleId,v.registration_number plate,
  CASE WHEN a.vehicle_id IS NOT NULL AND v.operational_status IN ('active','available') AND v.status IN ('active','available','assigned') AND (v.is_temporary=0 OR v.temporary_date=?)
   AND NOT EXISTS(SELECT 1 FROM dispatch_trips t JOIN dispatches d ON d.id=t.dispatch_id WHERE t.dispatch_day_id=a.dispatch_day_id AND d.vehicle_id=a.vehicle_id AND (t.execution_status<>'not_started' OR d.status IN ('released','in_progress','completed')))
   THEN 1 ELSE 0 END available
  FROM weekly_route_definitions r JOIN weekly_route_plans p ON p.id=r.plan_id
  LEFT JOIN daily_route_assignments a ON a.route_number=r.route_number AND a.dispatch_day_id=?
  LEFT JOIN vehicles v ON v.id=a.vehicle_id WHERE p.is_active=1 ORDER BY r.route_number`).all(date,day?.id??null)
 return{date,dayReady:!!day,revision:day?.revision??null,routes:routes.map(r=>({...r,vehicleReady:!!r.available,vehicleId:r.available?r.vehicleId:null,plate:r.available?r.plate:null,available:true}))}
}

export function listDriverDateRequests(db=defaultDb){
 return db.prepare(`SELECT r.id,r.source_date sourceDate,r.target_date targetDate,r.reason,r.status,e.name employeeName,b.id internalBranchId,b.jodoo_branch_id branchId,b.branch_name branchName,s.route_number routeNumber,v.registration_number plate FROM driver_date_requests r JOIN dispatch_stops s ON s.id=r.dispatch_stop_id JOIN branches b ON b.id=s.branch_id JOIN employees e ON e.id=r.employee_id JOIN dispatches d ON d.id=s.dispatch_id LEFT JOIN vehicles v ON v.id=d.vehicle_id WHERE r.status='pending' ORDER BY r.requested_at,r.id`).all().map(r=>({...r,routes:driverDateReviewOptions(r.targetDate,db).routes,schedule:getCollectionScheduleManagement(r.internalBranchId,db)}))
}

export function decideDriverDate(id,decision,payload,context={},db=defaultDb){
 if(!canManageDispatch(context))fail('routeTrial.supervisorOnly',403)
 if(!['approved','rejected'].includes(decision)||!String(payload.reason||'').trim()||String(payload.reason).length>1000)fail('routeTrial.reviewReason',400)
 return withImmediateTransaction(db,()=>{
  const r=db.prepare('SELECT * FROM driver_date_requests WHERE id=?').get(Number(id))
  if(!r)fail('routeTrial.notFound',404)
  if(r.status!=='pending'){if(r.status===decision)return{id:r.id,status:r.status,idempotent:true};fail('routeTrial.stale')}
  const s=lookup(db,r.dispatch_stop_id),actor=context.employeeName||String(context.employeeId),reason=String(payload.reason).trim()
  let targetStop=null,preservedDates=[]
  if(decision==='approved'){
   const today=context.today||kuchingDate(),date=String(payload.targetDate||r.target_date),scope=payload.scope||'once',route=Number(payload.routeNumber)
   if(!planningDate(date)||planningDate(date)!==date||date<today)fail('routeTrial.invalidReviewDate',400)
   if(!['once','permanent'].includes(scope))fail('routeTrial.invalidScope',400)
   if(!s||s.dispatch_date!==r.source_date||hasWork(db,s)||pendingDefer(db,s))fail('routeTrial.protected')
   if(r.source_date<today)fail('routeTrial.stale')
   if(date===s.dispatch_date&&route===s.route_number)fail('routeTrial.noChange',400)
   let options=driverDateReviewOptions(date,db)
   if(!options.routes.some(x=>x.routeNumber===route))fail('routeTrial.chooseRoute')
   if(payload.targetRevision!=null&&Number(payload.targetRevision)!==options.revision)fail('routeTrial.stale')
   if(!options.dayReady){generateDay({startDate:date,onlyMissing:true,generatedBy:actor},db);options=driverDateReviewOptions(date,db)}
   const chosen=options.routes.find(x=>x.routeNumber===route)
   const target=db.prepare('SELECT * FROM dispatch_days WHERE dispatch_date=?').get(date)
   if(target.status==='completed')fail('routeTrial.protected')
   const existing=findBranchServiceDateStop(db,s.branch_id,date,{excludeStopId:s.id})
   const targetExisting=existing?lookup(db,existing.id):null
   // Reuse a generated occurrence rather than creating a duplicate on an already due day.
   // Manual/special arrangements and anything with work or pending requests need review.
   if(targetExisting){
    if(!s.source_schedule_id||targetExisting.source_schedule_id!==s.source_schedule_id||targetExisting.source_special_request_id||targetExisting.override_note||hasWork(db,targetExisting)||pendingDefer(db,targetExisting)||targetExisting.execution_status!=='not_started'||db.prepare("SELECT 1 FROM driver_date_requests WHERE dispatch_stop_id=? AND status='pending'").get(targetExisting.id))fail('routeTrial.existingProtected')
   }else assertBranchServiceDateAvailable(db,s.branch_id,date,{excludeStopId:s.id,entryPoint:'driver_date_approval'})
   let before=null,after=null
   if(scope==='permanent'){
    before=getCollectionScheduleManagement(s.branch_id,db)
    if(!before||before.blocked||!before.internalScheduleId||before.internalScheduleId!==s.source_schedule_id)fail('routeTrial.scheduleReview',400)
    if(!payload.expectedScheduleUpdatedAt||payload.expectedScheduleUpdatedAt!==before.updatedAt)fail('routeTrial.stale')
    const sourceDay=weekdayName(s.dispatch_date),targetDay=weekdayName(date)
    if(!before.weekdays.includes(sourceDay)||sourceDay!==targetDay&&before.weekdays.includes(targetDay))fail('routeTrial.weekdayConflict',400)
    const weekdays=before.weekdays.map(x=>x===sourceDay?targetDay:x)
    const nth=Math.floor((Number(date.slice(-2))-1)/7)+1
    const saved=saveCollectionScheduleManagement(s.branch_id,{...before,weekdays,routeNumber:route,
     anchorDate:['interval_weeks','monthly'].includes(before.recurrenceType)?date:before.anchorDate,
     effectiveDate:s.dispatch_date,monthlyOccurrence:before.recurrenceType==='monthly'?(nth===5?-1:nth):before.monthlyOccurrence,
     sundayRouteNumber:targetDay==='Sunday'?route:before.sundayRouteNumber,sundayAuthorized:payload.sundayAuthorized===true,
     expectedUpdatedAt:payload.expectedScheduleUpdatedAt,reason,changedBy:actor},db)
    after=saved.after
   }
   // Cancel before inserting so a same-day route transfer respects branch/date uniqueness.
   // The enclosing transaction restores everything if any later write fails.
   db.prepare("UPDATE dispatch_stops SET status='cancelled',override_reason=?,override_note='driver_date_approved',override_at=CURRENT_TIMESTAMP WHERE id=?").run(reason,s.id)
   db.prepare("UPDATE schedule_occurrences SET status='cancelled',updated_at=CURRENT_TIMESTAMP WHERE dispatch_stop_id=?").run(s.id)
   if(targetExisting){
    targetStop=targetExisting.id
    placeReviewedScheduledStop({stopId:targetStop,date,vehicleId:chosen.vehicleId,routeNumber:route,changedBy:actor},db)
    audit(db,s,actor,'driver_date_existing_occurrence_reused',targetExisting,{requestId:r.id,targetStopId:targetStop,date,routeNumber:route})
   }else{
    const created=createStop({date,branchId:s.branch_code,vehicleId:chosen.vehicleId,tripNumber:1,estimatedWeightKg:s.estimated_weight_kg,changedBy:actor},db)
    const routeSequence=db.prepare('SELECT COALESCE(MAX(s.route_stop_sequence),0)+1 n FROM dispatch_stops s JOIN dispatch_trips t ON t.id=s.dispatch_trip_id WHERE t.dispatch_day_id=? AND s.route_number=?').get(target.id,route).n
    db.prepare('UPDATE dispatch_stops SET source_schedule_id=?,route_number=?,route_stop_sequence=? WHERE id=?').run(s.source_schedule_id,route,routeSequence,created.id)
    targetStop=created.id
   }
   if(s.source_schedule_id){
    db.prepare("INSERT INTO schedule_exceptions(branch_id,schedule_id,exception_type,original_date,target_date,permanent,reason,created_by) VALUES(?,?,?,?,?,0,?,?)").run(s.branch_id,s.source_schedule_id,date===s.dispatch_date?'add_extra_collection':'move_date',s.dispatch_date,date,reason,actor)
    db.prepare("INSERT INTO schedule_occurrences(schedule_id,branch_id,planned_date,occurrence_source,status,dispatch_stop_id) VALUES(?,?,?,'exception','planned',?) ON CONFLICT(schedule_id,planned_date) DO UPDATE SET status='planned',dispatch_stop_id=excluded.dispatch_stop_id,occurrence_source='exception',updated_at=CURRENT_TIMESTAMP").run(s.source_schedule_id,s.branch_id,date,targetStop)
   }
   db.prepare('INSERT INTO driver_date_reviews(request_id,branch_id,approved_date,route_number,scope,schedule_before_json,schedule_after_json) VALUES(?,?,?,?,?,?,?)').run(r.id,s.branch_id,date,route,scope,JSON.stringify(before),JSON.stringify(after))
   if(scope==='permanent'){
    preservedDates=syncReviewedBranchSchedule({branchId:s.branch_id,scheduleId:s.source_schedule_id,startDate:s.dispatch_date,excludeStopId:targetStop,changedBy:actor},db)
    after.nextCollectionDate=db.prepare('SELECT next_collection_date date FROM branch_schedules WHERE id=?').get(s.source_schedule_id).date
    db.prepare('UPDATE driver_date_reviews SET preserved_dates_json=?,schedule_after_json=? WHERE request_id=?').run(JSON.stringify(preservedDates),JSON.stringify(after),r.id)
   }
   if(!db.prepare("SELECT 1 FROM dispatch_stops WHERE dispatch_trip_id=? AND status<>'cancelled'").get(s.trip_id)&&s.execution_status==='in_progress'){
    db.prepare("UPDATE dispatch_trips SET execution_status='completed',completed_at=CURRENT_TIMESTAMP,completed_by_employee_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(context.employeeId,s.trip_id)
    // Other trips on this dispatch must also be complete before closing the dispatch.
    if(!db.prepare("SELECT 1 FROM dispatch_trips WHERE dispatch_id=? AND execution_status<>'completed'").get(s.dispatch_id))db.prepare("UPDATE dispatches SET status='completed',updated_at=CURRENT_TIMESTAMP WHERE id=?").run(s.dispatch_id)
    audit(db,s,actor,'empty_trip_closed_after_date_approval',{status:'in_progress'},{status:'completed',tripId:s.trip_id})
   }
   invalidateDispatchDay(db,r.source_date,'driver_date_approved','dispatch_stop',s.id,{status:s.status},{status:'cancelled',targetStopId:targetStop,targetDate:date,routeNumber:route,scope},actor)
  }
  db.prepare('UPDATE driver_date_requests SET status=?,reviewed_by=?,review_reason=?,reviewed_at=CURRENT_TIMESTAMP,target_stop_id=? WHERE id=?').run(decision,actor,reason,targetStop,r.id)
  audit(db,s,actor,'driver_date_request_'+decision,{requestId:r.id,status:'pending'},{status:decision,targetStopId:targetStop,reason,preservedDates})
  return{id:r.id,status:decision,targetStopId:targetStop,preservedDates}
 })
}

export function plannedCustomerReview(id,context={},db=defaultDb){
 if(!canManageDispatch(context))fail('routeTrial.supervisorOnly',403)
 const s=lookup(db,id)
 if(!s)fail('routeTrial.notFound',404)
 return{id:s.id,sourceDate:s.dispatch_date,targetDate:s.dispatch_date,branchId:s.branch_code,branchName:s.branch_name,schedule:getCollectionScheduleManagement(s.branch_id,db)}
}
export function changePlannedCustomer(id,payload,context={},db=defaultDb){
 if(!canManageDispatch(context))fail('routeTrial.supervisorOnly',403)
 return withImmediateTransaction(db,()=>{
  const s=lookup(db,id)
  if(!s||hasWork(db,s))fail('routeTrial.protected')
  let r=db.prepare("SELECT id FROM driver_date_requests WHERE dispatch_stop_id=? AND status='pending'").get(s.id)
  if(!r){
   const insert=db.prepare('INSERT INTO driver_date_requests(dispatch_stop_id,employee_id,source_date,target_date,reason) VALUES(?,?,?,?,?)').run(s.id,context.employeeId,s.dispatch_date,String(payload.targetDate||''),String(payload.reason||''))
   r={id:Number(insert.lastInsertRowid)}
   audit(db,s,context.employeeName||context.employeeId,'office_schedule_change_requested',null,{requestId:r.id,targetDate:payload.targetDate,routeNumber:payload.routeNumber})
  }
  return decideDriverDate(r.id,'approved',payload,context,db)
 })
}
