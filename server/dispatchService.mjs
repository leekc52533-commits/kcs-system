import { createHash } from 'node:crypto'
import { db as defaultDb } from './database.mjs'

const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
const iso = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(`${value}T00:00:00`)
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`
}
const addDays = (date, days) => { const next = new Date(`${date}T00:00:00`); next.setDate(next.getDate()+days); return iso(next) }
const json = (value) => value == null ? null : JSON.stringify(value)
const actor = (value) => String(value || 'Supervisor')
const dayName = (date) => DAY_NAMES[new Date(`${date}T00:00:00`).getDay()]
const scheduleMatches = (schedule, date) => {
  const frequency=String(schedule.frequency||'').toLowerCase()
  if(frequency==='call'||frequency.includes('on call'))return false
  const matchesDay=String(schedule.days_of_week || '').split(/[,;/]/).map(x=>x.trim()).includes(dayName(date))
  if(!matchesDay)return false
  if(frequency.includes('2 week')||frequency.includes('fortnight')){
    const anchor=schedule.next_take_date||schedule.take_date
    if(!anchor)return true
    const elapsed=Math.round((new Date(`${date}T00:00:00`)-new Date(`${anchor}T00:00:00`))/86400000)
    return elapsed%14===0
  }
  return true
}

function dayByDate(database, date) {
  return database.prepare('SELECT * FROM dispatch_days WHERE dispatch_date=?').get(date)
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

function addScheduledStop(database, day, schedule) {
  if (!schedule.branch_id) return false
  const exists = database.prepare(`SELECT id FROM dispatch_stops WHERE dispatch_trip_id IN (SELECT id FROM dispatch_trips WHERE dispatch_day_id=?) AND source_schedule_id=?`).get(day.id,schedule.id)
  if (exists) return false
  const trip=ensureUnassignedTrip(database,day)
  const sequence=database.prepare('SELECT COALESCE(MAX(stop_sequence),0)+1 value FROM dispatch_stops WHERE dispatch_id=?').get(trip.dispatch_id).value
  const snapshot=branchZoneSnapshot(database,schedule.branch_id)
  database.prepare(`INSERT INTO dispatch_stops(dispatch_id,branch_id,stop_sequence,status,dispatch_trip_id,source_schedule_id,zone_group_id_snapshot,zone_group_name_snapshot,area_name_snapshot)
    VALUES(?,?,?,'locked',?,?,?,?,?)`).run(trip.dispatch_id,schedule.branch_id,sequence,trip.id,schedule.id,snapshot.zoneGroupId??null,snapshot.zoneGroupName??'待确认',snapshot.areaName??'未分区')
  return true
}

function generateRange({startDate=iso(),generatedBy='Supervisor',count=7}={}, database=defaultDb) {
  const start=iso(startDate)
  database.exec('BEGIN IMMEDIATE')
  try {
    database.prepare(`INSERT INTO weekly_dispatch_plans(week_start,generated_by) VALUES(?,?) ON CONFLICT(week_start) DO UPDATE SET updated_at=CURRENT_TIMESTAMP`).run(start,actor(generatedBy))
    const plan=database.prepare('SELECT * FROM weekly_dispatch_plans WHERE week_start=?').get(start)
    let createdStops=0
    for(let offset=0;offset<count;offset+=1){
      const date=addDays(start,offset)
      database.prepare(`INSERT OR IGNORE INTO dispatch_days(weekly_plan_id,dispatch_date) VALUES(?,?)`).run(plan.id,date)
      const day=dayByDate(database,date)
      const schedules=database.prepare(`SELECT s.*,b.area_id FROM branch_schedules s JOIN branches b ON b.id=s.branch_id LEFT JOIN customers c ON c.id=b.customer_id WHERE s.is_active=1 AND b.is_active=1 AND COALESCE(c.is_active,1)=1`).all()
      for(const schedule of schedules) if(scheduleMatches(schedule,date)) createdStops+=Number(addScheduledStop(database,day,schedule))
      const additions=database.prepare(`SELECT s.*,b.area_id FROM schedule_exceptions e JOIN branch_schedules s ON s.id=e.schedule_id LEFT JOIN branches b ON b.id=s.branch_id WHERE e.target_date=? AND e.exception_type IN ('move_date','add_extra_collection','customer_request')`).all(date)
      for(const schedule of additions) createdStops+=Number(addScheduledStop(database,day,schedule))
      const removals=database.prepare(`SELECT schedule_id FROM schedule_exceptions WHERE original_date=? AND exception_type IN ('move_date','cancel_date','pause_once')`).all(date)
      for(const item of removals) database.prepare(`DELETE FROM dispatch_stops WHERE source_schedule_id=? AND dispatch_trip_id IN(SELECT id FROM dispatch_trips WHERE dispatch_day_id=?)`).run(item.schedule_id,day.id)
    }
    database.exec('COMMIT')
    return {weekStart:start,dayCount:count,createdStops,...(count===1?{day:getDispatchDay(start,database)}:getDispatchWeek({startDate:start},database))}
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
    WHERE dt.dispatch_day_id=? ORDER BY dt.trip_number,ds.stop_sequence`).all(dayId)
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
    const slots=[1,2,3].map(tripNumber=>{const trip=vehicleTrips.find(item=>item.tripNumber===tripNumber);return{tripNumber,tripId:trip?.id??null,stops:trip?stops.filter(stop=>stop.tripId===trip.id):[]}})
    const areas=[...new Set(slots.flatMap(slot=>slot.stops.map(stop=>stop.area).filter(Boolean)))]
    const assistants=assistantRows.filter(item=>item.vehicleId===vehicle.id)
    if(!assistants.length&&basis.assistantId)assistants.push({id:basis.assistantId,name:basis.assistant,employeeCode:null,vehicleId:vehicle.id})
    return{...vehicle,driverId:basis.driverId??null,driver:basis.driver??null,assistantIds:assistants.map(item=>item.id),assistants,startLocationId:basis.startLocationId??null,startLocation:basis.startLocation??null,endLocationId:basis.endLocationId??null,endLocation:basis.endLocation??null,areas,slots,customerCount:slots.reduce((sum,slot)=>sum+slot.stops.length,0)}
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
  const warningCount=unassignedStops.length+vehicleBoards.filter(board=>board.customerCount>0&&!board.driverId).length+specials.filter(x=>x.requestType==='potential_new'&&newCustomerMissing(x).length).length
  return {...day,stops,trips:assignedTrips,vehicleBoards,unassignedStops,unassignedGroups,unassignedZones,specialRequests:specials,warningCount,legacyUnassignedTripCount:allTrips.filter(item=>!item.vehicleId).length}
}

