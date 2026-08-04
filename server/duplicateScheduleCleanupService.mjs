import {listBranchServiceDateConflicts,listOccurrenceConflicts,withImmediateTransaction} from './branchServiceDateGuard.mjs'

export const APPROVED_DUPLICATE_SCHEDULE_PLAN=[
  {branchId:'10050',canonicalScheduleId:'10069',supersededScheduleId:'10330',customer:'DCH TECHNOLOGY',branch:'DCH TECHNOLOGY'},
  {branchId:'10278',canonicalScheduleId:'10280',supersededScheduleId:'10317',customer:'SK HARDWARE',branch:'SK HARDWARE'},
  {branchId:'10084',canonicalScheduleId:'10321',supersededScheduleId:'10086',customer:'DIY',branch:'DIY KBH PUNCAK BORENO'},
  {branchId:'10146',canonicalScheduleId:'10391',supersededScheduleId:'10148',customer:'FARLEY',branch:'FARLEY BAKERY',allowApprovedConfigDifference:true,cancelAllSupersededDraftStops:true},
  {branchId:'10033',canonicalScheduleId:'10346',supersededScheduleId:'10312',customer:'CCK LOCAL',branch:'CCK LOCAL CITY MALL'},
  {branchId:'10030',canonicalScheduleId:'10410',supersededScheduleId:'10032',customer:'CARING FARMASI',branch:'CARING FARMASI',allowCanonicalWeekdaySuperset:true}
]
const configFields=['branch_id','source_branch_id','frequency','days_of_week','take_date','next_take_date','recurrence_type','interval_weeks','anchor_date','effective_date','monthly_occurrence','fixed_weekday','next_collection_date']
const json=value=>value==null?null:JSON.stringify(value)
const scheduleByExternal=(database,id)=>database.prepare('SELECT * FROM branch_schedules WHERE jodoo_schedule_id=?').get(String(id))
const serviceDateExpr='COALESCE(ds.service_date,dd.dispatch_date,d.dispatch_date)'
const weekdaySet=value=>new Set(String(value||'').split(',').map(day=>day.trim()).filter(Boolean))

function activity(database,stop){
  const references={documents:database.prepare('SELECT COUNT(*) n FROM stop_documents WHERE dispatch_stop_id=?').get(stop.id).n,steps:database.prepare('SELECT COUNT(*) n FROM stop_step_records WHERE dispatch_stop_id=?').get(stop.id).n,materials:database.prepare('SELECT COUNT(*) n FROM dispatch_stop_material_prices WHERE dispatch_stop_id=?').get(stop.id).n,locations:database.prepare('SELECT COUNT(*) n FROM temporary_locations WHERE dispatch_stop_id=?').get(stop.id).n}
  const fields=['arrived_at','completed_at','collected_weight_kg','invoice_number','payment_status','override_reason','override_note','override_by','override_at']
  const populated=fields.filter(field=>stop[field]!=null&&String(stop[field]).trim()!=='')
  return{referenceCounts:references,populatedFields:populated,hasBusinessActivity:stop.status==='completed'||populated.length>0||Object.values(references).some(Number)}
}

