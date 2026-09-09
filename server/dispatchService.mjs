import {isRouteTrialDate} from '../shared/routeTrial.js'
import {SUNDAY_GROUPS,isSunday,sundayGroup,sundayDutyRoute,executionRoute,sundaySettings} from './sundayPlanning.mjs'
import {routeScheduleProposals} from './routeSchedulePlanning.mjs'
import { createHash } from 'node:crypto'
import { db as defaultDb } from './database.mjs'
import {addCalendarDays,kuchingDate} from '../shared/kuchingTime.js'
import {nextCollectionDate,scheduleMatchesDate} from '../shared/scheduleRecurrence.js'
import {assertBranchServiceDateAvailable,assertRouteGenerationReady,duplicateResult,findBranchServiceDateStop,recordDuplicateDiagnostic,withImmediateTransaction} from './branchServiceDateGuard.mjs'
import {resolveStartLocation,startLocationOptions,writeStartLocationSnapshot} from './dispatchStartLocationService.mjs'
import {commercialOptions,resolveBuyerPayer,resolvePrimaryEndLocation,writeCommercialSnapshot} from './dispatchCommercialService.mjs'
import {recordOptimizationFeedback} from './routeOptimizationService.mjs'
import {MAX_ASSIGNED_CREW} from '../shared/dispatchRules.js'
import {listDeferRequestsForDay} from './deferApprovalService.mjs'
import {activeRouteDriver,isTemporarySupervisorDriver} from './routeDriverAuthorization.mjs'

const iso = (value = new Date()) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : kuchingDate(value)
const addDays = addCalendarDays
const json = (value) => value == null ? null : JSON.stringify(value)
const actor = (value) => String(value || 'Supervisor')
const currentEmploymentPeriod=(database,employeeId)=>employeeId?database.prepare('SELECT id FROM employee_employment_history WHERE employee_id=? ORDER BY id DESC LIMIT 1').get(employeeId)?.id||null:null
const setFactoryDefault=(database,dispatchId)=>{try{writeStartLocationSnapshot(database,dispatchId,resolveStartLocation({}, {}, database))}catch(error){if(!/Company Yard/.test(error.message))throw error}}

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
  setFactoryDefault(database,dispatch.lastInsertRowid)
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

function branchZoneSnapshot(database,branchId){return database.prepare(`SELECT a.id areaId,a.name areaName,COALESCE(a.confirmed_zone_group_id,a.zone_group_id) zoneGroupId,z.name zoneGroupName,a.default_vehicle_id areaDefaultVehicleId,rta.vehicle_id routeVehicleId,rta.area_order routeAreaOrder,rtb.branch_order routeBranchOrder FROM branches b LEFT JOIN areas a ON a.id=b.area_id LEFT JOIN zone_groups z ON z.id=COALESCE(a.confirmed_zone_group_id,a.zone_group_id) LEFT JOIN route_templates rt ON rt.zone_group_id=z.id AND rt.is_active=1 LEFT JOIN route_template_areas rta ON rta.route_template_id=rt.id AND rta.area_id=a.id LEFT JOIN route_template_branches rtb ON rtb.route_template_id=rt.id AND rtb.branch_id=b.id WHERE b.id=?`).get(branchId)||{}}

function ensureVehicleTrip(database,day,vehicleId,tripNumber){
  const found=database.prepare(`SELECT dt.* FROM dispatch_trips dt JOIN dispatches d ON d.id=dt.dispatch_id WHERE dt.dispatch_day_id=? AND d.vehicle_id=? AND dt.trip_number=?`).get(day.id,vehicleId,tripNumber)
  if(found)return found
  const vehicle=database.prepare("SELECT * FROM vehicles WHERE id=? AND operational_status IN ('available','active') AND status IN ('available','assigned') AND (is_temporary=0 OR temporary_date=?)").get(vehicleId,day.dispatch_date)
  if(!vehicle)throw new Error('Vehicle is not available for this date')
  const dispatch=database.prepare("INSERT INTO dispatches(dispatch_date,vehicle_id,status) VALUES(?,?,'draft')").run(day.dispatch_date,vehicleId)
  setFactoryDefault(database,dispatch.lastInsertRowid)
  const result=database.prepare('INSERT INTO dispatch_trips(dispatch_day_id,dispatch_id,trip_number,area_id) VALUES(?,?,?,NULL)').run(day.id,dispatch.lastInsertRowid,tripNumber)
  return database.prepare('SELECT * FROM dispatch_trips WHERE id=?').get(result.lastInsertRowid)
}

function carryForwardVehicleDriver(database,day,vehicleId){
  if(protectedDayReason(database,day))return{updated:false,reason:'PROTECTED_DAY'}
  if(database.prepare("SELECT 1 FROM dispatch_change_logs WHERE dispatch_day_id=? AND entity_type='vehicle' AND entity_id=? AND change_type='vehicle_assignment_updated' AND json_type(after_json,'$.driverId') IS NOT NULL LIMIT 1").get(day.id,String(vehicleId)))return{updated:false,reason:'MANUAL_DRIVER_CHOICE'}
  const targetDate=day.dispatch_date
  const targetTrips=database.prepare(`SELECT d.id,d.driver_id driverId FROM dispatch_trips dt JOIN dispatches d ON d.id=dt.dispatch_id
    WHERE dt.dispatch_day_id=? AND d.vehicle_id=? ORDER BY dt.trip_number,dt.id`).all(day.id,vehicleId)
  if(!targetTrips.length)return{updated:false,reason:'NO_TARGET_TRIP'}
  if(targetTrips.some(row=>row.driverId))return{updated:false,reason:'TARGET_DRIVER_EXISTS'}
  const candidates=database.prepare(`SELECT d.id dispatchId,d.vehicle_id vehicleId,dd.dispatch_date sourceDate,d.driver_id driverId,d.driver_employment_period_id driverEmploymentPeriodId,e.job_role jobRole
    FROM dispatch_trips dt JOIN dispatch_days dd ON dd.id=dt.dispatch_day_id JOIN dispatches d ON d.id=dt.dispatch_id LEFT JOIN employees e ON e.id=d.driver_id
    WHERE dd.dispatch_date<? AND strftime('%w',dd.dispatch_date)<>'0'
    ORDER BY dd.dispatch_date DESC,dt.trip_number,dt.id`).all(targetDate)
  const source=candidates.map(row=>{
    const original=database.prepare(`SELECT j.value FROM dispatch_change_logs l,json_each(l.before_json,'$.trips') j WHERE l.change_type='route_day_handover' AND json_extract(j.value,'$.id')=? ORDER BY l.id LIMIT 1`).get(row.dispatchId)
    if(!original)return row
    const prior=JSON.parse(original.value),employee=database.prepare('SELECT job_role jobRole FROM employees WHERE id=?').get(prior.driver_id)
    return{...row,vehicleId:prior.vehicle_id,driverId:prior.driver_id,driverEmploymentPeriodId:prior.driver_employment_period_id,jobRole:employee?.jobRole}
  }).find(row=>Number(row.vehicleId)===Number(vehicleId))
  if(!source?.driverId||isTemporarySupervisorDriver(source))return{updated:false,reason:'NO_PREVIOUS_DRIVER'}
  const usable=database.prepare(`SELECT 1 FROM employees e WHERE e.id=? AND e.is_active=1 AND e.employment_status='active'
    AND NOT EXISTS(SELECT 1 FROM route_employee_availability a WHERE a.employee_id=e.id AND a.availability_date=? AND a.status<>'available')`).get(source.driverId,targetDate)
  const busy=database.prepare(`SELECT 1 FROM dispatch_trips dt JOIN dispatches d ON d.id=dt.dispatch_id WHERE dt.dispatch_day_id=? AND d.vehicle_id<>? AND (d.driver_id=? OR d.assistant_id=?)
    UNION SELECT 1 FROM dispatch_vehicle_assistants dva WHERE dva.dispatch_day_id=? AND dva.vehicle_id<>? AND dva.employee_id=? LIMIT 1`).get(day.id,vehicleId,source.driverId,source.driverId,day.id,vehicleId,source.driverId)
  if(!usable||busy)return{updated:false,reason:'PREVIOUS_DRIVER_UNAVAILABLE'}
  database.prepare(`UPDATE dispatches SET driver_id=?,driver_employment_period_id=?,updated_at=CURRENT_TIMESTAMP
    WHERE id IN(SELECT dispatch_id FROM dispatch_trips WHERE dispatch_day_id=?) AND vehicle_id=? AND driver_id IS NULL`)
    .run(source.driverId,source.driverEmploymentPeriodId,day.id,vehicleId)
  database.prepare(`INSERT INTO dispatch_change_logs(dispatch_day_id,actor,change_type,entity_type,entity_id,before_json,after_json,requires_reapproval)
    VALUES(?,'System','vehicle_driver_carried_forward','vehicle',?,NULL,?,0)`).run(day.id,String(vehicleId),json({vehicleId:Number(vehicleId),sourceDate:source.sourceDate,driverId:source.driverId}))
  return{updated:true,vehicleId:Number(vehicleId),date:targetDate,sourceDate:source.sourceDate,driverId:source.driverId}
}

export function carryForwardVehicleDrivers({startDate=iso(),endDate=null}={},database=defaultDb){
  const start=iso(startDate),end=endDate?iso(endDate):'9999-12-31',days=database.prepare(`SELECT DISTINCT dd.id,dd.dispatch_date FROM dispatch_days dd JOIN daily_route_assignments a ON a.dispatch_day_id=dd.id
    WHERE dd.dispatch_date BETWEEN ? AND ? AND dd.status IN ('draft','reapproval_required','approved') ORDER BY dd.dispatch_date`).all(start,end)
  const carried=[]
  return withImmediateTransaction(database,()=>{for(const day of days){const vehicles=database.prepare('SELECT DISTINCT vehicle_id vehicleId FROM daily_route_assignments WHERE dispatch_day_id=? AND vehicle_id IS NOT NULL ORDER BY vehicle_id').all(day.id);for(const vehicle of vehicles){const result=carryForwardVehicleDriver(database,day,vehicle.vehicleId);if(result.updated)carried.push(result)}}return{startDate:start,endDate:endDate?end:null,daysChecked:days.length,driversCarried:carried.length,carried}})
}

// Sunday grouping changes only untouched draft days. Approved/executed work stays intact.
function prepareSundayDay(database,day){
 if(!isSunday(day.dispatch_date)||database.prepare('SELECT 1 FROM sunday_dispatch_setup WHERE dispatch_day_id=?').get(day.id))return null
 const manual=database.prepare("SELECT 1 FROM dispatch_change_logs WHERE dispatch_day_id=? AND change_type IN ('daily_route_vehicle_assigned','vehicle_assignment_updated','route_day_handover','route_customer_adjusted','temporary_stops_assigned_to_route') LIMIT 1").get(day.id)
 if(protectedDayReason(database,day)||database.prepare('SELECT 1 FROM daily_route_approvals WHERE dispatch_day_id=?').get(day.id)||manual)return{date:day.dispatch_date,kind:'sunday_review',message:'星期日已有主管安排或批准，保留原安排；请主管核对两组合并任务。'}
 if(database.prepare('SELECT 1 FROM purchase_bills WHERE dispatch_day_id=? UNION SELECT 1 FROM unloading_weight_records WHERE dispatch_day_id=?').get(day.id,day.id))return{date:day.dispatch_date,kind:'sunday_review',message:'星期日已有单据或卸货记录，保留原安排，请主管核对。'}
 const rows=database.prepare("SELECT ds.* FROM dispatch_stops ds JOIN dispatch_trips dt ON dt.id=ds.dispatch_trip_id WHERE dt.dispatch_day_id=? AND ds.status<>'cancelled' ORDER BY ds.route_number,ds.route_stop_sequence,ds.id").all(day.id)
 if(rows.some(r=>r.arrived_at||r.completed_at||database.prepare('SELECT 1 FROM purchase_bills WHERE dispatch_stop_id=?').get(r.id)))return{date:day.dispatch_date,kind:'sunday_review',message:'星期日已有执行记录，保留原安排，请主管核对。'}
 const pool=ensureUnassignedTrip(database,day),counters=new Map()
 let sequence=database.prepare('SELECT COALESCE(MAX(stop_sequence),0) n FROM dispatch_stops WHERE dispatch_id=? AND stop_sequence>0').get(pool.dispatch_id).n
 for(const row of rows){const route=executionRoute(database,row.branch_id,day.dispatch_date,row.route_number);const n=(counters.get(route)||0)+1;counters.set(route,n);database.prepare('UPDATE dispatch_stops SET dispatch_id=?,dispatch_trip_id=?,stop_sequence=?,route_number=?,route_stop_sequence=? WHERE id=?').run(pool.dispatch_id,pool.id,++sequence,route,route?n:null,row.id)}
 database.prepare('DELETE FROM daily_route_assignments WHERE dispatch_day_id=?').run(day.id)
 database.prepare('DELETE FROM dispatch_vehicle_assistants WHERE dispatch_day_id=?').run(day.id)
 database.prepare('UPDATE dispatches SET driver_id=NULL,assistant_id=NULL,driver_employment_period_id=NULL,assistant_employment_period_id=NULL WHERE id IN(SELECT dispatch_id FROM dispatch_trips WHERE dispatch_day_id=?)').run(day.id)
 database.prepare('INSERT INTO sunday_dispatch_setup(dispatch_day_id) VALUES(?)').run(day.id)
 invalidateDispatchDay(database,day.dispatch_date,'sunday_groups_prepared','day',day.id,null,{groups:SUNDAY_GROUPS},'System')
 return null
}
function carrySundayCrew(database,day,vehicleId){
 if(database.prepare('SELECT 1 FROM dispatch_vehicle_assistants WHERE dispatch_day_id=? AND vehicle_id=?').get(day.id,vehicleId)||database.prepare("SELECT 1 FROM dispatch_change_logs WHERE dispatch_day_id=? AND change_type IN ('vehicle_assignment_updated','route_day_handover')").get(day.id))return
 const source=database.prepare("SELECT a.dispatch_day_id dayId FROM dispatch_vehicle_assistants a JOIN dispatch_days d ON d.id=a.dispatch_day_id WHERE a.vehicle_id=? AND d.dispatch_date<? AND strftime('%w',d.dispatch_date)<>'0' ORDER BY d.dispatch_date DESC LIMIT 1").get(vehicleId,day.dispatch_date)
 if(!source)return
 for(const row of database.prepare('SELECT employee_id id FROM dispatch_vehicle_assistants WHERE dispatch_day_id=? AND vehicle_id=?').all(source.dayId,vehicleId)){
 const usable=database.prepare("SELECT 1 FROM employees e WHERE e.id=? AND e.is_active=1 AND e.employment_status='active' AND (lower(e.job_role) IN ('assistant','crew','attendant / crew') OR EXISTS(SELECT 1 FROM employee_job_roles r WHERE r.employee_id=e.id AND r.role='Attendant / Crew' AND r.is_active=1)) AND NOT EXISTS(SELECT 1 FROM route_employee_availability a WHERE a.employee_id=e.id AND a.availability_date=? AND a.status<>'available')").get(row.id,day.dispatch_date)
 const busy=database.prepare('SELECT 1 FROM dispatch_vehicle_assistants WHERE dispatch_day_id=? AND employee_id=? UNION SELECT 1 FROM dispatches d JOIN dispatch_trips t ON t.dispatch_id=d.id WHERE t.dispatch_day_id=? AND (d.driver_id=? OR d.assistant_id=?)').get(day.id,row.id,day.id,row.id,row.id)
 if(usable&&!busy)database.prepare('INSERT INTO dispatch_vehicle_assistants(dispatch_day_id,vehicle_id,employee_id,employment_period_id) VALUES(?,?,?,?)').run(day.id,vehicleId,row.id,currentEmploymentPeriod(database,row.id))
 }
}

