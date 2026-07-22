import { db as defaultDb } from './database.mjs'
import { invalidateDispatchDay } from './dispatchService.mjs'

const text = (value) => String(value ?? '').trim()
const idOrNull = (value) => value ? Number(value) : null

function replacePreferredAreas(database, vehicleId, areaIds) {
  if (!Array.isArray(areaIds)) return
  database.prepare('DELETE FROM vehicle_preferred_areas WHERE vehicle_id=?').run(vehicleId)
  const insert = database.prepare('INSERT OR IGNORE INTO vehicle_preferred_areas(vehicle_id,area_id) VALUES(?,?)')
  for (const areaId of areaIds) if (Number(areaId)) insert.run(vehicleId, Number(areaId))
}

function replacePreferredZones(database,vehicleId,zoneGroupIds){
  if(!Array.isArray(zoneGroupIds))return
  database.prepare('DELETE FROM vehicle_preferred_zones WHERE vehicle_id=?').run(vehicleId)
  const insert=database.prepare('INSERT OR IGNORE INTO vehicle_preferred_zones(vehicle_id,zone_group_id) VALUES(?,?)')
  for(const zoneId of zoneGroupIds)if(Number(zoneId))insert.run(vehicleId,Number(zoneId))
}

function vehicleRows(database) {
  return database.prepare(`SELECT v.id,v.vehicle_code vehicleCode,v.vehicle_name vehicleName,v.registration_number registrationNumber,
    v.capacity_kg capacityKg,v.operational_status status,v.official_sequence officialSequence,v.is_common isCommon,v.brand,v.model,v.vehicle_type vehicleType,v.is_temporary isTemporary,v.temporary_date temporaryDate,
    v.default_base_location_id defaultBaseLocationId,base.name defaultBase,
    GROUP_CONCAT(a.id) preferredAreaIds,GROUP_CONCAT(a.name,'|') preferredAreaNames
    FROM vehicles v LEFT JOIN operational_locations base ON base.id=v.default_base_location_id
    LEFT JOIN vehicle_preferred_areas vpa ON vpa.vehicle_id=v.id LEFT JOIN areas a ON a.id=vpa.area_id
    GROUP BY v.id ORDER BY v.operational_status='sold',COALESCE(v.official_sequence,999),v.vehicle_code`).all().map((item) => ({
      ...item,
      preferredAreaIds: item.preferredAreaIds ? item.preferredAreaIds.split(',').map(Number) : [],
      preferredAreas: item.preferredAreaNames ? item.preferredAreaNames.split('|') : [],
      preferredZoneIds:database.prepare('SELECT zone_group_id id FROM vehicle_preferred_zones WHERE vehicle_id=? ORDER BY zone_group_id').all(item.id).map(row=>row.id),
      preferredZones:database.prepare('SELECT z.name FROM vehicle_preferred_zones vpz JOIN zone_groups z ON z.id=vpz.zone_group_id WHERE vpz.vehicle_id=? ORDER BY z.sort_order').all(item.id).map(row=>row.name)
    }))
}

function employeeRows(database) {
  return database.prepare(`SELECT e.id,e.employee_code employeeCode,e.name,e.phone,e.job_role jobRole,e.is_active isActive,
    COALESCE(e.employment_detail_status,e.employment_status) employmentStatus,e.employment_status operationalEmploymentStatus,e.employment_detail_status employmentDetailStatus,e.default_base_location_id defaultBaseLocationId,base.name defaultBase,
    e.employment_type employmentType,e.employment_start_date employmentStartDate,e.employment_end_date employmentEndDate,e.last_working_day lastWorkingDay,e.resignation_termination_reason resignationTerminationReason,
    e.national_id_number nationalIdNumber,e.bank_name bankName,e.bank_account_number bankAccountNumber,e.bank_account_holder_name bankAccountHolderName,e.epf_number epfNumber,e.socso_number socsoNumber,
    e.default_area_id defaultAreaId,a.name defaultArea,aa.id accountId,aa.username,aa.role systemRole,aa.is_active accountActive,aa.must_change_password mustChangePassword,
    GROUP_CONCAT(CASE WHEN ejr.is_active=1 THEN ejr.role END,'|') additionalRoles
    FROM employees e LEFT JOIN operational_locations base ON base.id=e.default_base_location_id
    LEFT JOIN areas a ON a.id=e.default_area_id LEFT JOIN auth_accounts aa ON aa.employee_id=e.id LEFT JOIN employee_job_roles ejr ON ejr.employee_id=e.id
    GROUP BY e.id ORDER BY e.name`).all().map(item=>({...item,
      additionalRoles:item.additionalRoles?item.additionalRoles.split('|'):[],
      usualAreaIds:database.prepare('SELECT area_id id FROM employee_familiar_areas WHERE employee_id=? ORDER BY area_id').all(item.id).map(row=>row.id),
      usualAreas:database.prepare('SELECT a.name FROM employee_familiar_areas f JOIN areas a ON a.id=f.area_id WHERE f.employee_id=? ORDER BY a.name').all(item.id).map(row=>row.name),
      accountPermissions:item.accountId?database.prepare('SELECT permission FROM auth_account_permissions WHERE account_id=? ORDER BY permission').all(item.accountId).map(row=>row.permission):[],
      employmentPeriods:database.prepare(`SELECT id,start_date startDate,end_date endDate,last_working_day lastWorkingDay,employment_status employmentStatus,employment_type employmentType,primary_job_role primaryJobRole,secondary_job_roles secondaryJobRoles,resignation_or_termination_reason reason,rehire_flag rehireFlag,created_by createdBy,created_at createdAt,updated_by updatedBy,updated_at updatedAt FROM employee_employment_history WHERE employee_id=? ORDER BY id`).all(item.id).map(row=>({...row,secondaryJobRoles:row.secondaryJobRoles?row.secondaryJobRoles.split('|'):[]})),
      nationalIdMasked:maskIdentity(item.nationalIdNumber),bankAccountMasked:maskLastFour(item.bankAccountNumber),epfMasked:maskLastFour(item.epfNumber),socsoMasked:maskLastFour(item.socsoNumber),
      hasNationalId:Boolean(item.nationalIdNumber),hasBankAccount:Boolean(item.bankAccountNumber),hasEpf:Boolean(item.epfNumber),hasSocso:Boolean(item.socsoNumber),
      nationalIdNumber:undefined,bankAccountNumber:undefined,epfNumber:undefined,socsoNumber:undefined
    }))
}

