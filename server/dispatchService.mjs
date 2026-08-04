import { createHash } from 'node:crypto'
import { db as defaultDb } from './database.mjs'
import {addCalendarDays,kuchingDate} from '../shared/kuchingTime.js'
import {nextCollectionDate,scheduleMatchesDate} from '../shared/scheduleRecurrence.js'
import {assertBranchServiceDateAvailable,assertRouteGenerationReady,duplicateResult,findBranchServiceDateStop,recordDuplicateDiagnostic,withImmediateTransaction} from './branchServiceDateGuard.mjs'

const iso = (value = new Date()) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : kuchingDate(value)
const addDays = addCalendarDays
const json = (value) => value == null ? null : JSON.stringify(value)
const actor = (value) => String(value || 'Supervisor')
const currentEmploymentPeriod=(database,employeeId)=>employeeId?database.prepare('SELECT id FROM employee_employment_history WHERE employee_id=? ORDER BY id DESC LIMIT 1').get(employeeId)?.id||null:null

function dayByDate(database, date) {
  return database.prepare('SELECT * FROM dispatch_days WHERE dispatch_date=?').get(date)
}

const PROTECTED_DAY_STATUSES=new Set(['approved','published','in_progress','completed'])
const PROTECTED_DISPATCH_STATUSES=new Set(['released','in_progress','completed'])
function protectedDayReason(database,day){
  if(!day)return null
  if(PROTECTED_DAY_STATUSES.has(String(day.status||'').toLowerCase()))return`Dispatch day is ${day.status}`
  const dispatch=database.prepare(`SELECT d.id,d.status FROM dispatch_trips dt JOIN dispatches d ON d.id=dt.dispatch_id WHERE dt.dispatch_day_id=? AND d.status IN ('released','in_progress','completed') ORDER BY d.id LIMIT 1`).get(day.id)
  return dispatch&&PROTECTED_DISPATCH_STATUSES.has(String(dispatch.status||'').toLowerCase())?`Dispatch ${dispatch.id} is ${dispatch.status}`:null
}

function latestExistingEstimatedWeight(database,branchId){
  return database.prepare(`SELECT estimated_weight_kg value FROM dispatch_stops
    WHERE branch_id=? AND estimated_weight_kg IS NOT NULL AND estimated_weight_kg>=0
    ORDER BY COALESCE(service_date,(SELECT dispatch_date FROM dispatches WHERE id=dispatch_stops.dispatch_id)) DESC,id DESC LIMIT 1`).get(branchId)?.value??null
}