// Fill only missing assignments; explicit choices (including clearing) always win.
function fillRouteVehicleDefaults(database,startDate,onlyDayIds=null){
  let vehiclesCarried=0
  const days=database.prepare("SELECT * FROM dispatch_days WHERE dispatch_date>=? AND status IN ('draft','reapproval_required') ORDER BY dispatch_date").all(startDate)
  for(const day of days){
    if(onlyDayIds&&!onlyDayIds.has(day.id))continue
    if(protectedDayReason(database,day))continue
    if(isSunday(day.dispatch_date)&&!database.prepare('SELECT 1 FROM sunday_dispatch_setup WHERE dispatch_day_id=?').get(day.id))continue
    const routes=database.prepare("SELECT DISTINCT ds.route_number routeNumber FROM dispatch_stops ds JOIN dispatch_trips dt ON dt.id=ds.dispatch_trip_id WHERE dt.dispatch_day_id=? AND ds.route_number IS NOT NULL AND ds.status<>'cancelled' ORDER BY ds.route_number").all(day.id)
    for(const {routeNumber} of routes){
      if(database.prepare('SELECT 1 FROM daily_route_assignments WHERE dispatch_day_id=? AND route_number=?').get(day.id,routeNumber))continue
      if(database.prepare("SELECT 1 FROM dispatch_change_logs WHERE dispatch_day_id=? AND entity_type='route' AND entity_id=? AND change_type='daily_route_vehicle_assigned' LIMIT 1").get(day.id,String(routeNumber)))continue
      const duty=isSunday(day.dispatch_date)&&sundayGroup(routeNumber)?sundayDutyRoute(day.dispatch_date,sundayGroup(routeNumber)):routeNumber
      const source=database.prepare(`SELECT COALESCE((SELECT json_extract(l.before_json,'$.vehicleId') FROM dispatch_change_logs l WHERE l.dispatch_day_id=dd.id AND l.change_type='route_day_handover' AND l.entity_id=CAST(a.route_number AS TEXT) ORDER BY l.id LIMIT 1),a.vehicle_id) vehicleId,dd.dispatch_date sourceDate FROM daily_route_assignments a JOIN dispatch_days dd ON dd.id=a.dispatch_day_id WHERE a.route_number=? AND dd.dispatch_date<? AND strftime('%w',dd.dispatch_date)<>'0' ORDER BY dd.dispatch_date DESC LIMIT 1`).get(duty,day.dispatch_date)
      if(!source?.vehicleId)continue
      const cleared=database.prepare("SELECT 1 FROM dispatch_change_logs l JOIN dispatch_days dd ON dd.id=l.dispatch_day_id WHERE dd.dispatch_date>=? AND dd.dispatch_date<? AND strftime('%w',dd.dispatch_date)<>'0' AND l.entity_type='route' AND l.entity_id=? AND l.change_type='daily_route_vehicle_assigned' AND json_extract(l.after_json,'$.vehicleId') IS NULL LIMIT 1").get(source.sourceDate,day.dispatch_date,String(duty))
      if(cleared)continue
      const usable=database.prepare("SELECT 1 FROM vehicles v WHERE v.id=? AND v.operational_status IN ('available','active') AND v.status IN ('available','assigned') AND (v.is_temporary=0 OR v.temporary_date=?) AND NOT EXISTS(SELECT 1 FROM route_vehicle_availability va WHERE va.vehicle_id=v.id AND va.availability_date=? AND va.status<>'available')").get(source.vehicleId,day.dispatch_date,day.dispatch_date)
      if(!usable||database.prepare('SELECT 1 FROM daily_route_assignments WHERE dispatch_day_id=? AND vehicle_id=?').get(day.id,source.vehicleId))continue
      const stops=database.prepare("SELECT ds.id,ds.dispatch_trip_id tripId FROM dispatch_stops ds JOIN dispatch_trips dt ON dt.id=ds.dispatch_trip_id WHERE dt.dispatch_day_id=? AND ds.route_number=? AND ds.status<>'cancelled' ORDER BY ds.route_stop_sequence,ds.id").all(day.id,routeNumber)
      const target=ensureVehicleTrip(database,day,source.vehicleId,1)
      for(const stop of stops)database.prepare('UPDATE dispatch_stops SET stop_sequence=-id WHERE id=?').run(stop.id)
      let sequence=database.prepare('SELECT COALESCE(MAX(stop_sequence),0) n FROM dispatch_stops WHERE dispatch_id=? AND stop_sequence>0').get(target.dispatch_id).n
      for(const stop of stops)database.prepare('UPDATE dispatch_stops SET dispatch_id=?,dispatch_trip_id=?,stop_sequence=? WHERE id=?').run(target.dispatch_id,target.id,++sequence,stop.id)
      database.prepare("INSERT INTO daily_route_assignments(dispatch_day_id,route_number,vehicle_id,assigned_by) VALUES(?,?,?,'System default')").run(day.id,routeNumber,source.vehicleId)
      // Existing sequence gaps reserve cancelled history; append without compaction.
      invalidateDispatchDay(database,day.dispatch_date,'route_vehicle_carried_forward','route',routeNumber,null,source,'System')
      vehiclesCarried++
    }
    for(const row of database.prepare('SELECT vehicle_id vehicleId FROM daily_route_assignments WHERE dispatch_day_id=? AND vehicle_id IS NOT NULL').all(day.id)){carryForwardVehicleDriver(database,day,row.vehicleId);if(isSunday(day.dispatch_date))carrySundayCrew(database,day,row.vehicleId)}
  }
  return{vehiclesCarried}
}

