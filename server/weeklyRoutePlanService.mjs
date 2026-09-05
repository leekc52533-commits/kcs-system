import {KCS_WEEKLY_ROUTE_PLAN_V49} from './weeklyRoutePlanV49Data.mjs'

const clean=value=>String(value??'').trim()
export const normalizePlate=value=>clean(value).toUpperCase().replace(/[^A-Z0-9]/g,'')
const normalizeBranch=value=>clean(value).toUpperCase().replace(/\s+/g,'')

export function validateWeeklyRoutePlan(plan){
  if(!plan||!clean(plan.name)||!clean(plan.sourceName)||!Array.isArray(plan.entries)||!plan.entries.length)throw new Error('Weekly route plan is incomplete')
  const branchDays=new Set(),positions=new Set(),plates=new Set(),branches=new Set()
  const entries=plan.entries.map((raw,index)=>{
    if(!Array.isArray(raw)||raw.length<7)throw new Error(`Weekly route row ${index+1} is incomplete`)
    const [weekday,plate,trip,sequence,branchCode,zoneName,areaName]=raw
    const item={weekday:Number(weekday),plate:normalizePlate(plate),trip:Number(trip),sequence:Number(sequence),branchCode:normalizeBranch(branchCode),zoneName:clean(zoneName),areaName:clean(areaName)}
    if(!Number.isInteger(item.weekday)||item.weekday<0||item.weekday>6)throw new Error(`Invalid weekday at route row ${index+1}`)
    if(!item.plate)throw new Error(`Missing vehicle plate at route row ${index+1}`)
    if(!Number.isInteger(item.trip)||item.trip<1||item.trip>3)throw new Error(`Invalid Trip at route row ${index+1}`)
    if(!Number.isInteger(item.sequence)||item.sequence<1)throw new Error(`Invalid sequence at route row ${index+1}`)
    if(!item.branchCode)throw new Error(`Missing Branch ID at route row ${index+1}`)
    const branchKey=`${item.weekday}:${item.branchCode}`,positionKey=`${item.weekday}:${item.plate}:${item.trip}:${item.sequence}`
    if(branchDays.has(branchKey))throw new Error(`Duplicate Branch ${item.branchCode} on weekday ${item.weekday}`)
    if(positions.has(positionKey))throw new Error(`Duplicate route position ${positionKey}`)
    branchDays.add(branchKey);positions.add(positionKey);plates.add(item.plate);branches.add(item.branchCode)
    return item
  })
  return{...plan,name:clean(plan.name),sourceName:clean(plan.sourceName),sourceStartDate:clean(plan.sourceStartDate)||null,entries,entryCount:entries.length,branchCount:branches.size,vehiclePlates:[...plates].sort()}
}

function branchMap(database){
  const map=new Map()
  for(const row of database.prepare('SELECT id,jodoo_branch_id FROM branches').all()){
    const key=normalizeBranch(row.jodoo_branch_id)
    map.set(key,row.id)
    if(/^B\d+$/.test(key))map.set(key.slice(1),row.id)
    else if(/^\d+$/.test(key))map.set(`B${key}`,row.id)
  }
  return map
}

function availablePlates(database){
  const result=new Set()
  for(const vehicle of database.prepare("SELECT vehicle_code,registration_number FROM vehicles WHERE is_temporary=0 AND operational_status IN ('available','active') AND status IN ('available','assigned')").all()){
    result.add(normalizePlate(vehicle.registration_number||vehicle.vehicle_code))
  }
  return result
}

export function installWeeklyRoutePlan(plan=KCS_WEEKLY_ROUTE_PLAN_V49,{changedBy='Owner Admin'}={},database){
  if(!database)throw new Error('Database is required')
  const checked=validateWeeklyRoutePlan(plan),branches=branchMap(database),missingBranches=[]
  const resolved=checked.entries.map(item=>{const branchId=branches.get(item.branchCode);if(!branchId)missingBranches.push(item.branchCode);return{...item,branchId}})
  if(missingBranches.length)throw new Error(`Route plan Branch IDs not found: ${[...new Set(missingBranches)].slice(0,20).join(', ')}`)
  const existing=database.prepare('SELECT id FROM weekly_route_plans WHERE is_active=1 AND name=? AND source_name=?').get(checked.name,checked.sourceName)
  if(existing&&database.prepare('SELECT COUNT(*) n FROM weekly_route_plan_stops WHERE plan_id=?').get(existing.id).n===resolved.length){
    const present=availablePlates(database),pendingVehiclePlates=checked.vehiclePlates.filter(plate=>!present.has(plate))
    return{planId:existing.id,noOp:true,entryCount:resolved.length,branchCount:checked.branchCount,vehiclePlates:checked.vehiclePlates,pendingVehiclePlates}
  }
  database.exec('BEGIN IMMEDIATE')
  try{
    database.prepare('UPDATE weekly_route_plans SET is_active=0,updated_at=CURRENT_TIMESTAMP WHERE is_active=1').run()
    const created=database.prepare('INSERT INTO weekly_route_plans(name,source_name,source_start_date,created_by) VALUES(?,?,?,?)').run(checked.name,checked.sourceName,checked.sourceStartDate,clean(changedBy)||'Owner Admin')
    const planId=Number(created.lastInsertRowid),insert=database.prepare('INSERT INTO weekly_route_plan_stops(plan_id,weekday,branch_id,vehicle_registration_number,trip_number,stop_sequence,zone_name_snapshot,area_name_snapshot) VALUES(?,?,?,?,?,?,?,?)')
    for(const item of resolved)insert.run(planId,item.weekday,item.branchId,item.plate,item.trip,item.sequence,item.zoneName,item.areaName)
    database.prepare("INSERT INTO master_change_history(entity_type,entity_id,change_type,new_value,after_json,reason,changed_by) VALUES('weekly_route_plan',?,'INSTALL',?,?,?,?)").run(String(planId),checked.name,JSON.stringify({sourceName:checked.sourceName,entryCount:resolved.length,branchCount:checked.branchCount,vehiclePlates:checked.vehiclePlates}),'Approved Excel route plan',clean(changedBy)||'Owner Admin')
    if(database.prepare('PRAGMA foreign_key_check').get())throw new Error('Foreign-key validation failed after installing route plan')
    database.exec('COMMIT')
    const present=availablePlates(database),pendingVehiclePlates=checked.vehiclePlates.filter(plate=>!present.has(plate))
    return{planId,noOp:false,entryCount:resolved.length,branchCount:checked.branchCount,vehiclePlates:checked.vehiclePlates,pendingVehiclePlates}
  }catch(error){database.exec('ROLLBACK');throw error}
}