export function invalidateDispatchDay(database, date, changeType, entityType, entityId, before, after, changedBy='Supervisor') {
  const day = dayByDate(database,date)
  if (!day) return null
  const nextStatus = ['approved','published'].includes(day.status) ? 'reapproval_required' : day.status
  database.prepare('UPDATE dispatch_days SET status=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(nextStatus,day.id)
  database.prepare(`INSERT INTO dispatch_change_logs(dispatch_day_id,actor,change_type,entity_type,entity_id,before_json,after_json,requires_reapproval)
    VALUES(?,?,?,?,?,?,?,?)`).run(day.id,actor(changedBy),changeType,entityType,String(entityId??''),json(before),json(after),['approved','published'].includes(day.status)?1:0)
  return { ...day, status:nextStatus, revision:day.revision+1 }
}

function ensureTrip(database, day, areaId=null, tripNumber=1) {
  const found = database.prepare(`SELECT dt.* FROM dispatch_trips dt WHERE dt.dispatch_day_id=? AND dt.area_id IS ? AND dt.trip_number=?`).get(day.id,areaId,tripNumber)
  if (found) return found
  const dispatch = database.prepare("INSERT INTO dispatches(dispatch_date,status) VALUES(?,'draft')").run(day.dispatch_date)
  const result = database.prepare('INSERT INTO dispatch_trips(dispatch_day_id,dispatch_id,trip_number,area_id) VALUES(?,?,?,?)').run(day.id,dispatch.lastInsertRowid,tripNumber,areaId)
  return database.prepare('SELECT * FROM dispatch_trips WHERE id=?').get(result.lastInsertRowid)
}

function ensureUnassignedTrip(database,day){
  const found=database.prepare(`SELECT dt.* FROM dispatch_trips dt JOIN dispatches d ON d.id=dt.dispatch_id WHERE dt.dispatch_day_id=? AND dt.trip_number=0 AND d.vehicle_id IS NULL`).get(day.id)
  if(found)return found
  const dispatch=database.prepare("INSERT INTO dispatches(dispatch_date,status) VALUES(?,'draft')").run(day.dispatch_date)
  const result=database.prepare('INSERT INTO dispatch_trips(dispatch_day_id,dispatch_id,trip_number,area_id) VALUES(?,?,0,NULL)').run(day.id,dispatch.lastInsertRowid)
  return database.prepare('SELECT * FROM dispatch_trips WHERE id=?').get(result.lastInsertRowid)
}

function branchZoneSnapshot(database,branchId){return database.prepare(`SELECT a.id areaId,a.name areaName,COALESCE(a.confirmed_zone_group_id,a.zone_group_id) zoneGroupId,z.name zoneGroupName FROM branches b LEFT JOIN areas a ON a.id=b.area_id LEFT JOIN zone_groups z ON z.id=COALESCE(a.confirmed_zone_group_id,a.zone_group_id) WHERE b.id=?`).get(branchId)||{}}

function ensureVehicleTrip(database,day,vehicleId,tripNumber){
  const found=database.prepare(`SELECT dt.* FROM dispatch_trips dt JOIN dispatches d ON d.id=dt.dispatch_id WHERE dt.dispatch_day_id=? AND d.vehicle_id=? AND dt.trip_number=?`).get(day.id,vehicleId,tripNumber)
  if(found)return found
  const vehicle=database.prepare("SELECT * FROM vehicles WHERE id=? AND operational_status IN ('available','active') AND status IN ('available','assigned') AND (is_temporary=0 OR temporary_date=?)").get(vehicleId,day.dispatch_date)
  if(!vehicle)throw new Error('Vehicle is not available for this date')
  const dispatch=database.prepare("INSERT INTO dispatches(dispatch_date,vehicle_id,status) VALUES(?,?,'draft')").run(day.dispatch_date,vehicleId)
  const result=database.prepare('INSERT INTO dispatch_trips(dispatch_day_id,dispatch_id,trip_number,area_id) VALUES(?,?,?,NULL)').run(day.id,dispatch.lastInsertRowid,tripNumber)
  return database.prepare('SELECT * FROM dispatch_trips WHERE id=?').get(result.lastInsertRowid)
}

function addScheduledStop(database, day, schedule, occurrenceSource='recurrence') {
  if (!schedule.branch_id) return {created:false,result:'Skipped',code:'SCHEDULE_BRANCH_MISSING'}
  const exists=findBranchServiceDateStop(database,schedule.branch_id,day.dispatch_date)
  if(exists){if(Number(exists.source_schedule_id)!==Number(schedule.id))recordDuplicateDiagnostic(database,day,{existing:exists,branchId:schedule.branch_id,serviceDate:day.dispatch_date,attemptedScheduleId:schedule.id,entryPoint:occurrenceSource});return duplicateResult(exists,{branchId:schedule.branch_id,serviceDate:day.dispatch_date,attemptedScheduleId:schedule.id,entryPoint:occurrenceSource})}
  const previousOccurrence=database.prepare('SELECT * FROM schedule_occurrences WHERE schedule_id=? AND planned_date=?').get(schedule.id,day.dispatch_date)
  if(previousOccurrence?.status==='cancelled')database.prepare("UPDATE schedule_occurrences SET branch_id=?,occurrence_source=?,status='planned',dispatch_stop_id=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(schedule.branch_id,occurrenceSource,previousOccurrence.id)
  else if(previousOccurrence)return{created:false,result:'Already Exists',code:'SCHEDULE_OCCURRENCE_EXISTS',existingOccurrenceId:previousOccurrence.id,existingStopId:previousOccurrence.dispatch_stop_id??null}
  else{
    const occurrence=database.prepare('INSERT OR IGNORE INTO schedule_occurrences(schedule_id,branch_id,planned_date,occurrence_source) VALUES(?,?,?,?)').run(schedule.id,schedule.branch_id,day.dispatch_date,occurrenceSource)
    if(!occurrence.changes){const other=database.prepare("SELECT * FROM schedule_occurrences WHERE branch_id=? AND planned_date=? AND status<>'cancelled' ORDER BY id LIMIT 1").get(schedule.branch_id,day.dispatch_date);return{created:false,result:'Already Exists',code:'DUPLICATE_BRANCH_SERVICE_DATE',branchId:schedule.branch_id,serviceDate:day.dispatch_date,existingOccurrenceId:other?.id??null,existingScheduleId:other?.schedule_id??null,attemptedScheduleId:schedule.id}}
  }
  const trip=ensureUnassignedTrip(database,day)
  const sequence=database.prepare('SELECT COALESCE(MAX(stop_sequence),0)+1 value FROM dispatch_stops WHERE dispatch_id=?').get(trip.dispatch_id).value
  const snapshot=branchZoneSnapshot(database,schedule.branch_id)
  const estimatedWeightKg=latestExistingEstimatedWeight(database,schedule.branch_id)
  const stop=database.prepare(`INSERT INTO dispatch_stops(dispatch_id,branch_id,stop_sequence,status,dispatch_trip_id,source_schedule_id,service_date,dedupe_enforced,estimated_weight_kg,zone_group_id_snapshot,zone_group_name_snapshot,area_name_snapshot)
    VALUES(?,?,?,'locked',?,?,?,1,?,?,?,?)`).run(trip.dispatch_id,schedule.branch_id,sequence,trip.id,schedule.id,day.dispatch_date,estimatedWeightKg,snapshot.zoneGroupId??null,snapshot.zoneGroupName??'待确认',snapshot.areaName??'未分区')
  database.prepare("UPDATE schedule_occurrences SET dispatch_stop_id=?,status='generated',updated_at=CURRENT_TIMESTAMP WHERE schedule_id=? AND planned_date=?").run(stop.lastInsertRowid,schedule.id,day.dispatch_date)
  if(schedule.recurrence_type)database.prepare('UPDATE branch_schedules SET next_collection_date=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(nextCollectionDate(schedule,addDays(day.dispatch_date,1)),schedule.id)
  return {created:true,result:'Created',stopId:Number(stop.lastInsertRowid),scheduleId:schedule.id,branchId:schedule.branch_id,serviceDate:day.dispatch_date}
}

function generateRange({startDate=iso(),generatedBy='Supervisor',count=7}={}, database=defaultDb) {
  const start=iso(startDate)
  database.exec('BEGIN IMMEDIATE')
  try {
    assertRouteGenerationReady(database)
    database.prepare(`INSERT INTO weekly_dispatch_plans(week_start,generated_by) VALUES(?,?) ON CONFLICT(week_start) DO NOTHING`).run(start,actor(generatedBy))
    const plan=database.prepare('SELECT * FROM weekly_dispatch_plans WHERE week_start=?').get(start)
    let createdStops=0,reusedStops=0,duplicateStops=[],protectedDays=[]
    for(let offset=0;offset<count;offset+=1){
      const date=addDays(start,offset)
      database.prepare(`INSERT OR IGNORE INTO dispatch_days(weekly_plan_id,dispatch_date) VALUES(?,?)`).run(plan.id,date)
      const day=dayByDate(database,date)
      const protectedReason=protectedDayReason(database,day)
      if(protectedReason){protectedDays.push({date,reason:protectedReason,status:day.status});continue}
      const schedules=database.prepare(`SELECT s.*,b.area_id FROM branch_schedules s JOIN branches b ON b.id=s.branch_id LEFT JOIN customers c ON c.id=b.customer_id WHERE s.is_active=1 AND b.is_active=1 AND COALESCE(c.is_active,1)=1 AND LOWER(TRIM(COALESCE(b.collection_frequency,''))) NOT IN ('on call','paused')`).all()
      for(const schedule of schedules) if(scheduleMatchesDate(schedule,date)){const result=addScheduledStop(database,day,schedule);if(result.created)createdStops+=1;else{reusedStops+=1;if(result.code==='DUPLICATE_BRANCH_SERVICE_DATE'&&Number(result.existingScheduleId)!==Number(result.attemptedScheduleId))duplicateStops.push(result)}}
      const additions=database.prepare(`SELECT s.*,b.area_id FROM schedule_exceptions e JOIN branch_schedules s ON s.id=e.schedule_id LEFT JOIN branches b ON b.id=s.branch_id WHERE e.target_date=? AND e.exception_type IN ('move_date','add_extra_collection','customer_request')`).all(date)
      for(const schedule of additions){const result=addScheduledStop(database,day,schedule,'exception');if(result.created)createdStops+=1;else{reusedStops+=1;if(result.code==='DUPLICATE_BRANCH_SERVICE_DATE'&&Number(result.existingScheduleId)!==Number(result.attemptedScheduleId))duplicateStops.push(result)}}
      const removals=database.prepare(`SELECT schedule_id FROM schedule_exceptions WHERE original_date=? AND exception_type IN ('move_date','cancel_date','pause_once')`).all(date)
      for(const item of removals){
        database.prepare("UPDATE schedule_occurrences SET dispatch_stop_id=NULL,status='cancelled',updated_at=CURRENT_TIMESTAMP WHERE schedule_id=? AND planned_date=?").run(item.schedule_id,date)
        database.prepare(`UPDATE dispatch_stops SET status='cancelled',superseded_reason='Schedule exception',superseded_at=CURRENT_TIMESTAMP,superseded_by='System' WHERE source_schedule_id=? AND dispatch_trip_id IN(SELECT id FROM dispatch_trips WHERE dispatch_day_id=?) AND status<>'completed'`).run(item.schedule_id,day.id)
      }
    }
    database.exec('COMMIT')
    return {weekStart:start,dayCount:count,createdStops,reusedStops,protectedDays,duplicateStops,...(count===1?{day:getDispatchDay(start,database)}:getDispatchWeek({startDate:start},database))}
  } catch(error){database.exec('ROLLBACK');throw error}
}
export function generateWeek(payload={},database=defaultDb){return generateRange({...payload,count:7},database)}
export function generateDay(payload={},database=defaultDb){return generateRange({...payload,count:1},database)}

function stopRows(database, dayId) {
  return database.prepare(`SELECT ds.id,ds.stop_sequence stopSequence,ds.sequence_locked sequenceLocked,ds.estimated_weight_kg estimatedWeightKg,
    ds.source_special_request_id specialRequestId,b.jodoo_branch_id branchId,b.branch_name branchName,c.name customerName,c.payment_type paymentType,c.occ_price occPrice,
    b.area_id areaId,COALESCE(ds.area_name_snapshot,a.name) area,COALESCE(ds.zone_group_id_snapshot,a.zone_group_id) zoneGroupId,COALESCE(ds.zone_group_name_snapshot,z.name,'待确认') zoneGroup,z.sort_order zoneSortOrder,b.latitude,b.longitude,b.time_restriction timeRestriction,
    dt.id tripId,dt.trip_number tripNumber,d.vehicle_id vehicleId,v.vehicle_code vehicle,d.driver_id driverId,dr.name driver,d.assistant_id assistantId,asst.name assistant
    FROM dispatch_stops ds JOIN dispatch_trips dt ON dt.id=ds.dispatch_trip_id JOIN dispatches d ON d.id=dt.dispatch_id
    JOIN branches b ON b.id=ds.branch_id LEFT JOIN customers c ON c.id=b.customer_id LEFT JOIN areas a ON a.id=b.area_id LEFT JOIN zone_groups z ON z.id=a.zone_group_id
    LEFT JOIN vehicles v ON v.id=d.vehicle_id LEFT JOIN employees dr ON dr.id=d.driver_id LEFT JOIN employees asst ON asst.id=d.assistant_id
    WHERE dt.dispatch_day_id=? AND ds.status<>'cancelled' ORDER BY dt.trip_number,ds.stop_sequence`).all(dayId)
}

function dayView(database, day) {
  const stops=stopRows(database,day.id)
  const allTrips=database.prepare(`SELECT dt.id,dt.trip_number tripNumber,dt.estimated_weight_kg estimatedWeightKg,a.name area,d.vehicle_id vehicleId,v.vehicle_code vehicle,
    d.driver_id driverId,dr.name driver,d.assistant_id assistantId,asst.name assistant,d.start_location_id startLocationId,d.end_location_id endLocationId,sl.name startLocation,el.name endLocation
    FROM dispatch_trips dt JOIN dispatches d ON d.id=dt.dispatch_id LEFT JOIN areas a ON a.id=dt.area_id LEFT JOIN vehicles v ON v.id=d.vehicle_id
    LEFT JOIN employees dr ON dr.id=d.driver_id LEFT JOIN employees asst ON asst.id=d.assistant_id LEFT JOIN operational_locations sl ON sl.id=d.start_location_id
    LEFT JOIN operational_locations el ON el.id=d.end_location_id WHERE dt.dispatch_day_id=? ORDER BY dt.trip_number,a.name`).all(day.id)
  const specials=database.prepare(`SELECT id,request_type requestType,temporary_customer_name customerName,requested_collection_date requestedDate,scheduled_date scheduledDate,
    status,promised_to_customer promisedToCustomer,estimated_weight_kg estimatedWeightKg,vehicle_id vehicleId,trip_number tripNumber,linked_customer_id customerId,linked_branch_id branchId,occ_price occPrice,payment_type paymentType,address,location_link locationLink,temporary_latitude latitude,temporary_longitude longitude
    FROM special_collection_requests WHERE scheduled_date=? AND status NOT IN ('rejected','cancelled')`).all(day.dispatch_date)
  const vehicles=database.prepare(`SELECT v.id,v.vehicle_code vehicle,v.vehicle_name vehicleName,v.registration_number registrationNumber,v.capacity_kg capacityKg,
    v.operational_status status,v.is_common isCommon,v.is_temporary isTemporary,v.temporary_date temporaryDate,v.default_base_location_id defaultBaseLocationId,base.name defaultBase,
    (SELECT GROUP_CONCAT(a.name,'|') FROM vehicle_preferred_areas vpa JOIN areas a ON a.id=vpa.area_id WHERE vpa.vehicle_id=v.id) preferredAreaNames
    FROM vehicles v LEFT JOIN operational_locations base ON base.id=v.default_base_location_id
    WHERE v.operational_status IN ('available','active') AND v.status IN ('available','assigned') AND (v.is_temporary=0 OR v.temporary_date=?) ORDER BY v.is_temporary,COALESCE(v.official_sequence,999),v.vehicle_code`).all(day.dispatch_date).map(item=>({...item,preferredAreas:item.preferredAreaNames?item.preferredAreaNames.split('|'):[]}))
  const availableIds=new Set(vehicles.map(item=>item.id)),assignedTrips=allTrips.filter(item=>item.vehicleId&&availableIds.has(item.vehicleId))
  const assistantRows=database.prepare(`SELECT dva.vehicle_id vehicleId,e.id,e.employee_code employeeCode,e.name FROM dispatch_vehicle_assistants dva JOIN employees e ON e.id=dva.employee_id WHERE dva.dispatch_day_id=? ORDER BY e.name`).all(day.id)
  const boardVehicles=vehicles.filter(vehicle=>vehicle.isCommon||assignedTrips.some(item=>item.vehicleId===vehicle.id))
  const vehicleBoards=boardVehicles.map(vehicle=>{
    const vehicleTrips=assignedTrips.filter(item=>item.vehicleId===vehicle.id),basis=vehicleTrips.find(item=>item.driverId||item.assistantId||item.startLocationId||item.endLocationId)||vehicleTrips[0]||{}
    const slots=[1,2,3].map(tripNumber=>{const trip=vehicleTrips.find(item=>item.tripNumber===tripNumber),tripStops=trip?stops.filter(stop=>stop.tripId===trip.id):[],weighted=tripStops.filter(stop=>stop.estimatedWeightKg!=null);return{tripNumber,tripId:trip?.id??null,stops:tripStops,stopCount:tripStops.length,estimatedWeightKg:weighted.reduce((sum,stop)=>sum+Number(stop.estimatedWeightKg),0),weightedStopCount:weighted.length,missingWeightCount:tripStops.length-weighted.length}})
    const areas=[...new Set(slots.flatMap(slot=>slot.stops.map(stop=>stop.area).filter(Boolean)))]
    const assistants=assistantRows.filter(item=>item.vehicleId===vehicle.id)
    if(!assistants.length&&basis.assistantId)assistants.push({id:basis.assistantId,name:basis.assistant,employeeCode:null,vehicleId:vehicle.id})
    return{...vehicle,driverId:basis.driverId??null,driver:basis.driver??null,assistantIds:assistants.map(item=>item.id),assistants,startLocationId:basis.startLocationId??null,startLocation:basis.startLocation??null,endLocationId:basis.endLocationId??null,endLocation:basis.endLocation??null,areas,slots,customerCount:slots.reduce((sum,slot)=>sum+slot.stopCount,0),estimatedWeightKg:slots.reduce((sum,slot)=>sum+slot.estimatedWeightKg,0),weightedStopCount:slots.reduce((sum,slot)=>sum+slot.weightedStopCount,0),missingWeightCount:slots.reduce((sum,slot)=>sum+slot.missingWeightCount,0)}
  })
  const unassignedStops=stops.filter(stop=>!stop.vehicleId||!availableIds.has(stop.vehicleId))
  const unassignedGroups=[...new Map(unassignedStops.map(stop=>[stop.areaId??'unassigned',{areaId:stop.areaId??null,areaName:stop.area||'未分区',zoneGroupId:stop.zoneGroupId??'pending',zoneGroupName:stop.zoneGroup||'待确认',zoneSortOrder:stop.zoneSortOrder??9999}])).values()].map(group=>{
    const groupedStops=unassignedStops.filter(stop=>(stop.areaId??null)===group.areaId),weights=groupedStops.filter(stop=>stop.estimatedWeightKg!=null)
    return{...group,customerCount:groupedStops.length,estimatedWeightKg:weights.reduce((sum,stop)=>sum+Number(stop.estimatedWeightKg),0),weightedCustomerCount:weights.length,
      missingGpsCount:groupedStops.filter(stop=>!Number.isFinite(stop.latitude)||!Number.isFinite(stop.longitude)||stop.latitude===0||stop.longitude===0).length,
      timeRestrictionCount:groupedStops.filter(stop=>Boolean(String(stop.timeRestriction||'').trim())).length,stops:groupedStops}
  }).sort((a,b)=>a.areaName.localeCompare(b.areaName))
  const unassignedZones=[...new Map(unassignedGroups.map(group=>[group.zoneGroupId,{zoneGroupId:group.zoneGroupId,zoneGroupName:group.zoneGroupName}])).values()].map(zone=>{
    const areas=unassignedGroups.filter(group=>group.zoneGroupId===zone.zoneGroupId),zoneStops=areas.flatMap(group=>group.stops)
    return{...zone,areaCount:areas.length,customerCount:zoneStops.length,estimatedWeightKg:areas.reduce((sum,group)=>sum+group.estimatedWeightKg,0),weightedCustomerCount:areas.reduce((sum,group)=>sum+group.weightedCustomerCount,0),
      missingGpsCount:areas.reduce((sum,group)=>sum+group.missingGpsCount,0),timeRestrictionCount:areas.reduce((sum,group)=>sum+group.timeRestrictionCount,0),stops:zoneStops,areas}
  }).sort((a,b)=>a.zoneSortOrder-b.zoneSortOrder||String(a.zoneGroupName).localeCompare(String(b.zoneGroupName)))
  const weightedStops=stops.filter(stop=>stop.estimatedWeightKg!=null),missingGpsCount=stops.filter(stop=>!Number.isFinite(stop.latitude)||!Number.isFinite(stop.longitude)||stop.latitude===0||stop.longitude===0).length,timeRestrictionCount=stops.filter(stop=>Boolean(String(stop.timeRestriction||'').trim())).length,missingWeightCount=stops.length-weightedStops.length
  const warningCount=missingGpsCount+missingWeightCount+timeRestrictionCount+vehicleBoards.filter(board=>board.customerCount>0&&!board.driverId).length+specials.filter(x=>x.requestType==='potential_new'&&newCustomerMissing(x).length).length
  const previewSummary={stopCount:stops.length,estimatedWeightKg:weightedStops.reduce((sum,stop)=>sum+Number(stop.estimatedWeightKg),0),weightedStopCount:weightedStops.length,missingWeightCount,missingGpsCount,timeRestrictionCount,unassignedCount:unassignedStops.length,warningCount}
  const approval=database.prepare("SELECT actor approvedBy,created_at approvedAt,reason approvalReason FROM dispatch_approvals WHERE dispatch_day_id=? AND action IN ('approve','reapprove') ORDER BY id DESC LIMIT 1").get(day.id)||{}
  return {...day,...approval,stops,trips:assignedTrips,vehicleBoards,unassignedStops,unassignedGroups,unassignedZones,specialRequests:specials,warningCount,previewSummary,legacyUnassignedTripCount:allTrips.filter(item=>!item.vehicleId).length}
}

const resourceOptions=(database)=>({
  vehicles:database.prepare(`SELECT v.id,v.vehicle_code vehicleCode,v.vehicle_name vehicleName,v.registration_number registrationNumber,v.capacity_kg capacityKg,v.operational_status status,v.is_common isCommon,
    v.is_temporary isTemporary,v.temporary_date temporaryDate,v.default_base_location_id defaultBaseLocationId,base.name defaultBase,
    (SELECT GROUP_CONCAT(a.name,'|') FROM vehicle_preferred_areas vpa JOIN areas a ON a.id=vpa.area_id WHERE vpa.vehicle_id=v.id) preferredAreaNames
    FROM vehicles v LEFT JOIN operational_locations base ON base.id=v.default_base_location_id ORDER BY v.operational_status='sold',v.is_temporary,COALESCE(v.official_sequence,999),v.vehicle_code`).all().map(item=>({...item,preferredAreas:item.preferredAreaNames?item.preferredAreaNames.split('|'):[]})),
  employees:database.prepare(`SELECT e.id,e.employee_code employeeCode,e.name,e.job_role role,e.employment_status employmentStatus,e.is_active isActive,
    e.default_base_location_id defaultBaseLocationId,base.name defaultBase,e.default_area_id defaultAreaId,a.name defaultArea,GROUP_CONCAT(CASE WHEN r.is_active=1 THEN r.role END,'|') additionalRoles
    FROM employees e LEFT JOIN operational_locations base ON base.id=e.default_base_location_id LEFT JOIN areas a ON a.id=e.default_area_id LEFT JOIN employee_job_roles r ON r.employee_id=e.id
    WHERE e.is_active=1 AND e.employment_status='active' GROUP BY e.id ORDER BY e.name`).all().map(item=>({...item,additionalRoles:item.additionalRoles?item.additionalRoles.split('|'):[]})),
  locations:database.prepare('SELECT id,name,can_start canStart,can_end canEnd FROM operational_locations WHERE is_active=1 ORDER BY name').all(),
  areas:database.prepare('SELECT a.id,a.name,a.zone_group_id zoneGroupId,z.name zoneGroup FROM areas a JOIN zone_groups z ON z.id=a.zone_group_id WHERE a.is_active=1 ORDER BY z.sort_order,a.name').all(),
  zoneGroups:database.prepare('SELECT id,code,name,sort_order sortOrder FROM zone_groups WHERE is_active=1 ORDER BY sort_order,id').all()
})

export function getDispatchWeek({startDate=iso()}={},database=defaultDb){
  const start=iso(startDate),end=addDays(start,6)
  const days=database.prepare('SELECT * FROM dispatch_days WHERE dispatch_date BETWEEN ? AND ? ORDER BY dispatch_date').all(start,end).map(day=>dayView(database,day))
  return {startDate:start,endDate:end,days,...resourceOptions(database)}
}
export function getDispatchDay(date,database=defaultDb){const day=dayByDate(database,iso(date));return day?{...dayView(database,day),...resourceOptions(database)}:null}

export function promisedCheck(date,database=defaultDb){
  const target=iso(date)
  const promised=database.prepare(`SELECT * FROM special_collection_requests WHERE promised_to_customer=1 AND requested_collection_date=? AND status NOT IN ('rejected','cancelled','completed')`).all(target)
  const issues=[]
  for(const r of promised){
    if(!r.scheduled_date)issues.push({requestId:r.id,code:'PROMISED_NOT_SCHEDULED',message:'已承诺客户尚未安排'})
    else if(r.scheduled_date!==target)issues.push({requestId:r.id,code:'PROMISED_WRONG_DATE',message:'已承诺客户安排日期不正确'})
  }
  return {date:target,ok:issues.length===0,issues}
}

function newCustomerMissing(request){
  const missing=[]
  if(!request.customerId&&!request.linked_customer_id)missing.push('CustomerID')
  if(!request.branchId&&!request.linked_branch_id)missing.push('BranchID')
  if(request.occPrice==null&&request.occ_price==null)missing.push('OCC Price')
  if(!request.paymentType&&!request.payment_type)missing.push('Payment Type')
  if(!(request.address||request.locationLink||request.location_link||(request.latitude??request.temporary_latitude)!=null))missing.push('Address or Location')
  return missing
}

export function publicationCheck(date,database=defaultDb){
  const view=getDispatchDay(date,database);if(!view)return {ok:false,issues:[{code:'DAY_NOT_FOUND',message:'当天草稿不存在'}]}
  const issues=[]
  if(view.unassignedStops.length)issues.push({code:'UNASSIGNED_CUSTOMERS',message:`还有 ${view.unassignedStops.length} 位客户在未分配客户池`})
  for(const board of view.vehicleBoards)if(board.customerCount>0&&!board.driverId)issues.push({code:'DRIVER_MISSING',vehicleId:board.id,message:`${board.vehicle} 尚未分配司机`})
  for(const stop of view.stops){if(stop.occPrice==null)issues.push({code:'PRICE_MISSING',stopId:stop.id,message:`${stop.branchId} 缺少 OCC Price`});if(!stop.paymentType)issues.push({code:'PAYMENT_TYPE_MISSING',stopId:stop.id,message:`${stop.branchId} 缺少 Payment Type`})}
  for(const request of view.specialRequests)if(request.requestType==='potential_new')for(const field of newCustomerMissing(request))issues.push({code:`NEW_CUSTOMER_${field.toUpperCase().replaceAll(' ','_')}_MISSING`,requestId:request.id,message:`新客户缺少 ${field}`})
  return {ok:issues.length===0,issues,promised:promisedCheck(date,database)}
}

export function dailyApprovalCheck(date,database=defaultDb){
  const serviceDate=iso(date),day=dayByDate(database,serviceDate);if(!day)return{ok:false,date:serviceDate,issues:[{code:'DAY_NOT_FOUND',message:'Dispatch day not found.'}],warnings:[]}
  const rows=database.prepare(`SELECT ds.id stopId,ds.branch_id branchId,ds.stop_sequence sequence,ds.status stopStatus,ds.estimated_weight_kg estimatedWeightKg,
    ds.source_schedule_id sourceScheduleId,b.jodoo_branch_id branchCode,b.branch_name branchName,b.is_active branchActive,b.status branchStatus,b.latitude,b.longitude,b.time_restriction timeRestriction,
    dt.id tripId,dt.trip_number tripNumber,d.id dispatchId,d.status dispatchStatus,d.vehicle_id vehicleId,v.vehicle_code vehicleCode,v.operational_status vehicleOperationalStatus,v.status vehicleStatus,
    COALESCE(s.is_active,1) scheduleActive FROM dispatch_stops ds JOIN dispatch_trips dt ON dt.id=ds.dispatch_trip_id JOIN dispatches d ON d.id=ds.dispatch_id
    JOIN branches b ON b.id=ds.branch_id LEFT JOIN vehicles v ON v.id=d.vehicle_id LEFT JOIN branch_schedules s ON s.id=ds.source_schedule_id
    WHERE dt.dispatch_day_id=? AND ds.status<>'cancelled' ORDER BY d.vehicle_id,dt.trip_number,ds.stop_sequence,ds.id`).all(day.id)
  const issues=[],warnings=[]
  if(!['draft','reapproval_required'].includes(day.status))issues.push({code:'DAY_NOT_DRAFT',message:`The route is ${day.status} and cannot be approved.`})
  if(!rows.length)issues.push({code:'NO_DRAFT_STOPS',message:'At least one active Draft Stop is required.'})
  for(const row of rows){
    if(!row.vehicleId)issues.push({code:'UNASSIGNED_STOP',stopId:row.stopId,message:`Stop ${row.stopId} is still Unassigned.`})
    else if(!['available','active'].includes(row.vehicleOperationalStatus)||!['available','assigned'].includes(row.vehicleStatus))issues.push({code:'VEHICLE_INACTIVE',stopId:row.stopId,vehicleId:row.vehicleId,message:`Stop ${row.stopId} does not use an Active vehicle.`})
    if(![1,2,3].includes(Number(row.tripNumber)))issues.push({code:'TRIP_INVALID',stopId:row.stopId,message:`Stop ${row.stopId} has an invalid Trip.`})
    if(row.branchActive!==1||String(row.branchStatus).toLowerCase()!=='active')issues.push({code:'BRANCH_INACTIVE',stopId:row.stopId,branchId:row.branchCode,message:`${row.branchName||row.branchCode} is inactive.`})
    if(row.sourceScheduleId&&row.scheduleActive!==1)issues.push({code:'SCHEDULE_SUPERSEDED',stopId:row.stopId,scheduleId:row.sourceScheduleId,message:`Stop ${row.stopId} belongs to a Superseded Schedule.`})
    if(row.dispatchStatus!=='draft')issues.push({code:'DISPATCH_PROTECTED',stopId:row.stopId,dispatchId:row.dispatchId,message:`Dispatch ${row.dispatchId} is ${row.dispatchStatus}.`})
    if(!Number.isFinite(row.latitude)||!Number.isFinite(row.longitude)||row.latitude===0||row.longitude===0)warnings.push({code:'GPS_MISSING',stopId:row.stopId,message:`${row.branchName||row.branchCode}: GPS missing.`})
    if(row.estimatedWeightKg==null)warnings.push({code:'WEIGHT_MISSING',stopId:row.stopId,message:`${row.branchName||row.branchCode}: estimated weight not set.`})
    if(String(row.timeRestriction||'').trim())warnings.push({code:'TIME_RESTRICTION',stopId:row.stopId,message:`${row.branchName||row.branchCode}: time restriction applies.`})
  }
  const tripGroups=new Map()
  for(const row of rows.filter(item=>item.vehicleId)){const key=`${row.vehicleId}:${row.tripId}`,group=tripGroups.get(key)||[];group.push(row);tripGroups.set(key,group)}
  for(const group of tripGroups.values()){const sequences=group.map(item=>Number(item.sequence)).sort((a,b)=>a-b),expected=sequences.map((_,index)=>index+1);if(sequences.some((value,index)=>value!==expected[index]))issues.push({code:'SEQUENCE_INVALID',vehicleId:group[0].vehicleId,tripId:group[0].tripId,stopIds:group.map(item=>item.stopId),message:`Vehicle ${group[0].vehicleCode} Trip ${group[0].tripNumber} sequence must be continuous from 1.`})}
  const duplicates=database.prepare(`SELECT ds.branch_id branchId,COUNT(*) count,GROUP_CONCAT(ds.id) stopIds FROM dispatch_stops ds JOIN dispatch_trips dt ON dt.id=ds.dispatch_trip_id
    WHERE dt.dispatch_day_id=? AND ds.status IN ('locked','available','active','completed','overridden') GROUP BY ds.branch_id HAVING COUNT(*)>1`).all(day.id)
  for(const duplicate of duplicates)issues.push({code:'DUPLICATE_BRANCH_SERVICE_DATE',branchId:duplicate.branchId,stopIds:String(duplicate.stopIds).split(',').map(Number),message:`Duplicate Branch Service Date for Stops ${duplicate.stopIds}.`})
  const vehicleIds=[...new Set(rows.map(row=>row.vehicleId).filter(Boolean))],weighted=rows.filter(row=>row.estimatedWeightKg!=null)
  return{ok:issues.length===0,date:serviceDate,dayId:day.id,status:day.status,issues,warnings,summary:{stopCount:rows.length,assignedCount:rows.filter(row=>row.vehicleId).length,unassignedCount:rows.filter(row=>!row.vehicleId).length,vehicleCount:vehicleIds.length,vehicleIds,estimatedWeightKg:weighted.reduce((sum,row)=>sum+Number(row.estimatedWeightKg),0),weightedStopCount:weighted.length,missingWeightCount:rows.length-weighted.length,missingGpsCount:warnings.filter(item=>item.code==='GPS_MISSING').length,timeRestrictionCount:warnings.filter(item=>item.code==='TIME_RESTRICTION').length,trips:[...tripGroups.values()].map(group=>({vehicleId:group[0].vehicleId,vehicle:group[0].vehicleCode,tripNumber:group[0].tripNumber,stopCount:group.length,estimatedWeightKg:group.filter(row=>row.estimatedWeightKg!=null).reduce((sum,row)=>sum+Number(row.estimatedWeightKg),0),missingWeightCount:group.filter(row=>row.estimatedWeightKg==null).length}))}}
}

export function approveDay(date,{approvedBy='Supervisor',reason=''}={},database=defaultDb){
  const approvalReason=String(reason||'').trim();if(!approvalReason)throw new Error('Approval reason is required.')
  return withImmediateTransaction(database,()=>{const check=dailyApprovalCheck(date,database);if(!check.ok){const error=new Error(check.issues.map(item=>item.message).join(' '));error.code='DAY_APPROVAL_VALIDATION_FAILED';error.issues=check.issues;throw error}const day=dayByDate(database,iso(date)),before={...day}
    database.prepare("UPDATE dispatch_days SET status='approved',approved_revision=revision,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(day.id)
    database.prepare("INSERT INTO dispatch_approvals(dispatch_day_id,action,revision,actor,reason) VALUES(?,?,?,?,?)").run(day.id,day.status==='reapproval_required'?'reapprove':'approve',day.revision,actor(approvedBy),approvalReason)
    database.prepare(`INSERT INTO dispatch_change_logs(dispatch_day_id,actor,change_type,entity_type,entity_id,before_json,after_json,requires_reapproval) VALUES(?,?,'day_approved','dispatch_day',?,?,?,0)`).run(day.id,actor(approvedBy),String(day.id),json(before),json({...day,status:'approved',approvedRevision:day.revision,reason:approvalReason}))
    return getDispatchDay(date,database)})
}
export function publishDay(date,{publishedBy='Supervisor',promisedExceptionReason=''}={},database=defaultDb){
  const day=dayByDate(database,iso(date));if(!day)throw new Error('Dispatch day not found')
  if(day.status!=='approved'||day.approved_revision!==day.revision)throw new Error('路线必须先按当前版本重新批准')
  const check=publicationCheck(date,database)
  if(check.issues.length)throw new Error(check.issues.map(x=>x.message).join('；'))
  if(!check.promised.ok&&!String(promisedExceptionReason).trim())throw new Error('有已承诺客户未正确安排；请填写发布例外原因')
  database.prepare("UPDATE dispatch_days SET status='published',published_at=CURRENT_TIMESTAMP,published_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(actor(publishedBy),day.id)
  database.prepare("UPDATE dispatches SET status='released',updated_at=CURRENT_TIMESTAMP WHERE id IN(SELECT dispatch_id FROM dispatch_trips WHERE dispatch_day_id=?)").run(day.id)
  database.prepare("INSERT INTO dispatch_approvals(dispatch_day_id,action,revision,actor,reason) VALUES(?,'publish',?,?,?)").run(day.id,day.revision,actor(publishedBy),promisedExceptionReason||null)
  return getDispatchDay(date,database)
}
export function reopenDay(date,{reopenedBy='Supervisor',reason=''}={},database=defaultDb){
  const withdrawalReason=String(reason||'').trim();if(!withdrawalReason)throw new Error('Withdrawal reason is required.')
  return withImmediateTransaction(database,()=>{const day=dayByDate(database,iso(date));if(!day)throw new Error('Dispatch day not found');if(day.status!=='approved')throw new Error(`Only an Approved route can be withdrawn; current status is ${day.status}.`);const before={...day}
    const protectedDispatch=database.prepare("SELECT id,status FROM dispatches WHERE id IN(SELECT dispatch_id FROM dispatch_trips WHERE dispatch_day_id=?) AND status IN ('released','in_progress','completed') LIMIT 1").get(day.id);if(protectedDispatch)throw new Error(`Dispatch ${protectedDispatch.id} is ${protectedDispatch.status} and cannot be withdrawn.`)
    database.prepare("UPDATE dispatch_days SET status='draft',revision=revision+1,approved_revision=NULL,published_at=NULL,published_by=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(day.id)
    database.prepare("INSERT INTO dispatch_approvals(dispatch_day_id,action,revision,actor,reason) VALUES(?,'reopen',?,?,?)").run(day.id,day.revision+1,actor(reopenedBy),withdrawalReason)
    database.prepare(`INSERT INTO dispatch_change_logs(dispatch_day_id,actor,change_type,entity_type,entity_id,before_json,after_json,requires_reapproval) VALUES(?,?,'day_approval_withdrawn','dispatch_day',?,?,?,0)`).run(day.id,actor(reopenedBy),String(day.id),json(before),json({...day,status:'draft',revision:day.revision+1,reason:withdrawalReason}))
    return getDispatchDay(date,database)})
}

export function createStop(payload,database=defaultDb){
  return withImmediateTransaction(database,()=>{
    const serviceDate=iso(payload.date),day=dayByDate(database,serviceDate);if(!day)throw new Error('Dispatch day not found')
    const branch=database.prepare('SELECT * FROM branches WHERE jodoo_branch_id=?').get(payload.branchId);if(!branch)throw new Error('Branch not found')
    assertBranchServiceDateAvailable(database,branch.id,serviceDate,{entryPoint:payload.specialRequestId?'special_request':'manual_stop'})
    const trip=payload.tripId?database.prepare('SELECT * FROM dispatch_trips WHERE id=? AND dispatch_day_id=?').get(payload.tripId,day.id):payload.vehicleId?ensureVehicleTrip(database,day,Number(payload.vehicleId),Number(payload.tripNumber||1)):ensureUnassignedTrip(database,day)
    if(!trip)throw new Error('Trip not found')
    const sequence=Number(payload.stopSequence||database.prepare('SELECT COALESCE(MAX(stop_sequence),0)+1 value FROM dispatch_stops WHERE dispatch_id=?').get(trip.dispatch_id).value),snapshot=branchZoneSnapshot(database,branch.id)
    const result=database.prepare(`INSERT INTO dispatch_stops(dispatch_id,branch_id,stop_sequence,status,dispatch_trip_id,source_special_request_id,service_date,dedupe_enforced,estimated_weight_kg,sequence_locked,zone_group_id_snapshot,zone_group_name_snapshot,area_name_snapshot) VALUES(?,?,?,'locked',?,?,?,1,?,?,?,?,?)`).run(trip.dispatch_id,branch.id,sequence,trip.id,payload.specialRequestId||null,serviceDate,payload.estimatedWeightKg??null,payload.sequenceLocked?1:0,snapshot.zoneGroupId??null,snapshot.zoneGroupName??'待确认',snapshot.areaName??'未分区')
    invalidateDispatchDay(database,day.dispatch_date,'stop_added','dispatch_stop',result.lastInsertRowid,null,payload,payload.changedBy)
    return database.prepare('SELECT * FROM dispatch_stops WHERE id=?').get(result.lastInsertRowid)
  })
}

export function createTrip(payload,database=defaultDb){
  const day=dayByDate(database,iso(payload.date));if(!day)throw new Error('Dispatch day not found')
  const next=Number(payload.tripNumber||database.prepare('SELECT COALESCE(MAX(trip_number),0)+1 value FROM dispatch_trips WHERE dispatch_day_id=?').get(day.id).value)
  const trip=ensureTrip(database,day,payload.areaId??null,next)
  invalidateDispatchDay(database,day.dispatch_date,'trip_added','dispatch_trip',trip.id,null,payload,payload.changedBy)
  return trip
}

export function updateStop(id,payload,database=defaultDb){
  const before=database.prepare(`SELECT ds.*,dd.dispatch_date FROM dispatch_stops ds JOIN dispatch_trips dt ON dt.id=ds.dispatch_trip_id JOIN dispatch_days dd ON dd.id=dt.dispatch_day_id WHERE ds.id=?`).get(id);if(!before)throw new Error('Stop not found')
  if(before.sequence_locked&&(payload.tripId!==undefined||payload.vehicleId!==undefined||payload.tripNumber!==undefined||payload.date!==undefined||payload.stopSequence!==undefined||payload.unassigned)&&payload.sequenceLocked!==false)throw new Error('此客户顺序已锁定，请先解除锁定')
  const targetDate=payload.date?iso(payload.date):before.dispatch_date
  return withImmediateTransaction(database,()=>{
    const targetDay=dayByDate(database,targetDate);if(!targetDay)throw new Error('Target dispatch day not found')
    assertBranchServiceDateAvailable(database,before.branch_id,targetDate,{excludeStopId:Number(id),attemptedScheduleId:before.source_schedule_id,entryPoint:'move_stop'})
    let trip=before.dispatch_trip_id
    if(payload.tripId)trip=Number(payload.tripId)
    else if(payload.vehicleId)trip=ensureVehicleTrip(database,targetDay,Number(payload.vehicleId),Math.min(3,Math.max(1,Number(payload.tripNumber||1)))).id
    else if(payload.unassigned)trip=ensureUnassignedTrip(database,targetDay).id
    const tripRow=database.prepare('SELECT * FROM dispatch_trips WHERE id=?').get(trip);if(!tripRow)throw new Error('Trip not found')
    const wanted=Number(payload.stopSequence??(trip===before.dispatch_trip_id?before.stop_sequence:database.prepare('SELECT COALESCE(MAX(stop_sequence),0)+1 value FROM dispatch_stops WHERE dispatch_id=?').get(tripRow.dispatch_id).value))
    database.prepare('UPDATE dispatch_stops SET stop_sequence=-1 WHERE id=?').run(id)
    if(before.dispatch_id===tripRow.dispatch_id){
      if(wanted<before.stop_sequence){database.prepare('UPDATE dispatch_stops SET stop_sequence=stop_sequence+100000 WHERE dispatch_id=? AND stop_sequence>=? AND stop_sequence<?').run(tripRow.dispatch_id,wanted,before.stop_sequence);database.prepare('UPDATE dispatch_stops SET stop_sequence=stop_sequence-99999 WHERE dispatch_id=? AND stop_sequence>=100000').run(tripRow.dispatch_id)}
      if(wanted>before.stop_sequence){database.prepare('UPDATE dispatch_stops SET stop_sequence=stop_sequence+100000 WHERE dispatch_id=? AND stop_sequence>? AND stop_sequence<=?').run(tripRow.dispatch_id,before.stop_sequence,wanted);database.prepare('UPDATE dispatch_stops SET stop_sequence=stop_sequence-100001 WHERE dispatch_id=? AND stop_sequence>=100000').run(tripRow.dispatch_id)}
    }else{
      database.prepare('UPDATE dispatch_stops SET stop_sequence=stop_sequence+100000 WHERE dispatch_id=? AND stop_sequence>?').run(before.dispatch_id,before.stop_sequence);database.prepare('UPDATE dispatch_stops SET stop_sequence=stop_sequence-100001 WHERE dispatch_id=? AND stop_sequence>=100000').run(before.dispatch_id)
      database.prepare('UPDATE dispatch_stops SET stop_sequence=stop_sequence+100000 WHERE dispatch_id=? AND stop_sequence>=?').run(tripRow.dispatch_id,wanted);database.prepare('UPDATE dispatch_stops SET stop_sequence=stop_sequence-99999 WHERE dispatch_id=? AND stop_sequence>=100000').run(tripRow.dispatch_id)
    }
    database.prepare(`UPDATE dispatch_stops SET dispatch_id=?,dispatch_trip_id=?,stop_sequence=?,service_date=?,dedupe_enforced=1,sequence_locked=COALESCE(?,sequence_locked),estimated_weight_kg=COALESCE(?,estimated_weight_kg) WHERE id=?`).run(tripRow.dispatch_id,trip,wanted,targetDate,payload.sequenceLocked==null?null:Number(Boolean(payload.sequenceLocked)),payload.estimatedWeightKg??null,id)
    if(targetDate!==before.dispatch_date){const snapshot=branchZoneSnapshot(database,before.branch_id);database.prepare('UPDATE dispatch_stops SET zone_group_id_snapshot=?,zone_group_name_snapshot=?,area_name_snapshot=? WHERE id=?').run(snapshot.zoneGroupId??null,snapshot.zoneGroupName??'待确认',snapshot.areaName??'未分区',id)}
    if(targetDate!==before.dispatch_date&&!payload.suppressException&&before.source_schedule_id&&!database.prepare("SELECT id FROM schedule_exceptions WHERE schedule_id=? AND exception_type='move_date' AND original_date=? AND target_date=? AND permanent=0").get(before.source_schedule_id,before.dispatch_date,targetDate))database.prepare(`INSERT INTO schedule_exceptions(branch_id,schedule_id,exception_type,original_date,target_date,permanent,reason,created_by) VALUES(?,?,'move_date',?,?,0,?,?)`).run(before.branch_id,before.source_schedule_id,before.dispatch_date,targetDate,payload.reason||'Weekly planner drag-and-drop',actor(payload.changedBy))
    invalidateDispatchDay(database,before.dispatch_date,'stop_updated','dispatch_stop',id,before,payload,payload.changedBy)
    if(targetDate!==before.dispatch_date)invalidateDispatchDay(database,targetDate,'stop_moved_in','dispatch_stop',id,null,payload,payload.changedBy)
    return database.prepare('SELECT * FROM dispatch_stops WHERE id=?').get(id)
  })
}
export function deleteStop(id,{changedBy='Supervisor',reason='Weekly planner removal'}={},database=defaultDb){const before=database.prepare(`SELECT ds.*,dd.dispatch_date FROM dispatch_stops ds JOIN dispatch_trips dt ON dt.id=ds.dispatch_trip_id JOIN dispatch_days dd ON dd.id=dt.dispatch_day_id WHERE ds.id=?`).get(id);if(!before)throw new Error('Stop not found');database.exec('BEGIN IMMEDIATE');try{if(before.source_schedule_id&&!database.prepare("SELECT id FROM schedule_exceptions WHERE schedule_id=? AND exception_type='cancel_date' AND original_date=? AND permanent=0").get(before.source_schedule_id,before.dispatch_date))database.prepare(`INSERT INTO schedule_exceptions(branch_id,schedule_id,exception_type,original_date,permanent,reason,created_by) VALUES(?,?,'cancel_date',?,0,?,?)`).run(before.branch_id,before.source_schedule_id,before.dispatch_date,reason,actor(changedBy));database.prepare('DELETE FROM dispatch_stops WHERE id=?').run(id);invalidateDispatchDay(database,before.dispatch_date,'stop_removed','dispatch_stop',id,before,null,changedBy);database.exec('COMMIT');return{deleted:true,id:Number(id)}}catch(error){database.exec('ROLLBACK');throw error}}

export function updateTrip(id,payload,database=defaultDb){const before=database.prepare(`SELECT dt.*,dd.dispatch_date,d.vehicle_id,d.driver_id,d.assistant_id,d.start_location_id,d.end_location_id FROM dispatch_trips dt JOIN dispatch_days dd ON dd.id=dt.dispatch_day_id JOIN dispatches d ON d.id=dt.dispatch_id WHERE dt.id=?`).get(id);if(!before)throw new Error('Trip not found');database.prepare(`UPDATE dispatches SET vehicle_id=?,driver_id=?,assistant_id=?,start_location_id=?,end_location_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(payload.vehicleId??before.vehicle_id,payload.driverId??before.driver_id,payload.assistantId??before.assistant_id,payload.startLocationId??before.start_location_id,payload.endLocationId??before.end_location_id,before.dispatch_id);database.prepare('UPDATE dispatch_trips SET trip_number=COALESCE(?,trip_number),estimated_weight_kg=COALESCE(?,estimated_weight_kg),updated_at=CURRENT_TIMESTAMP WHERE id=?').run(payload.tripNumber??null,payload.estimatedWeightKg??null,id);invalidateDispatchDay(database,before.dispatch_date,'trip_updated','dispatch_trip',id,before,payload,payload.changedBy);return database.prepare('SELECT * FROM dispatch_trips WHERE id=?').get(id)}

export function assignVehicleDay(date,vehicleId,payload,database=defaultDb){
  const day=dayByDate(database,iso(date));if(!day)throw new Error('Dispatch day not found')
  const before=database.prepare(`SELECT d.driver_id driverId,d.assistant_id assistantId,d.start_location_id startLocationId,d.end_location_id endLocationId FROM dispatch_trips dt JOIN dispatches d ON d.id=dt.dispatch_id WHERE dt.dispatch_day_id=? AND d.vehicle_id=? LIMIT 1`).get(day.id,vehicleId)||{}
  before.assistantIds=database.prepare('SELECT employee_id id FROM dispatch_vehicle_assistants WHERE dispatch_day_id=? AND vehicle_id=? ORDER BY employee_id').all(day.id,vehicleId).map(item=>item.id)
  if(payload.driverId){
    const driver=database.prepare(`SELECT * FROM employees e WHERE id=? AND is_active=1 AND employment_status='active' AND (lower(job_role)='driver' OR EXISTS(SELECT 1 FROM employee_job_roles r WHERE r.employee_id=e.id AND r.role='Driver' AND r.is_active=1))`).get(payload.driverId)
    if(!driver)throw new Error('所选员工不是可用 Driver')
    const conflict=database.prepare(`SELECT v.vehicle_code vehicle FROM dispatch_trips dt JOIN dispatches d ON d.id=dt.dispatch_id JOIN vehicles v ON v.id=d.vehicle_id
      WHERE dt.dispatch_day_id=? AND d.driver_id=? AND d.vehicle_id<>? LIMIT 1`).get(day.id,payload.driverId,vehicleId)
    if(conflict)throw new Error(`该司机当天已分配给 ${conflict.vehicle}，请先解除原分配`)
    const assistantConflict=database.prepare(`SELECT 1 FROM dispatch_vehicle_assistants WHERE dispatch_day_id=? AND employee_id=? LIMIT 1`).get(day.id,payload.driverId)
    if(assistantConflict)throw new Error('该员工当天已担任 Attendant，不能同时担任 Driver')
  }
  const assistantIds=payload.assistantIds===undefined?null:[...new Set((payload.assistantIds||[]).map(Number).filter(Boolean))]
  if(assistantIds)for(const employeeId of assistantIds){if(Number(payload.driverId)===employeeId)throw new Error('同一员工同一天不能同时担任 Driver 与 Attendant');const employee=database.prepare(`SELECT id FROM employees e WHERE id=? AND is_active=1 AND employment_status='active' AND (lower(job_role) IN ('assistant','crew','attendant / crew') OR EXISTS(SELECT 1 FROM employee_job_roles r WHERE r.employee_id=e.id AND r.role='Attendant / Crew' AND r.is_active=1))`).get(employeeId);if(!employee)throw new Error('所选员工不是可用 Assistant/Crew');const driving=database.prepare(`SELECT 1 FROM dispatch_trips dt JOIN dispatches d ON d.id=dt.dispatch_id WHERE dt.dispatch_day_id=? AND d.driver_id=? LIMIT 1`).get(day.id,employeeId);if(driving)throw new Error('该员工当天已担任 Driver，不能同时担任 Attendant');const otherVehicle=database.prepare(`SELECT v.vehicle_code vehicle FROM dispatch_vehicle_assistants dva JOIN vehicles v ON v.id=dva.vehicle_id WHERE dva.dispatch_day_id=? AND dva.employee_id=? AND dva.vehicle_id<>? LIMIT 1`).get(day.id,employeeId,vehicleId);if(otherVehicle)throw new Error(`该跟车员当天已分配给 ${otherVehicle.vehicle}，请先解除原分配`)}
  database.exec('BEGIN IMMEDIATE')
  try{
    if(assistantIds){database.prepare('DELETE FROM dispatch_vehicle_assistants WHERE dispatch_day_id=? AND vehicle_id=?').run(day.id,vehicleId);const insert=database.prepare('INSERT INTO dispatch_vehicle_assistants(dispatch_day_id,vehicle_id,employee_id,employment_period_id) VALUES(?,?,?,?)');for(const employeeId of assistantIds)insert.run(day.id,vehicleId,employeeId,currentEmploymentPeriod(database,employeeId))}
    for(let tripNumber=1;tripNumber<=3;tripNumber+=1){const trip=ensureVehicleTrip(database,day,Number(vehicleId),tripNumber);const dispatch=database.prepare('SELECT * FROM dispatches WHERE id=?').get(trip.dispatch_id),driverId=payload.driverId===undefined?dispatch.driver_id:payload.driverId,assistantId=assistantIds===null?dispatch.assistant_id:(assistantIds[0]||null);database.prepare(`UPDATE dispatches SET driver_id=?,driver_employment_period_id=?,assistant_id=?,assistant_employment_period_id=?,start_location_id=?,end_location_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(driverId,currentEmploymentPeriod(database,driverId),assistantId,currentEmploymentPeriod(database,assistantId),payload.startLocationId===undefined?dispatch.start_location_id:payload.startLocationId,payload.endLocationId===undefined?dispatch.end_location_id:payload.endLocationId,trip.dispatch_id)}
    invalidateDispatchDay(database,day.dispatch_date,'vehicle_assignment_updated','vehicle',vehicleId,before,{...payload,assistantIds},payload.changedBy);database.exec('COMMIT');return getDispatchDay(date,database)
  }catch(error){database.exec('ROLLBACK');throw error}
}

export function transferVehicleDay(date,sourceVehicleId,payload,database=defaultDb){
  const day=dayByDate(database,iso(date));if(!day)throw new Error('Dispatch day not found')
  const targetId=Number(payload.targetVehicleId);if(!targetId||targetId===Number(sourceVehicleId))throw new Error('Please select a different target vehicle')
  const source=database.prepare('SELECT * FROM vehicles WHERE id=?').get(sourceVehicleId),target=database.prepare("SELECT * FROM vehicles WHERE id=? AND operational_status IN ('available','active')").get(targetId)
  if(!source||!target)throw new Error('Source or target vehicle is unavailable')
  const sourceTrips=database.prepare(`SELECT dt.*,d.driver_id,d.assistant_id,d.start_location_id,d.end_location_id FROM dispatch_trips dt JOIN dispatches d ON d.id=dt.dispatch_id WHERE dt.dispatch_day_id=? AND d.vehicle_id=? ORDER BY dt.trip_number,dt.id`).all(day.id,sourceVehicleId)
  if(!sourceTrips.length)throw new Error('Source vehicle has no route to transfer')
  const before={sourceVehicleId:Number(sourceVehicleId),targetVehicleId:targetId,tripIds:sourceTrips.map(item=>item.id),driverId:sourceTrips.find(item=>item.driver_id)?.driver_id??null}
  database.exec('BEGIN IMMEDIATE')
  try{
    for(const sourceTrip of sourceTrips){
      const targetTrip=ensureVehicleTrip(database,day,targetId,sourceTrip.trip_number)
      let sequence=database.prepare('SELECT COALESCE(MAX(stop_sequence),0) value FROM dispatch_stops WHERE dispatch_id=?').get(targetTrip.dispatch_id).value
      const stops=database.prepare('SELECT id FROM dispatch_stops WHERE dispatch_trip_id=? ORDER BY stop_sequence').all(sourceTrip.id)
      for(const stop of stops){sequence+=1;database.prepare('UPDATE dispatch_stops SET dispatch_id=?,dispatch_trip_id=?,stop_sequence=? WHERE id=?').run(targetTrip.dispatch_id,targetTrip.id,sequence,stop.id)}
      if(payload.transferDriver!==false)database.prepare(`UPDATE dispatches SET driver_id=COALESCE(?,driver_id),driver_employment_period_id=COALESCE(?,driver_employment_period_id),assistant_id=COALESCE(?,assistant_id),assistant_employment_period_id=COALESCE(?,assistant_employment_period_id),start_location_id=COALESCE(?,start_location_id),end_location_id=COALESCE(?,end_location_id),updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(sourceTrip.driver_id,currentEmploymentPeriod(database,sourceTrip.driver_id),sourceTrip.assistant_id,currentEmploymentPeriod(database,sourceTrip.assistant_id),sourceTrip.start_location_id,sourceTrip.end_location_id,targetTrip.dispatch_id)
      database.prepare('UPDATE dispatches SET vehicle_id=NULL,driver_id=NULL,assistant_id=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(sourceTrip.dispatch_id)
    }
    if(payload.transferDriver!==false){
      const assistants=database.prepare('SELECT employee_id FROM dispatch_vehicle_assistants WHERE dispatch_day_id=? AND vehicle_id=?').all(day.id,sourceVehicleId)
      const add=database.prepare('INSERT OR IGNORE INTO dispatch_vehicle_assistants(dispatch_day_id,vehicle_id,employee_id,employment_period_id) VALUES(?,?,?,?)')
      for(const item of assistants)add.run(day.id,targetId,item.employee_id,currentEmploymentPeriod(database,item.employee_id))
      database.prepare('DELETE FROM dispatch_vehicle_assistants WHERE dispatch_day_id=? AND vehicle_id=?').run(day.id,sourceVehicleId)
    }
    if(payload.setSourceMaintenance){database.prepare("UPDATE vehicles SET operational_status='maintenance',status='maintenance',updated_at=CURRENT_TIMESTAMP WHERE id=?").run(sourceVehicleId);database.prepare("INSERT INTO vehicle_status_history(vehicle_id,previous_status,new_status,reason,changed_by) VALUES(?,?,'maintenance',?,?)").run(sourceVehicleId,source.operational_status,payload.reason||'Vehicle route transferred due to maintenance',actor(payload.changedBy))}
    invalidateDispatchDay(database,day.dispatch_date,'vehicle_route_transferred','vehicle',sourceVehicleId,before,{targetVehicleId:targetId,transferDriver:payload.transferDriver!==false,setSourceMaintenance:Boolean(payload.setSourceMaintenance),reason:payload.reason||null},payload.changedBy)
    database.exec('COMMIT');return getDispatchDay(date,database)
  }catch(error){database.exec('ROLLBACK');throw error}
}

export function assignAreaStops(date,payload,database=defaultDb){
  const day=dayByDate(database,iso(date));if(!day)throw new Error('Dispatch day not found')
  const stopIds=[...new Set((payload.stopIds||[]).map(Number).filter(Boolean))];if(!stopIds.length)throw new Error('Area 没有可分配客户')
  const placeholders=stopIds.map(()=>'?').join(',')
  const eligible=database.prepare(`SELECT ds.id FROM dispatch_stops ds JOIN dispatch_trips dt ON dt.id=ds.dispatch_trip_id JOIN dispatches d ON d.id=dt.dispatch_id
    LEFT JOIN vehicles v ON v.id=d.vehicle_id WHERE dt.dispatch_day_id=? AND ds.id IN (${placeholders}) AND ds.status<>'cancelled' AND (d.vehicle_id IS NULL OR v.operational_status NOT IN ('available','active') OR v.status NOT IN ('available','assigned') OR (v.is_temporary=1 AND v.temporary_date<>?))`).all(day.id,...stopIds,day.dispatch_date)
  if(eligible.length!==stopIds.length)throw new Error('Area 内有客户已被其他主管分配，请刷新后重试')
  database.exec('BEGIN IMMEDIATE')
  try{
    const trip=ensureVehicleTrip(database,day,Number(payload.vehicleId),Math.min(3,Math.max(1,Number(payload.tripNumber||1))))
    let sequence=database.prepare('SELECT COALESCE(MAX(stop_sequence),0) value FROM dispatch_stops WHERE dispatch_id=?').get(trip.dispatch_id).value
    const move=database.prepare('UPDATE dispatch_stops SET dispatch_id=?,dispatch_trip_id=?,stop_sequence=? WHERE id=?')
    for(const stopId of stopIds){sequence+=1;move.run(trip.dispatch_id,trip.id,sequence,stopId)}
    invalidateDispatchDay(database,day.dispatch_date,'area_assigned','area',payload.areaId??'unassigned',null,{vehicleId:payload.vehicleId,tripNumber:payload.tripNumber||1,stopIds},payload.changedBy)
    database.exec('COMMIT');return getDispatchDay(date,database)
  }catch(error){database.exec('ROLLBACK');throw error}
}

const draftStopById=(database,id)=>database.prepare(`SELECT ds.*,dd.id dispatch_day_id,dd.dispatch_date,dd.status day_status,d.status dispatch_status,
  dt.trip_number,d.vehicle_id,s.jodoo_schedule_id,s.days_of_week schedule_days
  FROM dispatch_stops ds JOIN dispatch_trips dt ON dt.id=ds.dispatch_trip_id JOIN dispatch_days dd ON dd.id=dt.dispatch_day_id
  JOIN dispatches d ON d.id=ds.dispatch_id LEFT JOIN branch_schedules s ON s.id=ds.source_schedule_id WHERE ds.id=?`).get(Number(id))

function assertDraftStopEditable(stop){
  if(!stop)throw new Error('Draft Stop not found.')
  if(stop.day_status!=='draft'||stop.dispatch_status!=='draft'||stop.status==='cancelled')throw new Error(`Stop ${stop.id} is protected and cannot be adjusted.`)
}

function normalizeTripSequences(database,tripIds){
  const update=database.prepare('UPDATE dispatch_stops SET stop_sequence=? WHERE id=?')
  for(const tripId of new Set(tripIds.map(Number).filter(Boolean))){
    const rows=database.prepare("SELECT id FROM dispatch_stops WHERE dispatch_trip_id=? AND status<>'cancelled' ORDER BY stop_sequence,id").all(tripId)
    rows.forEach((row,index)=>update.run(index+1,row.id))
  }
}

/** Saves the supervisor's staged seven-day draft edits as one all-or-nothing change set. */
export function saveDraftAdjustments(payload={},database=defaultDb){
  const adjustments=Array.isArray(payload.adjustments)?payload.adjustments:[]
  const reason=String(payload.reason||'').trim(),changedBy=actor(payload.changedBy)
  if(!adjustments.length)throw new Error('No draft changes were submitted.')
  if(!reason)throw new Error('Reason is required.')
  return withImmediateTransaction(database,()=>{
    const touchedTrips=[],results=[]
    for(const change of adjustments){
      const before=draftStopById(database,change.stopId);assertDraftStopEditable(before)
      const targetDate=iso(change.serviceDate||before.dispatch_date),targetDay=dayByDate(database,targetDate)
      if(!targetDay)throw new Error(`Target dispatch day ${targetDate} was not generated.`)
      const targetProtection=protectedDayReason(database,targetDay);if(targetProtection)throw new Error(`Target date is protected: ${targetProtection}.`)
      const duplicate=findBranchServiceDateStop(database,before.branch_id,targetDate,{excludeStopId:before.id})
      if(duplicate&&Number(duplicate.id)!==Number(before.id))throw new Error(`Duplicate Branch Service Date: existing Stop ${duplicate.id}.`)
      const dateMode=change.dateMode==='recurring'?'recurring':'occurrence'
      if(targetDate!==before.dispatch_date&&dateMode==='recurring'){
        if(!before.source_schedule_id||!before.jodoo_schedule_id)throw new Error(`Stop ${before.id} has no Active Schedule to change.`)
        const weekday=new Date(`${targetDate}T00:00:00Z`).toLocaleDateString('en-US',{weekday:'long',timeZone:'UTC'})
        createScheduleException({scheduleId:before.jodoo_schedule_id,type:'move_date',originalDate:before.dispatch_date,targetDate,permanent:true,dayOfWeek:weekday,reason,createdBy:changedBy},database)
        const delta=Math.round((new Date(`${targetDate}T00:00:00Z`)-new Date(`${before.dispatch_date}T00:00:00Z`))/86400000)
        const selectedIds=new Set(adjustments.map(item=>Number(item.stopId)))
        const future=database.prepare(`SELECT ds.id FROM dispatch_stops ds JOIN dispatch_trips dt ON dt.id=ds.dispatch_trip_id JOIN dispatch_days dd ON dd.id=dt.dispatch_day_id JOIN dispatches d ON d.id=ds.dispatch_id
          WHERE ds.source_schedule_id=? AND ds.id<>? AND ds.status<>'cancelled' AND dd.dispatch_date>? AND dd.status='draft' AND d.status='draft' ORDER BY dd.dispatch_date`).all(before.source_schedule_id,before.id,before.dispatch_date)
        for(const row of future){if(selectedIds.has(Number(row.id)))continue;const futureBefore=draftStopById(database,row.id),futureDate=addDays(futureBefore.dispatch_date,delta),futureDay=dayByDate(database,futureDate);if(!futureDay)continue;assertBranchServiceDateAvailable(database,futureBefore.branch_id,futureDate,{excludeStopId:futureBefore.id,attemptedScheduleId:futureBefore.source_schedule_id,entryPoint:'recurring_draft_move'});touchedTrips.push(futureBefore.dispatch_trip_id);const moved=updateStop(futureBefore.id,{date:futureDate,unassigned:true,suppressException:true,reason,changedBy},database);touchedTrips.push(moved.dispatch_trip_id)}
      }
      touchedTrips.push(before.dispatch_trip_id)
      const updated=updateStop(before.id,{date:targetDate,vehicleId:change.unassigned?undefined:change.vehicleId,tripNumber:change.unassigned?undefined:change.tripNumber,unassigned:Boolean(change.unassigned),stopSequence:change.stopSequence,reason,changedBy},database)
      touchedTrips.push(updated.dispatch_trip_id)
      database.prepare(`INSERT INTO dispatch_change_logs(dispatch_day_id,actor,change_type,entity_type,entity_id,before_json,after_json,requires_reapproval)
        VALUES(?,?,'supervisor_draft_adjustment','dispatch_stop',?,?,?,0)`).run(before.dispatch_day_id,changedBy,String(before.id),json(before),json({...updated,dateMode,reason}))
      results.push({stopId:Number(before.id),dateMode,serviceDate:targetDate,unassigned:Boolean(change.unassigned)})
    }
    normalizeTripSequences(database,touchedTrips)
    return{updated:results.length,results}
  })
}

const driverRouteForbidden=message=>{const error=new Error(message);error.statusCode=403;error.code='PERMISSION_DENIED';return error}

/** Read-only, session-scoped view of the authenticated employee's approved route for today. */
export function driverToday({employeeId,role,today=kuchingDate()}={},database=defaultDb){
  const employee=database.prepare(`SELECT e.id,e.job_role jobRole,e.employment_status employmentStatus,e.is_active isActive,
    EXISTS(SELECT 1 FROM employee_job_roles r WHERE r.employee_id=e.id AND r.role='Driver' AND r.is_active=1) hasDriverRole,
    EXISTS(SELECT 1 FROM employee_job_roles r WHERE r.employee_id=e.id AND r.role='Attendant / Crew' AND r.is_active=1) hasCrewRole
    FROM employees e WHERE e.id=?`).get(Number(employeeId))
  const accountRole=String(role||'').trim().toLowerCase(),jobRole=String(employee?.jobRole||'').trim().toLowerCase()
  if(!employee||!employee.isActive||employee.employmentStatus!=='active')throw driverRouteForbidden('This employee is not active.')
  const isDriver=accountRole==='driver'&&(jobRole==='driver'||Boolean(employee.hasDriverRole))
  const isCrew=accountRole==='crew'&&(['assistant','crew','attendant / crew'].includes(jobRole)||Boolean(employee.hasCrewRole))
  if(!isDriver&&!isCrew)throw driverRouteForbidden('You do not have permission to view a driver route.')
  const date=iso(today),weekday=new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US',{weekday:'long',timeZone:'UTC'}),day=dayByDate(database,date)
  const empty=reason=>({date,weekday,status:day?.status||null,approved:false,routeAvailable:false,reason,trips:[],vehicles:[],totalStops:0,completedStops:0,pendingStops:0})
  if(!day||day.status!=='approved')return empty('NO_APPROVED_ROUTE')
  const assignment=isDriver?'d.driver_id=?':`(d.assistant_id=? OR EXISTS(SELECT 1 FROM dispatch_vehicle_assistants dva WHERE dva.dispatch_day_id=dt.dispatch_day_id AND dva.vehicle_id=d.vehicle_id AND dva.employee_id=?))`
  const params=isDriver?[day.id,Number(employeeId)]:[day.id,Number(employeeId),Number(employeeId)]
  const trips=database.prepare(`SELECT dt.id,dt.trip_number tripNumber,d.vehicle_id vehicleId,v.vehicle_code vehicleCode,v.vehicle_name vehicleName,v.registration_number registrationNumber
    FROM dispatch_trips dt JOIN dispatches d ON d.id=dt.dispatch_id JOIN vehicles v ON v.id=d.vehicle_id
    WHERE dt.dispatch_day_id=? AND ${assignment} AND v.operational_status IN ('available','active') AND v.status IN ('available','assigned')
      AND EXISTS(SELECT 1 FROM dispatch_stops ds JOIN branches bx ON bx.id=ds.branch_id WHERE ds.dispatch_trip_id=dt.id AND ds.status<>'cancelled' AND lower(COALESCE(bx.status,'active'))='active')
    ORDER BY v.vehicle_code,dt.trip_number,dt.id`).all(...params).map(trip=>({...trip,stops:database.prepare(`SELECT ds.id,ds.stop_sequence stopSequence,ds.status,b.jodoo_branch_id branchId,b.branch_name branchName,c.name customerName,b.address,
      COALESCE(ds.area_name_snapshot,a.name) area,b.time_restriction timeRestriction,ds.estimated_weight_kg estimatedWeightKg,
      CASE WHEN b.latitude IS NOT NULL AND b.longitude IS NOT NULL THEN 1 ELSE 0 END gpsAvailable
      FROM dispatch_stops ds JOIN branches b ON b.id=ds.branch_id LEFT JOIN customers c ON c.id=b.customer_id LEFT JOIN areas a ON a.id=b.area_id
      WHERE ds.dispatch_trip_id=? AND ds.status<>'cancelled' AND lower(COALESCE(b.status,'active'))='active'
      ORDER BY ds.stop_sequence,ds.id`).all(trip.id).map(stop=>({...stop,gpsAvailable:Boolean(stop.gpsAvailable)}))}))
  if(!trips.length)return empty('NO_VEHICLE_ASSIGNED')
  const stops=trips.flatMap(trip=>trip.stops),vehicles=[...new Map(trips.map(trip=>[trip.vehicleId,{id:trip.vehicleId,vehicleCode:trip.vehicleCode,vehicleName:trip.vehicleName,registrationNumber:trip.registrationNumber}])).values()]
  return{date,weekday,status:'approved',approved:true,routeAvailable:true,trips,vehicles,totalStops:stops.length,completedStops:stops.filter(stop=>stop.status==='completed').length,pendingStops:stops.filter(stop=>stop.status!=='completed').length}
}

export function createScheduleException(payload,database=defaultDb){
  const schedule=database.prepare('SELECT * FROM branch_schedules WHERE jodoo_schedule_id=?').get(payload.scheduleId);if(!schedule)throw new Error('Schedule not found')
  const type=String(payload.type||'').trim().toLowerCase().replaceAll(' ','_')
  return withImmediateTransaction(database,()=>{
    if(payload.permanent){
      if(!payload.dayOfWeek)throw new Error('Permanent schedule change requires dayOfWeek')
      const delta=payload.originalDate&&payload.targetDate?Math.round((new Date(`${payload.targetDate}T00:00:00Z`)-new Date(`${payload.originalDate}T00:00:00Z`))/86400000):0
      database.prepare("UPDATE branch_schedules SET days_of_week=?,fixed_weekday=CASE WHEN fixed_weekday IS NULL THEN NULL ELSE ? END,anchor_date=CASE WHEN anchor_date IS NULL THEN NULL ELSE date(anchor_date,?) END,effective_date=CASE WHEN effective_date IS NULL THEN NULL ELSE date(effective_date,?) END,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(payload.dayOfWeek,payload.dayOfWeek,`${delta} days`,`${delta} days`,schedule.id)
    }
    const result=database.prepare(`INSERT INTO schedule_exceptions(branch_id,schedule_id,exception_type,original_date,target_date,permanent,reason,created_by) VALUES(?,?,?,?,?,?,?,?)`).run(schedule.branch_id,schedule.id,type,payload.originalDate||null,payload.targetDate||null,payload.permanent?1:0,payload.reason||null,actor(payload.createdBy))
    if(payload.originalDate)invalidateDispatchDay(database,payload.originalDate,payload.permanent?'schedule_permanent_change':'schedule_exception','schedule',schedule.id,schedule,payload,payload.createdBy)
    if(payload.targetDate&&payload.targetDate!==payload.originalDate)invalidateDispatchDay(database,payload.targetDate,'schedule_exception','schedule',schedule.id,null,payload,payload.createdBy)
    return database.prepare('SELECT * FROM schedule_exceptions WHERE id=?').get(result.lastInsertRowid)
  })
}

export function requestDedupeKey(payload){return createHash('sha256').update([payload.existingBranchId||'',payload.requestedCollectionDate||'',payload.phone||'',payload.temporaryCustomerName||''].map(x=>String(x).trim().toLowerCase()).join('|')).digest('hex')}
export { iso, newCustomerMissing }