const JOB_ROLES=new Set(['Driver','Attendant / Crew','Supervisor','Office','Admin','Mechanic / Workshop','Other'])
const EMPLOYMENT_TYPES=new Set(['Permanent','Contractor','Part-time','Temporary'])
const EMPLOYMENT_STATUSES=new Set(['active','on_leave','inactive','resigned','terminated','suspended'])
const normalizeJobRole=value=>{const raw=text(value)||'Other',mapped={driver:'Driver',assistant:'Attendant / Crew',crew:'Attendant / Crew',attendant:'Attendant / Crew',supervisor:'Supervisor',office:'Office',admin:'Admin',mechanic:'Mechanic / Workshop',workshop:'Mechanic / Workshop',other:'Other'}[raw.toLowerCase()]||raw;if(!JOB_ROLES.has(mapped))throw new Error('Invalid Employee Job Role');return mapped}
const normalizeEmploymentType=value=>{const result=text(value)||'Permanent';if(!EMPLOYMENT_TYPES.has(result))throw new Error('Invalid Employment Type');return result}
const normalizeEmploymentStatus=value=>{const result=text(value).toLowerCase()||'active',mapped={active:'active','on leave':'on_leave',on_leave:'on_leave',inactive:'inactive',resigned:'resigned',terminated:'terminated',suspended:'suspended'}[result];if(!mapped||!EMPLOYMENT_STATUSES.has(mapped))throw new Error('Invalid Employment Status');return mapped}
const operationalStatus=status=>status==='active'?'active':status==='on_leave'?'on_leave':'inactive'
const maskLastFour=value=>text(value)?`${'*'.repeat(Math.max(4,text(value).length-4))}${text(value).slice(-4)}`:null
const maskIdentity=value=>{const raw=text(value);if(!raw)return null;return `${raw.slice(0,Math.max(0,raw.length-4))}****`}
const nextEmployeeCode=(database)=>{for(let number=1;;number+=1){const code=`EMP-${String(number).padStart(4,'0')}`;if(!database.prepare('SELECT 1 FROM employees WHERE employee_code=?').get(code))return code}}
function assertUniqueEmployeeFields(database,payload,excludeId=null){for(const[field,key,label]of[['employee_code','employeeCode','Employee Code'],['national_id_number','nationalIdNumber','IC Number'],['epf_number','epfNumber','EPF Number'],['socso_number','socsoNumber','SOCSO Number']]){const value=text(payload[key]);if(!value)continue;const existing=database.prepare(`SELECT id,employee_code,name FROM employees WHERE ${field}=? AND (? IS NULL OR id<>?)`).get(value,excludeId,excludeId);if(existing)throw new Error(`${label} already belongs to ${existing.employee_code||'existing employee'} (${existing.name})`)}}
function replaceEmployeeFamiliarAreas(database,employeeId,areaIds,actor){if(!Array.isArray(areaIds))return;database.prepare('DELETE FROM employee_familiar_areas WHERE employee_id=?').run(employeeId);const insert=database.prepare('INSERT OR IGNORE INTO employee_familiar_areas(employee_id,area_id,created_by) VALUES(?,?,?)');for(const areaId of areaIds)if(Number(areaId))insert.run(employeeId,Number(areaId),actor)}
function validateEmployeeBase(database,value){const id=idOrNull(value);if(!id)return null;const location=database.prepare(`SELECT id FROM operational_locations WHERE id=? AND is_active=1 AND COALESCE(operational_type,CASE location_type WHEN 'depot' THEN 'Company Yard' WHEN 'employee_home' THEN 'Employee Base' ELSE 'Other' END) IN ('Company Yard','Employee Base')`).get(id);if(!location)throw new Error('Default Base must be an active Company Yard or Employee Base');return id}
const auditValue=value=>value==null?'':String(value)
function auditEmployeeChanges(database,id,before,next,payload,actor){const tracked=[['employee_code','employeeCode'],['name','name'],['phone','phone'],['job_role','jobRole'],['employment_type','employmentType'],['employment_detail_status','employmentStatus'],['employment_start_date','employmentStartDate'],['employment_end_date','employmentEndDate'],['last_working_day','lastWorkingDay'],['resignation_termination_reason','resignationTerminationReason'],['national_id_number','nationalIdNumber'],['bank_name','bankName'],['bank_account_number','bankAccountNumber'],['bank_account_holder_name','bankAccountHolderName'],['epf_number','epfNumber'],['socso_number','socsoNumber'],['default_base_location_id','defaultBaseLocationId']];const changes=tracked.filter(([column,key])=>Object.hasOwn(payload,key)&&auditValue(before?.[column])!==auditValue(next[column]));if(changes.length&&!text(payload.reason))throw new Error('修改员工关键资料必须填写原因');const insert=database.prepare('INSERT INTO employee_change_history(employee_id,field_name,old_value,new_value,reason,changed_by) VALUES(?,?,?,?,?,?)'),sensitive=new Set(['national_id_number','bank_name','bank_account_number','bank_account_holder_name','epf_number','socso_number']);for(const[column]of changes){insert.run(id,column,auditValue(before?.[column])||null,auditValue(next[column])||null,text(payload.reason),actor);if(sensitive.has(column))database.prepare(`INSERT INTO employee_sensitive_access_logs(employee_id,action,field_name,reason,actor) VALUES(?,'modify',?,?,?)`).run(id,column,text(payload.reason),actor)}}
function replaceEmployeeRoles(database,employeeId,primaryRole,roles,actor,reason,oldRoles=[]){const next=[...new Set([primaryRole,...(roles||[]).map(normalizeJobRole)])];database.prepare('DELETE FROM employee_job_roles WHERE employee_id=?').run(employeeId);const insert=database.prepare('INSERT INTO employee_job_roles(employee_id,role,is_primary,created_by) VALUES(?,?,?,?)');for(const role of next)insert.run(employeeId,role,role===primaryRole?1:0,actor);database.prepare('INSERT INTO employee_role_history(employee_id,old_roles_json,new_roles_json,reason,changed_by) VALUES(?,?,?,?,?)').run(employeeId,JSON.stringify(oldRoles),JSON.stringify(next),text(reason)||null,actor)}

export function listResources(database = defaultDb) {
  return {
    vehicles: vehicleRows(database),
    employees: employeeRows(database),
    locations: database.prepare(`SELECT id,name,location_type locationType,operational_type operationalType,address,latitude,longitude,can_start canStart,can_end canEnd,is_active isActive FROM operational_locations ORDER BY name`).all(),
    areas: areaRows(database),
    zoneGroups: zoneRows(database)
  }
}

export function getEmployeeMaster(id,database=defaultDb){return employeeRows(database).find(item=>item.id===Number(id))||null}

const zoneStatsSql=`SELECT z.id,z.code,z.name,z.sort_order sortOrder,z.is_active isActive,
  (SELECT COUNT(*) FROM areas a WHERE a.zone_group_id=z.id) areaCount,
  (SELECT COUNT(*) FROM areas a WHERE a.zone_group_id=z.id AND a.zone_assignment_status='confirmed') confirmedAreaCount,
  (SELECT COUNT(*) FROM areas a WHERE a.zone_group_id=z.id AND a.zone_assignment_status='pending_confirmation') pendingAreaCount,
  (SELECT COUNT(*) FROM branches b JOIN areas a ON a.id=b.area_id WHERE a.zone_group_id=z.id) branchCount,
  (SELECT COUNT(*) FROM branches b JOIN areas a ON a.id=b.area_id WHERE a.zone_group_id=z.id AND b.latitude BETWEEN -90 AND 90 AND b.longitude BETWEEN -180 AND 180 AND NOT(b.latitude=0 AND b.longitude=0)) gpsBranchCount,
  ((SELECT COUNT(*) FROM branches b JOIN areas a ON a.id=b.area_id WHERE a.zone_group_id=z.id) -
   (SELECT COUNT(*) FROM branches b JOIN areas a ON a.id=b.area_id WHERE a.zone_group_id=z.id AND b.latitude BETWEEN -90 AND 90 AND b.longitude BETWEEN -180 AND 180 AND NOT(b.latitude=0 AND b.longitude=0))) missingGpsBranchCount,
  (SELECT COUNT(DISTINCT b.id) FROM branches b JOIN areas a ON a.id=b.area_id WHERE a.zone_group_id=z.id AND EXISTS(SELECT 1 FROM branch_schedules s WHERE s.branch_id=b.id AND s.is_active=1)) scheduledCustomerCount,
  (SELECT COUNT(DISTINCT b.id) FROM branches b JOIN areas a ON a.id=b.area_id WHERE a.zone_group_id=z.id AND EXISTS(SELECT 1 FROM branch_schedules s WHERE s.branch_id=b.id AND s.is_active=1)) scheduledBranchCount
  FROM zone_groups z`
