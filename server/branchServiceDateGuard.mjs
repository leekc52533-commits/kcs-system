const ACTIVE_STOP_STATUSES=['locked','available','active','completed','overridden']
const placeholders=ACTIVE_STOP_STATUSES.map(()=>'?').join(',')

export class DuplicateBranchServiceDateError extends Error{
  constructor(existing,{branchId,serviceDate,attemptedScheduleId=null,entryPoint='dispatch'}={}){
    super(`Duplicate Branch Service Date: Branch ${branchId} already has Stop ${existing.id} on ${serviceDate}`)
    this.name='DuplicateBranchServiceDateError';this.code='DUPLICATE_BRANCH_SERVICE_DATE';this.statusCode=409;this.result='Already Exists'
    this.branchId=branchId;this.serviceDate=serviceDate;this.existingStopId=existing.id;this.existingScheduleId=existing.source_schedule_id??null;this.attemptedScheduleId=attemptedScheduleId;this.entryPoint=entryPoint
  }
}

export function withImmediateTransaction(database,work){if(database.isTransaction)return work();database.exec('BEGIN IMMEDIATE');try{const result=work();database.exec('COMMIT');return result}catch(error){database.exec('ROLLBACK');throw error}}

export function findBranchServiceDateStop(database,branchId,serviceDate,{excludeStopId=null}={}){
  return database.prepare(`SELECT ds.*,COALESCE(ds.service_date,dd.dispatch_date,d.dispatch_date) resolved_service_date,dd.id dispatch_day_id,dd.status dispatch_day_status,d.status dispatch_status
    FROM dispatch_stops ds JOIN dispatches d ON d.id=ds.dispatch_id LEFT JOIN dispatch_trips dt ON dt.id=ds.dispatch_trip_id LEFT JOIN dispatch_days dd ON dd.id=dt.dispatch_day_id
    WHERE ds.branch_id=? AND COALESCE(ds.service_date,dd.dispatch_date,d.dispatch_date)=? AND ds.status IN (${placeholders}) AND (? IS NULL OR ds.id<>?)
    ORDER BY CASE ds.status WHEN 'completed' THEN 0 WHEN 'active' THEN 1 WHEN 'locked' THEN 2 ELSE 3 END,ds.id LIMIT 1`).get(branchId,serviceDate,...ACTIVE_STOP_STATUSES,excludeStopId,excludeStopId)
}

export const duplicateResult=(existing,details={})=>({created:false,result:'Already Exists',code:'DUPLICATE_BRANCH_SERVICE_DATE',message:'Duplicate Branch Service Date',branchId:details.branchId,serviceDate:details.serviceDate,existingStopId:existing.id,existingScheduleId:existing.source_schedule_id??null,attemptedScheduleId:details.attemptedScheduleId??null,entryPoint:details.entryPoint||'dispatch'})
export function assertBranchServiceDateAvailable(database,branchId,serviceDate,options={}){const existing=findBranchServiceDateStop(database,branchId,serviceDate,options);if(existing)throw new DuplicateBranchServiceDateError(existing,{branchId,serviceDate,...options});return true}

export function listBranchServiceDateConflicts(database){return database.prepare(`SELECT ds.branch_id,COALESCE(ds.service_date,dd.dispatch_date,d.dispatch_date) service_date,COUNT(*) stop_count,GROUP_CONCAT(ds.id) stop_ids,GROUP_CONCAT(COALESCE(ds.source_schedule_id,'')) schedule_ids
  FROM dispatch_stops ds JOIN dispatches d ON d.id=ds.dispatch_id LEFT JOIN dispatch_trips dt ON dt.id=ds.dispatch_trip_id LEFT JOIN dispatch_days dd ON dd.id=dt.dispatch_day_id
  WHERE ds.status IN (${placeholders}) GROUP BY ds.branch_id,COALESCE(ds.service_date,dd.dispatch_date,d.dispatch_date) HAVING COUNT(*)>1 ORDER BY service_date,ds.branch_id`).all(...ACTIVE_STOP_STATUSES)}
export function listOccurrenceConflicts(database){return database.prepare(`SELECT branch_id,planned_date,COUNT(*) occurrence_count,GROUP_CONCAT(id) occurrence_ids,GROUP_CONCAT(schedule_id) schedule_ids FROM schedule_occurrences WHERE branch_id IS NOT NULL AND status<>'cancelled' GROUP BY branch_id,planned_date HAVING COUNT(*)>1 ORDER BY planned_date,branch_id`).all()}
export function assertRouteGenerationReady(database){const stopConflicts=listBranchServiceDateConflicts(database),occurrenceConflicts=listOccurrenceConflicts(database);if(stopConflicts.length||occurrenceConflicts.length){const error=new Error(`Route generation blocked: ${stopConflicts.length} duplicate Branch service dates and ${occurrenceConflicts.length} duplicate occurrences require audited resolution`);error.code='ROUTE_GENERATION_DUPLICATES_UNRESOLVED';error.statusCode=409;error.stopConflicts=stopConflicts;error.occurrenceConflicts=occurrenceConflicts;throw error}return{ready:true,stopConflicts:0,occurrenceConflicts:0}}
export function recordDuplicateDiagnostic(database,day,{existing,branchId,serviceDate,attemptedScheduleId=null,entryPoint='dispatch',actor='System'}){database.prepare(`INSERT INTO dispatch_change_logs(dispatch_day_id,actor,change_type,entity_type,entity_id,before_json,after_json,requires_reapproval) VALUES(?,?,'duplicate_branch_service_date_blocked','branch',?,?,?,0)`).run(day?.id??null,String(actor||'System'),String(branchId),JSON.stringify({existingStopId:existing.id,existingScheduleId:existing.source_schedule_id??null,serviceDate}),JSON.stringify({attemptedScheduleId,entryPoint,result:'Already Exists'}))}
