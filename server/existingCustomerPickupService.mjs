import {db as defaultDb} from './database.mjs'
import {kuchingDate} from '../shared/kuchingTime.js'
import {canManageDispatch} from '../shared/dispatchAccess.js'
import {withImmediateTransaction,findBranchServiceDateStop,assertBranchServiceDateAvailable} from './branchServiceDateGuard.mjs'
import {intakeTrips} from './temporaryCustomerIntakeService.mjs'
import {listBranchProducts} from './materialProductService.mjs'
import {assertNoPendingTripApproval} from './temporaryIntakeBilling.mjs'
const fail=(code,statusCode=409)=>{throw Object.assign(Error(code),{code,statusCode})}
const today=ctx=>ctx.today||kuchingDate()
function searchActor(db,ctx){
 if(!['driver','crew'].includes(ctx.role)&&!canManageDispatch(ctx))fail('INTAKE_PERMISSION',403)
 if(!db.prepare("SELECT 1 FROM employees WHERE id=? AND is_active=1 AND employment_status='active'").get(ctx.employeeId))fail('INTAKE_PERMISSION',403)
}
const branchSql=`SELECT b.id,b.jodoo_branch_id branchCode,b.branch_name name,c.name companyName,b.address,COALESCE(b.phone,c.phone) phone,b.contact_person contactPerson,c.whatsapp,b.latitude,b.longitude,COALESCE(b.payment_type,c.default_payment_type,c.payment_type) paymentMethod
 FROM branches b JOIN customers c ON c.id=b.customer_id WHERE b.is_active=1 AND b.status='active' AND b.lifecycle_status='ACTIVE' AND c.is_active=1`
const activeBranch=(db,id)=>{const b=db.prepare(branchSql+' AND b.id=?').get(Number(id));if(!b)fail('PICKUP_BRANCH',404);return b}
const stop=(db,id)=>db.prepare(`SELECT s.*,t.dispatch_day_id dayId,t.execution_status tripStatus,t.completed_at tripCompletedAt,d.status dispatchStatus,dd.dispatch_date serviceDate,d.vehicle_id vehicleId,d.driver_id driverId,v.registration_number plate,v.vehicle_code vehicleCode
 FROM dispatch_stops s JOIN dispatch_trips t ON t.id=s.dispatch_trip_id JOIN dispatch_days dd ON dd.id=t.dispatch_day_id JOIN dispatches d ON d.id=s.dispatch_id LEFT JOIN vehicles v ON v.id=d.vehicle_id WHERE s.id=?`).get(id)
