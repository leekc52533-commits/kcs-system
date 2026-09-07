import {db as defaultDb} from './database.mjs'
import {kuchingDate} from '../shared/kuchingTime.js'
import {withImmediateTransaction} from './branchServiceDateGuard.mjs'
import {activeRouteDriver} from './routeDriverAuthorization.mjs'

const fail=(message,code='ACTING_DRIVER_INVALID',statusCode=409)=>Object.assign(new Error(message),{code,statusCode})
const managementRoles=new Set(['supervisor','operations_admin','owner_admin'])
const assertSupervisor=(database,context)=>{
  if(!managementRoles.has(String(context.role||'').toLowerCase()))throw fail('Supervisor permission is required.','PERMISSION_DENIED',403)
  const employee=activeRouteDriver(database,context.employeeId,context.role)
  if(!employee)throw fail('Your employee account is not active.','PERMISSION_DENIED',403)
  return employee
}

export function actingCollectorOptions(context={},database=defaultDb){
  const employee=assertSupervisor(database,context),date=kuchingDate(context.date||new Date()),day=database.prepare('SELECT id,status FROM dispatch_days WHERE dispatch_date=?').get(date)
  if(!day)return{date,status:null,employee,vehicles:[]}
  const vehicles=database.prepare(`SELECT DISTINCT v.id vehicleId,v.registration_number registrationNumber,v.vehicle_code vehicleCode,
      d.driver_id driverId,e.name driverName
    FROM dispatch_trips dt JOIN dispatches d ON d.id=dt.dispatch_id JOIN vehicles v ON v.id=d.vehicle_id LEFT JOIN employees e ON e.id=d.driver_id
    WHERE dt.dispatch_day_id=? AND EXISTS(SELECT 1 FROM dispatch_stops ds WHERE ds.dispatch_trip_id=dt.id AND ds.status<>'cancelled')
    ORDER BY v.vehicle_code,v.id`).all(day.id).map(vehicle=>{
      const stops=database.prepare(`SELECT ds.id,ds.route_number routeNumber,ds.stop_sequence stopSequence,b.jodoo_branch_id branchId,b.branch_name branchName,c.name customerName
        FROM dispatch_stops ds JOIN dispatch_trips dt ON dt.id=ds.dispatch_trip_id JOIN dispatches d ON d.id=dt.dispatch_id JOIN branches b ON b.id=ds.branch_id LEFT JOIN customers c ON c.id=b.customer_id
        WHERE dt.dispatch_day_id=? AND d.vehicle_id=? AND ds.status<>'cancelled' ORDER BY COALESCE(ds.route_number,99),ds.stop_sequence,ds.id`).all(day.id,vehicle.vehicleId)
      const approved=new Set(database.prepare(`SELECT DISTINCT a.route_number routeNumber FROM daily_route_approvals a
        WHERE a.dispatch_day_id=?`).all(day.id).map(row=>Number(row.routeNumber)))
      const routeNumbers=[...new Set(stops.map(stop=>Number(stop.routeNumber)).filter(Boolean))]
      return{...vehicle,totalStops:stops.length,routeNumbers,approved:routeNumbers.length>0&&routeNumbers.every(number=>approved.has(number)),assignedToMe:Number(vehicle.driverId)===Number(employee.id),stops}
    })
  return{date,status:day.status,employee,vehicles}
}

export function claimActingCollectorVehicle(vehicleId,context={},database=defaultDb){
  const employee=assertSupervisor(database,context),date=kuchingDate(context.date||new Date()),day=database.prepare('SELECT id,status FROM dispatch_days WHERE dispatch_date=?').get(date)
  if(!day)throw fail('Today’s dispatch has not been created.','NOT_FOUND',404)
  const vehicle=database.prepare(`SELECT v.id,v.registration_number registrationNumber FROM vehicles v WHERE v.id=? AND EXISTS(
    SELECT 1 FROM dispatch_trips dt JOIN dispatches d ON d.id=dt.dispatch_id JOIN dispatch_stops ds ON ds.dispatch_trip_id=dt.id
    WHERE dt.dispatch_day_id=? AND d.vehicle_id=v.id AND ds.status<>'cancelled')`).get(Number(vehicleId),day.id)
  if(!vehicle)throw fail('This vehicle has no route today.','NOT_FOUND',404)
  const running=database.prepare(`SELECT 1 FROM dispatch_trips dt JOIN dispatches d ON d.id=dt.dispatch_id WHERE dt.dispatch_day_id=? AND d.vehicle_id=? AND dt.execution_status='in_progress' LIMIT 1`).get(day.id,vehicle.id)
  if(running)throw fail('This vehicle has already started and cannot change driver.','TRIP_ALREADY_STARTED',409)
  return withImmediateTransaction(database,()=>{
    const previous=database.prepare(`SELECT d.driver_id driverId,e.name driverName FROM dispatch_trips dt JOIN dispatches d ON d.id=dt.dispatch_id LEFT JOIN employees e ON e.id=d.driver_id WHERE dt.dispatch_day_id=? AND d.vehicle_id=? LIMIT 1`).get(day.id,vehicle.id)||{}
    const period=database.prepare('SELECT id FROM employee_employment_history WHERE employee_id=? ORDER BY id DESC LIMIT 1').get(employee.id)?.id||null
    database.prepare(`UPDATE dispatches SET driver_id=?,driver_employment_period_id=?,updated_at=CURRENT_TIMESTAMP
      WHERE vehicle_id=? AND id IN(SELECT dispatch_id FROM dispatch_trips WHERE dispatch_day_id=?)`).run(employee.id,period,vehicle.id,day.id)
    database.prepare(`INSERT INTO dispatch_change_logs(dispatch_day_id,actor,change_type,entity_type,entity_id,before_json,after_json,requires_reapproval)
      VALUES(?,?,'supervisor_acting_driver','vehicle',?,?,?,0)`).run(day.id,context.employeeName||employee.name,String(vehicle.id),JSON.stringify(previous),JSON.stringify({driverId:employee.id,driverName:employee.name,date,temporary:true}))
    return{ok:true,date,vehicleId:vehicle.id,registrationNumber:vehicle.registrationNumber,driverId:employee.id,driverName:employee.name,temporary:true}
  })
}