const zoneRow=(database,id)=>database.prepare(`${zoneStatsSql} WHERE z.id=?`).get(id)
const zoneRows=database=>database.prepare(`${zoneStatsSql} ORDER BY z.sort_order,z.id`).all()
const areaRows=database=>database.prepare(`SELECT a.id,a.jodoo_area_id areaId,a.name,a.is_active isActive,a.zone_group_id zoneGroupId,a.confirmed_zone_group_id confirmedZoneGroupId,
  a.zone_assignment_status zoneAssignmentStatus,z.name zoneGroup,confirmed.name confirmedZoneGroup,
  (SELECT COUNT(DISTINCT b.customer_id) FROM branches b WHERE b.area_id=a.id) customerCount,
  (SELECT COUNT(*) FROM branches b WHERE b.area_id=a.id) branchCount,
  (SELECT COUNT(*) FROM branches b WHERE b.area_id=a.id AND b.latitude BETWEEN -90 AND 90 AND b.longitude BETWEEN -180 AND 180 AND NOT(b.latitude=0 AND b.longitude=0)) gpsBranchCount
  FROM areas a JOIN zone_groups z ON z.id=a.zone_group_id LEFT JOIN zone_groups confirmed ON confirmed.id=a.confirmed_zone_group_id ORDER BY z.sort_order,a.name`).all()
const auditZone=(database,action,id,before,after,changedBy)=>database.prepare(`INSERT INTO audit_logs(action,entity_type,entity_id,before_json,after_json) VALUES(?,?,?,?,?)`).run(`${action}:${text(changedBy)||'Supervisor'}`,'zone_group',String(id),before?JSON.stringify(before):null,after?JSON.stringify(after):null)
const auditArea=(database,action,id,before,after,changedBy)=>database.prepare(`INSERT INTO audit_logs(action,entity_type,entity_id,before_json,after_json) VALUES(?,?,?,?,?)`).run(action,'area',String(id),before?JSON.stringify(before):null,JSON.stringify({...after,changedBy:text(changedBy)||'Supervisor'}))
const affectedDates=(database,areaIds)=>{if(!areaIds.length)return[];const marks=areaIds.map(()=>'?').join(',');return database.prepare(`SELECT DISTINCT dd.dispatch_date FROM dispatch_days dd JOIN dispatch_trips dt ON dt.dispatch_day_id=dd.id JOIN dispatch_stops ds ON ds.dispatch_trip_id=dt.id JOIN branches b ON b.id=ds.branch_id WHERE b.area_id IN (${marks}) AND dd.dispatch_date>=date('now','localtime') AND dd.status IN ('approved','published')`).all(...areaIds).map(item=>item.dispatch_date)}

export function listZoneGroups(database=defaultDb){return{items:zoneRows(database),areas:listResources(database).areas}}

const officialGpsSql=alias=>`${alias}.latitude BETWEEN -90 AND 90 AND ${alias}.longitude BETWEEN -180 AND 180 AND NOT(${alias}.latitude=0 AND ${alias}.longitude=0)`
const metricLabels={areas:'Area总数',confirmed:'已确认',pending:'待确认',official_gps:'有正式GPS',missing_gps:'缺GPS',branches:'Customer Branch',scheduled:'已排客户'}

export function getZoneGroupMetricDetails(id,options={},database=defaultDb){
  const zone=zoneRow(database,Number(id));if(!zone)throw new Error('Zone Group not found')
  const metric=metricLabels[options.metric]?options.metric:'areas',view=metric==='official_gps'&&options.view==='branch'?'branch':'area'
  let items
  if(['areas','confirmed','pending'].includes(metric)||(metric==='official_gps'&&view==='area')){
    items=database.prepare(`SELECT a.id,a.jodoo_area_id areaId,a.name areaName,a.zone_assignment_status zoneAssignmentStatus,
      current.name currentZone,formal.name formalZone,
      COUNT(DISTINCT b.id) branchCount,
      SUM(CASE WHEN ${officialGpsSql('b')} THEN 1 ELSE 0 END) officialGpsCount,
      COUNT(DISTINCT b.id)-SUM(CASE WHEN ${officialGpsSql('b')} THEN 1 ELSE 0 END) missingGpsCount
      FROM areas a JOIN zone_groups current ON current.id=a.zone_group_id
      LEFT JOIN zone_groups formal ON formal.id=COALESCE(a.confirmed_zone_group_id,a.zone_group_id)
      LEFT JOIN branches b ON b.area_id=a.id
      WHERE a.zone_group_id=? GROUP BY a.id ORDER BY a.name`).all(zone.id).map(item=>({...item,officialGpsCount:Number(item.officialGpsCount||0),missingGpsCount:Number(item.missingGpsCount||0)}))
    if(metric==='confirmed')items=items.filter(item=>item.zoneAssignmentStatus==='confirmed')
    if(metric==='pending')items=items.filter(item=>item.zoneAssignmentStatus!=='confirmed')
    if(metric==='official_gps')items=items.filter(item=>item.officialGpsCount>0)
  }else{
    const rows=database.prepare(`SELECT b.id,b.jodoo_branch_id branchId,b.branch_name branchName,b.latitude,b.longitude,b.gps_status gpsStatus,
      c.jodoo_customer_id customerId,c.name customerName,a.id areaId,a.name areaName,
      EXISTS(SELECT 1 FROM temporary_locations t WHERE t.branch_id=b.id) hasTemporaryGps,
      s.jodoo_schedule_id scheduleId,s.frequency,s.days_of_week assignedWeekdays
      FROM branches b JOIN areas a ON a.id=b.area_id LEFT JOIN customers c ON c.id=b.customer_id
      LEFT JOIN branch_schedules s ON s.branch_id=b.id AND s.is_active=1
      WHERE a.zone_group_id=? ORDER BY a.name,c.name,b.branch_name,s.jodoo_schedule_id`).all(zone.id)
    const grouped=new Map()
    for(const row of rows){
      if(!grouped.has(row.id))grouped.set(row.id,{id:row.id,branchId:row.branchId,branchName:row.branchName,customerId:row.customerId,customerName:row.customerName,areaId:row.areaId,areaName:row.areaName,latitude:row.latitude,longitude:row.longitude,gpsStatus:row.gpsStatus,hasOfficialGps:Boolean(Number.isFinite(row.latitude)&&Number.isFinite(row.longitude)&&row.latitude>=-90&&row.latitude<=90&&row.longitude>=-180&&row.longitude<=180&&!(row.latitude===0&&row.longitude===0)),hasTemporaryGps:Boolean(row.hasTemporaryGps),schedules:[]})
      if(row.scheduleId)grouped.get(row.id).schedules.push({scheduleId:row.scheduleId,frequency:row.frequency,assignedWeekdays:row.assignedWeekdays})
    }
    items=[...grouped.values()]
    if(metric==='official_gps')items=items.filter(item=>item.hasOfficialGps)
    if(metric==='missing_gps')items=items.filter(item=>!item.hasOfficialGps)
    if(metric==='scheduled')items=items.filter(item=>item.schedules.length>0)
  }
  const total=items.length,search=text(options.search).toLowerCase(),areaId=Number(options.areaId)||null
  if(search)items=items.filter(item=>`${item.areaName||''} ${item.areaId||''} ${item.customerName||''} ${item.customerId||''} ${item.branchName||''} ${item.branchId||''}`.toLowerCase().includes(search))
  if(areaId)items=items.filter(item=>(item.branchId?item.areaId:item.id)===areaId)
  const sort=options.sort||'name'
  items.sort((a,b)=>sort==='branches_desc'?(b.branchCount||0)-(a.branchCount||0):sort==='gps_desc'?(b.officialGpsCount||0)-(a.officialGpsCount||0):sort==='branch_id'?text(a.branchId).localeCompare(text(b.branchId)):sort==='customer'?text(a.customerName).localeCompare(text(b.customerName)):text(a.areaName||a.branchName).localeCompare(text(b.areaName||b.branchName)))
  return{zone:{id:zone.id,name:zone.name},metric,label:metricLabels[metric],view,total,filteredCount:items.length,areas:areaRows(database).filter(area=>area.zoneGroupId===zone.id).map(area=>({id:area.id,name:area.name})),items}
}