export function carryForwardRouteVehicles({startDate=iso()}={},database=defaultDb){
  return withImmediateTransaction(database,()=>fillRouteVehicleDefaults(database,iso(startDate)))
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
  const snapshot=branchZoneSnapshot(database,schedule.branch_id)
  const trip=ensureUnassignedTrip(database,day)
  const sequence=database.prepare('SELECT COALESCE(MAX(stop_sequence),0)+1 value FROM dispatch_stops WHERE dispatch_id=?').get(trip.dispatch_id).value
  const estimatedWeightKg=latestExistingEstimatedWeight(database,schedule.branch_id)
  const stop=database.prepare(`INSERT INTO dispatch_stops(dispatch_id,branch_id,stop_sequence,status,dispatch_trip_id,source_schedule_id,service_date,dedupe_enforced,estimated_weight_kg,zone_group_id_snapshot,zone_group_name_snapshot,area_name_snapshot)
    VALUES(?,?,?,'locked',?,?,?,1,?,?,?,?)`).run(trip.dispatch_id,schedule.branch_id,sequence,trip.id,schedule.id,day.dispatch_date,estimatedWeightKg,snapshot.zoneGroupId??null,snapshot.zoneGroupName??'待确认',snapshot.areaName??'未分区')
  database.prepare("UPDATE schedule_occurrences SET dispatch_stop_id=?,status='generated',updated_at=CURRENT_TIMESTAMP WHERE schedule_id=? AND planned_date=?").run(stop.lastInsertRowid,schedule.id,day.dispatch_date)
  if(schedule.recurrence_type&&occurrenceSource==='recurrence')database.prepare('UPDATE branch_schedules SET next_collection_date=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(nextCollectionDate(schedule,addDays(day.dispatch_date,1)),schedule.id)
  return {created:true,result:'Created',stopId:Number(stop.lastInsertRowid),scheduleId:schedule.id,branchId:schedule.branch_id,serviceDate:day.dispatch_date}
}

const weekdayForDate=date=>new Date(`${date}T00:00:00Z`).getUTCDay()

export function applyWeeklyRoutePlanToDay(database,day){
  const plan=database.prepare('SELECT id FROM weekly_route_plans WHERE is_active=1 ORDER BY id DESC LIMIT 1').get()
  if(!plan)return{applied:false,arranged:0,pendingRoutes:[]}
  let routes=database.prepare(`SELECT wr.branch_id branchId,wr.route_number routeNumber,wr.trip_number tripNumber,wr.stop_sequence stopSequence
    FROM weekly_route_plan_stops wr WHERE wr.plan_id=? AND wr.weekday=?
    ORDER BY wr.route_number,wr.trip_number,wr.stop_sequence`).all(plan.id,weekdayForDate(day.dispatch_date))

  const allStops=database.prepare(`SELECT ds.id,ds.branch_id branchId,ds.dispatch_id dispatchId,ds.dispatch_trip_id tripId,ds.stop_sequence oldSequence,ds.route_number routeNumber,ds.route_stop_sequence routeStopSequence,dt.trip_number tripNumber,ds.status
    FROM dispatch_stops ds JOIN dispatch_trips dt ON dt.id=ds.dispatch_trip_id WHERE dt.dispatch_day_id=?
    ORDER BY ds.dispatch_id,ds.stop_sequence,ds.id`).all(day.id)
  if(!allStops.length)return{applied:true,arranged:0,pendingRoutes:[]}
  const stopByBranch=new Map(allStops.filter(row=>row.status!=='cancelled').map(row=>[row.branchId,row]))
  // Keep explicit one-date supervisor Route choices when regenerating a draft.
  const overrides=new Map(allStops.filter(stop=>stop.status!=='cancelled'&&stop.routeNumber!=null).map(stop=>[stop.branchId,{branchId:stop.branchId,routeNumber:stop.routeNumber,tripNumber:stop.tripNumber>0?stop.tripNumber:1,stopSequence:stop.routeStopSequence||9999}]))
  for(const log of database.prepare("SELECT entity_id,after_json FROM dispatch_change_logs WHERE dispatch_day_id=? AND change_type='route_customer_adjusted' ORDER BY id").all(day.id)){
    const choice=JSON.parse(log.after_json||'{}'),stop=allStops.find(item=>item.id===Number(log.entity_id)&&item.status!=='cancelled')
    if(stop&&choice.date===day.dispatch_date)overrides.set(stop.branchId,{branchId:stop.branchId,routeNumber:choice.routeNumber,tripNumber:1,stopSequence:choice.routeStopSequence||9999})
  }
  routes=routes.map(r=>({...r,routeNumber:executionRoute(database,r.branchId,day.dispatch_date,r.routeNumber)}))
  routes=[...routes.filter(item=>!overrides.has(item.branchId)),...overrides.values()]

  const assignments=new Map(database.prepare('SELECT route_number routeNumber,vehicle_id vehicleId FROM daily_route_assignments WHERE dispatch_day_id=?').all(day.id).map(row=>[row.routeNumber,row.vehicleId]))
  const pending=new Set(),plannedIds=new Set(),sequenceCounters=new Map()
  database.prepare(`UPDATE dispatch_stops SET stop_sequence=-id WHERE dispatch_trip_id IN(SELECT id FROM dispatch_trips WHERE dispatch_day_id=?)`).run(day.id)
  let arranged=0
  for(const route of routes){
    const stop=stopByBranch.get(route.branchId)
    if(!stop)continue
    const vehicleId=assignments.get(route.routeNumber),target=vehicleId?ensureVehicleTrip(database,day,vehicleId,route.tripNumber):ensureUnassignedTrip(database,day)
    if(!vehicleId)pending.add(route.routeNumber)
    const key=target.dispatch_id,sequence=(sequenceCounters.get(key)||0)+1
    sequenceCounters.set(key,sequence)
    database.prepare('UPDATE dispatch_stops SET dispatch_id=?,dispatch_trip_id=?,stop_sequence=?,route_number=?,route_stop_sequence=? WHERE id=?').run(target.dispatch_id,target.id,sequence,route.routeNumber,route.stopSequence,stop.id)
    plannedIds.add(stop.id);arranged+=1
  }
  const remaining=allStops.filter(stop=>stop.status!=='cancelled'&&!plannedIds.has(stop.id))
  if(!remaining.length)return{applied:true,arranged,pendingRoutes:[...pending].sort()}
  const unassigned=ensureUnassignedTrip(database,day)
  let next=database.prepare('SELECT COALESCE(MAX(stop_sequence),0)+1 value FROM dispatch_stops WHERE dispatch_id=? AND stop_sequence>0').get(unassigned.dispatch_id).value
  for(const stop of remaining){
    database.prepare('UPDATE dispatch_stops SET dispatch_id=?,dispatch_trip_id=?,stop_sequence=?,route_number=NULL,route_stop_sequence=NULL WHERE id=?').run(unassigned.dispatch_id,unassigned.id,next,stop.id)
    next+=1
  }
  return{applied:true,arranged,pendingRoutes:[...pending].sort()}
}

function generateRange({startDate=iso(),generatedBy='Supervisor',count=7,onlyMissing=false}={}, database=defaultDb) {
  const start=iso(startDate)
  database.exec('BEGIN IMMEDIATE')
  try {
    assertRouteGenerationReady(database)
    database.prepare(`INSERT INTO weekly_dispatch_plans(week_start,generated_by) VALUES(?,?) ON CONFLICT(week_start) DO NOTHING`).run(start,actor(generatedBy))
    const plan=database.prepare('SELECT * FROM weekly_dispatch_plans WHERE week_start=?').get(start)
    const createdDayIds=new Set()
    let createdStops=0,reusedStops=0,duplicateStops=[],protectedDays=[]
    for(let offset=0;offset<count;offset+=1){
      const date=addDays(start,offset)
      if(onlyMissing&&dayByDate(database,date))continue
      database.prepare(`INSERT OR IGNORE INTO dispatch_days(weekly_plan_id,dispatch_date) VALUES(?,?)`).run(plan.id,date)
      const day=dayByDate(database,date)
      createdDayIds.add(day.id)
      const protectedReason=protectedDayReason(database,day)
      if(protectedReason){protectedDays.push({date,reason:protectedReason,status:day.status});continue}
      const schedules=database.prepare(`SELECT s.*,b.area_id FROM branch_schedules s JOIN branches b ON b.id=s.branch_id LEFT JOIN customers c ON c.id=b.customer_id LEFT JOIN areas a ON a.id=b.area_id LEFT JOIN zone_groups z ON z.id=COALESCE(a.confirmed_zone_group_id,a.zone_group_id) LEFT JOIN route_templates rt ON rt.zone_group_id=z.id AND rt.is_active=1 LEFT JOIN route_template_areas rta ON rta.route_template_id=rt.id AND rta.area_id=a.id LEFT JOIN route_template_branches rtb ON rtb.route_template_id=rt.id AND rtb.branch_id=b.id WHERE s.is_active=1 AND b.lifecycle_status='ACTIVE' AND COALESCE(c.is_active,1)=1 AND LOWER(TRIM(COALESCE(b.collection_frequency,''))) NOT IN ('on call','paused') ORDER BY COALESCE(z.sort_order,999999),CASE WHEN rta.area_order IS NULL THEN 1 ELSE 0 END,rta.area_order,CASE WHEN rtb.branch_order IS NULL THEN 1 ELSE 0 END,rtb.branch_order,COALESCE(b.branch_name,''),b.id,s.id`).all()
      for(const schedule of schedules) if(scheduleMatchesDate(schedule,date)){const result=addScheduledStop(database,day,schedule);if(result.created)createdStops+=1;else{reusedStops+=1;if(result.code==='DUPLICATE_BRANCH_SERVICE_DATE'&&Number(result.existingScheduleId)!==Number(result.attemptedScheduleId))duplicateStops.push(result)}}
      const additions=database.prepare(`SELECT s.*,b.area_id FROM schedule_exceptions e JOIN branch_schedules s ON s.id=e.schedule_id LEFT JOIN branches b ON b.id=s.branch_id LEFT JOIN areas a ON a.id=b.area_id LEFT JOIN zone_groups z ON z.id=COALESCE(a.confirmed_zone_group_id,a.zone_group_id) LEFT JOIN route_templates rt ON rt.zone_group_id=z.id AND rt.is_active=1 LEFT JOIN route_template_areas rta ON rta.route_template_id=rt.id AND rta.area_id=a.id LEFT JOIN route_template_branches rtb ON rtb.route_template_id=rt.id AND rtb.branch_id=b.id WHERE e.target_date=? AND e.exception_type IN ('move_date','add_extra_collection','customer_request') AND b.lifecycle_status='ACTIVE' ORDER BY COALESCE(z.sort_order,999999),CASE WHEN rta.area_order IS NULL THEN 1 ELSE 0 END,rta.area_order,CASE WHEN rtb.branch_order IS NULL THEN 1 ELSE 0 END,rtb.branch_order,COALESCE(b.branch_name,''),b.id,s.id`).all(date)
      for(const schedule of additions){const result=addScheduledStop(database,day,schedule,'exception');if(result.created)createdStops+=1;else{reusedStops+=1;if(result.code==='DUPLICATE_BRANCH_SERVICE_DATE'&&Number(result.existingScheduleId)!==Number(result.attemptedScheduleId))duplicateStops.push(result)}}
      const removals=database.prepare(`SELECT schedule_id FROM schedule_exceptions WHERE original_date=? AND exception_type IN ('move_date','cancel_date','pause_once')`).all(date)
      for(const item of removals){
        database.prepare("UPDATE schedule_occurrences SET dispatch_stop_id=NULL,status='cancelled',updated_at=CURRENT_TIMESTAMP WHERE schedule_id=? AND planned_date=?").run(item.schedule_id,date)
        database.prepare(`UPDATE dispatch_stops SET status='cancelled',superseded_reason='Schedule exception',superseded_at=CURRENT_TIMESTAMP,superseded_by='System' WHERE source_schedule_id=? AND dispatch_trip_id IN(SELECT id FROM dispatch_trips WHERE dispatch_day_id=?) AND status<>'completed'`).run(item.schedule_id,day.id)
      }
      applyWeeklyRoutePlanToDay(database,day)
      prepareSundayDay(database,day)
    }
    fillRouteVehicleDefaults(database,start,onlyMissing?createdDayIds:null)
    database.exec('COMMIT')
    return {weekStart:start,dayCount:count,createdStops,reusedStops,protectedDays,duplicateStops,...(count===1?{day:getDispatchDay(start,database)}:getDispatchWeek({startDate:start},database))}
  } catch(error){if(database.isTransaction)database.exec('ROLLBACK');throw error}
}
// Fill the rolling window without regenerating any existing day or its approvals.
export function ensureRollingWeek({startDate=iso(),generatedBy='Supervisor'}={},database=defaultDb){
  const start=iso(startDate),end=addDays(start,6)
  const count=database.prepare('SELECT COUNT(*) n FROM dispatch_days WHERE dispatch_date BETWEEN ? AND ?').get(start,end).n
  if(count!==7)generateRange({startDate:start,generatedBy,count:7,onlyMissing:true},database)
  const sundayReview=withImmediateTransaction(database,()=>{const reviews=[];for(let i=0;i<7;i++){const d=dayByDate(database,addDays(start,i));if(d){const warning=prepareSundayDay(database,d);if(warning)reviews.push(warning)}}fillRouteVehicleDefaults(database,start);return reviews})
  const scheduleReview=reconcileScheduleWindow({startDate:start,changedBy:generatedBy},database)
  return {...getDispatchWeek({startDate:start},database),scheduleReview:[...sundayReview,...scheduleReview],planningReview:routeScheduleProposals(database,start)}
}
export function generateWeek(payload={},database=defaultDb){return generateRange({...payload,count:7},database)}
export function generateDay(payload={},database=defaultDb){return generateRange({...payload,count:1},database)}

function stopRows(database, dayId) {
  const hasOutcome=database.prepare('PRAGMA table_info(dispatch_stops)').all().some(column=>column.name==='completion_outcome')
  return database.prepare(`SELECT ds.id,ds.status,${hasOutcome?'ds.completion_outcome':'NULL'} completionOutcome,ds.arrived_at arrivedAt,ds.completed_at completedAt,ds.override_note overrideNote,ds.override_reason overrideReason,EXISTS(SELECT 1 FROM purchase_bills pb WHERE pb.dispatch_stop_id=ds.id) hasBill,b.address,b.contact_person contactPerson,b.phone,b.parking_note parkingNote,b.truck_access truckAccess,b.gps_remark gpsRemark,c.jodoo_customer_id customerId,ds.stop_sequence stopSequence,ds.sequence_locked sequenceLocked,ds.estimated_weight_kg estimatedWeightKg,ds.route_number routeNumber,ds.route_stop_sequence routeStopSequence,
    ds.source_special_request_id specialRequestId,b.jodoo_branch_id branchId,b.branch_name branchName,c.name customerName,c.payment_type paymentType,COALESCE((SELECT CASE WHEN cmp.price_type='outstation' THEN COALESCE(cmp.outstation_special_price,opl.price_amount) ELSE COALESCE(cmp.standard_special_price,spl.price_amount) END FROM customer_material_pricing cmp JOIN materials om ON om.id=cmp.material_id AND om.material_code='OCC' LEFT JOIN material_price_levels spl ON spl.id=cmp.standard_price_level_id LEFT JOIN material_price_levels opl ON opl.id=cmp.outstation_price_level_id WHERE cmp.customer_id=c.id AND cmp.status='active' AND cmp.resolution_state='ready'),c.occ_price) occPrice,
    b.area_id areaId,COALESCE(ds.area_name_snapshot,a.name) area,COALESCE(ds.zone_group_id_snapshot,a.zone_group_id) zoneGroupId,COALESCE(ds.zone_group_name_snapshot,z.name,'待确认') zoneGroup,z.sort_order zoneSortOrder,b.latitude,b.longitude,b.time_restriction timeRestriction,
    dt.id tripId,dt.trip_number tripNumber,d.vehicle_id vehicleId,v.vehicle_code vehicle,d.driver_id driverId,dr.name driver,d.assistant_id assistantId,asst.name assistant
    FROM dispatch_stops ds JOIN dispatch_trips dt ON dt.id=ds.dispatch_trip_id JOIN dispatches d ON d.id=dt.dispatch_id
    JOIN branches b ON b.id=ds.branch_id LEFT JOIN customers c ON c.id=b.customer_id LEFT JOIN areas a ON a.id=b.area_id LEFT JOIN zone_groups z ON z.id=a.zone_group_id
    LEFT JOIN vehicles v ON v.id=d.vehicle_id LEFT JOIN employees dr ON dr.id=d.driver_id LEFT JOIN employees asst ON asst.id=d.assistant_id
    WHERE dt.dispatch_day_id=? AND ds.status<>'cancelled' ORDER BY dt.trip_number,ds.stop_sequence`).all(dayId)
}

export function routeSignature(database,dayId,routeNumber){
  const rows=database.prepare(`SELECT ds.id,ds.branch_id branchId,ds.route_stop_sequence routeSequence,ds.stop_sequence stopSequence,ds.status,dt.trip_number tripNumber,d.vehicle_id vehicleId
    FROM dispatch_stops ds JOIN dispatch_trips dt ON dt.id=ds.dispatch_trip_id JOIN dispatches d ON d.id=ds.dispatch_id
    WHERE dt.dispatch_day_id=? AND ds.route_number=? AND ds.status<>'cancelled' ORDER BY ds.route_stop_sequence,ds.id`).all(dayId,routeNumber)
  return createHash('sha256').update(JSON.stringify(rows)).digest('hex')
}

function dayView(database, day) {
  const stops=stopRows(database,day.id)
  const noGoodsNotices=database.prepare("SELECT ds.id,ds.override_reason reason,ds.route_number routeNumber,b.jodoo_branch_id branchId,b.branch_name branchName FROM dispatch_stops ds JOIN dispatch_trips dt ON dt.id=ds.dispatch_trip_id JOIN branches b ON b.id=ds.branch_id WHERE dt.dispatch_day_id=? AND ds.override_note='customer_reported_no_goods' ORDER BY ds.id").all(day.id)
  const allTrips=database.prepare(`SELECT dt.id,dt.trip_number tripNumber,dt.estimated_weight_kg estimatedWeightKg,a.name area,d.vehicle_id vehicleId,v.vehicle_code vehicle,
    d.driver_id driverId,dr.name driver,d.assistant_id assistantId,asst.name assistant,d.start_location_id startLocationId,d.start_location_type startLocationType,d.start_location_reference_type startLocationReferenceType,d.start_location_reference_id startLocationReferenceId,d.start_location_name startLocationName,d.start_address startAddress,d.start_latitude startLatitude,d.start_longitude startLongitude,d.buyer_reference_id buyerReferenceId,d.buyer_code buyerCode,d.buyer_name buyerName,d.end_location_id endLocationId,d.end_location_reference_type endLocationReferenceType,d.end_location_reference_id endLocationReferenceId,d.end_location_name endLocationName,d.end_location_parent_name endLocationParentName,d.end_address endAddress,d.end_latitude endLatitude,d.end_longitude endLongitude,sl.name startLocation,el.name endLocation
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
    WHERE v.operational_status IN ('available','active') AND v.status IN ('available','assigned') AND (v.is_temporary=0 OR v.temporary_date=?)
    AND NOT EXISTS(SELECT 1 FROM route_vehicle_availability va WHERE va.vehicle_id=v.id AND va.availability_date=? AND va.status<>'available')
    ORDER BY v.is_temporary,COALESCE(v.official_sequence,999),v.vehicle_code`).all(day.dispatch_date,day.dispatch_date).map(item=>({...item,preferredAreas:item.preferredAreaNames?item.preferredAreaNames.split('|'):[]}))
  const availableIds=new Set(vehicles.map(item=>item.id)),assignedTrips=allTrips.filter(item=>item.vehicleId&&availableIds.has(item.vehicleId))
  const assistantRows=database.prepare(`SELECT dva.vehicle_id vehicleId,e.id,e.employee_code employeeCode,e.name FROM dispatch_vehicle_assistants dva JOIN employees e ON e.id=dva.employee_id WHERE dva.dispatch_day_id=? ORDER BY e.name`).all(day.id)
  // Tabs represent the complete vehicle pool that can actually be used that day,
  // including a newly-created permanent vehicle before it receives its first stop.
  const boardVehicles=vehicles
  const vehicleBoards=boardVehicles.map(vehicle=>{
    const vehicleTrips=assignedTrips.filter(item=>item.vehicleId===vehicle.id),basis=vehicleTrips.find(item=>item.driverId||item.assistantId||item.startLocationId||item.endLocationId)||vehicleTrips[0]||{}
    const slots=[1,2,3].map(tripNumber=>{const trip=vehicleTrips.find(item=>item.tripNumber===tripNumber),tripStops=trip?stops.filter(stop=>stop.tripId===trip.id):[],weighted=tripStops.filter(stop=>stop.estimatedWeightKg!=null);return{tripNumber,tripId:trip?.id??null,startLocationType:trip?.startLocationType??null,startLocationReferenceType:trip?.startLocationReferenceType??null,startLocationReferenceId:trip?.startLocationReferenceId??null,startLocationName:trip?.startLocationName??trip?.startLocation??null,startAddress:trip?.startAddress??null,startLatitude:trip?.startLatitude??null,startLongitude:trip?.startLongitude??null,buyerReferenceId:trip?.buyerReferenceId??null,buyerCode:trip?.buyerCode??null,buyerName:trip?.buyerName??null,endLocationReferenceType:trip?.endLocationReferenceType??null,endLocationReferenceId:trip?.endLocationReferenceId??null,endLocationName:trip?.endLocationName??trip?.endLocation??null,endLocationParentName:trip?.endLocationParentName??null,endAddress:trip?.endAddress??null,endLatitude:trip?.endLatitude??null,endLongitude:trip?.endLongitude??null,stops:tripStops,stopCount:tripStops.length,estimatedWeightKg:weighted.reduce((sum,stop)=>sum+Number(stop.estimatedWeightKg),0),weightedStopCount:weighted.length,missingWeightCount:tripStops.length-weighted.length}})
    const areas=[...new Set(slots.flatMap(slot=>slot.stops.map(stop=>stop.area).filter(Boolean)))]
    const assistants=assistantRows.filter(item=>item.vehicleId===vehicle.id)
    if(!assistants.length&&basis.assistantId)assistants.push({id:basis.assistantId,name:basis.assistant,employeeCode:null,vehicleId:vehicle.id})
    const estimatedWeightKg=slots.reduce((sum,slot)=>sum+slot.estimatedWeightKg,0);return{...vehicle,driverId:basis.driverId??null,driver:basis.driver??null,assistantIds:assistants.map(item=>item.id),assistants,startLocationId:basis.startLocationId??null,startLocation:basis.startLocation??null,endLocationId:basis.endLocationId??null,endLocation:basis.endLocation??null,areas,slots,customerCount:slots.reduce((sum,slot)=>sum+slot.stopCount,0),estimatedWeightKg,weightedStopCount:slots.reduce((sum,slot)=>sum+slot.weightedStopCount,0),missingWeightCount:slots.reduce((sum,slot)=>sum+slot.missingWeightCount,0),overCapacity:Boolean(vehicle.capacityKg&&estimatedWeightKg>vehicle.capacityKg)}
  })
  const unassignedStops=stops.filter(stop=>!stop.vehicleId||!availableIds.has(stop.vehicleId))
  const assignmentRows=database.prepare('SELECT route_number routeNumber,vehicle_id vehicleId,assigned_by assignedBy,updated_at updatedAt FROM daily_route_assignments WHERE dispatch_day_id=?').all(day.id),assignmentByRoute=new Map(assignmentRows.map(row=>[row.routeNumber,row]))
  const definitionRows=database.prepare(`SELECT d.route_number routeNumber,d.display_name displayName FROM weekly_route_definitions d JOIN weekly_route_plans p ON p.id=d.plan_id WHERE p.is_active=1`).all(),definitionByRoute=new Map(definitionRows.map(row=>[row.routeNumber,row.displayName]))
  const approvalRows=database.prepare('SELECT route_number routeNumber,route_signature routeSignature,actor approvedBy,reason approvalReason,approved_at approvedAt FROM daily_route_approvals WHERE dispatch_day_id=?').all(day.id),approvalByRoute=new Map(approvalRows.map(row=>[row.routeNumber,row]))
  const routeBoards=[1,2,3,4,5].map(routeNumber=>{const assignment=assignmentByRoute.get(routeNumber)||{},vehicle=vehicles.find(item=>item.id===assignment.vehicleId),routeStops=stops.filter(stop=>stop.routeNumber===routeNumber).sort((a,b)=>(a.routeStopSequence??999999)-(b.routeStopSequence??999999)||a.id-b.id),approval=approvalByRoute.get(routeNumber),approved=Boolean(routeStops.length&&approval&&approval.routeSignature===routeSignature(database,day.id,routeNumber));return{routeNumber,name:isSunday(day.dispatch_date)&&database.prepare('SELECT 1 FROM sunday_dispatch_setup WHERE dispatch_day_id=?').get(day.id)&&SUNDAY_GROUPS.find(g=>g.routeNumber===routeNumber)?SUNDAY_GROUPS.find(g=>g.routeNumber===routeNumber).name:definitionByRoute.get(routeNumber)||`Route ${routeNumber}`,vehicleId:assignment.vehicleId??null,vehicle:vehicle?.vehicle??null,registrationNumber:vehicle?.registrationNumber??null,assignedBy:assignment.assignedBy??null,updatedAt:assignment.updatedAt??null,customerCount:routeStops.length,stops:routeStops,approvalStatus:routeStops.length?(approved?'approved':approval?'reapproval_required':'pending'):'empty',approvedBy:approved?approval.approvedBy:null,approvedAt:approved?approval.approvedAt:null,approvalReason:approved?approval.approvalReason:null}})
  const extraUnassignedStops=unassignedStops.filter(stop=>stop.routeNumber==null)
  const unassignedGroups=[...new Map(extraUnassignedStops.map(stop=>[stop.areaId??'unassigned',{areaId:stop.areaId??null,areaName:stop.area||'未分区',zoneGroupId:stop.zoneGroupId??'pending',zoneGroupName:stop.zoneGroup||'待确认',zoneSortOrder:stop.zoneSortOrder??9999}])).values()].map(group=>{
    const groupedStops=extraUnassignedStops.filter(stop=>(stop.areaId??null)===group.areaId),weights=groupedStops.filter(stop=>stop.estimatedWeightKg!=null)
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
  const warningCount=missingGpsCount+missingWeightCount+timeRestrictionCount+vehicleBoards.filter(board=>board.customerCount>0&&!board.driverId).length+vehicleBoards.filter(board=>board.overCapacity).length+specials.filter(x=>x.requestType==='potential_new'&&newCustomerMissing(x).length).length
  const previewSummary={stopCount:stops.length,estimatedWeightKg:weightedStops.reduce((sum,stop)=>sum+Number(stop.estimatedWeightKg),0),weightedStopCount:weightedStops.length,missingWeightCount,missingGpsCount,timeRestrictionCount,unassignedCount:unassignedStops.length,warningCount}
  const approval=database.prepare("SELECT actor approvedBy,created_at approvedAt,reason approvalReason FROM dispatch_approvals WHERE dispatch_day_id=? AND action IN ('approve','reapprove') ORDER BY id DESC LIMIT 1").get(day.id)||{}
  return {...day,sundayGrouped:isSunday(day.dispatch_date)&&Boolean(database.prepare('SELECT 1 FROM sunday_dispatch_setup WHERE dispatch_day_id=?').get(day.id)),...approval,noGoodsNotices,stops,trips:assignedTrips,vehicleBoards,routeBoards,unassignedStops,extraUnassignedStops,unassignedGroups,unassignedZones,specialRequests:specials,deferRequests:listDeferRequestsForDay(day.id,database),warningCount,previewSummary,legacyUnassignedTripCount:allTrips.filter(item=>!item.vehicleId).length}
}

const resourceOptions=(database)=>({
  ...commercialOptions(database),
  vehicles:database.prepare(`SELECT v.id,v.vehicle_code vehicleCode,v.vehicle_name vehicleName,v.registration_number registrationNumber,v.capacity_kg capacityKg,v.operational_status status,v.is_common isCommon,
    v.is_temporary isTemporary,v.temporary_date temporaryDate,v.default_base_location_id defaultBaseLocationId,base.name defaultBase,
    (SELECT GROUP_CONCAT(a.name,'|') FROM vehicle_preferred_areas vpa JOIN areas a ON a.id=vpa.area_id WHERE vpa.vehicle_id=v.id) preferredAreaNames
    FROM vehicles v LEFT JOIN operational_locations base ON base.id=v.default_base_location_id ORDER BY v.operational_status='sold',v.is_temporary,COALESCE(v.official_sequence,999),v.vehicle_code`).all().map(item=>({...item,preferredAreas:item.preferredAreaNames?item.preferredAreaNames.split('|'):[]})),
  employees:database.prepare(`SELECT e.id,e.employee_code employeeCode,e.name,e.job_role role,e.employment_status employmentStatus,e.is_active isActive,
    e.default_base_location_id defaultBaseLocationId,base.name defaultBase,e.default_area_id defaultAreaId,a.name defaultArea,GROUP_CONCAT(CASE WHEN r.is_active=1 THEN r.role END,'|') additionalRoles
    FROM employees e LEFT JOIN operational_locations base ON base.id=e.default_base_location_id LEFT JOIN areas a ON a.id=e.default_area_id LEFT JOIN employee_job_roles r ON r.employee_id=e.id
    WHERE e.is_active=1 AND e.employment_status='active' GROUP BY e.id ORDER BY e.name`).all().map(item=>({...item,additionalRoles:item.additionalRoles?item.additionalRoles.split('|'):[]})),
  locations:database.prepare(`SELECT l.id,l.location_code locationCode,l.can_start canStart,l.can_end canEnd,l.buyer_id buyerId,b.buyer_code buyerCode,b.buyer_name buyerName,CASE WHEN l.buyer_id IS NULL THEN l.name ELSE b.buyer_name||' → '||l.name END name FROM operational_locations l LEFT JOIN buyers b ON b.id=l.buyer_id WHERE l.is_active=1 AND COALESCE(l.status,'active')='active' ORDER BY COALESCE(b.buyer_name,l.name),l.name`).all(),
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

export function routeApprovalCheck(date,routeNumber,database=defaultDb){
  const serviceDate=iso(date),route=Number(routeNumber),day=dayByDate(database,serviceDate)
  if(!day)return{ok:false,date:serviceDate,routeNumber:route,issues:[{code:'DAY_NOT_FOUND',message:'Dispatch day not found.'}],warnings:[]}
  if(!Number.isInteger(route)||route<1||route>5)return{ok:false,date:serviceDate,routeNumber:route,issues:[{code:'ROUTE_INVALID',message:'Route must be between 1 and 5.'}],warnings:[]}
  const rows=database.prepare(`SELECT ds.id stopId,ds.branch_id branchId,ds.status stopStatus,ds.estimated_weight_kg estimatedWeightKg,ds.route_stop_sequence routeSequence,
    ds.source_schedule_id sourceScheduleId,b.jodoo_branch_id branchCode,b.branch_name branchName,b.is_active branchActive,b.status branchStatus,b.latitude,b.longitude,b.time_restriction timeRestriction,
    dt.id tripId,dt.trip_number tripNumber,d.id dispatchId,d.status dispatchStatus,d.vehicle_id vehicleId,v.vehicle_code vehicleCode,v.operational_status vehicleOperationalStatus,v.status vehicleStatus,COALESCE(s.is_active,1) scheduleActive
    FROM dispatch_stops ds JOIN dispatch_trips dt ON dt.id=ds.dispatch_trip_id JOIN dispatches d ON d.id=ds.dispatch_id JOIN branches b ON b.id=ds.branch_id
    LEFT JOIN vehicles v ON v.id=d.vehicle_id LEFT JOIN branch_schedules s ON s.id=ds.source_schedule_id
    WHERE dt.dispatch_day_id=? AND ds.route_number=? AND ds.status<>'cancelled' ORDER BY ds.route_stop_sequence,ds.id`).all(day.id,route)
  const issues=[],warnings=[]
  if(!['draft','reapproval_required','in_progress'].includes(day.status))issues.push({code:'DAY_NOT_EDITABLE',message:`The dispatch day is ${day.status}.`})
  if(!rows.length)issues.push({code:'NO_ROUTE_STOPS',message:`Route ${route} has no customers.`})
  const assignment=database.prepare('SELECT vehicle_id vehicleId FROM daily_route_assignments WHERE dispatch_day_id=? AND route_number=?').get(day.id,route)
  if(!assignment?.vehicleId)issues.push({code:'ROUTE_UNASSIGNED',message:`Route ${route} has not been assigned a vehicle.`})
  for(const row of rows){
    if(!row.vehicleId||row.vehicleId!==assignment?.vehicleId)issues.push({code:'ROUTE_VEHICLE_MISMATCH',stopId:row.stopId,message:`${row.branchCode} is not on the Route vehicle.`})
    else if(!['available','active'].includes(row.vehicleOperationalStatus)||!['available','assigned'].includes(row.vehicleStatus))issues.push({code:'VEHICLE_INACTIVE',stopId:row.stopId,message:`${row.vehicleCode} is not Active.`})
    if(![1,2,3].includes(Number(row.tripNumber)))issues.push({code:'TRIP_INVALID',stopId:row.stopId,message:`${row.branchCode} has an invalid Trip.`})
    if(row.branchActive!==1||String(row.branchStatus).toLowerCase()!=='active')issues.push({code:'BRANCH_INACTIVE',stopId:row.stopId,message:`${row.branchName||row.branchCode} is inactive.`})
    if(row.sourceScheduleId&&row.scheduleActive!==1)issues.push({code:'SCHEDULE_SUPERSEDED',stopId:row.stopId,message:`${row.branchCode} belongs to a Superseded Schedule.`})
    if(row.dispatchStatus!=='draft')issues.push({code:'DISPATCH_PROTECTED',stopId:row.stopId,message:`Dispatch ${row.dispatchId} is ${row.dispatchStatus}.`})
    if(!Number.isFinite(row.latitude)||!Number.isFinite(row.longitude)||row.latitude===0||row.longitude===0)warnings.push({code:'GPS_MISSING',stopId:row.stopId,message:`${row.branchName||row.branchCode}: GPS missing.`})
    if(row.estimatedWeightKg==null)warnings.push({code:'WEIGHT_MISSING',stopId:row.stopId,message:`${row.branchName||row.branchCode}: estimated weight not set.`})
  }
  const weighted=rows.filter(row=>row.estimatedWeightKg!=null)
  return{ok:issues.length===0,date:serviceDate,dayId:day.id,routeNumber:route,status:day.status,issues,warnings,summary:{stopCount:rows.length,vehicleId:assignment?.vehicleId??null,estimatedWeightKg:weighted.reduce((sum,row)=>sum+Number(row.estimatedWeightKg),0),weightedStopCount:weighted.length,missingWeightCount:rows.length-weighted.length,missingGpsCount:warnings.filter(item=>item.code==='GPS_MISSING').length}}
}

export function approveRoute(date,routeNumber,{approvedBy='Supervisor',reason='Route checked and ready'}={},database=defaultDb){
  const approvalReason=String(reason||'').trim();if(!approvalReason)throw new Error('Approval reason is required.')
  return withImmediateTransaction(database,()=>{
    const check=routeApprovalCheck(date,routeNumber,database);if(!check.ok){const error=new Error(check.issues.map(item=>item.message).join(' '));error.code='ROUTE_APPROVAL_VALIDATION_FAILED';error.issues=check.issues;throw error}
    const day=dayByDate(database,iso(date)),route=Number(routeNumber),signature=routeSignature(database,day.id,route),approvedByName=actor(approvedBy)
    database.prepare(`INSERT INTO daily_route_approvals(dispatch_day_id,route_number,route_signature,actor,reason) VALUES(?,?,?,?,?)
      ON CONFLICT(dispatch_day_id,route_number) DO UPDATE SET route_signature=excluded.route_signature,actor=excluded.actor,reason=excluded.reason,approved_at=CURRENT_TIMESTAMP`).run(day.id,route,signature,approvedByName,approvalReason)
    database.prepare(`INSERT INTO dispatch_change_logs(dispatch_day_id,actor,change_type,entity_type,entity_id,before_json,after_json,requires_reapproval) VALUES(?,?,'route_approved','daily_route',?,?,?,0)`).run(day.id,approvedByName,String(route),null,json({routeNumber:route,routeSignature:signature,reason:approvalReason}))
    const activeRoutes=database.prepare("SELECT DISTINCT route_number routeNumber FROM dispatch_stops ds JOIN dispatch_trips dt ON dt.id=ds.dispatch_trip_id WHERE dt.dispatch_day_id=? AND ds.status<>'cancelled' AND ds.route_number IS NOT NULL").all(day.id).map(row=>row.routeNumber)
    const allApproved=activeRoutes.length>0&&activeRoutes.every(number=>database.prepare('SELECT route_signature routeSignature FROM daily_route_approvals WHERE dispatch_day_id=? AND route_number=?').get(day.id,number)?.routeSignature===routeSignature(database,day.id,number))
    if(allApproved&&!['in_progress','completed'].includes(day.status)){database.prepare("UPDATE dispatch_days SET status='approved',approved_revision=revision,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(day.id);database.prepare("INSERT INTO dispatch_approvals(dispatch_day_id,action,revision,actor,reason) VALUES(?,?,?,?,?)").run(day.id,day.status==='reapproval_required'?'reapprove':'approve',day.revision,approvedByName,'All active Routes approved individually')}
    else if(day.status==='draft')database.prepare("UPDATE dispatch_days SET status='reapproval_required',updated_at=CURRENT_TIMESTAMP WHERE id=?").run(day.id)
    return getDispatchDay(date,database)
  })
}

export function approveDay(date,{approvedBy='Supervisor',reason=''}={},database=defaultDb){
  const approvalReason=String(reason||'').trim();if(!approvalReason)throw new Error('Approval reason is required.')
  return withImmediateTransaction(database,()=>{const check=dailyApprovalCheck(date,database);if(!check.ok){const error=new Error(check.issues.map(item=>item.message).join(' '));error.code='DAY_APPROVAL_VALIDATION_FAILED';error.issues=check.issues;throw error}const day=dayByDate(database,iso(date)),before={...day}
    const routeNumbers=database.prepare("SELECT DISTINCT route_number routeNumber FROM dispatch_stops ds JOIN dispatch_trips dt ON dt.id=ds.dispatch_trip_id WHERE dt.dispatch_day_id=? AND ds.status<>'cancelled' AND ds.route_number IS NOT NULL").all(day.id).map(row=>row.routeNumber),saveRouteApproval=database.prepare(`INSERT INTO daily_route_approvals(dispatch_day_id,route_number,route_signature,actor,reason) VALUES(?,?,?,?,?) ON CONFLICT(dispatch_day_id,route_number) DO UPDATE SET route_signature=excluded.route_signature,actor=excluded.actor,reason=excluded.reason,approved_at=CURRENT_TIMESTAMP`)
    for(const routeNumber of routeNumbers)saveRouteApproval.run(day.id,routeNumber,routeSignature(database,day.id,routeNumber),actor(approvedBy),approvalReason)
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
    database.prepare('DELETE FROM daily_route_approvals WHERE dispatch_day_id=?').run(day.id)
    database.prepare("UPDATE dispatch_days SET status='draft',revision=revision+1,approved_revision=NULL,published_at=NULL,published_by=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(day.id)
    database.prepare("INSERT INTO dispatch_approvals(dispatch_day_id,action,revision,actor,reason) VALUES(?,'reopen',?,?,?)").run(day.id,day.revision+1,actor(reopenedBy),withdrawalReason)
    database.prepare(`INSERT INTO dispatch_change_logs(dispatch_day_id,actor,change_type,entity_type,entity_id,before_json,after_json,requires_reapproval) VALUES(?,?,'day_approval_withdrawn','dispatch_day',?,?,?,0)`).run(day.id,actor(reopenedBy),String(day.id),json(before),json({...day,status:'draft',revision:day.revision+1,reason:withdrawalReason}))
    return getDispatchDay(date,database)})
}

export function createStop(payload,database=defaultDb){
  return withImmediateTransaction(database,()=>{
    const serviceDate=iso(payload.date),day=dayByDate(database,serviceDate);if(!day)throw new Error('Dispatch day not found')
    const branch=database.prepare('SELECT * FROM branches WHERE jodoo_branch_id=?').get(payload.branchId);if(!branch)throw new Error('Branch not found');if(branch.lifecycle_status!=='ACTIVE')throw new Error('Only an Active Branch can be added to a new Dispatch')
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
  const routePlacementChange=payload.tripId!==undefined||payload.vehicleId!==undefined||payload.tripNumber!==undefined||payload.unassigned||payload.date!==undefined||payload.stopSequence!==undefined
  if(before.route_number&&routePlacementChange)throw new Error(`Route ${before.route_number} 的客户与顺序已固定；请改派整条 Route，不要移动单个客户`)
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
    const updated=database.prepare('SELECT * FROM dispatch_stops WHERE id=?').get(id)
    recordOptimizationFeedback({stopId:id,before,after:updated,reason:payload.reason,actor:actor(payload.changedBy)},{db:database})
    return updated
  })
}

export function adjustRouteCustomer(id,payload={},context={},database=defaultDb){
  const fail=(message,statusCode=409)=>{throw Object.assign(new Error(message),{statusCode})}
  if(!['owner_admin','operations_admin','supervisor'].includes(context.role))fail('只有主管可以调整路线客户。',403)
  const date=payload.date,route=Number(payload.routeNumber),reason=String(payload.reason||'').trim()
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date||'')||!Number.isInteger(route)||route<1||route>5||!reason)fail('请选择日期、ROUTE，并填写原因。',400)
  return withImmediateTransaction(database,()=>{
    const before=draftStopById(database,id);if(!before)fail('找不到收货记录。',404)
    const source=dayByDate(database,before.dispatch_date),targetDay=dayByDate(database,date)
    if(!targetDay)fail('请先建立目标日期的派车安排。')
    if(Number(payload.expectedRevision)!==source.revision||Number(payload.targetRevision)!==targetDay.revision)fail('安排已经改变，请刷新后重试。')
    for(const day of [source,targetDay])if(protectedDayReason(database,day)||!['draft','reapproval_required'].includes(day.status))fail('请先撤回相关日期的批准；已开始执行的日期不能移动客户。')
    if(!before.route_number||['active','completed','cancelled'].includes(before.status)||before.arrived_at||before.completed_at||database.prepare('SELECT 1 FROM purchase_bills WHERE dispatch_stop_id=?').get(id))fail('此收货记录已有执行或单据，不能改期或转移。')
    if(date===before.dispatch_date&&route===before.route_number)fail('请选择不同日期或 ROUTE。',400)
    assertBranchServiceDateAvailable(database,before.branch_id,date,{excludeStopId:Number(id),attemptedScheduleId:before.source_schedule_id,entryPoint:'route_customer_adjustment'})
    const assignment=database.prepare('SELECT vehicle_id vehicleId FROM daily_route_assignments WHERE dispatch_day_id=? AND route_number=?').get(targetDay.id,route)
    const trip=assignment?.vehicleId?ensureVehicleTrip(database,targetDay,assignment.vehicleId,1):ensureUnassignedTrip(database,targetDay)
    const sequence=database.prepare('SELECT COALESCE(MAX(stop_sequence),0)+1 n FROM dispatch_stops WHERE dispatch_id=?').get(trip.dispatch_id).n
    const routeSequence=database.prepare("SELECT COALESCE(MAX(route_stop_sequence),0)+1 n FROM dispatch_stops s JOIN dispatch_trips t ON t.id=s.dispatch_trip_id WHERE t.dispatch_day_id=? AND s.route_number=? AND s.status<>'cancelled'").get(targetDay.id,route).n
    database.prepare('UPDATE dispatch_stops SET dispatch_id=?,dispatch_trip_id=?,service_date=?,dedupe_enforced=1,stop_sequence=?,route_number=?,route_stop_sequence=? WHERE id=?').run(trip.dispatch_id,trip.id,date,sequence,route,routeSequence,id)
    if(date!==before.dispatch_date&&before.source_schedule_id)database.prepare("UPDATE schedule_exceptions SET target_date=? WHERE schedule_id=? AND exception_type='move_date' AND target_date=? AND permanent=0").run(date,before.source_schedule_id,before.dispatch_date)
    if(date!==before.dispatch_date&&before.source_schedule_id)database.prepare("DELETE FROM schedule_exceptions WHERE schedule_id=? AND exception_type='move_date' AND original_date=target_date AND target_date=? AND permanent=0").run(before.source_schedule_id,date)
    if(date!==before.dispatch_date&&before.source_schedule_id)database.prepare("INSERT INTO schedule_exceptions(branch_id,schedule_id,exception_type,original_date,target_date,permanent,reason,created_by) VALUES(?,?,'move_date',?,?,0,?,?)").run(before.branch_id,before.source_schedule_id,before.dispatch_date,date,reason,actor(context.employeeName))
    normalizeTripSequences(database,[before.dispatch_trip_id,trip.id])
    const after={date,routeNumber:route,routeStopSequence:routeSequence,reason}
    invalidateDispatchDay(database,before.dispatch_date,'route_customer_adjusted','dispatch_stop',id,before,after,context.employeeName)
    if(date!==before.dispatch_date)invalidateDispatchDay(database,date,'route_customer_adjusted','dispatch_stop',id,before,after,context.employeeName)
    return{updated:true,stopId:Number(id),...after}
  })
}

export function moveRouteStop(id,payload,database=defaultDb){
  return withImmediateTransaction(database,()=>{
    const before=database.prepare(`SELECT ds.*,dd.id dispatch_day_id,dd.dispatch_date,dd.status day_status,dd.revision,d.vehicle_id source_vehicle_id,dt.trip_number
      FROM dispatch_stops ds JOIN dispatch_trips dt ON dt.id=ds.dispatch_trip_id JOIN dispatch_days dd ON dd.id=dt.dispatch_day_id JOIN dispatches d ON d.id=ds.dispatch_id WHERE ds.id=?`).get(id)
    if(!before)throw Object.assign(new Error('Route stop not found.'),{statusCode:404})
    if(before.route_number)throw Object.assign(new Error(`Route ${before.route_number} 的客户必须整条换车，不能单独移动车站`),{statusCode:409,code:'WHOLE_ROUTE_REQUIRED'})
    if(before.day_status!=='draft')throw Object.assign(new Error('Approved routes cannot be changed. Withdraw Approval first.'),{statusCode:409,code:'ROUTE_APPROVED'})
    if(Number(payload.expectedRevision)!==Number(before.revision))throw Object.assign(new Error('The route was changed by another supervisor. Refresh and try again.'),{statusCode:409,code:'REVISION_CONFLICT'})
    const targetVehicleId=Number(payload.targetVehicleId)
    if(!targetVehicleId||targetVehicleId===Number(before.source_vehicle_id))throw Object.assign(new Error('Select a different target vehicle.'),{statusCode:400})
    const target=database.prepare(`SELECT v.id,v.vehicle_code,v.registration_number FROM vehicles v
      WHERE v.id=? AND v.operational_status IN ('available','active') AND v.status IN ('available','assigned')
      AND (v.is_temporary=0 OR v.temporary_date=?)
      AND NOT EXISTS(SELECT 1 FROM route_vehicle_availability a WHERE a.vehicle_id=v.id AND a.availability_date=? AND a.status<>'available')`).get(targetVehicleId,before.dispatch_date,before.dispatch_date)
    if(!target)throw Object.assign(new Error('Target vehicle is unavailable for this date.'),{statusCode:409,code:'VEHICLE_UNAVAILABLE'})
    const occupied=database.prepare(`SELECT dt.trip_number FROM dispatch_trips dt JOIN dispatches d ON d.id=dt.dispatch_id
      WHERE dt.dispatch_day_id=? AND d.vehicle_id=? AND EXISTS(SELECT 1 FROM dispatch_stops s WHERE s.dispatch_trip_id=dt.id AND s.status<>'cancelled') ORDER BY dt.trip_number DESC LIMIT 1`).get(before.dispatch_day_id,targetVehicleId)
    const targetTrip=ensureVehicleTrip(database,{id:before.dispatch_day_id,dispatch_date:before.dispatch_date},targetVehicleId,occupied?.trip_number||1)
    const targetSequence=database.prepare("SELECT COALESCE(MAX(stop_sequence),0)+1 value FROM dispatch_stops WHERE dispatch_trip_id=? AND status<>'cancelled'").get(targetTrip.id).value
    database.prepare('UPDATE dispatch_stops SET dispatch_id=?,dispatch_trip_id=?,stop_sequence=? WHERE id=? AND dispatch_trip_id=?').run(targetTrip.dispatch_id,targetTrip.id,targetSequence,id,before.dispatch_trip_id)
    database.prepare("UPDATE dispatch_stops SET stop_sequence=stop_sequence-1 WHERE dispatch_trip_id=? AND status<>'cancelled' AND stop_sequence>?").run(before.dispatch_trip_id,before.stop_sequence)
    const after=database.prepare('SELECT * FROM dispatch_stops WHERE id=?').get(id)
    invalidateDispatchDay(database,before.dispatch_date,'route_stop_vehicle_moved','dispatch_stop',id,
      {date:before.dispatch_date,stopId:Number(id),vehicleId:before.source_vehicle_id,tripId:before.dispatch_trip_id,stopSequence:before.stop_sequence},
      {date:before.dispatch_date,stopId:Number(id),vehicleId:targetVehicleId,tripId:targetTrip.id,stopSequence:targetSequence,reason:payload.reason||null},payload.changedBy)
    return{stopId:Number(id),date:before.dispatch_date,sourceVehicleId:before.source_vehicle_id,targetVehicleId,previousSequence:before.stop_sequence,newSequence:targetSequence,revision:before.revision+1,stop:after}
  })
}
export function deleteStop(id,{changedBy='Supervisor',reason='Weekly planner removal'}={},database=defaultDb){const before=database.prepare(`SELECT ds.*,dd.dispatch_date FROM dispatch_stops ds JOIN dispatch_trips dt ON dt.id=ds.dispatch_trip_id JOIN dispatch_days dd ON dd.id=dt.dispatch_day_id WHERE ds.id=?`).get(id);if(!before)throw new Error('Stop not found');database.exec('BEGIN IMMEDIATE');try{if(before.source_schedule_id&&!database.prepare("SELECT id FROM schedule_exceptions WHERE schedule_id=? AND exception_type='cancel_date' AND original_date=? AND permanent=0").get(before.source_schedule_id,before.dispatch_date))database.prepare(`INSERT INTO schedule_exceptions(branch_id,schedule_id,exception_type,original_date,permanent,reason,created_by) VALUES(?,?,'cancel_date',?,0,?,?)`).run(before.branch_id,before.source_schedule_id,before.dispatch_date,reason,actor(changedBy));database.prepare('DELETE FROM dispatch_stops WHERE id=?').run(id);invalidateDispatchDay(database,before.dispatch_date,'stop_removed','dispatch_stop',id,before,null,changedBy);database.exec('COMMIT');return{deleted:true,id:Number(id)}}catch(error){database.exec('ROLLBACK');throw error}}

export function updateTrip(id,payload,database=defaultDb){return withImmediateTransaction(database,()=>{const before=database.prepare(`SELECT dt.*,dd.dispatch_date,d.* FROM dispatch_trips dt JOIN dispatch_days dd ON dd.id=dt.dispatch_day_id JOIN dispatches d ON d.id=dt.dispatch_id WHERE dt.id=?`).get(id);if(!before)throw new Error('Trip not found');database.prepare(`UPDATE dispatches SET vehicle_id=?,driver_id=?,assistant_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(payload.vehicleId??before.vehicle_id,payload.driverId??before.driver_id,payload.assistantId??before.assistant_id,before.dispatch_id);if(payload.startLocation){const resolved=resolveStartLocation(payload.startLocation,{driverId:payload.driverId??before.driver_id,canViewEmployeeHome:Boolean(payload.canViewEmployeeHome)},database);writeStartLocationSnapshot(database,before.dispatch_id,resolved)}const commercialChanged=Object.hasOwn(payload,'buyerPayer')||Object.hasOwn(payload,'primaryEndLocation');if(commercialChanged){const buyer=Object.hasOwn(payload,'buyerPayer')?resolveBuyerPayer(payload.buyerPayer,database):(before.buyer_reference_id?{buyerReferenceId:before.buyer_reference_id,buyerCode:before.buyer_code,buyerName:before.buyer_name}:null),endLocation=Object.hasOwn(payload,'primaryEndLocation')?resolvePrimaryEndLocation(payload.primaryEndLocation,database):(before.end_location_reference_id?{endLocationId:before.end_location_id,endLocationReferenceType:before.end_location_reference_type,endLocationReferenceId:before.end_location_reference_id,endLocationName:before.end_location_name,endLocationParentName:before.end_location_parent_name,endAddress:before.end_address,endLatitude:before.end_latitude,endLongitude:before.end_longitude}:null);writeCommercialSnapshot(database,before.dispatch_id,{buyer,endLocation})}database.prepare('UPDATE dispatch_trips SET trip_number=COALESCE(?,trip_number),estimated_weight_kg=COALESCE(?,estimated_weight_kg),updated_at=CURRENT_TIMESTAMP WHERE id=?').run(payload.tripNumber??null,payload.estimatedWeightKg??null,id);const after=database.prepare('SELECT * FROM dispatches WHERE id=?').get(before.dispatch_id),changeType=payload.startLocation?'trip_start_location_updated':commercialChanged?'trip_commercial_route_updated':'trip_updated';invalidateDispatchDay(database,before.dispatch_date,changeType,'dispatch_trip',id,before,{...after,reason:payload.reason||null},payload.changedBy);return database.prepare('SELECT * FROM dispatch_trips WHERE id=?').get(id)})}

export function getStartLocationOptions(payload={},database=defaultDb){return startLocationOptions(payload,database)}

export function renameRoute(routeNumber,payload={},database=defaultDb){
  const route=Number(routeNumber),name=String(payload.name||'').trim(),changedBy=actor(payload.changedBy)
  if(!Number.isInteger(route)||route<1||route>5)throw new Error('Route must be between 1 and 5')
  if(!name)throw new Error('Route name is required')
  if(name.length>60)throw new Error('Route name must not exceed 60 characters')
  const plan=database.prepare('SELECT id FROM weekly_route_plans WHERE is_active=1 ORDER BY id DESC LIMIT 1').get()
  if(!plan)throw new Error('Active weekly route plan not found')
  const duplicate=database.prepare('SELECT route_number routeNumber FROM weekly_route_definitions WHERE plan_id=? AND route_number<>? AND lower(trim(display_name))=lower(?)').get(plan.id,route,name)
  if(duplicate)throw new Error(`This name is already used by Route ${duplicate.routeNumber}`)
  const before=database.prepare('SELECT display_name displayName FROM weekly_route_definitions WHERE plan_id=? AND route_number=?').get(plan.id,route)?.displayName||`Route ${route}`
  database.prepare(`INSERT INTO weekly_route_definitions(plan_id,route_number,display_name,updated_by) VALUES(?,?,?,?)
    ON CONFLICT(plan_id,route_number) DO UPDATE SET display_name=excluded.display_name,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`).run(plan.id,route,name,changedBy)
  database.prepare("INSERT INTO master_change_history(entity_type,entity_id,change_type,old_value,new_value,before_json,after_json,reason,changed_by) VALUES('weekly_route_definition',?,'RENAME',?,?,?,?,?,?)")
    .run(`${plan.id}:${route}`,before,name,JSON.stringify({routeNumber:route,name:before}),JSON.stringify({routeNumber:route,name}),'Route display name changed',changedBy)
  return{routeNumber:route,name}
}

export function reorderRouteStop(date,routeNumber,payload={},database=defaultDb){
  const serviceDate=iso(date),route=Number(routeNumber),stopId=Number(payload.stopId),direction=payload.direction,changedBy=actor(payload.changedBy)
  if(!Number.isInteger(route)||route<1||route>5)throw new Error('Route must be between 1 and 5')
  if(!Number.isInteger(stopId)||stopId<1)throw new Error('Stop is required')
  if(!['up','down'].includes(direction))throw new Error('Direction must be up or down')
  const day=dayByDate(database,serviceDate)
  if(!day)throw new Error('Dispatch day not found')
  const protection=protectedDayReason(database,day)
  if(protection||!['draft','reapproval_required'].includes(day.status))throw new Error(`Route order is protected: ${protection||day.status}`)
  const visible=database.prepare(`SELECT ds.id,ds.branch_id branchId,ds.route_stop_sequence routeStopSequence FROM dispatch_stops ds JOIN dispatch_trips dt ON dt.id=ds.dispatch_trip_id
    WHERE dt.dispatch_day_id=? AND ds.route_number=? AND ds.status<>'cancelled' ORDER BY ds.route_stop_sequence,ds.id`).all(day.id,route)
  const index=visible.findIndex(row=>row.id===stopId),targetIndex=index+(direction==='up'?-1:1)
  if(index<0)throw new Error('Customer is not in this Route')
  if(targetIndex<0||targetIndex>=visible.length)return getDispatchDay(serviceDate,database)
  const plan=database.prepare('SELECT id FROM weekly_route_plans WHERE is_active=1 ORDER BY id DESC LIMIT 1').get()
  if(!plan)throw new Error('Active weekly route plan not found')
  const weekday=weekdayForDate(serviceDate),template=database.prepare(`SELECT rowid rowId,branch_id branchId,trip_number tripNumber,stop_sequence stopSequence FROM weekly_route_plan_stops
    WHERE plan_id=? AND weekday=? AND route_number=? ORDER BY trip_number,stop_sequence,rowid`).all(plan.id,weekday,route)
  const sourceIndex=template.findIndex(row=>row.branchId===visible[index].branchId),anchorIndex=template.findIndex(row=>row.branchId===visible[targetIndex].branchId)
  if(sourceIndex<0||anchorIndex<0)throw new Error('Route template customer not found')
  const reordered=[...template],moved=reordered.splice(sourceIndex,1)[0],anchor=reordered.findIndex(row=>row.branchId===visible[targetIndex].branchId)
  reordered.splice(direction==='up'?anchor:anchor+1,0,moved)
  database.exec('BEGIN IMMEDIATE')
  try{
    database.prepare('UPDATE weekly_route_plan_stops SET stop_sequence=stop_sequence+10000 WHERE plan_id=? AND weekday=? AND route_number=?').run(plan.id,weekday,route)
    const updateTemplate=database.prepare('UPDATE weekly_route_plan_stops SET trip_number=?,stop_sequence=? WHERE rowid=?')
    reordered.forEach((row,position)=>updateTemplate.run(row.tripNumber,position+1,row.rowId))
    const sequenceByBranch=new Map(reordered.map((row,position)=>[row.branchId,position+1]))
    const editableDays=database.prepare(`SELECT id FROM dispatch_days WHERE status IN ('draft','reapproval_required') AND CAST(strftime('%w',dispatch_date) AS INTEGER)=?`).all(weekday)
    const updateDay=database.prepare(`UPDATE dispatch_stops SET route_stop_sequence=? WHERE branch_id=? AND route_number=? AND dispatch_trip_id IN(SELECT id FROM dispatch_trips WHERE dispatch_day_id=?) AND status<>'cancelled'`)
    for(const editableDay of editableDays)for(const [branchId,sequence] of sequenceByBranch)updateDay.run(sequence,branchId,route,editableDay.id)
    database.prepare("INSERT INTO master_change_history(entity_type,entity_id,change_type,before_json,after_json,reason,changed_by) VALUES('weekly_route_stop',?,'REORDER',?,?,?,?)")
      .run(`${plan.id}:${weekday}:${visible[index].branchId}`,JSON.stringify({routeNumber:route,weekday,branchId:visible[index].branchId,position:index+1}),JSON.stringify({routeNumber:route,weekday,branchId:visible[index].branchId,position:targetIndex+1}),'Route customer order changed',changedBy)
    database.exec('COMMIT')
    return getDispatchDay(serviceDate,database)
  }catch(error){database.exec('ROLLBACK');throw error}
}

/** Assigns one complete Route to a vehicle for this date only. Route membership and order never change. */
export function assignRouteVehicle(date,routeNumber,payload={},database=defaultDb){
  const day=dayByDate(database,iso(date)),route=Number(routeNumber),vehicleId=payload.vehicleId==null?null:Number(payload.vehicleId)
  if(!day)throw new Error('Dispatch day not found')
  if(!Number.isInteger(route)||route<1||route>5)throw new Error('Route must be between 1 and 5')
  const protection=protectedDayReason(database,day);if(protection||!['draft','reapproval_required'].includes(day.status))throw new Error(`Route assignment is protected: ${protection||day.status}`)
  if(vehicleId){
    const vehicle=database.prepare("SELECT id FROM vehicles WHERE id=? AND operational_status IN ('available','active') AND status IN ('available','assigned') AND (is_temporary=0 OR temporary_date=?)").get(vehicleId,day.dispatch_date)
    if(!vehicle)throw new Error('Vehicle is not available for this date')
    const conflict=database.prepare('SELECT route_number routeNumber FROM daily_route_assignments WHERE dispatch_day_id=? AND vehicle_id=? AND route_number<>?').get(day.id,vehicleId,route)
    if(conflict)throw new Error(`This vehicle is already assigned to Route ${conflict.routeNumber}`)
  }
  const stops=database.prepare(`SELECT ds.id,ds.dispatch_trip_id tripId FROM dispatch_stops ds JOIN dispatch_trips dt ON dt.id=ds.dispatch_trip_id
    WHERE dt.dispatch_day_id=? AND ds.route_number=? AND ds.status<>'cancelled' ORDER BY ds.route_stop_sequence,ds.id`).all(day.id,route)
  if(!stops.length)throw new Error(`Route ${route} has no customers on this date`)
  const before=database.prepare('SELECT route_number routeNumber,vehicle_id vehicleId FROM daily_route_assignments WHERE dispatch_day_id=? AND route_number=?').get(day.id,route)||{routeNumber:route,vehicleId:null}
  database.exec('BEGIN IMMEDIATE')
  try{
    const touched=stops.map(stop=>stop.tripId)
    database.prepare(`UPDATE dispatch_stops SET stop_sequence=-id WHERE id IN (SELECT ds.id FROM dispatch_stops ds JOIN dispatch_trips dt ON dt.id=ds.dispatch_trip_id WHERE dt.dispatch_day_id=? AND ds.route_number=?)`).run(day.id,route)
    const target=vehicleId?ensureVehicleTrip(database,day,vehicleId,1):ensureUnassignedTrip(database,day)
    let sequence=database.prepare('SELECT COALESCE(MAX(stop_sequence),0) value FROM dispatch_stops WHERE dispatch_id=? AND stop_sequence>0').get(target.dispatch_id).value
    const move=database.prepare('UPDATE dispatch_stops SET dispatch_id=?,dispatch_trip_id=?,stop_sequence=? WHERE id=?')
    for(const stop of stops){sequence+=1;move.run(target.dispatch_id,target.id,sequence,stop.id)}
    if(vehicleId)database.prepare(`INSERT INTO daily_route_assignments(dispatch_day_id,route_number,vehicle_id,assigned_by) VALUES(?,?,?,?)
      ON CONFLICT(dispatch_day_id,route_number) DO UPDATE SET vehicle_id=excluded.vehicle_id,assigned_by=excluded.assigned_by,updated_at=CURRENT_TIMESTAMP`).run(day.id,route,vehicleId,actor(payload.changedBy))
    else database.prepare('DELETE FROM daily_route_assignments WHERE dispatch_day_id=? AND route_number=?').run(day.id,route)
    if(vehicleId)carryForwardVehicleDriver(database,day,vehicleId)
    // Keep original sequence slots, including cancelled history.
    invalidateDispatchDay(database,day.dispatch_date,'daily_route_vehicle_assigned','route',route,before,{routeNumber:route,vehicleId},payload.changedBy)
    if(!isSunday(day.dispatch_date))fillRouteVehicleDefaults(database,addDays(day.dispatch_date,1))
    database.exec('COMMIT');return getDispatchDay(date,database)
  }catch(error){database.exec('ROLLBACK');throw error}
}

export function assignVehicleDay(date,vehicleId,payload,database=defaultDb){
  const day=dayByDate(database,iso(date));if(!day)throw new Error('Dispatch day not found')
  const before=database.prepare(`SELECT d.driver_id driverId,d.assistant_id assistantId,d.start_location_id startLocationId,d.end_location_id endLocationId FROM dispatch_trips dt JOIN dispatches d ON d.id=dt.dispatch_id WHERE dt.dispatch_day_id=? AND d.vehicle_id=? LIMIT 1`).get(day.id,vehicleId)||{}
  before.assistantIds=database.prepare('SELECT employee_id id FROM dispatch_vehicle_assistants WHERE dispatch_day_id=? AND vehicle_id=? ORDER BY employee_id').all(day.id,vehicleId).map(item=>item.id)
  if(payload.driverId){
    const driver=database.prepare(`SELECT * FROM employees e WHERE id=? AND is_active=1 AND employment_status='active' AND (lower(job_role) IN ('driver','supervisor') OR EXISTS(SELECT 1 FROM employee_job_roles r WHERE r.employee_id=e.id AND r.role='Driver' AND r.is_active=1))`).get(payload.driverId)
    if(!driver)throw new Error('所选员工不是可用 Driver')
    const conflict=database.prepare(`SELECT v.vehicle_code vehicle FROM dispatch_trips dt JOIN dispatches d ON d.id=dt.dispatch_id JOIN vehicles v ON v.id=d.vehicle_id
      WHERE dt.dispatch_day_id=? AND d.driver_id=? AND d.vehicle_id<>? LIMIT 1`).get(day.id,payload.driverId,vehicleId)
    if(conflict)throw new Error(`该司机当天已分配给 ${conflict.vehicle}，请先解除原分配`)
    const assistantConflict=database.prepare(`SELECT 1 FROM dispatch_vehicle_assistants WHERE dispatch_day_id=? AND employee_id=? LIMIT 1`).get(day.id,payload.driverId)
    if(assistantConflict)throw new Error('该员工当天已担任 Attendant，不能同时担任 Driver')
  }
  const assistantIds=payload.assistantIds===undefined?null:[...new Set((payload.assistantIds||[]).map(Number).filter(Boolean))]
  if(assistantIds&&assistantIds.length>MAX_ASSIGNED_CREW)throw new Error(`每辆车最多只能安排 ${MAX_ASSIGNED_CREW} 名 Assistant/Crew`)
  if(assistantIds)for(const employeeId of assistantIds){if(Number(payload.driverId)===employeeId)throw new Error('同一员工同一天不能同时担任 Driver 与 Attendant');const employee=database.prepare(`SELECT id FROM employees e WHERE id=? AND is_active=1 AND employment_status='active' AND (lower(job_role) IN ('assistant','crew','attendant / crew') OR EXISTS(SELECT 1 FROM employee_job_roles r WHERE r.employee_id=e.id AND r.role='Attendant / Crew' AND r.is_active=1))`).get(employeeId);if(!employee)throw new Error('所选员工不是可用 Assistant/Crew');const driving=database.prepare(`SELECT 1 FROM dispatch_trips dt JOIN dispatches d ON d.id=dt.dispatch_id WHERE dt.dispatch_day_id=? AND d.driver_id=? LIMIT 1`).get(day.id,employeeId);if(driving)throw new Error('该员工当天已担任 Driver，不能同时担任 Attendant');const otherVehicle=database.prepare(`SELECT v.vehicle_code vehicle FROM dispatch_vehicle_assistants dva JOIN vehicles v ON v.id=dva.vehicle_id WHERE dva.dispatch_day_id=? AND dva.employee_id=? AND dva.vehicle_id<>? LIMIT 1`).get(day.id,employeeId,vehicleId);if(otherVehicle)throw new Error(`该跟车员当天已分配给 ${otherVehicle.vehicle}，请先解除原分配`)}
  database.exec('BEGIN IMMEDIATE')
  try{
    if(assistantIds){database.prepare('DELETE FROM dispatch_vehicle_assistants WHERE dispatch_day_id=? AND vehicle_id=?').run(day.id,vehicleId);const insert=database.prepare('INSERT INTO dispatch_vehicle_assistants(dispatch_day_id,vehicle_id,employee_id,employment_period_id) VALUES(?,?,?,?)');for(const employeeId of assistantIds)insert.run(day.id,vehicleId,employeeId,currentEmploymentPeriod(database,employeeId))}
    for(let tripNumber=1;tripNumber<=3;tripNumber+=1){const trip=ensureVehicleTrip(database,day,Number(vehicleId),tripNumber);const dispatch=database.prepare('SELECT * FROM dispatches WHERE id=?').get(trip.dispatch_id),driverId=payload.driverId===undefined?dispatch.driver_id:payload.driverId,assistantId=assistantIds===null?dispatch.assistant_id:(assistantIds[0]||null);database.prepare(`UPDATE dispatches SET driver_id=?,driver_employment_period_id=?,assistant_id=?,assistant_employment_period_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(driverId,currentEmploymentPeriod(database,driverId),assistantId,currentEmploymentPeriod(database,assistantId),trip.dispatch_id);if(payload.startLocation)writeStartLocationSnapshot(database,trip.dispatch_id,resolveStartLocation(payload.startLocation,{driverId,canViewEmployeeHome:Boolean(payload.canViewEmployeeHome)},database));if(payload.endLocationId!==undefined)writeCommercialSnapshot(database,trip.dispatch_id,{buyer:dispatch.buyer_reference_id?{buyerReferenceId:dispatch.buyer_reference_id,buyerCode:dispatch.buyer_code,buyerName:dispatch.buyer_name}:null,endLocation:payload.endLocationId?resolvePrimaryEndLocation(payload.endLocationId,database):null})}
    invalidateDispatchDay(database,day.dispatch_date,'vehicle_assignment_updated','vehicle',vehicleId,before,{...payload,assistantIds},payload.changedBy)
    const selectedDriver=payload.driverId?database.prepare('SELECT job_role jobRole FROM employees WHERE id=?').get(payload.driverId):null
    if(!isSunday(day.dispatch_date)&&payload.driverId&&!isTemporarySupervisorDriver(selectedDriver)){const futureDays=database.prepare(`SELECT DISTINCT dd.id,dd.dispatch_date FROM dispatch_days dd JOIN daily_route_assignments a ON a.dispatch_day_id=dd.id
      WHERE dd.dispatch_date>? AND dd.status IN ('draft','reapproval_required','approved') AND a.vehicle_id=? ORDER BY dd.dispatch_date`).all(day.dispatch_date,vehicleId);for(const futureDay of futureDays)carryForwardVehicleDriver(database,futureDay,Number(vehicleId))}
    database.exec('COMMIT');return getDispatchDay(date,database)
  }catch(error){database.exec('ROLLBACK');throw error}
}

export function transferVehicleDay(date,sourceVehicleId,payload,database=defaultDb){
  const day=dayByDate(database,iso(date));if(!day)throw new Error('Dispatch day not found')
  const targetId=Number(payload.targetVehicleId);if(!targetId||targetId===Number(sourceVehicleId))throw new Error('Please select a different target vehicle')
  const source=database.prepare('SELECT * FROM vehicles WHERE id=?').get(sourceVehicleId),target=database.prepare("SELECT * FROM vehicles WHERE id=? AND operational_status IN ('available','active')").get(targetId)
  if(!source||!target)throw new Error('Source or target vehicle is unavailable')
  const targetRoute=database.prepare('SELECT route_number routeNumber FROM daily_route_assignments WHERE dispatch_day_id=? AND vehicle_id=?').get(day.id,targetId)
  if(targetRoute)throw new Error(`Target vehicle is already assigned to Route ${targetRoute.routeNumber}`)
  const sourceTrips=database.prepare(`SELECT dt.*,d.driver_id,d.assistant_id,d.start_location_id,d.start_location_type,d.start_location_reference_type,d.start_location_reference_id,d.start_location_name,d.start_address,d.start_latitude,d.start_longitude,d.buyer_reference_id,d.buyer_code,d.buyer_name,d.end_location_id,d.end_location_reference_type,d.end_location_reference_id,d.end_location_name,d.end_location_parent_name,d.end_address,d.end_latitude,d.end_longitude FROM dispatch_trips dt JOIN dispatches d ON d.id=dt.dispatch_id WHERE dt.dispatch_day_id=? AND d.vehicle_id=? ORDER BY dt.trip_number,dt.id`).all(day.id,sourceVehicleId)
  if(!sourceTrips.length)throw new Error('Source vehicle has no route to transfer')
  const before={sourceVehicleId:Number(sourceVehicleId),targetVehicleId:targetId,tripIds:sourceTrips.map(item=>item.id),driverId:sourceTrips.find(item=>item.driver_id)?.driver_id??null}
  database.exec('BEGIN IMMEDIATE')
  try{
    for(const sourceTrip of sourceTrips){
      const targetTrip=ensureVehicleTrip(database,day,targetId,sourceTrip.trip_number)
      let sequence=database.prepare('SELECT COALESCE(MAX(stop_sequence),0) value FROM dispatch_stops WHERE dispatch_id=?').get(targetTrip.dispatch_id).value
      const stops=database.prepare('SELECT id FROM dispatch_stops WHERE dispatch_trip_id=? ORDER BY stop_sequence').all(sourceTrip.id)
      for(const stop of stops){sequence+=1;database.prepare('UPDATE dispatch_stops SET dispatch_id=?,dispatch_trip_id=?,stop_sequence=? WHERE id=?').run(targetTrip.dispatch_id,targetTrip.id,sequence,stop.id)}
      if(payload.transferDriver!==false){database.prepare(`UPDATE dispatches SET driver_id=COALESCE(?,driver_id),driver_employment_period_id=COALESCE(?,driver_employment_period_id),assistant_id=COALESCE(?,assistant_id),assistant_employment_period_id=COALESCE(?,assistant_employment_period_id),updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(sourceTrip.driver_id,currentEmploymentPeriod(database,sourceTrip.driver_id),sourceTrip.assistant_id,currentEmploymentPeriod(database,sourceTrip.assistant_id),targetTrip.dispatch_id);if(sourceTrip.start_location_type)writeStartLocationSnapshot(database,targetTrip.dispatch_id,{startLocationId:sourceTrip.start_location_id,startLocationType:sourceTrip.start_location_type,startLocationReferenceType:sourceTrip.start_location_reference_type,startLocationReferenceId:sourceTrip.start_location_reference_id,startLocationName:sourceTrip.start_location_name,startAddress:sourceTrip.start_address,startLatitude:sourceTrip.start_latitude,startLongitude:sourceTrip.start_longitude});if(sourceTrip.buyer_reference_id||sourceTrip.end_location_reference_id)writeCommercialSnapshot(database,targetTrip.dispatch_id,{buyer:sourceTrip.buyer_reference_id?{buyerReferenceId:sourceTrip.buyer_reference_id,buyerCode:sourceTrip.buyer_code,buyerName:sourceTrip.buyer_name}:null,endLocation:sourceTrip.end_location_reference_id?{endLocationId:sourceTrip.end_location_id,endLocationReferenceType:sourceTrip.end_location_reference_type,endLocationReferenceId:sourceTrip.end_location_reference_id,endLocationName:sourceTrip.end_location_name,endLocationParentName:sourceTrip.end_location_parent_name,endAddress:sourceTrip.end_address,endLatitude:sourceTrip.end_latitude,endLongitude:sourceTrip.end_longitude}:null})}
      database.prepare('UPDATE dispatches SET vehicle_id=NULL,driver_id=NULL,assistant_id=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(sourceTrip.dispatch_id)
    }
    if(payload.transferDriver!==false){
      const assistants=database.prepare('SELECT employee_id FROM dispatch_vehicle_assistants WHERE dispatch_day_id=? AND vehicle_id=?').all(day.id,sourceVehicleId)
      const add=database.prepare('INSERT OR IGNORE INTO dispatch_vehicle_assistants(dispatch_day_id,vehicle_id,employee_id,employment_period_id) VALUES(?,?,?,?)')
      for(const item of assistants)add.run(day.id,targetId,item.employee_id,currentEmploymentPeriod(database,item.employee_id))
      database.prepare('DELETE FROM dispatch_vehicle_assistants WHERE dispatch_day_id=? AND vehicle_id=?').run(day.id,sourceVehicleId)
    }
    database.prepare('UPDATE daily_route_assignments SET vehicle_id=?,assigned_by=?,updated_at=CURRENT_TIMESTAMP WHERE dispatch_day_id=? AND vehicle_id=?').run(targetId,actor(payload.changedBy),day.id,sourceVehicleId)
    if(payload.setSourceMaintenance){database.prepare("UPDATE vehicles SET operational_status='maintenance',status='maintenance',updated_at=CURRENT_TIMESTAMP WHERE id=?").run(sourceVehicleId);database.prepare("INSERT INTO vehicle_status_history(vehicle_id,previous_status,new_status,reason,changed_by) VALUES(?,?,'maintenance',?,?)").run(sourceVehicleId,source.operational_status,payload.reason||'Vehicle route transferred due to maintenance',actor(payload.changedBy))}
    invalidateDispatchDay(database,day.dispatch_date,'vehicle_route_transferred','vehicle',sourceVehicleId,before,{targetVehicleId:targetId,transferDriver:payload.transferDriver!==false,setSourceMaintenance:Boolean(payload.setSourceMaintenance),reason:payload.reason||null},payload.changedBy)
    database.exec('COMMIT');return getDispatchDay(date,database)
  }catch(error){database.exec('ROLLBACK');throw error}
}

// Today's operational assignment changes; immutable bill/weight snapshots are never rewritten.
export function handoverRoute(date,routeNumber,payload={},context={},database=defaultDb){
  const fail=message=>Object.assign(new Error(message),{statusCode:409})
  if(!['supervisor','operations_admin','owner_admin'].includes(context.role))throw Object.assign(new Error('Supervisor permission required'),{statusCode:403})
  if(date!==(context.today||iso()))throw fail('只能调整当天；其他日期请使用正常派车安排')
  const reason=String(payload.reason||'').trim(),vehicleId=Number(payload.vehicleId),driverId=Number(payload.driverId),route=Number(routeNumber)
  if(!reason)throw fail('请填写调整原因')
  if(!Number.isInteger(route)||route<1||route>5)throw fail('Invalid Route')
  return withImmediateTransaction(database,()=>{
    const day=dayByDate(database,date)
    if(!day||Number(payload.expectedRevision)!==day.revision)throw fail('安排已更新，请刷新后再试')
    if(day.status==='completed')throw fail('当天收货已全部完成，不能调整执行安排')
    const assignment=database.prepare('SELECT vehicle_id vehicleId FROM daily_route_assignments WHERE dispatch_day_id=? AND route_number=?').get(day.id,route)
    if(!assignment?.vehicleId)throw fail('请先为这条 Route 分配车辆')
    const trips=database.prepare('SELECT d.* FROM dispatches d JOIN dispatch_trips dt ON dt.dispatch_id=d.id WHERE dt.dispatch_day_id=? AND d.vehicle_id=?').all(day.id,assignment.vehicleId)
    if(!trips.length)throw fail('没有可交接的行程')
    const usable=database.prepare("SELECT 1 FROM vehicles v WHERE id=? AND operational_status IN ('available','active') AND status IN ('available','assigned') AND (is_temporary=0 OR temporary_date=?) AND NOT EXISTS(SELECT 1 FROM route_vehicle_availability va WHERE va.vehicle_id=v.id AND va.availability_date=? AND va.status<>'available')").get(vehicleId,date,date)
    const driver=database.prepare(`SELECT e.* FROM employees e WHERE id=? AND is_active=1 AND employment_status='active' AND (lower(job_role) IN ('driver','supervisor') OR EXISTS(SELECT 1 FROM employee_job_roles r WHERE r.employee_id=e.id AND r.role='Driver' AND r.is_active=1)) AND NOT EXISTS(SELECT 1 FROM route_employee_availability a WHERE a.employee_id=e.id AND a.availability_date=? AND a.status<>'available')`).get(driverId,date)
    if(!usable||!driver)throw fail('请选择可用车辆和司机')
    if(database.prepare('SELECT 1 FROM daily_route_assignments WHERE dispatch_day_id=? AND vehicle_id=? AND route_number<>?').get(day.id,vehicleId,route))throw fail('车辆已经分配给另一条 Route')
    if(database.prepare(`SELECT 1 FROM dispatch_trips dt JOIN dispatch_stops ds ON ds.dispatch_trip_id=dt.id JOIN dispatches d ON d.id=dt.dispatch_id WHERE dt.dispatch_day_id=? AND d.vehicle_id=? AND ds.status<>'cancelled' AND (ds.route_number IS NULL OR ds.route_number<>?) LIMIT 1`).get(day.id,assignment.vehicleId,route))throw fail('原车有其他 Route 的任务，请先核对')
    if(database.prepare(`SELECT 1 FROM dispatch_trips dt JOIN dispatches d ON d.id=dt.dispatch_id WHERE dt.dispatch_day_id=? AND d.vehicle_id<>? AND d.driver_id=? LIMIT 1`).get(day.id,assignment.vehicleId,driverId)||database.prepare('SELECT 1 FROM dispatch_vehicle_assistants WHERE dispatch_day_id=? AND employee_id=?').get(day.id,driverId))throw fail('该司机已有其他当天任务，请先解除冲突')
    const targetTrips=vehicleId===assignment.vehicleId?[]:database.prepare('SELECT d.id,dt.id tripId,dt.execution_status FROM dispatches d JOIN dispatch_trips dt ON dt.dispatch_id=d.id WHERE dt.dispatch_day_id=? AND d.vehicle_id=?').all(day.id,vehicleId)
    for(const target of targetTrips)if(target.execution_status!=='not_started'||database.prepare('SELECT 1 FROM dispatch_stops WHERE dispatch_trip_id=? LIMIT 1').get(target.tripId)||database.prepare('SELECT 1 FROM unloading_weight_records WHERE dispatch_trip_id=? LIMIT 1').get(target.tripId))throw fail('接手车辆已有收货或卸货记录，不能合并')
    if(vehicleId!==assignment.vehicleId&&database.prepare('SELECT 1 FROM dispatch_vehicle_assistants WHERE dispatch_day_id=? AND vehicle_id=?').get(day.id,vehicleId))throw fail('接手车辆已有跟车员安排，请先核对')
    if(trips.every(t=>t.vehicle_id===vehicleId&&t.driver_id===driverId))throw fail('车辆和司机没有改变')
    const before={vehicleId:assignment.vehicleId,trips,targetTrips}
    const approval=database.prepare('SELECT route_signature signature FROM daily_route_approvals WHERE dispatch_day_id=? AND route_number=?').get(day.id,route)
    const preserveApproval=approval&&(approval.signature===routeSignature(database,day.id,route)||trips.some(t=>t.status==='in_progress'))
    for(const target of targetTrips)database.prepare('UPDATE dispatches SET vehicle_id=NULL,driver_id=NULL WHERE id=?').run(target.id)
    for(const trip of trips)database.prepare('UPDATE dispatches SET vehicle_id=?,driver_id=?,driver_employment_period_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(vehicleId,driverId,currentEmploymentPeriod(database,driverId),trip.id)
    if(vehicleId!==assignment.vehicleId)database.prepare('UPDATE dispatch_vehicle_assistants SET vehicle_id=? WHERE dispatch_day_id=? AND vehicle_id=?').run(vehicleId,day.id,assignment.vehicleId)
    database.prepare('UPDATE daily_route_assignments SET vehicle_id=?,updated_at=CURRENT_TIMESTAMP WHERE dispatch_day_id=? AND route_number=?').run(vehicleId,day.id,route)
    // Supervisor confirms the new operational assignment; no automatic approval of unapproved Routes.
    if(preserveApproval)database.prepare('UPDATE daily_route_approvals SET route_signature=? WHERE dispatch_day_id=? AND route_number=?').run(routeSignature(database,day.id,route),day.id,route)
    database.prepare("UPDATE dispatch_days SET approved_revision=CASE WHEN status='approved' AND approved_revision=revision THEN revision+1 ELSE approved_revision END,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(day.id)
    database.prepare(`INSERT INTO dispatch_change_logs(dispatch_day_id,actor,change_type,entity_type,entity_id,before_json,after_json,requires_reapproval) VALUES(?,?,'route_day_handover','route',?,?,?,0)`).run(day.id,actor(context.employeeName),String(route),json(before),json({vehicleId,driverId,reason,date,temporary:true}))
    return getDispatchDay(date,database)
  })
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

/** Adds one or more date-specific, unassigned stops to a Route. The Route's vehicle, if any, carries them automatically. */
export function assignStopsToRoute(date,payload={},database=defaultDb){
  const serviceDate=iso(date),day=dayByDate(database,serviceDate),route=Number(payload.routeNumber)
  if(!day)throw new Error('Dispatch day not found')
  if(!Number.isInteger(route)||route<1||route>5)throw new Error('Route must be between 1 and 5')
  if(!['draft','reapproval_required','approved','in_progress'].includes(day.status))throw new Error(`当天已经是 ${day.status}，不能再分配客户`)
  const protectedRoute=database.prepare(`SELECT d.id,d.status FROM dispatch_stops ds JOIN dispatch_trips dt ON dt.id=ds.dispatch_trip_id JOIN dispatches d ON d.id=dt.dispatch_id
    WHERE dt.dispatch_day_id=? AND ds.route_number=? AND ds.status<>'cancelled' AND d.status IN ('released','in_progress','completed') ORDER BY d.id LIMIT 1`).get(day.id,route)
  if(protectedRoute)throw new Error(`Route ${route} 已经开始执行，不能再加入客户`)
  const stopIds=[...new Set((payload.stopIds||[]).map(Number).filter(Boolean))];if(!stopIds.length)throw new Error('没有可分配到 Route 的客户')
  const placeholders=stopIds.map(()=>'?').join(',')
  const eligible=database.prepare(`SELECT ds.id,ds.dispatch_trip_id tripId FROM dispatch_stops ds
    JOIN dispatch_trips dt ON dt.id=ds.dispatch_trip_id JOIN dispatches d ON d.id=dt.dispatch_id
    WHERE dt.dispatch_day_id=? AND ds.id IN (${placeholders}) AND ds.status<>'cancelled' AND ds.route_number IS NULL AND d.vehicle_id IS NULL`).all(day.id,...stopIds)
  if(eligible.length!==stopIds.length)throw new Error('有客户已经分配到其他 Route，请刷新后重试')
  const routeAssignment=database.prepare('SELECT vehicle_id vehicleId FROM daily_route_assignments WHERE dispatch_day_id=? AND route_number=?').get(day.id,route)
  return withImmediateTransaction(database,()=>{
    const target=routeAssignment?.vehicleId?ensureVehicleTrip(database,day,routeAssignment.vehicleId,1):ensureUnassignedTrip(database,day)
    let stopSequence=database.prepare("SELECT COALESCE(MAX(stop_sequence),0) value FROM dispatch_stops WHERE dispatch_id=? AND stop_sequence>0").get(target.dispatch_id).value
    let routeSequence=database.prepare("SELECT COALESCE(MAX(route_stop_sequence),0) value FROM dispatch_stops ds JOIN dispatch_trips dt ON dt.id=ds.dispatch_trip_id WHERE dt.dispatch_day_id=? AND ds.route_number=? AND ds.status<>'cancelled'").get(day.id,route).value
    database.prepare(`UPDATE dispatch_stops SET stop_sequence=-id WHERE id IN (${placeholders})`).run(...stopIds)
    const move=database.prepare('UPDATE dispatch_stops SET dispatch_id=?,dispatch_trip_id=?,stop_sequence=?,route_number=?,route_stop_sequence=? WHERE id=?')
    for(const stopId of stopIds){stopSequence+=1;routeSequence+=1;move.run(target.dispatch_id,target.id,stopSequence,route,routeSequence,stopId)}
    // Append only: cancelled records still reserve their sequence numbers.
    // Renumbering active stops would collide with history and change existing order.
    invalidateDispatchDay(database,serviceDate,'temporary_stops_assigned_to_route','route',route,null,{routeNumber:route,stopIds},payload.changedBy)
    return getDispatchDay(serviceDate,database)
  })
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

/** Read-only, session-scoped view of an authenticated driver's or crew member's approved route. */
function driverRouteForDate({employeeId,role,date,preview=false},database){
  const tripColumns=new Set(database.prepare('PRAGMA table_info(dispatch_trips)').all().map(row=>row.name)),stopColumns=new Set(database.prepare('PRAGMA table_info(dispatch_stops)').all().map(row=>row.name)),hasCompletion=tripColumns.has('completed_at')&&stopColumns.has('completion_outcome'),tripCompletion=hasCompletion?',dt.completed_at completedAt':'',stopCompletion=hasCompletion?',ds.completion_outcome completionOutcome,ds.completed_at completedAt,EXISTS(SELECT 1 FROM purchase_bills pb WHERE pb.dispatch_stop_id=ds.id AND pb.status=\'issued\') billCreated,(SELECT pb.bill_number FROM purchase_bills pb WHERE pb.dispatch_stop_id=ds.id AND pb.status=\'issued\' LIMIT 1) billNumber,(SELECT pb.payment_method FROM purchase_bills pb WHERE pb.dispatch_stop_id=ds.id AND pb.status=\'issued\' LIMIT 1) billPaymentMethod,EXISTS(SELECT 1 FROM purchase_payment_proofs pp JOIN purchase_bills pb ON pb.id=pp.purchase_bill_id WHERE pb.dispatch_stop_id=ds.id AND pb.status=\'issued\') paymentProofUploaded':''
  const employee=database.prepare(`SELECT e.id,e.job_role jobRole,e.employment_status employmentStatus,e.is_active isActive,
    EXISTS(SELECT 1 FROM employee_job_roles r WHERE r.employee_id=e.id AND r.role='Driver' AND r.is_active=1) hasDriverRole,
    EXISTS(SELECT 1 FROM employee_job_roles r WHERE r.employee_id=e.id AND r.role='Attendant / Crew' AND r.is_active=1) hasCrewRole
    FROM employees e WHERE e.id=?`).get(Number(employeeId))
  const accountRole=String(role||'').trim().toLowerCase(),jobRole=String(employee?.jobRole||'').trim().toLowerCase()
  if(!employee||!employee.isActive||employee.employmentStatus!=='active')throw driverRouteForbidden('This employee is not active.')
  const isDriver=Boolean(activeRouteDriver(database,employeeId,accountRole))
  const isCrew=accountRole==='crew'&&(['assistant','crew','attendant / crew'].includes(jobRole)||Boolean(employee.hasCrewRole))
  if(!isDriver&&!isCrew)throw driverRouteForbidden('You do not have permission to view a driver route.')
  date=iso(date)
  const weekday=new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US',{weekday:'long',timeZone:'UTC'}),day=dayByDate(database,date)
  const empty=reason=>({date,weekday,preview,status:day?.status||null,approved:false,routeAvailable:false,reason,trips:[],vehicles:[],totalStops:0,completedStops:0,pendingStops:0})
  if(!day)return empty('NO_APPROVED_ROUTE')
  const approvalRows=database.prepare('SELECT route_number routeNumber,route_signature routeSignature FROM daily_route_approvals WHERE dispatch_day_id=?').all(day.id)
  const executionStarted=['in_progress','completed'].includes(day.status),approvedRoutes=new Set(approvalRows.filter(row=>executionStarted||row.routeSignature===routeSignature(database,day.id,row.routeNumber)).map(row=>Number(row.routeNumber)))
  const legacyWholeDayApproval=['approved','in_progress'].includes(day.status)&&approvalRows.length===0
  if(!legacyWholeDayApproval&&!approvedRoutes.size)return empty('NO_APPROVED_ROUTE')
  const assignment=isDriver?'d.driver_id=?':`(d.assistant_id=? OR EXISTS(SELECT 1 FROM dispatch_vehicle_assistants dva WHERE dva.dispatch_day_id=dt.dispatch_day_id AND dva.vehicle_id=d.vehicle_id AND dva.employee_id=?))`
  const params=isDriver?[day.id,Number(employeeId)]:[day.id,Number(employeeId),Number(employeeId)]
  const trips=database.prepare(`SELECT dt.id,dt.trip_number tripNumber,dt.execution_status executionStatus,dt.started_at startedAt${tripCompletion},d.vehicle_id vehicleId,v.vehicle_code vehicleCode,v.vehicle_name vehicleName,v.registration_number registrationNumber
    FROM dispatch_trips dt JOIN dispatches d ON d.id=dt.dispatch_id JOIN vehicles v ON v.id=d.vehicle_id
    WHERE dt.dispatch_day_id=? AND ${assignment} AND v.operational_status IN ('available','active') AND v.status IN ('available','assigned')
      AND EXISTS(SELECT 1 FROM dispatch_stops ds JOIN branches bx ON bx.id=ds.branch_id WHERE ds.dispatch_trip_id=dt.id AND ds.status<>'cancelled' AND lower(COALESCE(bx.status,'active'))='active')
    ORDER BY v.vehicle_code,dt.trip_number,dt.id`).all(...params).map(trip=>({...trip,stops:database.prepare(`SELECT ds.id,ds.route_number routeNumber,ds.stop_sequence stopSequence,ds.status,CASE WHEN ds.override_note='driver_deferred' THEN 1 ELSE 0 END deferred,ds.override_reason deferReason${stopCompletion},b.jodoo_branch_id branchId,b.branch_name branchName,c.name customerName,b.address,b.latitude,b.longitude,
      COALESCE(ds.area_name_snapshot,a.name) area,b.time_restriction timeRestriction,ds.estimated_weight_kg estimatedWeightKg,ds.arrived_at arrivedAt,ds.arrival_distance_m arrivalDistanceMeters,
      dr.id deferRequestId,dr.status deferApprovalStatus,dr.reason deferRequestReason,dr.expected_return_time expectedReturnTime,dr.expected_return_at expectedReturnAt,dr.requested_at deferRequestedAt,dr.reviewed_by_name_snapshot deferReviewedBy,dr.review_reason deferReviewReason,dr.reviewed_at deferReviewedAt,
      CASE WHEN b.latitude IS NOT NULL AND b.longitude IS NOT NULL THEN 1 ELSE 0 END gpsAvailable
      FROM dispatch_stops ds JOIN branches b ON b.id=ds.branch_id LEFT JOIN customers c ON c.id=b.customer_id LEFT JOIN areas a ON a.id=b.area_id LEFT JOIN driver_defer_requests dr ON dr.id=(SELECT r.id FROM driver_defer_requests r WHERE r.dispatch_stop_id=ds.id ORDER BY r.id DESC LIMIT 1)
      WHERE ds.dispatch_trip_id=? AND ds.status<>'cancelled' AND lower(COALESCE(b.status,'active'))='active'
      ORDER BY ds.stop_sequence,ds.id`).all(trip.id).filter(stop=>legacyWholeDayApproval||approvedRoutes.has(Number(stop.routeNumber))).map(stop=>({...stop,dateRequest:database.prepare('SELECT id,status,target_date targetDate,review_reason reviewReason FROM driver_date_requests WHERE dispatch_stop_id=? ORDER BY id DESC LIMIT 1').get(stop.id)||null,deferred:Boolean(stop.deferred),gpsAvailable:Boolean(stop.gpsAvailable),billCreated:Boolean(stop.billCreated),paymentProofUploaded:Boolean(stop.paymentProofUploaded)}))})).filter(trip=>trip.stops.length).map((trip,index,trips)=>{const current=trip.executionStatus==='in_progress'?trip.stops.find(stop=>!stop.deferred&&!['completed','cancelled'].includes(stop.status)):null,earlierOpen=trips.some(other=>other.vehicleId===trip.vehicleId&&other.tripNumber<trip.tripNumber&&other.stops.length&&other.executionStatus!=='completed'),finished=trip.stops.filter(stop=>stop.status==='completed').length;return{...trip,completedCount:finished,totalCount:trip.stops.length,canComplete:trip.executionStatus==='in_progress'&&finished===trip.stops.length,canStart:['approved','reapproval_required','in_progress'].includes(day.status)&&trip.executionStatus==='not_started'&&!earlierOpen,currentStopId:current?.id||null,stops:trip.stops.map(stop=>({...stop,canArrive:Boolean((stop.deferred||current&&current.id===stop.id)&&!stop.arrivedAt),canFinish:Boolean((stop.deferred||current&&current.id===stop.id)&&stop.arrivedAt&&stop.status==='active'&&stop.deferApprovalStatus!=='pending')}))}})
  if(!trips.length)return empty('NO_VEHICLE_ASSIGNED')
  const stops=trips.flatMap(trip=>trip.stops),vehicles=[...new Map(trips.map(trip=>[trip.vehicleId,{id:trip.vehicleId,vehicleCode:trip.vehicleCode,vehicleName:trip.vehicleName,registrationNumber:trip.registrationNumber}])).values()]
  return{date,weekday,preview,trialOrderEnabled:!preview&&isRouteTrialDate(date),status:day.status,approved:true,routeAvailable:true,jodooUrl:String(process.env.JODOO_FORM_URL||'https://www.jodoo.com/'),trips,vehicles,totalStops:stops.length,completedStops:stops.filter(stop=>stop.status==='completed').length,pendingStops:stops.filter(stop=>stop.status!=='completed').length}
}

/** Backwards-compatible today endpoint service. The date is server-derived in production. */
export function driverToday({employeeId,role,today=kuchingDate()}={},database=defaultDb){
  return driverRouteForDate({employeeId,role,date:today,preview:false},database)
}

/** Tomorrow is deliberately server-derived and cannot accept a client-selected date. */
export function driverTomorrow({employeeId,role,now=new Date()}={},database=defaultDb){
  return driverRouteForDate({employeeId,role,date:addCalendarDays(kuchingDate(now),1),preview:true},database)
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

// Incremental reconciliation never rebuilds an existing route, order, vehicle or driver.
export function reconcileScheduleWindow({startDate=iso(),changedBy='System',confirmedDate=null,expectedRevision=null}={},database=defaultDb){
 return withImmediateTransaction(database,()=>{
  if(confirmedDate){const confirmed=dayByDate(database,confirmedDate);if(!confirmed||confirmed.revision!==Number(expectedRevision))throw new Error('安排已改变，请刷新后确认');if(confirmed.status==='completed')throw new Error('已完成日期不能补排')}
  const review=[],schedules=database.prepare("SELECT s.*,b.branch_name FROM branch_schedules s JOIN branches b ON b.id=s.branch_id LEFT JOIN customers c ON c.id=b.customer_id WHERE s.is_active=1 AND b.lifecycle_status='ACTIVE' AND b.is_active=1 AND LOWER(b.status)='active' AND COALESCE(c.is_active,1)=1").all()
  const plan=database.prepare('SELECT id FROM weekly_route_plans WHERE is_active=1').get()
  for(let offset=0;offset<(confirmedDate?1:7);offset++){
   const date=addDays(startDate,offset),day=dayByDate(database,date);if(!day)continue
   const exceptions=database.prepare('SELECT * FROM schedule_exceptions WHERE original_date=? OR target_date=?').all(date,date)
   const expected=new Map()
   for(const schedule of schedules){
    const extra=exceptions.some(e=>e.schedule_id===schedule.id&&e.target_date===date&&['move_date','add_extra_collection','customer_request'].includes(e.exception_type))
    const removed=exceptions.some(e=>e.schedule_id===schedule.id&&e.original_date===date&&['move_date','cancel_date','pause_once'].includes(e.exception_type))
    if(!removed&&(extra||scheduleMatchesDate(schedule,date)))expected.set(schedule.branch_id,{schedule,extra})
   }
   const protectedReason=protectedDayReason(database,day)||database.prepare('SELECT 1 FROM daily_route_approvals WHERE dispatch_day_id=? LIMIT 1').get(day.id)&&'已有路线批准'
   for(const {schedule,extra} of expected.values()){
    const existingStop=findBranchServiceDateStop(database,schedule.branch_id,date)
    if(existingStop){
      if(isSunday(date)&&database.prepare('SELECT 1 FROM sunday_dispatch_setup WHERE dispatch_day_id=?').get(day.id)){
        const setting=sundaySettings(database,schedule.branch_id),desired=executionRoute(database,schedule.branch_id,date,existingStop.route_number)
        if(setting.sundayConfirmed&&(!setting.effectiveDate||date>=setting.effectiveDate)&&desired&&Number(desired)!==Number(existingStop.route_number)){
          const manual=database.prepare("SELECT 1 FROM dispatch_change_logs WHERE dispatch_day_id=? AND entity_id=? AND change_type='route_customer_adjusted'").get(day.id,String(existingStop.id))
          const protectedStop=database.prepare("SELECT 1 FROM dispatch_stops s WHERE s.id=? AND (s.arrived_at IS NOT NULL OR s.completed_at IS NOT NULL OR EXISTS(SELECT 1 FROM purchase_bills b WHERE b.dispatch_stop_id=s.id))").get(existingStop.id)
          if(protectedReason||manual||protectedStop)review.push({date,branchId:schedule.source_branch_id,kind:'sunday_review',message:'星期日执行路线已改变，原安排已有批准、执行或人工调整，请主管核对。'})
          else{
            const vehicle=database.prepare('SELECT vehicle_id id FROM daily_route_assignments WHERE dispatch_day_id=? AND route_number=?').get(day.id,desired)
            const target=vehicle?.id?ensureVehicleTrip(database,day,vehicle.id,1):ensureUnassignedTrip(database,day)
            const n=database.prepare('SELECT COALESCE(MAX(stop_sequence),0)+1 n FROM dispatch_stops WHERE dispatch_id=?').get(target.dispatch_id).n
            const rn=database.prepare('SELECT COALESCE(MAX(s.route_stop_sequence),0)+1 n FROM dispatch_stops s JOIN dispatch_trips t ON t.id=s.dispatch_trip_id WHERE t.dispatch_day_id=? AND s.route_number=?').get(day.id,desired).n
            database.prepare('UPDATE dispatch_stops SET dispatch_id=?,dispatch_trip_id=?,stop_sequence=?,route_number=?,route_stop_sequence=? WHERE id=?').run(target.dispatch_id,target.id,n,desired,rn,existingStop.id)
            invalidateDispatchDay(database,date,'sunday_customer_execution_changed','dispatch_stop',existingStop.id,{routeNumber:existingStop.route_number},{routeNumber:desired},changedBy)
          }
        }
      }
      continue
    }
    // Explicit skips/cancellations remain historical decisions. Sync cancellations may be restored.
    if(database.prepare("SELECT 1 FROM dispatch_stops WHERE branch_id=? AND service_date=? AND status='cancelled' AND COALESCE(superseded_reason,'')<>'schedule_sync_removed'").get(schedule.branch_id,date))continue
    if(protectedReason&&confirmedDate!==date){review.push({date,branchId:schedule.source_branch_id,branchName:schedule.branch_name,kind:'missing',message:'应收客户尚未加入；请主管核对并撤回批准后补排'});continue}
    const mapping=plan&&database.prepare('SELECT route_number routeNumber FROM weekly_route_plan_stops WHERE plan_id=? AND weekday=? AND branch_id=?').get(plan.id,weekdayForDate(date),schedule.branch_id)
    const choices=plan?database.prepare('SELECT DISTINCT route_number routeNumber FROM weekly_route_plan_stops WHERE plan_id=? AND branch_id=?').all(plan.id,schedule.branch_id):[]
    const baseRoute=mapping?.routeNumber||(extra&&choices.length===1?choices[0].routeNumber:null)
    const route=executionRoute(database,schedule.branch_id,date,baseRoute)
    if(confirmedDate===date&&route&&database.prepare("SELECT 1 FROM dispatch_stops ds JOIN dispatches d ON d.id=ds.dispatch_id JOIN dispatch_trips dt ON dt.id=ds.dispatch_trip_id WHERE dt.dispatch_day_id=? AND ds.route_number=? AND d.status='completed'").get(day.id,route)){review.push({date,branchId:schedule.source_branch_id,branchName:schedule.branch_name,kind:'completed',message:'所属 ROUTE 已完成，请主管安排临时增加到其他日期'});continue}
    const approval=route&&database.prepare('SELECT route_signature signature FROM daily_route_approvals WHERE dispatch_day_id=? AND route_number=?').get(day.id,route)
    const preserveApproval=approval&&(approval.signature===routeSignature(database,day.id,route)||day.status==='in_progress')
    const added=addScheduledStop(database,day,schedule,extra?'exception':'recurrence')
    if(!added.created){review.push({date,branchId:schedule.source_branch_id,branchName:schedule.branch_name,kind:'occurrence',message:'收货记录与排程关联需要核对'});continue}
    if(route&&confirmedDate===date){
      const vehicle=database.prepare('SELECT vehicle_id id FROM daily_route_assignments WHERE dispatch_day_id=? AND route_number=?').get(day.id,route)
      const target=vehicle?.id?ensureVehicleTrip(database,day,vehicle.id,1):ensureUnassignedTrip(database,day)
      const sequence=database.prepare('SELECT COALESCE(MAX(stop_sequence),0)+1 n FROM dispatch_stops WHERE dispatch_id=?').get(target.dispatch_id).n
      const routeSequence=database.prepare('SELECT COALESCE(MAX(ds.route_stop_sequence),0)+1 n FROM dispatch_stops ds JOIN dispatch_trips dt ON dt.id=ds.dispatch_trip_id WHERE dt.dispatch_day_id=? AND ds.route_number=?').get(day.id,route).n
      database.prepare('UPDATE dispatch_stops SET dispatch_id=?,dispatch_trip_id=?,stop_sequence=?,route_number=?,route_stop_sequence=? WHERE id=?').run(target.dispatch_id,target.id,sequence,route,routeSequence,added.stopId)
      invalidateDispatchDay(database,date,'supervisor_confirmed_schedule_addition','dispatch_stop',added.stopId,null,{route,reason:'Supervisor confirmed missing scheduled customer'},changedBy)
      if(preserveApproval)database.prepare('UPDATE daily_route_approvals SET route_signature=? WHERE dispatch_day_id=? AND route_number=?').run(routeSignature(database,day.id,route),day.id,route)
    }else if(route)assignStopsToRoute(date,{routeNumber:route,stopIds:[added.stopId],changedBy},database)
    else{invalidateDispatchDay(database,date,'scheduled_customer_added','dispatch_stop',added.stopId,null,{scheduleId:schedule.id},changedBy);review.push({date,branchId:schedule.source_branch_id,branchName:schedule.branch_name,kind:'route',message:'已加入当天待安排客户，请确认所属 ROUTE'})}
   }
   const existing=database.prepare("SELECT ds.*,b.jodoo_branch_id branchCode,b.branch_name FROM dispatch_stops ds JOIN dispatch_trips dt ON dt.id=ds.dispatch_trip_id JOIN branches b ON b.id=ds.branch_id WHERE dt.dispatch_day_id=? AND ds.status<>'cancelled' AND ds.source_schedule_id IS NOT NULL").all(day.id)
   for(const stop of existing){
    if(expected.has(stop.branch_id))continue
    // Only a recorded permanent schedule edit may withdraw a previously generated occurrence.
    const edit=database.prepare("SELECT 1 FROM master_change_history WHERE entity_type='branch_schedule' AND entity_id=? LIMIT 1").get(String(stop.source_schedule_id));if(!edit)continue
    if(stop.arrived_at||stop.completed_at||['active','completed'].includes(stop.status)||database.prepare('SELECT 1 FROM purchase_bills WHERE dispatch_stop_id=?').get(stop.id))continue
    const manual=database.prepare("SELECT 1 FROM dispatch_change_logs WHERE dispatch_day_id=? AND (change_type='route_customer_adjusted' AND entity_id=? OR change_type='temporary_collection_added' AND json_extract(after_json,'$.stopId')=?) LIMIT 1").get(day.id,String(stop.id),stop.id)
    if(manual||stop.override_note==='customer_reported_no_goods')continue
    if(protectedReason){review.push({date,branchId:stop.branchCode,branchName:stop.branch_name,kind:'outdated',message:'固定排程已改变，原批准安排需要主管核对'});continue}
    database.prepare("UPDATE dispatch_stops SET status='cancelled',superseded_reason='schedule_sync_removed',superseded_by=?,superseded_at=CURRENT_TIMESTAMP WHERE id=?").run(changedBy,stop.id)
    database.prepare("UPDATE schedule_occurrences SET status='cancelled',dispatch_stop_id=NULL WHERE dispatch_stop_id=?").run(stop.id)
    invalidateDispatchDay(database,date,'schedule_sync_removed','dispatch_stop',stop.id,{status:stop.status},null,changedBy)
   }
  }
  return review
 })
}

export function addTemporaryRouteCollection(stopId,payload={},context={},database=defaultDb){
 if(!['owner_admin','operations_admin','supervisor'].includes(context.role))throw new Error('Supervisor permission is required')
 const date=String(payload.date||''),reason=String(payload.reason||'').trim(),today=context.today||iso()
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date||date<today||date>addDays(today,6)||!reason)throw new Error('请选择今天起七天内的日期，并填写原因。')
 return withImmediateTransaction(database,()=>{
  const source=draftStopById(database,stopId);if(!source)throw new Error('Customer Stop not found')
  const day=dayByDate(database,date);if(!day)throw new Error('请先载入七天派车')
  if(Number(payload.targetRevision)!==day.revision)throw new Error('安排已改变，请刷新后重试')
  if(protectedDayReason(database,day)||database.prepare('SELECT 1 FROM daily_route_approvals WHERE dispatch_day_id=?').get(day.id))throw new Error('目标日期已有批准或开始执行，请先由主管撤回批准后增加。')
  assertBranchServiceDateAvailable(database,source.branch_id,date)
  const schedule=database.prepare('SELECT * FROM branch_schedules WHERE id=?').get(source.source_schedule_id)
  if(!schedule)throw new Error('请先为客户保存收货排程')
  const inserted=addScheduledStop(database,day,schedule,'exception');if(!inserted.created)throw new Error('该日期已有收货记录，需要先核对')
  database.prepare("INSERT INTO schedule_exceptions(branch_id,schedule_id,exception_type,target_date,permanent,reason,created_by) VALUES(?,?,'add_extra_collection',?,0,?,?)").run(source.branch_id,schedule.id,date,reason,actor(context.actor))
  const route=source.route_number;if(route)assignStopsToRoute(date,{routeNumber:route,stopIds:[inserted.stopId],changedBy:context.actor},database)
  invalidateDispatchDay(database,date,'temporary_collection_added','branch',source.branch_id,null,{stopId:inserted.stopId,sourceStopId:Number(stopId),reason},context.actor)
  return{ok:true,stopId:inserted.stopId,date}
 })
}

export function recordCustomerReportedNoGoods(stopId,payload={},context={},database=defaultDb){
 if(!['owner_admin','operations_admin','supervisor'].includes(context.role))throw new Error('Supervisor permission is required')
 const reason=String(payload.reason||'').trim();if(!reason)throw new Error('请填写客户通知内容及原因')
 return withImmediateTransaction(database,()=>{
  const stop=draftStopById(database,stopId);if(!stop)throw new Error('Stop not found')
  if(stop.dispatch_date!==(context.today||iso()))throw new Error('只能记录今天客户通知无货')
  const day=dayByDate(database,stop.dispatch_date)
  if(Number(payload.expectedRevision)!==day.revision)throw new Error('安排已改变，请刷新后重试')
  if(stop.arrived_at||stop.completed_at||['active','completed','cancelled'].includes(stop.status)||database.prepare('SELECT 1 FROM purchase_bills WHERE dispatch_stop_id=?').get(stop.id))throw new Error('已有到店、完成或单据记录，不能改为未到店无货')
  const approval=database.prepare('SELECT 1 FROM daily_route_approvals WHERE dispatch_day_id=? AND route_number=? AND route_signature=?').get(day.id,stop.route_number,routeSignature(database,day.id,stop.route_number))
  database.prepare("UPDATE dispatch_stops SET status='cancelled',override_note='customer_reported_no_goods',override_reason=?,override_at=CURRENT_TIMESTAMP,superseded_reason='customer_reported_no_goods',superseded_by=?,superseded_at=CURRENT_TIMESTAMP WHERE id=?").run(reason,actor(context.actor),stop.id)
  if(stop.source_schedule_id)database.prepare("INSERT INTO schedule_exceptions(branch_id,schedule_id,exception_type,original_date,permanent,reason,created_by) VALUES(?,?,'pause_once',?,0,?,?)").run(stop.branch_id,stop.source_schedule_id,stop.dispatch_date,reason,actor(context.actor))
  invalidateDispatchDay(database,stop.dispatch_date,'customer_reported_no_goods','dispatch_stop',stop.id,{status:stop.status},{reason,visited:false},context.actor)
  if(approval){database.prepare('UPDATE daily_route_approvals SET route_signature=? WHERE dispatch_day_id=? AND route_number=?').run(routeSignature(database,day.id,stop.route_number),day.id,stop.route_number);database.prepare('UPDATE dispatch_days SET status=? WHERE id=?').run(day.status,day.id)}
  return{ok:true,visited:false}
 })
}
