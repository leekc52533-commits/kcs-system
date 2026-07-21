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

function vehicleRows(database) {
  return database.prepare(`SELECT v.id,v.vehicle_code vehicleCode,v.vehicle_name vehicleName,v.registration_number registrationNumber,
    v.capacity_kg capacityKg,v.status,v.is_temporary isTemporary,v.temporary_date temporaryDate,
    v.default_base_location_id defaultBaseLocationId,base.name defaultBase,
    GROUP_CONCAT(a.id) preferredAreaIds,GROUP_CONCAT(a.name,'|') preferredAreaNames
    FROM vehicles v LEFT JOIN operational_locations base ON base.id=v.default_base_location_id
    LEFT JOIN vehicle_preferred_areas vpa ON vpa.vehicle_id=v.id LEFT JOIN areas a ON a.id=vpa.area_id
    GROUP BY v.id ORDER BY v.is_temporary,v.vehicle_code`).all().map((item) => ({
      ...item,
      preferredAreaIds: item.preferredAreaIds ? item.preferredAreaIds.split(',').map(Number) : [],
      preferredAreas: item.preferredAreaNames ? item.preferredAreaNames.split('|') : []
    }))
}

function employeeRows(database) {
  return database.prepare(`SELECT e.id,e.employee_code employeeCode,e.name,e.phone,e.job_role jobRole,e.is_active isActive,
    e.employment_status employmentStatus,e.default_base_location_id defaultBaseLocationId,base.name defaultBase,
    e.default_area_id defaultAreaId,a.name defaultArea
    FROM employees e LEFT JOIN operational_locations base ON base.id=e.default_base_location_id
    LEFT JOIN areas a ON a.id=e.default_area_id ORDER BY e.name`).all()
}

export function listResources(database = defaultDb) {
  return {
    vehicles: vehicleRows(database),
    employees: employeeRows(database),
    locations: database.prepare(`SELECT id,name,location_type locationType,address,latitude,longitude,can_start canStart,can_end canEnd,is_active isActive FROM operational_locations ORDER BY name`).all(),
    areas: database.prepare('SELECT id,name,is_active isActive FROM areas ORDER BY name').all()
  }
}

export function createVehicle(payload, database = defaultDb) {
  if (!text(payload.vehicleCode)) throw new Error('Vehicle Number is required')
  database.exec('BEGIN IMMEDIATE')
  try {
    const result = database.prepare(`INSERT INTO vehicles(vehicle_code,vehicle_name,registration_number,capacity_kg,default_base_location_id,status,is_temporary,temporary_date)
      VALUES(?,?,?,?,?,?,?,?)`).run(text(payload.vehicleCode), text(payload.vehicleName) || null, text(payload.registrationNumber) || null, payload.capacityKg ?? null, idOrNull(payload.defaultBaseLocationId), payload.status || 'available', payload.isTemporary ? 1 : 0, payload.temporaryDate || null)
    replacePreferredAreas(database, result.lastInsertRowid, payload.preferredAreaIds || [])
    database.exec('COMMIT')
    return vehicleRows(database).find((item) => item.id === Number(result.lastInsertRowid))
  } catch (error) { database.exec('ROLLBACK'); throw error }
}

export function createTemporaryVehicle(payload, database = defaultDb) {
  if (!payload.date) throw new Error('Temporary vehicle date is required')
  const count = database.prepare('SELECT COUNT(*) count FROM vehicles WHERE is_temporary=1 AND temporary_date=?').get(payload.date).count + 1
  return createVehicle({ vehicleCode: payload.vehicleCode || `Temporary Lorry ${count} (${payload.date})`, vehicleName: payload.vehicleName || '临时车辆', status: 'assigned', isTemporary: true, temporaryDate: payload.date }, database)
}

