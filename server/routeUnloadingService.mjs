import {db as defaultDb} from './database.mjs'

export const unloadingCode=(record)=>`UL-${record.serviceDate.replaceAll('-','')}-${String(record.id).padStart(6,'0')}`
const parse=value=>{try{return JSON.parse(value||'null')}catch{return null}}

// Route identity is captured at upload, independently of later dispatch edits.
export function captureUnloadingRoute(database,recordId,trip){
  const routes=database.prepare(`SELECT DISTINCT s.route_number FROM dispatch_stops s JOIN dispatch_trips t ON t.id=s.dispatch_trip_id JOIN dispatches d ON d.id=t.dispatch_id WHERE t.dispatch_day_id=? AND d.vehicle_id=? AND s.route_number IS NOT NULL AND s.status<>'cancelled' ORDER BY s.route_number`).all(trip.dayId,trip.vehicleId).map(row=>row.route_number)
  const crew=database.prepare('SELECT e.id,e.name FROM dispatch_vehicle_assistants a JOIN employees e ON e.id=a.employee_id WHERE a.dispatch_day_id=? AND a.vehicle_id=? ORDER BY e.id').all(trip.dayId,trip.vehicleId)
  database.prepare("INSERT INTO dispatch_change_logs(dispatch_day_id,actor,change_type,entity_type,entity_id,after_json,requires_reapproval) VALUES(?,?,'unloading_route_snapshot','unloading_weight',?,?,0)").run(trip.dayId,trip.driverName,String(recordId),JSON.stringify({routes,crew}))
}

export function routeUnloadingRecords(date,routeNumber,database=defaultDb){
  const day=database.prepare('SELECT id FROM dispatch_days WHERE dispatch_date=?').get(date)
  if(!day)return{items:[],handovers:[]}
  const rows=database.prepare(`SELECT w.id,w.service_date serviceDate,w.dispatch_trip_id tripId,w.registration_number_snapshot registrationNumber,w.vehicle_code_snapshot vehicleCode,w.driver_name_snapshot driverName,w.crew_names_snapshot crew,w.unloading_location_name_snapshot locationName,w.weighed_at weighedAt,w.confirmed_weight_kg confirmedWeightKg,w.status,
    (SELECT after_json FROM dispatch_change_logs WHERE change_type='unloading_route_snapshot' AND entity_type='unloading_weight' AND entity_id=CAST(w.id AS TEXT) ORDER BY id LIMIT 1) snapshot
    FROM unloading_weight_records w WHERE w.dispatch_day_id=? ORDER BY w.weighed_at DESC,w.id DESC`).all(day.id)
  const items=rows.flatMap(row=>{
    const snapshot=parse(row.snapshot)
    const routes=snapshot?.routes||database.prepare(`SELECT DISTINCT s.route_number FROM dispatch_stops s JOIN dispatch_trips t ON t.id=s.dispatch_trip_id JOIN dispatches d ON d.id=t.dispatch_id WHERE t.dispatch_day_id=? AND s.route_number IS NOT NULL AND (s.dispatch_trip_id=? OR d.vehicle_id=(SELECT original.vehicle_id FROM dispatches original JOIN dispatch_trips ot ON ot.dispatch_id=original.id WHERE ot.id=?))`).all(day.id,row.tripId,row.tripId).map(s=>s.route_number)
    if(!routes.includes(routeNumber))return[]
    const {snapshot:_ignored,...record}=row
    return[{...record,code:unloadingCode(row),routes,legacyAssociation:!snapshot,crewParticipants:snapshot?.crew||[],photoUrl:`/api/unloading-weights/${row.id}/photo`}]
  })
  const employeeName=id=>database.prepare('SELECT name FROM employees WHERE id=?').get(id)?.name||`Employee #${id}`
  const plate=id=>database.prepare('SELECT registration_number plate FROM vehicles WHERE id=?').get(id)?.plate||`Vehicle #${id}`
  const handovers=database.prepare("SELECT id,actor,created_at occurredAt,before_json,after_json FROM dispatch_change_logs WHERE dispatch_day_id=? AND change_type='route_day_handover' AND entity_type='route' AND entity_id=? ORDER BY id").all(day.id,String(routeNumber)).map(log=>{
    const before=parse(log.before_json)||{},after=parse(log.after_json)||{}
    return{id:log.id,actor:log.actor,occurredAt:log.occurredAt,reason:after.reason,fromVehicle:plate(before.vehicleId),toVehicle:plate(after.vehicleId),fromDrivers:[...new Set((before.trips||[]).map(t=>t.driver_id).filter(Boolean))].map(employeeName),toDriver:after.driverId?employeeName(after.driverId):''}
  })
  return{items,handovers}
}
