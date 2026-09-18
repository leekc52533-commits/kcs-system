import {readMenu} from './menuLayoutService.mjs'
import {canManageDispatch} from '../shared/dispatchAccess.js'
import {withImmediateTransaction} from './branchServiceDateGuard.mjs'
import {kuchingDate} from '../shared/kuchingTime.js'
import {branchCollectionOpen} from './flexibleCollectionPolicy.mjs'
import {collectExistingCustomer} from './existingCustomerPickupService.mjs'
const fail=(code,statusCode=409)=>{throw Object.assign(Error(code),{code,statusCode})}
function manager(ctx){if(!canManageDispatch(ctx))fail('INTAKE_PERMISSION',403)}
export function collectionAccess(db,ctx){manager(ctx);return {canEdit:readMenu(db,ctx).canEdit,items:db.prepare(`SELECT z.id,z.name,z.is_active active,COALESCE(x.is_open,0) isOpen,COALESCE(x.revision,0) revision,x.changed_at changedAt FROM zone_groups z LEFT JOIN zone_collection_access x ON x.zone_id=z.id ORDER BY z.sort_order,z.id`).all()}}
export function setCollectionAccess(db,ctx,id,payload){return withImmediateTransaction(db,()=>{
 if(!readMenu(db,ctx).canEdit)fail('MENU_OWNER_ONLY',403)
 if(typeof payload.isOpen!=='boolean'||!Number.isInteger(payload.revision))fail('INVALID_STATUS',400)
 const z=db.prepare('SELECT * FROM zone_groups WHERE id=?').get(Number(id));if(!z||!z.is_active)fail('NOT_FOUND',404)
 const x=db.prepare('SELECT * FROM zone_collection_access WHERE zone_id=?').get(z.id)
 if((x?.revision||0)!==payload.revision)fail('MENU_STALE')
 db.prepare(`INSERT INTO zone_collection_access(zone_id,is_open,revision,changed_by) VALUES(?,?,1,?) ON CONFLICT(zone_id) DO UPDATE SET is_open=excluded.is_open,revision=revision+1,changed_by=excluded.changed_by,changed_at=CURRENT_TIMESTAMP`).run(z.id,Number(payload.isOpen),ctx.id)
 db.prepare('INSERT INTO zone_collection_access_events(zone_id,is_open,account_id) VALUES(?,?,?)').run(z.id,Number(payload.isOpen),ctx.id)
 return {ok:true}
})}
export function collectionDispatchOptions(db,ctx,zoneId){manager(ctx);const date=ctx.today||kuchingDate();return {
 branches:db.prepare(`SELECT b.id,b.branch_name name,c.name company FROM branches b JOIN customers c ON c.id=b.customer_id JOIN areas a ON a.id=b.area_id WHERE a.zone_group_id=? AND b.is_active=1 AND b.status='active' AND b.lifecycle_status='ACTIVE' AND c.is_active=1 ORDER BY c.name,b.branch_name`).all(Number(zoneId)),
 trips:db.prepare(`SELECT t.id,t.trip_number tripNumber,d.driver_id driverId,e.name driverName,v.registration_number plate FROM dispatch_trips t JOIN dispatches d ON d.id=t.dispatch_id JOIN dispatch_days dd ON dd.id=t.dispatch_day_id JOIN employees e ON e.id=d.driver_id JOIN vehicles v ON v.id=d.vehicle_id WHERE dd.dispatch_date=? AND dd.status='in_progress' AND t.execution_status='in_progress' AND t.completed_at IS NULL AND e.is_active=1 AND e.employment_status='active' AND v.operational_status IN ('active','available') AND v.status IN ('available','assigned') ORDER BY v.registration_number,t.trip_number`).all(date)
}}
export function dispatchOpenCollection(db,ctx,payload){manager(ctx);return withImmediateTransaction(db,()=>{
 if(!branchCollectionOpen(db,payload.branchId))fail('FLEX_CLOSED')
 const t=collectionDispatchOptions(db,ctx,payload.zoneId).trips.find(t=>t.id===Number(payload.tripId));if(!t)fail('INTAKE_TRIP')
 // Only this trusted server path may attribute a supervisor push to a target driver.
 return collectExistingCustomer({...payload,reason:payload.reason||'Supervisor dispatch'},{employeeId:t.driverId,role:'driver',today:ctx.today||kuchingDate()},db,{actor:ctx.employeeName||String(ctx.id),supervisor:true})
})}
