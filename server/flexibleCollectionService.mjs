import {readMenu} from './menuLayoutService.mjs'
import {canManageDispatch} from '../shared/dispatchAccess.js'
import {withImmediateTransaction} from './branchServiceDateGuard.mjs'
import {kuchingDate} from '../shared/kuchingTime.js'
import {branchCollectionOpen} from './flexibleCollectionPolicy.mjs'
import {collectExistingCustomer} from './existingCustomerPickupService.mjs'
const fail=(code,statusCode=409)=>{throw Object.assign(Error(code),{code,statusCode})}
function manager(ctx){if(!canManageDispatch(ctx))fail('INTAKE_PERMISSION',403)}
export function collectionAccess(db,ctx){manager(ctx);return {canEdit:readMenu(db,ctx).canEdit,items:[1,2,3,4,5].map(id=>({id,active:1,name:db.prepare('SELECT d.display_name name FROM weekly_route_definitions d JOIN weekly_route_plans p ON p.id=d.plan_id WHERE p.is_active=1 AND d.route_number=?').get(id)?.name||`Route ${id}`,...(db.prepare('SELECT is_open isOpen,revision,changed_at changedAt FROM route_collection_access WHERE route_number=?').get(id)||{isOpen:0,revision:0})}))}}
export function setCollectionAccess(db,ctx,id,payload){return withImmediateTransaction(db,()=>{
 if(!readMenu(db,ctx).canEdit)fail('MENU_OWNER_ONLY',403)
 if(typeof payload.isOpen!=='boolean'||!Number.isInteger(payload.revision)||![1,2,3,4,5].includes(Number(id)))fail('INVALID_STATUS',400)
 const x=db.prepare('SELECT * FROM route_collection_access WHERE route_number=?').get(Number(id))
 if((x?.revision||0)!==payload.revision)fail('MENU_STALE')
 db.prepare(`INSERT INTO route_collection_access(route_number,is_open,revision,changed_by) VALUES(?,?,1,?) ON CONFLICT(route_number) DO UPDATE SET is_open=excluded.is_open,revision=revision+1,changed_by=excluded.changed_by,changed_at=CURRENT_TIMESTAMP`).run(Number(id),Number(payload.isOpen),ctx.id)
 db.prepare('INSERT INTO route_collection_access_events(route_number,is_open,account_id,reason) VALUES(?,?,?,?)').run(Number(id),Number(payload.isOpen),ctx.id,'Owner route switch')
 return {ok:true}
})}
export function collectionDispatchOptions(db,ctx,zoneId){manager(ctx);const date=ctx.today||kuchingDate();return {serviceDate:date,
 branches:db.prepare(`SELECT b.id,b.jodoo_branch_id branchCode,b.branch_name name,c.name company,s.dispatch_trip_id tripId FROM branches b JOIN customers c ON c.id=b.customer_id JOIN dispatch_stops s ON s.branch_id=b.id JOIN dispatch_trips t ON t.id=s.dispatch_trip_id JOIN dispatch_days dd ON dd.id=t.dispatch_day_id WHERE b.is_active=1 AND b.status='active' AND b.lifecycle_status='ACTIVE' AND c.is_active=1 AND dd.dispatch_date=? AND s.route_number=? AND s.status IN ('locked','available') AND s.arrived_at IS NULL AND s.completed_at IS NULL AND t.completed_at IS NULL ORDER BY c.name,b.branch_name`).all(date,Number(zoneId)).filter(b=>branchCollectionOpen(db,b.id,date)),
 trips:db.prepare(`SELECT t.id,t.trip_number tripNumber,d.driver_id driverId,e.name driverName,v.registration_number plate FROM dispatch_trips t JOIN dispatches d ON d.id=t.dispatch_id JOIN dispatch_days dd ON dd.id=t.dispatch_day_id JOIN employees e ON e.id=d.driver_id JOIN vehicles v ON v.id=d.vehicle_id WHERE dd.dispatch_date=? AND dd.status='in_progress' AND t.execution_status='in_progress' AND t.completed_at IS NULL AND e.is_active=1 AND e.employment_status='active' AND v.operational_status IN ('active','available') AND v.status IN ('available','assigned') ORDER BY v.registration_number,t.trip_number`).all(date)
}}
export function dispatchOpenCollection(db,ctx,payload){manager(ctx);return withImmediateTransaction(db,()=>{
 if(payload.serviceDate&&payload.serviceDate!==(ctx.today||kuchingDate()))fail('PICKUP_STALE')
 if(!branchCollectionOpen(db,payload.branchId,ctx.today||kuchingDate()))fail('FLEX_CLOSED')
 const options=collectionDispatchOptions(db,ctx,payload.routeNumber);if(!options.branches.some(b=>b.id===Number(payload.branchId)))fail('FLEX_CLOSED');const t=options.trips.find(t=>t.id===Number(payload.tripId));if(!t)fail('INTAKE_TRIP')
 // Only this trusted server path may attribute a supervisor push to a target driver.
 return collectExistingCustomer({...payload,reason:payload.reason||'Supervisor dispatch'},{employeeId:t.driverId,role:'driver',today:ctx.today||kuchingDate()},db,{actor:ctx.employeeName||String(ctx.id),supervisor:true})
})}