const toRadians=value=>value*Math.PI/180
const distanceKm=(a,b)=>{const earth=6371,dLat=toRadians(b.latitude-a.latitude),dLon=toRadians(b.longitude-a.longitude),value=Math.sin(dLat/2)**2+Math.cos(toRadians(a.latitude))*Math.cos(toRadians(b.latitude))*Math.sin(dLon/2)**2;return earth*2*Math.atan2(Math.sqrt(value),Math.sqrt(1-value))}

export function getAreaConfirmationDetail(id,database=defaultDb){
  const area=database.prepare(`SELECT a.id,a.jodoo_area_id areaId,a.name,a.zone_group_id zoneGroupId,z.name zoneGroup,a.confirmed_zone_group_id confirmedZoneGroupId,cz.name confirmedZoneGroup,a.zone_assignment_status zoneAssignmentStatus,
    COUNT(DISTINCT b.customer_id) customerCount,COUNT(DISTINCT b.id) branchCount,
    SUM(CASE WHEN b.latitude BETWEEN -90 AND 90 AND b.longitude BETWEEN -180 AND 180 AND NOT(b.latitude=0 AND b.longitude=0) THEN 1 ELSE 0 END) gpsBranchCount
    FROM areas a JOIN zone_groups z ON z.id=a.zone_group_id LEFT JOIN zone_groups cz ON cz.id=a.confirmed_zone_group_id LEFT JOIN branches b ON b.area_id=a.id WHERE a.id=? GROUP BY a.id`).get(id)
  if(!area)throw new Error('Area not found')
  const rows=database.prepare(`SELECT b.id,b.jodoo_branch_id branchId,b.branch_name branchName,b.address,b.latitude,b.longitude,c.jodoo_customer_id customerId,c.name customerName,
    s.jodoo_schedule_id scheduleId,s.frequency,s.days_of_week dayOfWeek,s.take_date takeDate,s.next_take_date nextTakeDate
    FROM branches b LEFT JOIN customers c ON c.id=b.customer_id LEFT JOIN branch_schedules s ON s.branch_id=b.id AND s.is_active=1 WHERE b.area_id=? ORDER BY b.branch_name,s.jodoo_schedule_id`).all(id)
  const grouped=new Map()
  for(const row of rows){if(!grouped.has(row.id))grouped.set(row.id,{id:row.id,branchId:row.branchId,branchName:row.branchName,customerId:row.customerId,customerName:row.customerName,address:row.address,latitude:row.latitude,longitude:row.longitude,schedules:[]});if(row.scheduleId)grouped.get(row.id).schedules.push({scheduleId:row.scheduleId,frequency:row.frequency,dayOfWeek:row.dayOfWeek,takeDate:row.takeDate,nextTakeDate:row.nextTakeDate})}
  const history=database.prepare(`SELECT COUNT(ds.id) dispatchCount,COUNT(ds.collected_weight_kg) weightedDispatchCount,SUM(ds.collected_weight_kg) collectedWeightKg FROM dispatch_stops ds JOIN branches b ON b.id=ds.branch_id WHERE b.area_id=?`).get(id)
  const centroid=database.prepare(`SELECT AVG(latitude) latitude,AVG(longitude) longitude,COUNT(*) pointCount FROM branches WHERE area_id=? AND latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180 AND NOT(latitude=0 AND longitude=0)`).get(id)
  let adjacentAreas=[]
  if(centroid.pointCount){adjacentAreas=database.prepare(`SELECT a.id,a.name,z.name zoneGroup,AVG(b.latitude) latitude,AVG(b.longitude) longitude,COUNT(*) pointCount FROM areas a JOIN zone_groups z ON z.id=a.zone_group_id JOIN branches b ON b.area_id=a.id WHERE a.id<>? AND b.latitude BETWEEN -90 AND 90 AND b.longitude BETWEEN -180 AND 180 AND NOT(b.latitude=0 AND b.longitude=0) GROUP BY a.id`).all(id).map(item=>({...item,distanceKm:Number(distanceKm(centroid,item).toFixed(1))})).sort((a,b)=>a.distanceKm-b.distanceKm).slice(0,5)}
  return{...area,missingGpsBranchCount:area.branchCount-area.gpsBranchCount,branches:[...grouped.values()],history:{dispatchCount:history.dispatchCount,weightedDispatchCount:history.weightedDispatchCount,collectedWeightKg:history.collectedWeightKg},adjacentAreas}
}

export function createZoneGroup(payload,database=defaultDb){
  const name=text(payload.name);if(!name)throw new Error('Zone Group Name is required')
  const next=database.prepare('SELECT COALESCE(MAX(id),0)+1 value FROM zone_groups').get().value,code=text(payload.code)||`ZONE-${next}`,sortOrder=Number(payload.sortOrder??database.prepare('SELECT COALESCE(MAX(sort_order),0)+1 value FROM zone_groups').get().value)
  const result=database.prepare('INSERT INTO zone_groups(code,name,sort_order,is_active) VALUES(?,?,?,1)').run(code,name,sortOrder)
  const item=zoneRow(database,Number(result.lastInsertRowid));auditZone(database,'zone_created',item.id,null,item,payload.changedBy);return item
}