export function previewDuplicateScheduleCleanup(database,plan=APPROVED_DUPLICATE_SCHEDULE_PLAN){
  const schedulePlans=[],stopPlans=[]
  for(const item of plan){
    const canonical=scheduleByExternal(database,item.canonicalScheduleId),superseded=scheduleByExternal(database,item.supersededScheduleId)
    if(!canonical||!superseded)throw new Error(`Approved duplicate Schedule not found: ${item.canonicalScheduleId}/${item.supersededScheduleId}`)
    if(canonical.branch_id!==superseded.branch_id||String(canonical.source_branch_id)!==String(item.branchId))throw new Error(`Duplicate Schedule Branch mismatch: ${item.branchId}`)
    let differences=configFields.filter(field=>String(canonical[field]??'')!==String(superseded[field]??''))
    if(item.allowCanonicalWeekdaySuperset&&differences.length===1&&differences[0]==='days_of_week'){
      const canonicalDays=weekdaySet(canonical.days_of_week),supersededDays=weekdaySet(superseded.days_of_week)
      if([...supersededDays].every(day=>canonicalDays.has(day)))differences=[]
    }
    if(differences.length&&!item.allowApprovedConfigDifference)throw new Error(`Duplicate Schedules have business differences: ${differences.join(', ')}`)
    const stops=database.prepare(`SELECT ds.*,${serviceDateExpr} service_date_resolved,dd.id dispatch_day_id,dd.status dispatch_day_status,d.status dispatch_status FROM dispatch_stops ds JOIN dispatches d ON d.id=ds.dispatch_id LEFT JOIN dispatch_trips dt ON dt.id=ds.dispatch_trip_id LEFT JOIN dispatch_days dd ON dd.id=dt.dispatch_day_id WHERE ds.source_schedule_id IN (?,?) AND ds.status<>'cancelled' ORDER BY service_date_resolved,ds.id`).all(canonical.id,superseded.id)
    const byDate=Map.groupBy(stops,row=>row.service_date_resolved)
    for(const [serviceDate,rows] of byDate){
      const canonicalStop=rows.find(row=>row.source_schedule_id===canonical.id),supersededStop=rows.find(row=>row.source_schedule_id===superseded.id)
      if(!canonicalStop||!supersededStop)continue
      const ca=activity(database,canonicalStop),sa=activity(database,supersededStop)
      let retain=canonicalStop,cancel=supersededStop,reason='Neither Stop has business activity; retain the approved Canonical Schedule Stop.'
      if(ca.hasBusinessActivity&&sa.hasBusinessActivity){retain=null;cancel=null;reason='Both Stops contain business activity; automatic cleanup is blocked.'}
      else if(sa.hasBusinessActivity){retain=supersededStop;cancel=canonicalStop;reason='Superseded-Schedule Stop contains the only business activity; retain its original source_schedule_id.'}
      else if(ca.hasBusinessActivity)reason='Canonical Stop contains business activity and is retained.'
      stopPlans.push({...item,planKind:'duplicate_pair',serviceDate,dispatchId:canonicalStop.dispatch_id,dispatchDayId:canonicalStop.dispatch_day_id,canonicalStopId:canonicalStop.id,supersededStopId:supersededStop.id,canonicalStopActivity:ca,supersededStopActivity:sa,retainStopId:retain?.id??null,cancelStopId:cancel?.id??null,cancelOriginalStatus:cancel?.status??null,blocked:!retain,reason,sequenceAction:'Preserve all stop_sequence values; cancelled Stop is excluded from active route views.'})
    }
    if(item.cancelAllSupersededDraftStops){
      const pairedIds=new Set(stopPlans.filter(row=>row.supersededScheduleId===item.supersededScheduleId).map(row=>row.supersededStopId))
      for(const stop of stops.filter(row=>row.source_schedule_id===superseded.id&&!pairedIds.has(row.id))){
        const stopActivity=activity(database,stop),safeStatus=stop.status==='locked'&&stop.dispatch_status==='draft',blocked=stopActivity.hasBusinessActivity||!safeStatus
        stopPlans.push({...item,planKind:'superseded_schedule_draft',serviceDate:stop.service_date_resolved,dispatchId:stop.dispatch_id,dispatchDayId:stop.dispatch_day_id,canonicalStopId:null,supersededStopId:stop.id,canonicalStopActivity:null,supersededStopActivity:stopActivity,retainStopId:null,cancelStopId:stop.id,cancelOriginalStatus:stop.status,blocked,reason:blocked?'Superseded Schedule contains a non-draft or business-active Stop.':'Supervisor confirmed the Monday-Sunday Legacy Schedule was erroneous; cancel its unexecuted draft Stop.',sequenceAction:'Preserve stop_sequence; cancelled Stop is excluded from active route views.'})
      }
      const unsafeScheduleStop=stops.filter(row=>row.source_schedule_id===superseded.id).find(stop=>activity(database,stop).hasBusinessActivity||stop.status!=='locked'||stop.dispatch_status!=='draft')
      if(unsafeScheduleStop)for(const row of stopPlans.filter(planRow=>planRow.supersededScheduleId===item.supersededScheduleId)){row.blocked=true;row.reason=`Superseded Schedule contains unsafe Stop ${unsafeScheduleStop.id}; the whole Schedule cleanup is blocked.`}
    }
    schedulePlans.push({...item,internalBranchId:canonical.branch_id,canonicalInternalId:canonical.id,supersededInternalId:superseded.id,configDifferences:differences,canonicalActive:canonical.is_active,supersededActive:superseded.is_active,stopPairs:stopPlans.filter(row=>row.branchId===item.branchId&&row.planKind==='duplicate_pair').length,additionalDraftStops:stopPlans.filter(row=>row.branchId===item.branchId&&row.planKind==='superseded_schedule_draft').length,action:'Set superseded Schedule is_active=0 and retain all IDs/history.'})
  }
  const blockers=stopPlans.filter(row=>row.blocked)
  return{dryRun:true,schedulePlans,stopPlans,blockers,counts:{schedulesToSupersede:schedulePlans.filter(row=>row.supersededActive===1).length,stopPairs:stopPlans.filter(row=>row.planKind==='duplicate_pair').length,additionalDraftStops:stopPlans.filter(row=>row.planKind==='superseded_schedule_draft').length,stopsToCancel:stopPlans.filter(row=>!row.blocked).length,completedStopsToModify:stopPlans.filter(row=>row.cancelOriginalStatus==='completed').length,blockedPairs:blockers.length},existingConflicts:listBranchServiceDateConflicts(database)}
}