export function updateVehicle(id, payload, database = defaultDb) {
  const before = database.prepare('SELECT * FROM vehicles WHERE id=?').get(id)
  if (!before) throw new Error('Vehicle not found')
  database.exec('BEGIN IMMEDIATE')
  try {
    database.prepare(`UPDATE vehicles SET vehicle_code=?,vehicle_name=?,registration_number=?,capacity_kg=?,default_base_location_id=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(
      text(payload.vehicleCode ?? before.vehicle_code), payload.vehicleName === undefined ? before.vehicle_name : text(payload.vehicleName) || null,
      payload.registrationNumber === undefined ? before.registration_number : text(payload.registrationNumber) || null,
      payload.capacityKg === undefined ? before.capacity_kg : payload.capacityKg, payload.defaultBaseLocationId === undefined ? before.default_base_location_id : idOrNull(payload.defaultBaseLocationId), payload.status ?? before.status, id)
    replacePreferredAreas(database, id, payload.preferredAreaIds)
    if (payload.status && payload.status !== before.status) {
      const dates = database.prepare(`SELECT DISTINCT dd.dispatch_date FROM dispatch_days dd JOIN dispatch_trips dt ON dt.dispatch_day_id=dd.id JOIN dispatches d ON d.id=dt.dispatch_id WHERE d.vehicle_id=? AND dd.dispatch_date>=date('now','localtime')`).all(id)
      for (const item of dates) invalidateDispatchDay(database, item.dispatch_date, 'vehicle_status_changed', 'vehicle', id, before, payload, payload.changedBy)
    }
    database.exec('COMMIT')
    return vehicleRows(database).find((item) => item.id === Number(id))
  } catch (error) { database.exec('ROLLBACK'); throw error }
}

export function createEmployee(payload, database = defaultDb) {
  if (!text(payload.name)) throw new Error('Employee Name is required')
  const result = database.prepare(`INSERT INTO employees(employee_code,name,phone,job_role,employment_status,default_base_location_id,default_area_id,is_active) VALUES(?,?,?,?,?,?,?,?)`).run(
    text(payload.employeeCode) || null, text(payload.name), text(payload.phone) || null, payload.jobRole || 'driver', payload.employmentStatus || 'active', idOrNull(payload.defaultBaseLocationId), idOrNull(payload.defaultAreaId), payload.isActive === false ? 0 : 1)
  return employeeRows(database).find((item) => item.id === Number(result.lastInsertRowid))
}

export function updateEmployee(id, payload, database = defaultDb) {
  const before = database.prepare('SELECT * FROM employees WHERE id=?').get(id)
  if (!before) throw new Error('Employee not found')
  database.prepare(`UPDATE employees SET employee_code=?,name=?,phone=?,job_role=?,employment_status=?,default_base_location_id=?,default_area_id=?,is_active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(
    payload.employeeCode === undefined ? before.employee_code : text(payload.employeeCode) || null, text(payload.name ?? before.name), payload.phone === undefined ? before.phone : text(payload.phone) || null,
    payload.jobRole ?? before.job_role, payload.employmentStatus ?? before.employment_status, payload.defaultBaseLocationId === undefined ? before.default_base_location_id : idOrNull(payload.defaultBaseLocationId),
    payload.defaultAreaId === undefined ? before.default_area_id : idOrNull(payload.defaultAreaId), payload.isActive === undefined ? before.is_active : Number(Boolean(payload.isActive)), id)
  if (payload.isActive === false || (payload.employmentStatus && payload.employmentStatus !== 'active')) {
    const dates = database.prepare(`SELECT DISTINCT dd.dispatch_date FROM dispatch_days dd
      LEFT JOIN dispatch_trips dt ON dt.dispatch_day_id=dd.id LEFT JOIN dispatches d ON d.id=dt.dispatch_id
      LEFT JOIN dispatch_vehicle_assistants dva ON dva.dispatch_day_id=dd.id
      WHERE (d.driver_id=? OR d.assistant_id=? OR dva.employee_id=?) AND dd.dispatch_date>=date('now','localtime')`).all(id, id, id)
    for (const item of dates) invalidateDispatchDay(database, item.dispatch_date, 'employee_unavailable', 'employee', id, before, payload, payload.changedBy)
  }
  return employeeRows(database).find((item) => item.id === Number(id))
}

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