export function updateZoneGroup(id, payload, database = defaultDb) {
  const before=database.prepare('SELECT * FROM zone_groups WHERE id=?').get(id);if(!before)throw new Error('Zone Group not found')
  if(!text(payload.name??before.name))throw new Error('Zone Group Name is required')
  database.prepare('UPDATE zone_groups SET name=?,code=?,sort_order=?,is_active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(text(payload.name??before.name),text(payload.code??before.code),Number(payload.sortOrder??before.sort_order),payload.isActive===undefined?before.is_active:Number(Boolean(payload.isActive)),id)
  const item=zoneRow(database,id);auditZone(database,'zone_updated',id,before,item,payload.changedBy);return item
}

export function setZoneActive(id,isActive,payload={},database=defaultDb){return updateZoneGroup(id,{isActive,changedBy:payload.changedBy},database)}

export function mergeZoneGroups(payload,database=defaultDb){
  const targetId=Number(payload.targetZoneId),sourceIds=[...new Set((payload.sourceZoneIds||[]).map(Number).filter(id=>id&&id!==targetId))]
  const target=database.prepare('SELECT * FROM zone_groups WHERE id=?').get(targetId);if(!target||!sourceIds.length)throw new Error('Target Zone and at least one different source Zone are required')
  const marks=sourceIds.map(()=>'?').join(','),sources=database.prepare(`SELECT * FROM zone_groups WHERE id IN (${marks})`).all(...sourceIds);if(sources.length!==sourceIds.length)throw new Error('One or more source Zones were not found')
  const areas=database.prepare(`SELECT * FROM areas WHERE zone_group_id IN (${marks})`).all(...sourceIds)
  database.exec('BEGIN IMMEDIATE');try{
    database.prepare(`UPDATE areas SET confirmed_zone_group_id=COALESCE(confirmed_zone_group_id,zone_group_id),zone_group_id=?,zone_assignment_status='pending_confirmation',updated_at=CURRENT_TIMESTAMP WHERE zone_group_id IN (${marks})`).run(targetId,...sourceIds)
    for(const before of areas)auditArea(database,'area_zone_moved',before.id,before,{zoneGroupId:targetId,zoneAssignmentStatus:'pending_confirmation',source:'zone_merge'},payload.changedBy)
    for(const sourceId of sourceIds){database.prepare('INSERT OR IGNORE INTO vehicle_preferred_zones(vehicle_id,zone_group_id) SELECT vehicle_id,? FROM vehicle_preferred_zones WHERE zone_group_id=?').run(targetId,sourceId);database.prepare('DELETE FROM vehicle_preferred_zones WHERE zone_group_id=?').run(sourceId)}
    database.prepare(`UPDATE zone_groups SET is_active=0,updated_at=CURRENT_TIMESTAMP WHERE id IN (${marks})`).run(...sourceIds)
    if(payload.name)database.prepare('UPDATE zone_groups SET name=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(text(payload.name),targetId)
    auditZone(database,'zones_merged',targetId,sources,zoneRow(database,targetId),payload.changedBy);database.exec('COMMIT');return listZoneGroups(database)
  }catch(error){database.exec('ROLLBACK');throw error}
}

export function splitZoneGroup(payload,database=defaultDb){
  const sourceId=Number(payload.sourceZoneId),areaIds=[...new Set((payload.areaIds||[]).map(Number).filter(Boolean))];if(!sourceId||!text(payload.name)||!areaIds.length)throw new Error('Source Zone, new name and at least one Area are required')
  const source=database.prepare('SELECT * FROM zone_groups WHERE id=?').get(sourceId);if(!source)throw new Error('Source Zone not found')
  const marks=areaIds.map(()=>'?').join(','),matched=database.prepare(`SELECT id FROM areas WHERE zone_group_id=? AND id IN (${marks})`).all(sourceId,...areaIds);if(matched.length!==areaIds.length)throw new Error('All selected Areas must currently belong to the source Zone')
  database.exec('BEGIN IMMEDIATE');try{
    const next=database.prepare('SELECT COALESCE(MAX(id),0)+1 value FROM zone_groups').get().value,code=text(payload.code)||`ZONE-${next}`,sortOrder=Number(payload.sortOrder??source.sort_order+1)
    const created=database.prepare('INSERT INTO zone_groups(code,name,sort_order,is_active) VALUES(?,?,?,1)').run(code,text(payload.name),sortOrder),newId=Number(created.lastInsertRowid)
    const beforeAreas=database.prepare(`SELECT * FROM areas WHERE id IN (${marks})`).all(...areaIds)
    database.prepare(`UPDATE areas SET confirmed_zone_group_id=COALESCE(confirmed_zone_group_id,zone_group_id),zone_group_id=?,zone_assignment_status='pending_confirmation',updated_at=CURRENT_TIMESTAMP WHERE id IN (${marks})`).run(newId,...areaIds)
    for(const before of beforeAreas)auditArea(database,'area_zone_moved',before.id,before,{zoneGroupId:newId,zoneAssignmentStatus:'pending_confirmation',source:'zone_split'},payload.changedBy)
    auditZone(database,'zone_split',newId,source,zoneRow(database,newId),payload.changedBy);database.exec('COMMIT');return{zone:zoneRow(database,newId),...listZoneGroups(database)}
  }catch(error){database.exec('ROLLBACK');throw error}
}

export function assignAreaZone(areaId, zoneGroupId, payload={}, database = defaultDb) {
  return moveAreasToZone([areaId],zoneGroupId,payload,database)[0]
}

export function moveAreasToZone(areaIds,zoneGroupId,payload={},database=defaultDb){
  const ids=[...new Set((areaIds||[]).map(Number).filter(Boolean))];if(!ids.length)throw new Error('At least one Area is required')
  const zone=database.prepare('SELECT id,name FROM zone_groups WHERE id=? AND is_active=1').get(zoneGroupId);if(!zone)throw new Error('Zone Group not found or inactive')
  const marks=ids.map(()=>'?').join(','),beforeRows=database.prepare(`SELECT * FROM areas WHERE id IN (${marks})`).all(...ids);if(beforeRows.length!==ids.length)throw new Error('One or more Areas were not found')
  const reason=text(payload.reason)||'Zone Area Confirmation adjustment',actor=text(payload.changedBy)||'Supervisor',zoneName=database.prepare('SELECT name FROM zone_groups WHERE id=?')
  database.exec('BEGIN IMMEDIATE');try{
    database.prepare(`UPDATE areas SET confirmed_zone_group_id=COALESCE(confirmed_zone_group_id,zone_group_id),zone_group_id=?,zone_assignment_status='pending_confirmation',updated_at=CURRENT_TIMESTAMP WHERE id IN (${marks})`).run(zoneGroupId,...ids)
    for(const before of beforeRows)auditArea(database,'area_zone_moved',before.id,before,{areaId:before.jodoo_area_id,oldZoneId:before.zone_group_id,oldZone:zoneName.get(before.zone_group_id)?.name||null,newZoneId:Number(zoneGroupId),newZone:zone.name,confirmedZoneGroupId:before.confirmed_zone_group_id??before.zone_group_id,zoneAssignmentStatus:'pending_confirmation',reason,changedBy:actor},actor)
    database.exec('COMMIT')
  }catch(error){database.exec('ROLLBACK');throw error}
  const all=areaRows(database);return ids.map(id=>all.find(item=>item.id===id))
}

export function supervisorMoveAreasToZone(areaIds,zoneGroupId,payload={},database=defaultDb){
  if(text(payload.actorRole).toLowerCase()!=='supervisor')throw new Error('Supervisor permission required')
  if(!text(payload.reason))throw new Error('Movement reason is required')
  return moveAreasToZone(areaIds,zoneGroupId,payload,database)
}

export function setAreasConfirmation(areaIds,confirmed,payload={},database=defaultDb){
  const ids=[...new Set((areaIds||[]).map(Number).filter(Boolean))];if(!ids.length)throw new Error('At least one Area is required')
  const marks=ids.map(()=>'?').join(','),beforeRows=database.prepare(`SELECT * FROM areas WHERE id IN (${marks})`).all(...ids);if(beforeRows.length!==ids.length)throw new Error('One or more Areas were not found')
  const changedEffectiveIds=confirmed?beforeRows.filter(item=>(item.confirmed_zone_group_id??item.zone_group_id)!==item.zone_group_id).map(item=>item.id):[]
  const dates=affectedDates(database,changedEffectiveIds)
  database.exec('BEGIN IMMEDIATE');try{
    if(confirmed)database.prepare(`UPDATE areas SET confirmed_zone_group_id=zone_group_id,zone_assignment_status='confirmed',zone_confirmed_by=?,zone_confirmed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id IN (${marks})`).run(text(payload.changedBy)||'Supervisor',...ids)
    else database.prepare(`UPDATE areas SET confirmed_zone_group_id=COALESCE(confirmed_zone_group_id,zone_group_id),zone_assignment_status='pending_confirmation',zone_confirmed_by=NULL,zone_confirmed_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id IN (${marks})`).run(...ids)
    for(const before of beforeRows)auditArea(database,confirmed?'area_zone_confirmed':'area_zone_confirmation_revoked',before.id,before,{zoneGroupId:before.zone_group_id,confirmedZoneGroupId:confirmed?before.zone_group_id:(before.confirmed_zone_group_id??before.zone_group_id),zoneAssignmentStatus:confirmed?'confirmed':'pending_confirmation'},payload.changedBy)
    for(const date of dates)invalidateDispatchDay(database,date,'area_zone_confirmed','area','batch',beforeRows,{areaIds:changedEffectiveIds},payload.changedBy)
    database.exec('COMMIT')
  }catch(error){database.exec('ROLLBACK');throw error}
  const all=areaRows(database);return ids.map(id=>all.find(item=>item.id===id))
}

export function createVehicle(payload, database = defaultDb) {
  if (!text(payload.vehicleCode)) throw new Error('Vehicle Number is required')
  database.exec('BEGIN IMMEDIATE')
  try {
    const operationalStatus=payload.status||'available';if(!['available','active','maintenance','inactive','sold'].includes(operationalStatus))throw new Error('Invalid vehicle status')
    const legacyStatus=['available','active'].includes(operationalStatus)?'available':operationalStatus==='maintenance'?'maintenance':'inactive'
    const result = database.prepare(`INSERT INTO vehicles(vehicle_code,vehicle_name,registration_number,capacity_kg,default_base_location_id,status,operational_status,is_temporary,temporary_date,brand,model,manufacture_year,registration_date,vehicle_type,chassis_number,engine_number,gross_vehicle_weight_kg,unladen_weight_kg,remark,is_common)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(text(payload.vehicleCode),text(payload.vehicleName)||null,text(payload.registrationNumber)||null,payload.capacityKg??null,idOrNull(payload.defaultBaseLocationId),legacyStatus,operationalStatus,payload.isTemporary?1:0,payload.temporaryDate||null,text(payload.brand)||null,text(payload.model)||null,payload.manufactureYear||null,payload.registrationDate||null,text(payload.vehicleType)||null,text(payload.chassisNumber)||null,text(payload.engineNumber)||null,payload.grossVehicleWeightKg??null,payload.unladenWeightKg??null,text(payload.remark)||null,payload.isCommon?1:0)
    replacePreferredAreas(database, result.lastInsertRowid, payload.preferredAreaIds || [])
    replacePreferredZones(database,result.lastInsertRowid,payload.preferredZoneIds||[])
    database.exec('COMMIT')
    return vehicleRows(database).find((item) => item.id === Number(result.lastInsertRowid))
  } catch (error) { database.exec('ROLLBACK'); throw error }
}

export function createTemporaryVehicle(payload, database = defaultDb) {
  if (!payload.date) throw new Error('Temporary vehicle date is required')
  const count = database.prepare('SELECT COUNT(*) count FROM vehicles WHERE is_temporary=1 AND temporary_date=?').get(payload.date).count + 1
  return createVehicle({ vehicleCode: payload.vehicleCode || `Temporary Lorry ${count} (${payload.date})`, vehicleName: payload.vehicleName || '临时车辆', status: 'available', isTemporary: true, temporaryDate: payload.date }, database)
}

export function updateVehicle(id, payload, database = defaultDb) {
  const before = database.prepare('SELECT * FROM vehicles WHERE id=?').get(id)
  if (!before) throw new Error('Vehicle not found')
  database.exec('BEGIN IMMEDIATE')
  try {
    const currentStatus=before.operational_status||before.status,nextStatus=payload.status??currentStatus
    if(!['available','active','maintenance','inactive','sold'].includes(nextStatus))throw new Error('Invalid vehicle status')
    const nextLegacy=['available','active'].includes(nextStatus)?'available':nextStatus==='maintenance'?'maintenance':'inactive'
    database.prepare(`UPDATE vehicles SET vehicle_code=?,vehicle_name=?,registration_number=?,capacity_kg=?,default_base_location_id=?,status=?,operational_status=?,brand=?,model=?,manufacture_year=?,registration_date=?,vehicle_type=?,chassis_number=?,engine_number=?,gross_vehicle_weight_kg=?,unladen_weight_kg=?,remark=?,is_common=?,sold_at=CASE WHEN ?='sold' THEN COALESCE(sold_at,CURRENT_TIMESTAMP) ELSE sold_at END,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(
      text(payload.vehicleCode ?? before.vehicle_code), payload.vehicleName === undefined ? before.vehicle_name : text(payload.vehicleName) || null,
      payload.registrationNumber === undefined ? before.registration_number : text(payload.registrationNumber) || null,
      payload.capacityKg===undefined?before.capacity_kg:payload.capacityKg,payload.defaultBaseLocationId===undefined?before.default_base_location_id:idOrNull(payload.defaultBaseLocationId),nextLegacy,nextStatus,
      payload.brand===undefined?before.brand:text(payload.brand)||null,payload.model===undefined?before.model:text(payload.model)||null,payload.manufactureYear===undefined?before.manufacture_year:payload.manufactureYear||null,payload.registrationDate===undefined?before.registration_date:payload.registrationDate||null,payload.vehicleType===undefined?before.vehicle_type:text(payload.vehicleType)||null,payload.chassisNumber===undefined?before.chassis_number:text(payload.chassisNumber)||null,payload.engineNumber===undefined?before.engine_number:text(payload.engineNumber)||null,payload.grossVehicleWeightKg===undefined?before.gross_vehicle_weight_kg:payload.grossVehicleWeightKg,payload.unladenWeightKg===undefined?before.unladen_weight_kg:payload.unladenWeightKg,payload.remark===undefined?before.remark:text(payload.remark)||null,payload.isCommon===undefined?before.is_common:Number(Boolean(payload.isCommon)),nextStatus,id)
    replacePreferredAreas(database, id, payload.preferredAreaIds)
    replacePreferredZones(database,id,payload.preferredZoneIds)
    if (nextStatus !== currentStatus) {
      database.prepare('INSERT INTO vehicle_status_history(vehicle_id,previous_status,new_status,reason,changed_by) VALUES(?,?,?,?,?)').run(id,currentStatus,nextStatus,text(payload.statusReason)||null,text(payload.changedBy)||'Supervisor')
      const dates = database.prepare(`SELECT DISTINCT dd.dispatch_date FROM dispatch_days dd JOIN dispatch_trips dt ON dt.dispatch_day_id=dd.id JOIN dispatches d ON d.id=dt.dispatch_id WHERE d.vehicle_id=? AND dd.dispatch_date>=date('now','localtime')`).all(id)
      for (const item of dates) invalidateDispatchDay(database,item.dispatch_date,'vehicle_status_changed','vehicle',id,before,{...payload,status:nextStatus},payload.changedBy)
    }
    database.exec('COMMIT')
    return vehicleRows(database).find((item) => item.id === Number(id))
  } catch (error) { database.exec('ROLLBACK'); throw error }
}

export function createEmployee(payload, database = defaultDb) {
  if (!text(payload.name)) throw new Error('Employee Name is required')
  const primaryRole=normalizeJobRole(payload.jobRole),actor=text(payload.changedBy)||'Supervisor',detailStatus=normalizeEmploymentStatus(payload.employmentStatus),type=normalizeEmploymentType(payload.employmentType),employeeCode=text(payload.employeeCode)||nextEmployeeCode(database)
  const normalized={...payload,employeeCode};assertUniqueEmployeeFields(database,normalized)
  database.exec('SAVEPOINT employee_create');try{
    const result = database.prepare(`INSERT INTO employees(employee_code,name,phone,job_role,employment_status,employment_detail_status,employment_type,employment_start_date,employment_end_date,last_working_day,resignation_termination_reason,national_id_number,bank_name,bank_account_number,bank_account_holder_name,epf_number,socso_number,default_base_location_id,default_area_id,is_active) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      employeeCode,text(payload.name),text(payload.phone)||null,primaryRole,operationalStatus(detailStatus),detailStatus,type,payload.employmentStartDate||null,payload.employmentEndDate||null,payload.lastWorkingDay||null,text(payload.resignationTerminationReason)||null,text(payload.nationalIdNumber)||null,text(payload.bankName)||null,text(payload.bankAccountNumber)||null,text(payload.bankAccountHolderName)||null,text(payload.epfNumber)||null,text(payload.socsoNumber)||null,validateEmployeeBase(database,payload.defaultBaseLocationId),idOrNull(payload.defaultAreaId),detailStatus==='active'&&payload.isActive!==false?1:0)
    const id=Number(result.lastInsertRowid);replaceEmployeeRoles(database,id,primaryRole,payload.additionalRoles,actor,payload.reason);replaceEmployeeFamiliarAreas(database,id,payload.usualAreaIds,actor)
    database.prepare(`INSERT INTO employee_employment_history(employee_id,start_date,end_date,last_working_day,employment_status,employment_type,primary_job_role,secondary_job_roles,resignation_or_termination_reason,rehire_flag,created_by) VALUES(?,?,?,?,?,?,?,?,?,0,?)`).run(id,payload.employmentStartDate||null,payload.employmentEndDate||null,payload.lastWorkingDay||null,detailStatus,type,primaryRole,(payload.additionalRoles||[]).join('|')||null,text(payload.resignationTerminationReason)||null,actor)
    auditEmployeeChanges(database,id,null,database.prepare('SELECT * FROM employees WHERE id=?').get(id),{...normalized,reason:payload.reason||'Employee creation'},actor);const created=employeeRows(database).find(item=>item.id===id);database.exec('RELEASE employee_create');return created
  }catch(error){database.exec('ROLLBACK TO employee_create; RELEASE employee_create');throw error}
}

export function updateEmployee(id, payload, database = defaultDb) {
  const before = database.prepare('SELECT * FROM employees WHERE id=?').get(id)
  if (!before) throw new Error('Employee not found')
  const primaryRole=normalizeJobRole(payload.jobRole??before.job_role),oldRoles=database.prepare('SELECT role FROM employee_job_roles WHERE employee_id=? AND is_active=1').all(id).map(item=>item.role),actor=text(payload.changedBy)||'Supervisor',detailStatus=normalizeEmploymentStatus(payload.employmentStatus??before.employment_detail_status??before.employment_status),type=normalizeEmploymentType(payload.employmentType??before.employment_type),terminal=['inactive','resigned','terminated','suspended'].includes(detailStatus),effectiveEndDate=payload.employmentEndDate===undefined?(before.employment_end_date||(terminal?new Date().toISOString().slice(0,10):null)):payload.employmentEndDate||null
  const values={employeeCode:payload.employeeCode===undefined?before.employee_code:text(payload.employeeCode)||nextEmployeeCode(database),nationalIdNumber:payload.nationalIdNumber===undefined?before.national_id_number:text(payload.nationalIdNumber),epfNumber:payload.epfNumber===undefined?before.epf_number:text(payload.epfNumber),socsoNumber:payload.socsoNumber===undefined?before.socso_number:text(payload.socsoNumber)};assertUniqueEmployeeFields(database,values,id)
  database.exec('SAVEPOINT employee_update');try{
  database.prepare(`UPDATE employees SET employee_code=?,name=?,phone=?,job_role=?,employment_status=?,employment_detail_status=?,employment_type=?,employment_start_date=?,employment_end_date=?,last_working_day=?,resignation_termination_reason=?,national_id_number=?,bank_name=?,bank_account_number=?,bank_account_holder_name=?,epf_number=?,socso_number=?,default_base_location_id=?,default_area_id=?,is_active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(
    values.employeeCode,text(payload.name??before.name),payload.phone===undefined?before.phone:text(payload.phone)||null,primaryRole,operationalStatus(detailStatus),detailStatus,type,payload.employmentStartDate===undefined?before.employment_start_date:payload.employmentStartDate||null,effectiveEndDate,payload.lastWorkingDay===undefined?before.last_working_day:payload.lastWorkingDay||null,payload.resignationTerminationReason===undefined?before.resignation_termination_reason:text(payload.resignationTerminationReason)||null,values.nationalIdNumber||null,payload.bankName===undefined?before.bank_name:text(payload.bankName)||null,payload.bankAccountNumber===undefined?before.bank_account_number:text(payload.bankAccountNumber)||null,payload.bankAccountHolderName===undefined?before.bank_account_holder_name:text(payload.bankAccountHolderName)||null,values.epfNumber||null,values.socsoNumber||null,payload.defaultBaseLocationId===undefined?before.default_base_location_id:validateEmployeeBase(database,payload.defaultBaseLocationId),payload.defaultAreaId===undefined?before.default_area_id:idOrNull(payload.defaultAreaId),detailStatus==='active'&&(payload.isActive===undefined?before.is_active:Number(Boolean(payload.isActive)))?1:0,id)
  const after=database.prepare('SELECT * FROM employees WHERE id=?').get(id);auditEmployeeChanges(database,id,before,after,terminal&&!Object.hasOwn(payload,'employmentEndDate')?{...payload,employmentEndDate:effectiveEndDate}:payload,actor)
  const roleChanged=primaryRole!==normalizeJobRole(before.job_role)||Boolean(payload.additionalRoles);if(roleChanged)replaceEmployeeRoles(database,id,primaryRole,payload.additionalRoles??oldRoles.filter(role=>role!==primaryRole),actor,payload.reason,oldRoles);replaceEmployeeFamiliarAreas(database,id,payload.usualAreaIds,actor)
  const period=database.prepare('SELECT * FROM employee_employment_history WHERE employee_id=? ORDER BY id DESC LIMIT 1').get(id);if(period)database.prepare(`UPDATE employee_employment_history SET end_date=?,last_working_day=?,employment_status=?,employment_type=?,primary_job_role=?,secondary_job_roles=?,resignation_or_termination_reason=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(after.employment_end_date,after.last_working_day,detailStatus,type,primaryRole,(payload.additionalRoles??oldRoles.filter(role=>role!==primaryRole)).join('|')||null,after.resignation_termination_reason,actor,period.id)
  if(['inactive','resigned','terminated','suspended'].includes(detailStatus)){database.prepare('UPDATE auth_accounts SET is_active=0,disabled_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE employee_id=?').run(id);database.prepare('UPDATE auth_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE account_id IN(SELECT id FROM auth_accounts WHERE employee_id=?) AND revoked_at IS NULL').run(id)}
  if (roleChanged||detailStatus!=='active'||payload.isActive===false) {
    const dates = database.prepare(`SELECT DISTINCT dd.dispatch_date FROM dispatch_days dd
      LEFT JOIN dispatch_trips dt ON dt.dispatch_day_id=dd.id LEFT JOIN dispatches d ON d.id=dt.dispatch_id
      LEFT JOIN dispatch_vehicle_assistants dva ON dva.dispatch_day_id=dd.id
      WHERE (d.driver_id=? OR d.assistant_id=? OR dva.employee_id=?) AND dd.dispatch_date>=date('now','localtime')`).all(id, id, id)
    for (const item of dates) invalidateDispatchDay(database, item.dispatch_date, 'employee_unavailable', 'employee', id, before, payload, payload.changedBy)
  }
  const updated=employeeRows(database).find((item) => item.id === Number(id));database.exec('RELEASE employee_update')
  return updated
  }catch(error){database.exec('ROLLBACK TO employee_update; RELEASE employee_update');throw error}
}

export function getNextEmployeeCode(database=defaultDb){return{employeeCode:nextEmployeeCode(database)}}

export function rehireEmployee(id,payload,database=defaultDb){const before=database.prepare('SELECT * FROM employees WHERE id=?').get(id);if(!before)throw new Error('Employee not found');if(!text(payload.reason))throw new Error('Rehire reason is required');const actor=text(payload.changedBy)||'Admin',primaryRole=normalizeJobRole(payload.jobRole??before.job_role),type=normalizeEmploymentType(payload.employmentType??before.employment_type),roles=payload.additionalRoles||[];database.exec('SAVEPOINT employee_rehire');try{database.prepare(`UPDATE employees SET job_role=?,employment_status='active',employment_detail_status='active',employment_type=?,employment_start_date=?,employment_end_date=NULL,last_working_day=NULL,resignation_termination_reason=NULL,default_base_location_id=?,is_active=1,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(primaryRole,type,payload.employmentStartDate||new Date().toISOString().slice(0,10),payload.defaultBaseLocationId===undefined?before.default_base_location_id:idOrNull(payload.defaultBaseLocationId),id);replaceEmployeeRoles(database,id,primaryRole,roles,actor,payload.reason,database.prepare('SELECT role FROM employee_job_roles WHERE employee_id=?').all(id).map(row=>row.role));replaceEmployeeFamiliarAreas(database,id,payload.usualAreaIds,actor);database.prepare(`INSERT INTO employee_employment_history(employee_id,start_date,employment_status,employment_type,primary_job_role,secondary_job_roles,rehire_flag,created_by) VALUES(?,?,'active',?,?,?,?,?)`).run(id,payload.employmentStartDate||new Date().toISOString().slice(0,10),type,primaryRole,roles.join('|')||null,1,actor);database.prepare(`INSERT INTO employee_change_history(employee_id,field_name,old_value,new_value,reason,changed_by) VALUES(?, 'rehire',?,?,?,?)`).run(id,before.employment_detail_status,'active',text(payload.reason),actor);if(payload.reactivateAccount)database.prepare('UPDATE auth_accounts SET is_active=1,disabled_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE employee_id=?').run(id);database.exec('RELEASE employee_rehire');return employeeRows(database).find(item=>item.id===Number(id))}catch(error){database.exec('ROLLBACK TO employee_rehire; RELEASE employee_rehire');throw error}}

export function createLocation(payload, database = defaultDb) {
  if (!text(payload.name)) throw new Error('Location Name is required')
  const result = database.prepare(`INSERT INTO operational_locations(name,location_type,address,latitude,longitude,can_start,can_end,is_active) VALUES(?,?,?,?,?,?,?,?)`).run(text(payload.name), payload.locationType || 'other', text(payload.address) || null, payload.latitude ?? null, payload.longitude ?? null, payload.canStart ? 1 : 0, payload.canEnd ? 1 : 0, payload.isActive === false ? 0 : 1)
  return database.prepare('SELECT * FROM operational_locations WHERE id=?').get(result.lastInsertRowid)
}

export function updateLocation(id, payload, database = defaultDb) {
  const before = database.prepare('SELECT * FROM operational_locations WHERE id=?').get(id)
  if (!before) throw new Error('Location not found')
  database.prepare(`UPDATE operational_locations SET name=?,location_type=?,address=?,latitude=?,longitude=?,can_start=?,can_end=?,is_active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(text(payload.name ?? before.name), payload.locationType ?? before.location_type, payload.address === undefined ? before.address : text(payload.address) || null, payload.latitude === undefined ? before.latitude : payload.latitude, payload.longitude === undefined ? before.longitude : payload.longitude, payload.canStart === undefined ? before.can_start : Number(Boolean(payload.canStart)), payload.canEnd === undefined ? before.can_end : Number(Boolean(payload.canEnd)), payload.isActive === undefined ? before.is_active : Number(Boolean(payload.isActive)), id)
  return database.prepare('SELECT * FROM operational_locations WHERE id=?').get(id)
}