export function applyDuplicateScheduleCleanup(database,{changedBy,reason,plan=APPROVED_DUPLICATE_SCHEDULE_PLAN}={}){
  if(!String(changedBy||'').trim()||!String(reason||'').trim())throw new Error('changedBy and reason are required')
  return withImmediateTransaction(database,()=>{
    const preview=previewDuplicateScheduleCleanup(database,plan)
    if(preview.blockers.length)throw new Error(`Duplicate Stop cleanup blocked for ${preview.blockers.length} pair(s) with business activity`)
    if(preview.counts.completedStopsToModify)throw new Error('Completed historical Stops cannot be superseded')
    let schedulesSuperseded=0,stopsCancelled=0,auditRows=0
    for(const row of preview.stopPlans){
      const before=database.prepare('SELECT * FROM dispatch_stops WHERE id=?').get(row.cancelStopId)
      if(before.status==='cancelled')continue
      database.prepare(`UPDATE dispatch_stops SET status='cancelled',superseded_by_stop_id=?,superseded_reason=?,superseded_at=CURRENT_TIMESTAMP,superseded_by=? WHERE id=?`).run(row.retainStopId,reason,changedBy,row.cancelStopId)
      if(before.source_schedule_id)database.prepare("UPDATE schedule_occurrences SET status='cancelled',dispatch_stop_id=NULL,updated_at=CURRENT_TIMESTAMP WHERE schedule_id=? AND planned_date=?").run(before.source_schedule_id,row.serviceDate)
      const after=database.prepare('SELECT * FROM dispatch_stops WHERE id=?').get(row.cancelStopId)
      database.prepare(`INSERT INTO dispatch_change_logs(dispatch_day_id,actor,change_type,entity_type,entity_id,before_json,after_json,requires_reapproval) VALUES(?,?,'duplicate_stop_superseded','dispatch_stop',?,?,?,1)`).run(row.dispatchDayId,changedBy,String(row.cancelStopId),json(before),json(after));stopsCancelled++;auditRows++
    }
    for(const row of preview.schedulePlans){
      const before=scheduleByExternal(database,row.supersededScheduleId);if(before.is_active!==1)continue
      database.prepare(`UPDATE branch_schedules SET is_active=0,superseded_by_schedule_id=?,superseded_reason=?,superseded_at=CURRENT_TIMESTAMP,superseded_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(row.canonicalInternalId,reason,changedBy,row.supersededInternalId)
      const after=scheduleByExternal(database,row.supersededScheduleId)
      database.prepare(`INSERT INTO master_change_history(entity_type,entity_id,change_type,field_name,old_value,new_value,before_json,after_json,reason,changed_by) VALUES('branch_schedule',?,'duplicate_schedule_superseded','is_active','1','0',?,?,?,?)`).run(row.supersededScheduleId,json(before),json(after),reason,changedBy);schedulesSuperseded++;auditRows++
    }
    const targetBranches=new Set(preview.schedulePlans.map(row=>Number(row.internalBranchId))),remaining=listBranchServiceDateConflicts(database).filter(conflict=>targetBranches.has(Number(conflict.branch_id)))
    if(remaining.length)throw new Error('Duplicate Branch service-date conflicts remain after cleanup')
    const remainingOccurrences=listOccurrenceConflicts(database)
    if(!remainingOccurrences.length)database.exec(`CREATE UNIQUE INDEX IF NOT EXISTS schedule_occurrences_branch_date_unique ON schedule_occurrences(branch_id,planned_date) WHERE branch_id IS NOT NULL AND status<>'cancelled'`)
    return{applied:true,schedulesSuperseded,stopsCancelled,auditRows,completedStopsModified:0,sequenceChanges:0,remainingConflicts:listBranchServiceDateConflicts(database)}
  })
}
