import { db as defaultDb } from './database.mjs'
import { invalidateDispatchDay } from './dispatchService.mjs'

const text=(value)=>String(value??'').trim()

export function listResources(database=defaultDb){
  return {
    vehicles:database.prepare(`SELECT id,vehicle_code vehicleCode,registration_number registrationNumber,capacity_kg capacityKg,status,is_temporary isTemporary,temporary_date temporaryDate FROM vehicles ORDER BY is_temporary,vehicle_code`).all(),
    employees:database.prepare(`SELECT id,employee_code employeeCode,name,phone,job_role jobRole,is_active isActive FROM employees ORDER BY name`).all(),
    locations:database.prepare(`SELECT id,name,location_type locationType,address,latitude,longitude,can_start canStart,can_end canEnd,is_active isActive FROM operational_locations ORDER BY name`).all()
  }
}

export function createVehicle(payload,database=defaultDb){
  if(!text(payload.vehicleCode))throw new Error('Vehicle Code is required')
  const result=database.prepare(`INSERT INTO vehicles(vehicle_code,registration_number,capacity_kg,status,is_temporary,temporary_date) VALUES(?,?,?,?,?,?)`).run(text(payload.vehicleCode),text(payload.registrationNumber)||null,payload.capacityKg??null,payload.status||'available',payload.isTemporary?1:0,payload.temporaryDate||null)
  return database.prepare('SELECT * FROM vehicles WHERE id=?').get(result.lastInsertRowid)
}
export function createTemporaryVehicle(payload,database=defaultDb){
  if(!payload.date)throw new Error('Temporary vehicle date is required')
  const count=database.prepare('SELECT COUNT(*) count FROM vehicles WHERE is_temporary=1 AND temporary_date=?').get(payload.date).count+1
  return createVehicle({vehicleCode:payload.vehicleCode||`Temporary Lorry ${count} (${payload.date})`,status:'assigned',isTemporary:true,temporaryDate:payload.date},database)
}
export function updateVehicle(id,payload,database=defaultDb){
  const before=database.prepare('SELECT * FROM vehicles WHERE id=?').get(id);if(!before)throw new Error('Vehicle not found')
  database.prepare(`UPDATE vehicles SET vehicle_code=?,registration_number=?,capacity_kg=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(text(payload.vehicleCode??before.vehicle_code),payload.registrationNumber===undefined?before.registration_number:text(payload.registrationNumber)||null,payload.capacityKg===undefined?before.capacity_kg:payload.capacityKg,payload.status??before.status,id)
  if(payload.status&&payload.status!==before.status){const dates=database.prepare(`SELECT DISTINCT dd.dispatch_date FROM dispatch_days dd JOIN dispatch_trips dt ON dt.dispatch_day_id=dd.id JOIN dispatches d ON d.id=dt.dispatch_id WHERE d.vehicle_id=? AND dd.dispatch_date>=date('now','localtime')`).all(id);for(const item of dates)invalidateDispatchDay(database,item.dispatch_date,'vehicle_status_changed','vehicle',id,before,payload,payload.changedBy)}
  return database.prepare('SELECT * FROM vehicles WHERE id=?').get(id)
}

export function createEmployee(payload,database=defaultDb){if(!text(payload.name))throw new Error('Employee Name is required');const result=database.prepare(`INSERT INTO employees(employee_code,name,phone,job_role,is_active) VALUES(?,?,?,?,?)`).run(text(payload.employeeCode)||null,text(payload.name),text(payload.phone)||null,payload.jobRole||'driver',payload.isActive===false?0:1);return database.prepare('SELECT * FROM employees WHERE id=?').get(result.lastInsertRowid)}
export function updateEmployee(id,payload,database=defaultDb){const before=database.prepare('SELECT * FROM employees WHERE id=?').get(id);if(!before)throw new Error('Employee not found');database.prepare(`UPDATE employees SET employee_code=?,name=?,phone=?,job_role=?,is_active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(payload.employeeCode===undefined?before.employee_code:text(payload.employeeCode)||null,text(payload.name??before.name),payload.phone===undefined?before.phone:text(payload.phone)||null,payload.jobRole??before.job_role,payload.isActive===undefined?before.is_active:Number(Boolean(payload.isActive)),id);if(payload.isActive===false){const dates=database.prepare(`SELECT DISTINCT dd.dispatch_date FROM dispatch_days dd JOIN dispatch_trips dt ON dt.dispatch_day_id=dd.id JOIN dispatches d ON d.id=dt.dispatch_id WHERE (d.driver_id=? OR d.assistant_id=?) AND dd.dispatch_date>=date('now','localtime')`).all(id,id);for(const item of dates)invalidateDispatchDay(database,item.dispatch_date,'employee_unavailable','employee',id,before,payload,payload.changedBy)}return database.prepare('SELECT * FROM employees WHERE id=?').get(id)}

export function createLocation(payload,database=defaultDb){if(!text(payload.name))throw new Error('Location Name is required');const result=database.prepare(`INSERT INTO operational_locations(name,location_type,address,latitude,longitude,can_start,can_end,is_active) VALUES(?,?,?,?,?,?,?,?)`).run(text(payload.name),payload.locationType||'other',text(payload.address)||null,payload.latitude??null,payload.longitude??null,payload.canStart?1:0,payload.canEnd?1:0,payload.isActive===false?0:1);return database.prepare('SELECT * FROM operational_locations WHERE id=?').get(result.lastInsertRowid)}
export function updateLocation(id,payload,database=defaultDb){const before=database.prepare('SELECT * FROM operational_locations WHERE id=?').get(id);if(!before)throw new Error('Location not found');database.prepare(`UPDATE operational_locations SET name=?,location_type=?,address=?,latitude=?,longitude=?,can_start=?,can_end=?,is_active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(text(payload.name??before.name),payload.locationType??before.location_type,payload.address===undefined?before.address:text(payload.address)||null,payload.latitude===undefined?before.latitude:payload.latitude,payload.longitude===undefined?before.longitude:payload.longitude,payload.canStart===undefined?before.can_start:Number(Boolean(payload.canStart)),payload.canEnd===undefined?before.can_end:Number(Boolean(payload.canEnd)),payload.isActive===undefined?before.is_active:Number(Boolean(payload.isActive)),id);return database.prepare('SELECT * FROM operational_locations WHERE id=?').get(id)}
