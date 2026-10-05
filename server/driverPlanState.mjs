import {createHash} from 'node:crypto'
import {routeSignature} from './routeApprovalState.mjs'
export function driverPlanState(db,tripId){
 const trip=db.prepare(`SELECT t.id,t.trip_number tripNumber,t.execution_status executionStatus,t.dispatch_day_id dayId,
 dd.dispatch_date date,dd.status dayStatus,d.id dispatchId,d.driver_id driverId,e.name driverName,d.assistant_id assistantId,d.vehicle_id vehicleId
 FROM dispatch_trips t JOIN dispatch_days dd ON dd.id=t.dispatch_day_id JOIN dispatches d ON d.id=t.dispatch_id LEFT JOIN employees e ON e.id=d.driver_id WHERE t.id=?`).get(Number(tripId))
 if(!trip)return null
 const stops=db.prepare("SELECT id,branch_id branchId,route_number routeNumber,route_stop_sequence routeSequence,stop_sequence sequence,service_date serviceDate,sequence_locked sequenceLocked FROM dispatch_stops WHERE dispatch_trip_id=? AND status<>'cancelled' ORDER BY stop_sequence,id").all(trip.id)
 const crew=db.prepare('SELECT employee_id FROM dispatch_vehicle_assistants WHERE dispatch_day_id=? AND vehicle_id=? ORDER BY employee_id').all(trip.dayId,trip.vehicleId)
 const {executionStatus,dayStatus,driverName,...identity}=trip
 const signature=createHash('sha256').update(JSON.stringify({identity,stops,crew})).digest('hex')
 const exists=db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='driver_plan_checks'").get()
 const saved=exists?db.prepare('SELECT employee_id employeeId,employee_name employeeName,checked_at checkedAt,plan_signature signature FROM driver_plan_checks WHERE trip_id=?').get(trip.id):null
 const approvals=db.prepare('SELECT route_number n,route_signature s FROM daily_route_approvals WHERE dispatch_day_id=?').all(trip.dayId)
 const approved=(!approvals.length&&['approved','published','in_progress','completed'].includes(dayStatus))||stops.some(s=>approvals.some(a=>a.n===s.routeNumber&&a.s===routeSignature(db,trip.dayId,a.n)))
 return {...trip,stops,signature,approved,editable:stops.length>0&&['draft','reapproval_required'].includes(dayStatus)&&executionStatus==='not_started'&&!approved,checked:Boolean(saved&&saved.signature===signature&&saved.employeeId===trip.driverId),checkedBy:saved?.signature===signature?saved.employeeName:null,checkedAt:saved?.signature===signature?saved.checkedAt:null}
}
export function driverPlanSummary(db,tripId){
 const p=driverPlanState(db,tripId)
 return p?{tripId:p.id,tripNumber:p.tripNumber,driverId:p.driverId,driverName:p.driverName,signature:p.signature,editable:p.editable,checked:p.checked,checkedBy:p.checked?p.checkedBy:null,checkedAt:p.checked?p.checkedAt:null}:null
}