const resourceOptions=(database)=>({
  vehicles:database.prepare(`SELECT v.id,v.vehicle_code vehicleCode,v.vehicle_name vehicleName,v.registration_number registrationNumber,v.capacity_kg capacityKg,v.operational_status status,v.is_common isCommon,
    v.is_temporary isTemporary,v.temporary_date temporaryDate,v.default_base_location_id defaultBaseLocationId,base.name defaultBase,
    (SELECT GROUP_CONCAT(a.name,'|') FROM vehicle_preferred_areas vpa JOIN areas a ON a.id=vpa.area_id WHERE vpa.vehicle_id=v.id) preferredAreaNames
    FROM vehicles v LEFT JOIN operational_locations base ON base.id=v.default_base_location_id ORDER BY v.operational_status='sold',v.is_temporary,COALESCE(v.official_sequence,999),v.vehicle_code`).all().map(item=>({...item,preferredAreas:item.preferredAreaNames?item.preferredAreaNames.split('|'):[]})),
  employees:database.prepare(`SELECT e.id,e.employee_code employeeCode,e.name,e.job_role role,e.employment_status employmentStatus,e.is_active isActive,
    e.default_base_location_id defaultBaseLocationId,base.name defaultBase,e.default_area_id defaultAreaId,a.name defaultArea
    FROM employees e LEFT JOIN operational_locations base ON base.id=e.default_base_location_id LEFT JOIN areas a ON a.id=e.default_area_id ORDER BY e.name`).all(),
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

export function approveDay(date,{approvedBy='Supervisor'}={},database=defaultDb){
  const day=dayByDate(database,iso(date));if(!day)throw new Error('Dispatch day not found')
  database.prepare("UPDATE dispatch_days SET status='approved',approved_revision=revision,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(day.id)
  database.prepare("INSERT INTO dispatch_approvals(dispatch_day_id,action,revision,actor) VALUES(?,?,?,?)").run(day.id,day.status==='reapproval_required'?'reapprove':'approve',day.revision,actor(approvedBy))
  return getDispatchDay(date,database)
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
  const day=dayByDate(database,iso(date));if(!day)throw new Error('Dispatch day not found')
  database.prepare("UPDATE dispatch_days SET status='draft',revision=revision+1,approved_revision=NULL,published_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(day.id)
  database.prepare("INSERT INTO dispatch_approvals(dispatch_day_id,action,revision,actor,reason) VALUES(?,'reopen',?,?,?)").run(day.id,day.revision+1,actor(reopenedBy),reason||null)
  return getDispatchDay(date,database)
}

export function createStop(payload,database=defaultDb){
  const day=dayByDate(database,iso(payload.date));if(!day)throw new Error('Dispatch day not found')
  const branch=database.prepare('SELECT * FROM branches WHERE jodoo_branch_id=?').get(payload.branchId);if(!branch)throw new Error('Branch not found')
  const trip=payload.tripId?database.prepare('SELECT * FROM dispatch_trips WHERE id=? AND dispatch_day_id=?').get(payload.tripId,day.id):payload.vehicleId?ensureVehicleTrip(database,day,Number(payload.vehicleId),Number(payload.tripNumber||1)):ensureUnassignedTrip(database,day)
  if(!trip)throw new Error('Trip not found')
  if(payload.specialRequestId){const duplicate=database.prepare('SELECT id FROM dispatch_stops WHERE source_special_request_id=? AND dispatch_trip_id=?').get(payload.specialRequestId,trip.id);if(duplicate)return database.prepare('SELECT * FROM dispatch_stops WHERE id=?').get(duplicate.id)}
  const sequence=Number(payload.stopSequence||database.prepare('SELECT COALESCE(MAX(stop_sequence),0)+1 value FROM dispatch_stops WHERE dispatch_id=?').get(trip.dispatch_id).value)
  const snapshot=branchZoneSnapshot(database,branch.id)
  const result=database.prepare(`INSERT INTO dispatch_stops(dispatch_id,branch_id,stop_sequence,status,dispatch_trip_id,source_special_request_id,estimated_weight_kg,sequence_locked,zone_group_id_snapshot,zone_group_name_snapshot,area_name_snapshot) VALUES(?,?,?,'locked',?,?,?,?,?,?,?)`).run(trip.dispatch_id,branch.id,sequence,trip.id,payload.specialRequestId||null,payload.estimatedWeightKg??null,payload.sequenceLocked?1:0,snapshot.zoneGroupId??null,snapshot.zoneGroupName??'待确认',snapshot.areaName??'未分区')
  invalidateDispatchDay(database,day.dispatch_date,'stop_added','dispatch_stop',result.lastInsertRowid,null,payload,payload.changedBy)
  return database.prepare('SELECT * FROM dispatch_stops WHERE id=?').get(result.lastInsertRowid)
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
  let targetDay=dayByDate(database,targetDate);if(!targetDay)throw new Error('Target dispatch day not found')
  let trip=before.dispatch_trip_id
  if(payload.tripId)trip=Number(payload.tripId)
  else if(payload.vehicleId)trip=ensureVehicleTrip(database,targetDay,Number(payload.vehicleId),Math.min(3,Math.max(1,Number(payload.tripNumber||1)))).id
  else if(payload.unassigned)trip=ensureUnassignedTrip(database,targetDay).id
  const tripRow=database.prepare('SELECT * FROM dispatch_trips WHERE id=?').get(trip);if(!tripRow)throw new Error('Trip not found')
  const wanted=Number(payload.stopSequence??(trip===before.dispatch_trip_id?before.stop_sequence:database.prepare('SELECT COALESCE(MAX(stop_sequence),0)+1 value FROM dispatch_stops WHERE dispatch_id=?').get(tripRow.dispatch_id).value))
  database.exec('BEGIN IMMEDIATE')
  try{
    database.prepare('UPDATE dispatch_stops SET stop_sequence=-1 WHERE id=?').run(id)
    if(before.dispatch_id===tripRow.dispatch_id){
      if(wanted<before.stop_sequence){database.prepare('UPDATE dispatch_stops SET stop_sequence=stop_sequence+100000 WHERE dispatch_id=? AND stop_sequence>=? AND stop_sequence<?').run(tripRow.dispatch_id,wanted,before.stop_sequence);database.prepare('UPDATE dispatch_stops SET stop_sequence=stop_sequence-99999 WHERE dispatch_id=? AND stop_sequence>=100000').run(tripRow.dispatch_id)}
      if(wanted>before.stop_sequence){database.prepare('UPDATE dispatch_stops SET stop_sequence=stop_sequence+100000 WHERE dispatch_id=? AND stop_sequence>? AND stop_sequence<=?').run(tripRow.dispatch_id,before.stop_sequence,wanted);database.prepare('UPDATE dispatch_stops SET stop_sequence=stop_sequence-100001 WHERE dispatch_id=? AND stop_sequence>=100000').run(tripRow.dispatch_id)}
    }else{
      database.prepare('UPDATE dispatch_stops SET stop_sequence=stop_sequence+100000 WHERE dispatch_id=? AND stop_sequence>?').run(before.dispatch_id,before.stop_sequence);database.prepare('UPDATE dispatch_stops SET stop_sequence=stop_sequence-100001 WHERE dispatch_id=? AND stop_sequence>=100000').run(before.dispatch_id)
      database.prepare('UPDATE dispatch_stops SET stop_sequence=stop_sequence+100000 WHERE dispatch_id=? AND stop_sequence>=?').run(tripRow.dispatch_id,wanted);database.prepare('UPDATE dispatch_stops SET stop_sequence=stop_sequence-99999 WHERE dispatch_id=? AND stop_sequence>=100000').run(tripRow.dispatch_id)
    }
    database.prepare(`UPDATE dispatch_stops SET dispatch_id=?,dispatch_trip_id=?,stop_sequence=?,sequence_locked=COALESCE(?,sequence_locked),estimated_weight_kg=COALESCE(?,estimated_weight_kg) WHERE id=?`).run(tripRow.dispatch_id,trip,wanted,payload.sequenceLocked==null?null:Number(Boolean(payload.sequenceLocked)),payload.estimatedWeightKg??null,id)
    if(targetDate!==before.dispatch_date){const snapshot=branchZoneSnapshot(database,before.branch_id);database.prepare('UPDATE dispatch_stops SET zone_group_id_snapshot=?,zone_group_name_snapshot=?,area_name_snapshot=? WHERE id=?').run(snapshot.zoneGroupId??null,snapshot.zoneGroupName??'待确认',snapshot.areaName??'未分区',id)}
    if(targetDate!==before.dispatch_date&&before.source_schedule_id&&!database.prepare("SELECT id FROM schedule_exceptions WHERE schedule_id=? AND exception_type='move_date' AND original_date=? AND target_date=? AND permanent=0").get(before.source_schedule_id,before.dispatch_date,targetDate))database.prepare(`INSERT INTO schedule_exceptions(branch_id,schedule_id,exception_type,original_date,target_date,permanent,reason,created_by) VALUES(?,?,'move_date',?,?,0,?,?)`).run(before.branch_id,before.source_schedule_id,before.dispatch_date,targetDate,payload.reason||'Weekly planner drag-and-drop',actor(payload.changedBy))
    invalidateDispatchDay(database,before.dispatch_date,'stop_updated','dispatch_stop',id,before,payload,payload.changedBy)
    if(targetDate!==before.dispatch_date)invalidateDispatchDay(database,targetDate,'stop_moved_in','dispatch_stop',id,null,payload,payload.changedBy)
    database.exec('COMMIT')
    return database.prepare('SELECT * FROM dispatch_stops WHERE id=?').get(id)
  }catch(error){database.exec('ROLLBACK');throw error}
}
export function deleteStop(id,{changedBy='Supervisor',reason='Weekly planner removal'}={},database=defaultDb){const before=database.prepare(`SELECT ds.*,dd.dispatch_date FROM dispatch_stops ds JOIN dispatch_trips dt ON dt.id=ds.dispatch_trip_id JOIN dispatch_days dd ON dd.id=dt.dispatch_day_id WHERE ds.id=?`).get(id);if(!before)throw new Error('Stop not found');database.exec('BEGIN IMMEDIATE');try{if(before.source_schedule_id&&!database.prepare("SELECT id FROM schedule_exceptions WHERE schedule_id=? AND exception_type='cancel_date' AND original_date=? AND permanent=0").get(before.source_schedule_id,before.dispatch_date))database.prepare(`INSERT INTO schedule_exceptions(branch_id,schedule_id,exception_type,original_date,permanent,reason,created_by) VALUES(?,?,'cancel_date',?,0,?,?)`).run(before.branch_id,before.source_schedule_id,before.dispatch_date,reason,actor(changedBy));database.prepare('DELETE FROM dispatch_stops WHERE id=?').run(id);invalidateDispatchDay(database,before.dispatch_date,'stop_removed','dispatch_stop',id,before,null,changedBy);database.exec('COMMIT');return{deleted:true,id:Number(id)}}catch(error){database.exec('ROLLBACK');throw error}}

export function updateTrip(id,payload,database=defaultDb){const before=database.prepare(`SELECT dt.*,dd.dispatch_date,d.vehicle_id,d.driver_id,d.assistant_id,d.start_location_id,d.end_location_id FROM dispatch_trips dt JOIN dispatch_days dd ON dd.id=dt.dispatch_day_id JOIN dispatches d ON d.id=dt.dispatch_id WHERE dt.id=?`).get(id);if(!before)throw new Error('Trip not found');database.prepare(`UPDATE dispatches SET vehicle_id=?,driver_id=?,assistant_id=?,start_location_id=?,end_location_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(payload.vehicleId??before.vehicle_id,payload.driverId??before.driver_id,payload.assistantId??before.assistant_id,payload.startLocationId??before.start_location_id,payload.endLocationId??before.end_location_id,before.dispatch_id);database.prepare('UPDATE dispatch_trips SET trip_number=COALESCE(?,trip_number),estimated_weight_kg=COALESCE(?,estimated_weight_kg),updated_at=CURRENT_TIMESTAMP WHERE id=?').run(payload.tripNumber??null,payload.estimatedWeightKg??null,id);invalidateDispatchDay(database,before.dispatch_date,'trip_updated','dispatch_trip',id,before,payload,payload.changedBy);return database.prepare('SELECT * FROM dispatch_trips WHERE id=?').get(id)}

export function assignVehicleDay(date,vehicleId,payload,database=defaultDb){
  const day=dayByDate(database,iso(date));if(!day)throw new Error('Dispatch day not found')
  const before=database.prepare(`SELECT d.driver_id driverId,d.assistant_id assistantId,d.start_location_id startLocationId,d.end_location_id endLocationId FROM dispatch_trips dt JOIN dispatches d ON d.id=dt.dispatch_id WHERE dt.dispatch_day_id=? AND d.vehicle_id=? LIMIT 1`).get(day.id,vehicleId)||{}
  before.assistantIds=database.prepare('SELECT employee_id id FROM dispatch_vehicle_assistants WHERE dispatch_day_id=? AND vehicle_id=? ORDER BY employee_id').all(day.id,vehicleId).map(item=>item.id)
  if(payload.driverId){
    const driver=database.prepare(`SELECT * FROM employees WHERE id=? AND is_active=1 AND employment_status='active' AND lower(job_role)='driver'`).get(payload.driverId)
    if(!driver)throw new Error('所选员工不是可用 Driver')
    const conflict=database.prepare(`SELECT v.vehicle_code vehicle FROM dispatch_trips dt JOIN dispatches d ON d.id=dt.dispatch_id JOIN vehicles v ON v.id=d.vehicle_id
      WHERE dt.dispatch_day_id=? AND d.driver_id=? AND d.vehicle_id<>? LIMIT 1`).get(day.id,payload.driverId,vehicleId)
    if(conflict)throw new Error(`该司机当天已分配给 ${conflict.vehicle}，请先解除原分配`)
  }
  const assistantIds=payload.assistantIds===undefined?null:[...new Set((payload.assistantIds||[]).map(Number).filter(Boolean))]
  if(assistantIds)for(const employeeId of assistantIds){const employee=database.prepare(`SELECT id FROM employees WHERE id=? AND is_active=1 AND employment_status='active' AND lower(job_role) IN ('assistant','crew')`).get(employeeId);if(!employee)throw new Error('所选员工不是可用 Assistant/Crew')}
  database.exec('BEGIN IMMEDIATE')
  try{
    if(assistantIds){database.prepare('DELETE FROM dispatch_vehicle_assistants WHERE dispatch_day_id=? AND vehicle_id=?').run(day.id,vehicleId);const insert=database.prepare('INSERT INTO dispatch_vehicle_assistants(dispatch_day_id,vehicle_id,employee_id) VALUES(?,?,?)');for(const employeeId of assistantIds)insert.run(day.id,vehicleId,employeeId)}
    for(let tripNumber=1;tripNumber<=3;tripNumber+=1){const trip=ensureVehicleTrip(database,day,Number(vehicleId),tripNumber);const dispatch=database.prepare('SELECT * FROM dispatches WHERE id=?').get(trip.dispatch_id);database.prepare(`UPDATE dispatches SET driver_id=?,assistant_id=?,start_location_id=?,end_location_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(payload.driverId===undefined?dispatch.driver_id:payload.driverId,assistantIds===null?dispatch.assistant_id:(assistantIds[0]||null),payload.startLocationId===undefined?dispatch.start_location_id:payload.startLocationId,payload.endLocationId===undefined?dispatch.end_location_id:payload.endLocationId,trip.dispatch_id)}
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
      if(payload.transferDriver!==false)database.prepare(`UPDATE dispatches SET driver_id=COALESCE(?,driver_id),assistant_id=COALESCE(?,assistant_id),start_location_id=COALESCE(?,start_location_id),end_location_id=COALESCE(?,end_location_id),updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(sourceTrip.driver_id,sourceTrip.assistant_id,sourceTrip.start_location_id,sourceTrip.end_location_id,targetTrip.dispatch_id)
      database.prepare('UPDATE dispatches SET vehicle_id=NULL,driver_id=NULL,assistant_id=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(sourceTrip.dispatch_id)
    }
    if(payload.transferDriver!==false){
      const assistants=database.prepare('SELECT employee_id FROM dispatch_vehicle_assistants WHERE dispatch_day_id=? AND vehicle_id=?').all(day.id,sourceVehicleId)
      const add=database.prepare('INSERT OR IGNORE INTO dispatch_vehicle_assistants(dispatch_day_id,vehicle_id,employee_id) VALUES(?,?,?)')
      for(const item of assistants)add.run(day.id,targetId,item.employee_id)
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
    LEFT JOIN vehicles v ON v.id=d.vehicle_id WHERE dt.dispatch_day_id=? AND ds.id IN (${placeholders}) AND (d.vehicle_id IS NULL OR v.operational_status NOT IN ('available','active') OR v.status NOT IN ('available','assigned') OR (v.is_temporary=1 AND v.temporary_date<>?))`).all(day.id,...stopIds,day.dispatch_date)
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

export function driverToday({driverId,date=iso()}={},database=defaultDb){
  const day=dayByDate(database,iso(date));if(!day||day.status!=='published')return{date:iso(date),published:false,trips:[]}
  const trips=database.prepare(`SELECT dt.id,dt.trip_number tripNumber,d.vehicle_id vehicleId,v.vehicle_code vehicle,d.driver_id driverId FROM dispatch_trips dt JOIN dispatches d ON d.id=dt.dispatch_id LEFT JOIN vehicles v ON v.id=d.vehicle_id WHERE dt.dispatch_day_id=? AND d.driver_id=? AND EXISTS(SELECT 1 FROM dispatch_stops ds WHERE ds.dispatch_trip_id=dt.id)`).all(day.id,Number(driverId))
  return{date:day.dispatch_date,published:true,trips:trips.map(t=>({...t,assistants:database.prepare(`SELECT e.id,e.employee_code employeeCode,e.name FROM dispatch_vehicle_assistants dva JOIN employees e ON e.id=dva.employee_id WHERE dva.dispatch_day_id=? AND dva.vehicle_id=? ORDER BY e.name`).all(day.id,t.vehicleId),stops:database.prepare(`SELECT ds.id,ds.stop_sequence stopSequence,b.jodoo_branch_id branchId,b.branch_name branchName,c.name customerName,b.address,b.latitude,b.longitude,c.payment_type paymentType,c.occ_price occPrice FROM dispatch_stops ds JOIN branches b ON b.id=ds.branch_id LEFT JOIN customers c ON c.id=b.customer_id WHERE ds.dispatch_trip_id=? ORDER BY ds.stop_sequence`).all(t.id)}))}
}

export function createScheduleException(payload,database=defaultDb){
  const schedule=database.prepare('SELECT * FROM branch_schedules WHERE jodoo_schedule_id=?').get(payload.scheduleId);if(!schedule)throw new Error('Schedule not found')
  const type=String(payload.type||'').trim().toLowerCase().replaceAll(' ','_')
  database.exec('BEGIN IMMEDIATE');try{
    if(payload.permanent){
      if(!payload.dayOfWeek)throw new Error('Permanent schedule change requires dayOfWeek')
      database.prepare('UPDATE branch_schedules SET days_of_week=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(payload.dayOfWeek,schedule.id)
    }
    const result=database.prepare(`INSERT INTO schedule_exceptions(branch_id,schedule_id,exception_type,original_date,target_date,permanent,reason,created_by) VALUES(?,?,?,?,?,?,?,?)`).run(schedule.branch_id,schedule.id,type,payload.originalDate||null,payload.targetDate||null,payload.permanent?1:0,payload.reason||null,actor(payload.createdBy))
    if(payload.originalDate)invalidateDispatchDay(database,payload.originalDate,payload.permanent?'schedule_permanent_change':'schedule_exception','schedule',schedule.id,schedule,payload,payload.createdBy)
    if(payload.targetDate&&payload.targetDate!==payload.originalDate)invalidateDispatchDay(database,payload.targetDate,'schedule_exception','schedule',schedule.id,null,payload,payload.createdBy)
    database.exec('COMMIT');return database.prepare('SELECT * FROM schedule_exceptions WHERE id=?').get(result.lastInsertRowid)
  }catch(error){database.exec('ROLLBACK');throw error}
}

export function requestDedupeKey(payload){return createHash('sha256').update([payload.existingBranchId||'',payload.requestedCollectionDate||'',payload.phone||'',payload.temporaryCustomerName||''].map(x=>String(x).trim().toLowerCase()).join('|')).digest('hex')}
export { iso, newCustomerMissing }