function hasWork(db,s){
 if(!s||s.tripCompletedAt||['completed','cancelled'].includes(s.dispatchStatus)||!['locked','available'].includes(s.status)||s.arrived_at||s.completed_at||s.invoice_number||s.collected_weight_kg!=null||s.payment_status||s.override_note==='driver_deferred')return true
 return ['purchase_bills','stop_documents','stop_step_records','driver_no_goods_proofs','no_goods_notices'].some(table=>db.prepare(`SELECT 1 FROM ${table} WHERE dispatch_stop_id=?`).get(s.id))||db.prepare("SELECT 1 FROM driver_defer_requests WHERE dispatch_stop_id=? AND status='pending'").get(s.id)||db.prepare("SELECT 1 FROM driver_date_requests WHERE dispatch_stop_id=? AND status='pending'").get(s.id)
}
function assignment(db,branchId,ctx){
 const found=findBranchServiceDateStop(db,branchId,today(ctx));if(!found)return null
 const s=stop(db,found.id)
 return {stopId:s.id,tripId:s.dispatch_trip_id,vehicleId:s.vehicleId,plate:s.plate||s.vehicleCode,serviceDate:s.serviceDate,status:s.status,own:Number(s.driverId)===Number(ctx.employeeId),protected:Boolean(hasWork(db,s))}
}
export function searchPickupCustomers(search,ctx={},db=defaultDb){
 searchActor(db,ctx);const term=String(search||'').trim().slice(0,100);if(!term)return []
 const escape=s=>s.replace(/[\\%_]/g,'\\$&'),q=`%${escape(term)}%`,code=`%${escape(term.replace(/^[bc](?=\d)/i,''))}%`
 return db.prepare(branchSql+` AND (b.branch_name LIKE ? ESCAPE '\\' OR c.name LIKE ? ESCAPE '\\' OR b.jodoo_branch_id LIKE ? ESCAPE '\\' OR c.jodoo_customer_id LIKE ? ESCAPE '\\' OR b.phone LIKE ? ESCAPE '\\' OR c.phone LIKE ? ESCAPE '\\') ORDER BY c.name COLLATE NOCASE,b.branch_name COLLATE NOCASE,b.id LIMIT 30`).all(q,q,code,code,q,q).map(b=>({...b,assignment:assignment(db,b.id,ctx)}))
}
export function pickupCustomerDetails(id,ctx={},db=defaultDb){
 searchActor(db,ctx);const b=activeBranch(db,id)
 return {...b,assignment:assignment(db,b.id,ctx),products:listBranchProducts(b.id,db).filter(p=>p.isSelectable&&Number(p.currentPrice)>0)}
}
function targetTrip(db,id,ctx){
 if(!intakeTrips(ctx,db).some(t=>t.id===Number(id)))fail('INTAKE_TRIP')
 const t=db.prepare('SELECT t.*,d.driver_id driverId,d.vehicle_id vehicleId FROM dispatch_trips t JOIN dispatches d ON d.id=t.dispatch_id WHERE t.id=?').get(Number(id));assertNoPendingTripApproval(db,t.id)
 const route=db.prepare("SELECT route_number FROM dispatch_stops WHERE dispatch_trip_id=? AND status<>'cancelled' AND route_number IS NOT NULL ORDER BY stop_sequence LIMIT 1").get(t.id)
 return {...t,routeNumber:route?.route_number??null}
}
function requireBilling(db,b){
 if(b.latitude==null||b.longitude==null||!Number.isFinite(Number(b.latitude))||!Number.isFinite(Number(b.longitude))||Math.abs(Number(b.latitude))>90||Math.abs(Number(b.longitude))>180||(Number(b.latitude)===0&&Number(b.longitude)===0))fail('PICKUP_GPS')
 if(!['cash','credit'].includes(String(b.paymentMethod||'').toLowerCase())||!listBranchProducts(b.id,db).some(p=>p.isSelectable&&Number(p.currentPrice)>0))fail('PICKUP_PRICE')
}
function audit(db,dayId,stopId,actor,type,before,after){db.prepare("INSERT INTO dispatch_change_logs(dispatch_day_id,actor,change_type,entity_type,entity_id,before_json,after_json,requires_reapproval) VALUES(?,?,?,'dispatch_stop',?,?,?,0)").run(dayId,String(actor),type,String(stopId),JSON.stringify(before),JSON.stringify(after))}
function position(db,t){return {sequence:db.prepare('SELECT COALESCE(MAX(stop_sequence),0)+1 n FROM dispatch_stops WHERE dispatch_id=?').get(t.dispatch_id).n,routeSequence:db.prepare('SELECT COALESCE(MAX(s.route_stop_sequence),0)+1 n FROM dispatch_stops s JOIN dispatch_trips dt ON dt.id=s.dispatch_trip_id WHERE dt.dispatch_day_id=? AND s.route_number=?').get(t.dispatch_day_id,t.routeNumber).n}}
export function collectExistingCustomer(payload={},ctx={},db=defaultDb){
 return withImmediateTransaction(db,()=>{
  const t=targetTrip(db,payload.tripId,ctx),b=activeBranch(db,payload.branchId),existing=findBranchServiceDateStop(db,b.id,today(ctx))
  if(existing){
   const s=stop(db,existing.id)
   if(Number(s.driverId)===Number(ctx.employeeId)){
    if(s.dispatch_trip_id!==t.id)fail('PICKUP_OWN_TRIP')
    db.prepare("INSERT OR IGNORE INTO existing_customer_pickups(dispatch_stop_id,employee_id,kind) VALUES(?,?,'existing')").run(s.id,ctx.employeeId)
    return {id:`existing-${s.id}`,stopId:s.id,reused:true,arrived:Boolean(s.arrived_at),completed:s.status==='completed'}
   }
   if(hasWork(db,s))fail('PICKUP_PROTECTED')
   const reason=String(payload.reason||'').trim();if(!reason||reason.length>1000)fail('PICKUP_REASON',400)
   requireBilling(db,b)
   const prior=db.prepare("SELECT * FROM customer_transfer_requests WHERE dispatch_stop_id=? AND status='pending'").get(s.id)
   if(prior){if(prior.requester_employee_id!==Number(ctx.employeeId)||prior.target_trip_id!==t.id)fail('PICKUP_PENDING');return {pending:true,requestId:prior.id}}
   const id=Number(db.prepare('INSERT INTO customer_transfer_requests(dispatch_stop_id,service_date,requester_employee_id,requester_role,source_trip_id,source_dispatch_id,source_vehicle_id,source_driver_id,target_trip_id,target_vehicle_id,reason) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(s.id,today(ctx),ctx.employeeId,ctx.role,s.dispatch_trip_id,s.dispatch_id,s.vehicleId??null,s.driverId??null,t.id,t.vehicleId,reason).lastInsertRowid)
   audit(db,s.dayId,s.id,ctx.employeeId,'customer_transfer_requested',{tripId:s.dispatch_trip_id,vehicleId:s.vehicleId},{requestId:id,targetTripId:t.id,targetVehicleId:t.vehicleId,reason})
   return {pending:true,requestId:id}
  }
  requireBilling(db,b)
  // A cancelled record with documents is history, not a fresh collection opportunity.
  const documented=db.prepare(`SELECT s.id FROM dispatch_stops s JOIN dispatches d ON d.id=s.dispatch_id WHERE s.branch_id=? AND COALESCE(s.service_date,d.dispatch_date)=? AND (s.arrived_at IS NOT NULL OR EXISTS(SELECT 1 FROM purchase_bills pb WHERE pb.dispatch_stop_id=s.id))`).get(b.id,today(ctx));if(documented)fail('PICKUP_PROTECTED')
  assertBranchServiceDateAvailable(db,b.id,today(ctx));const pos=position(db,t)
  const id=Number(db.prepare("INSERT INTO dispatch_stops(dispatch_id,dispatch_trip_id,branch_id,stop_sequence,status,service_date,dedupe_enforced,route_number,route_stop_sequence,override_note) VALUES(?,?,?,?,'available',?,1,?,?,'existing_customer_pickup')").run(t.dispatch_id,t.id,b.id,pos.sequence,today(ctx),t.routeNumber,pos.routeSequence).lastInsertRowid)
  db.prepare("INSERT INTO existing_customer_pickups(dispatch_stop_id,employee_id,kind) VALUES(?,?,'added')").run(id,ctx.employeeId)
  audit(db,t.dispatch_day_id,id,ctx.employeeId,'existing_customer_added_once',null,{branchId:b.id,tripId:t.id,vehicleId:t.vehicleId})
  return {id:`existing-${id}`,stopId:id}
 })
}
export function listExistingPickups(ctx={},db=defaultDb){
 searchActor(db,ctx)
 return db.prepare(`SELECT s.id stopId,'existing-'||s.id id,1 existingCustomer,'existing' status,s.status stopStatus,s.arrived_at arrivedAt,b.branch_name name,b.latitude,b.longitude,dd.dispatch_date serviceDate,v.registration_number plate,
 pb.id billId,pb.bill_number billNumber,COALESCE(pb.payment_method,b.payment_type,c.default_payment_type,c.payment_type) paymentMethod,EXISTS(SELECT 1 FROM purchase_payment_proofs p WHERE p.purchase_bill_id=pb.id) paymentProofUploaded
 FROM existing_customer_pickups p JOIN dispatch_stops s ON s.id=p.dispatch_stop_id JOIN branches b ON b.id=s.branch_id JOIN customers c ON c.id=b.customer_id JOIN dispatch_trips t ON t.id=s.dispatch_trip_id JOIN dispatch_days dd ON dd.id=t.dispatch_day_id JOIN dispatches d ON d.id=s.dispatch_id JOIN vehicles v ON v.id=d.vehicle_id LEFT JOIN purchase_bills pb ON pb.dispatch_stop_id=s.id AND pb.status='issued'
 WHERE d.driver_id=? AND dd.dispatch_date=? AND s.status<>'cancelled' ORDER BY s.id DESC`).all(ctx.employeeId,today(ctx))
}
const transfersSql=`SELECT r.*,b.branch_name name,b.jodoo_branch_id branchCode,c.name companyName,sv.registration_number sourcePlate,tv.registration_number targetPlate,e.name requesterName
 FROM customer_transfer_requests r JOIN dispatch_stops s ON s.id=r.dispatch_stop_id JOIN branches b ON b.id=s.branch_id JOIN customers c ON c.id=b.customer_id LEFT JOIN vehicles sv ON sv.id=r.source_vehicle_id JOIN vehicles tv ON tv.id=r.target_vehicle_id JOIN employees e ON e.id=r.requester_employee_id`
export function listCustomerTransfers(ctx={},db=defaultDb,{review=false}={}){
 if(review){if(!canManageDispatch(ctx))fail('INTAKE_PERMISSION',403);return db.prepare(transfersSql+" WHERE r.status='pending' ORDER BY r.id").all()}
 searchActor(db,ctx);return db.prepare(transfersSql+" WHERE r.requester_employee_id=? AND (r.service_date=? OR r.status='pending') ORDER BY r.id DESC").all(ctx.employeeId,today(ctx))
}
export function reviewCustomerTransfer(id,payload={},ctx={},db=defaultDb){
 if(!canManageDispatch(ctx))fail('INTAKE_PERMISSION',403)
 const decision=payload.decision,reason=String(payload.reason||'').trim();if(!['approved','rejected'].includes(decision)||!reason||reason.length>1000)fail('PICKUP_REASON',400)
 return withImmediateTransaction(db,()=>{
  const r=db.prepare('SELECT * FROM customer_transfer_requests WHERE id=?').get(Number(id));if(!r)fail('PICKUP_STALE')
  if(r.status===decision)return {ok:true,idempotent:true};if(r.status!=='pending')fail('PICKUP_STALE')
  const s=stop(db,r.dispatch_stop_id)
  if(decision==='approved'){
   if(!s||s.serviceDate!==today(ctx)||r.service_date!==today(ctx)||s.dispatch_trip_id!==r.source_trip_id||s.dispatch_id!==r.source_dispatch_id||s.vehicleId!==r.source_vehicle_id||s.driverId!==r.source_driver_id)fail('PICKUP_STALE')
   if(hasWork(db,s))fail('PICKUP_PROTECTED')
   const t=targetTrip(db,r.target_trip_id,{employeeId:r.requester_employee_id,role:r.requester_role,today:today(ctx)})
   if(t.vehicleId!==r.target_vehicle_id)fail('PICKUP_STALE')
   const b=activeBranch(db,s.branch_id);requireBilling(db,b);assertBranchServiceDateAvailable(db,b.id,today(ctx),{excludeStopId:s.id})
   const pos=position(db,t)
   db.prepare("UPDATE dispatch_stops SET dispatch_id=?,dispatch_trip_id=?,stop_sequence=?,route_number=?,route_stop_sequence=?,status='available' WHERE id=?").run(t.dispatch_id,t.id,pos.sequence,t.routeNumber,pos.routeSequence,s.id)
   db.prepare("INSERT INTO existing_customer_pickups(dispatch_stop_id,employee_id,kind) VALUES(?,?,'transferred') ON CONFLICT(dispatch_stop_id) DO UPDATE SET employee_id=excluded.employee_id,kind='transferred'").run(s.id,r.requester_employee_id)
   audit(db,s.dayId,s.id,ctx.employeeName||ctx.employeeId,'customer_transfer_approved',s,{requestId:r.id,tripId:t.id,vehicleId:t.vehicleId,driverId:r.requester_employee_id,reason})
  }else audit(db,s.dayId,s.id,ctx.employeeName||ctx.employeeId,'customer_transfer_rejected',{requestId:r.id},{reason})
  db.prepare('UPDATE customer_transfer_requests SET status=?,reviewed_at=CURRENT_TIMESTAMP,reviewed_by=?,review_reason=? WHERE id=?').run(decision,ctx.employeeName||String(ctx.employeeId),reason,r.id)
  return {ok:true,stopId:r.dispatch_stop_id}
 })
}
