import {canManageDispatch} from '../shared/dispatchAccess.js'
import {nextMasterId} from './customerMasterService.mjs'
import {db as defaultDb} from './database.mjs'
import {kuchingDate} from '../shared/kuchingTime.js'
import {withImmediateTransaction} from './branchServiceDateGuard.mjs'
import {activeRouteDriver} from './routeDriverAuthorization.mjs'
import {intakeEvent,assertNoPendingTripApproval} from './temporaryIntakeBilling.mjs'

const fail=(code,statusCode=409)=>{const e=Error(code);e.code=code;e.statusCode=statusCode;throw e}
const manager=ctx=>{if(!canManageDispatch(ctx))fail('INTAKE_PERMISSION',403)}
const driver=(db,ctx)=>{if(!activeRouteDriver(db,ctx.employeeId,ctx.role))fail('INTAKE_PERMISSION',403)}
export function intakeTrips(ctx={},db=defaultDb){
 driver(db,ctx)
 return db.prepare(`SELECT t.id,t.trip_number tripNumber,d.vehicle_id vehicleId,v.registration_number plate,v.vehicle_code vehicleCode
 FROM dispatch_trips t JOIN dispatches d ON d.id=t.dispatch_id JOIN dispatch_days dd ON dd.id=t.dispatch_day_id JOIN vehicles v ON v.id=d.vehicle_id
 WHERE d.driver_id=? AND dd.dispatch_date=? AND dd.status='in_progress' AND t.execution_status='in_progress' AND t.completed_at IS NULL
 AND v.operational_status IN ('active','available') AND v.status IN ('available','assigned') ORDER BY t.id`).all(ctx.employeeId,ctx.today||kuchingDate())
}
export function createIntake(payload={},ctx={},db=defaultDb){
 driver(db,ctx)
 const name=String(payload.name||'').trim(),phone=String(payload.phone||'').trim(),key=String(payload.requestKey||'')
 const lat=Number(payload.latitude),lng=Number(payload.longitude)
 if(!name||name.length>200||phone.length>60||!/^[-a-zA-Z0-9]{16,80}$/.test(key))fail('INTAKE_FIELDS',400)
 if(payload.latitude==null||payload.longitude==null||String(payload.latitude).trim()===''||String(payload.longitude).trim()===''||!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180||(lat===0&&lng===0))fail('INTAKE_GPS',400)
 return withImmediateTransaction(db,()=>{
  const prior=db.prepare('SELECT id,dispatch_stop_id stopId,employee_id employeeId FROM temporary_customer_intakes WHERE request_key=?').get(key)
  if(prior){if(prior.employeeId!==Number(ctx.employeeId))fail('INTAKE_PERMISSION',403);return prior}
  const trip=intakeTrips(ctx,db).find(t=>t.id===Number(payload.tripId));if(!trip)fail('INTAKE_TRIP')
  const t=db.prepare('SELECT * FROM dispatch_trips WHERE id=?').get(trip.id)
  assertNoPendingTripApproval(db,t.id)
  const route=db.prepare("SELECT route_number FROM dispatch_stops WHERE dispatch_trip_id=? AND status<>'cancelled' AND route_number IS NOT NULL ORDER BY stop_sequence LIMIT 1").get(t.id)
  const customerCode=nextMasterId(db,'customers','jodoo_customer_id','customer'),branchCode=nextMasterId(db,'branches','jodoo_branch_id','branch')
  const customerId=Number(db.prepare("INSERT INTO customers(jodoo_customer_id,name,phone,payment_type,default_payment_type,source_system,created_by) VALUES(?,?,?,'Cash','Cash','KCS Temporary',?)").run(customerCode,name,phone,String(ctx.employeeId)).lastInsertRowid)
  const branchId=Number(db.prepare("INSERT INTO branches(jodoo_branch_id,customer_id,branch_name,phone,latitude,longitude,gps_status,payment_type,collection_frequency,source_system,created_by) VALUES(?,?,?,?,?,?,'pending_review','Cash','On Call','KCS Temporary',?)").run(branchCode,customerId,name,phone,lat,lng,String(ctx.employeeId)).lastInsertRowid)
  db.prepare('UPDATE branches SET source_customer_id=? WHERE id=?').run(customerCode,branchId)
  const seq=db.prepare('SELECT COALESCE(MAX(stop_sequence),0)+1 n FROM dispatch_stops WHERE dispatch_id=?').get(t.dispatch_id).n
  const routeSeq=db.prepare('SELECT COALESCE(MAX(route_stop_sequence),0)+1 n FROM dispatch_stops WHERE route_number=? AND service_date=?').get(route?.route_number??null,ctx.today||kuchingDate()).n
  const stopId=Number(db.prepare("INSERT INTO dispatch_stops(dispatch_id,dispatch_trip_id,branch_id,stop_sequence,status,service_date,dedupe_enforced,route_number,route_stop_sequence,override_note) VALUES(?,?,?,?,'available',?,1,?,?,'temporary_intake')").run(t.dispatch_id,t.id,branchId,seq,ctx.today||kuchingDate(),route?.route_number??null,routeSeq).lastInsertRowid)
  const id=Number(db.prepare('INSERT INTO temporary_customer_intakes(request_key,branch_id,dispatch_stop_id,employee_id) VALUES(?,?,?,?)').run(key,branchId,stopId,ctx.employeeId).lastInsertRowid)
  intakeEvent(db,id,'created',ctx.employeeId,{name,phone,latitude:lat,longitude:lng,stopId,tripId:t.id,vehicleId:trip.vehicleId})
  db.prepare("INSERT INTO dispatch_change_logs(dispatch_day_id,actor,change_type,entity_type,entity_id,after_json,requires_reapproval) VALUES(?,?,'temporary_intake_created','dispatch_stop',?,?,0)").run(t.dispatch_day_id,String(ctx.employeeId),String(stopId),JSON.stringify({intakeId:id,branchId,tripId:t.id}))
  return {id,stopId}
 })
}
const rows=`SELECT i.*,s.id stopId,s.status stopStatus,s.arrived_at arrivedAt,b.branch_name name,b.phone,b.latitude,b.longitude,b.jodoo_branch_id branchCode,
 COALESCE(pb.driver_name_snapshot,e.name) driverName,COALESCE(pb.registration_number_snapshot,v.registration_number) plate,dd.dispatch_date serviceDate,
 pb.id billId,pb.bill_number billNumber,pb.total_cents totalCents,pb.payment_method paymentMethod,
 EXISTS(SELECT 1 FROM purchase_payment_proofs p WHERE p.purchase_bill_id=pb.id) paymentProofUploaded,
 linked.branch_name linkedName,linked.jodoo_branch_id linkedCode
 FROM temporary_customer_intakes i JOIN branches b ON b.id=i.branch_id JOIN dispatch_stops s ON s.id=i.dispatch_stop_id
 JOIN dispatch_trips t ON t.id=s.dispatch_trip_id JOIN dispatch_days dd ON dd.id=t.dispatch_day_id JOIN dispatches d ON d.id=t.dispatch_id
 JOIN employees e ON e.id=i.employee_id JOIN vehicles v ON v.id=d.vehicle_id
 LEFT JOIN purchase_bills pb ON pb.dispatch_stop_id=s.id AND pb.status='issued' LEFT JOIN branches linked ON linked.id=i.linked_branch_id`
export function listIntakes(ctx={},db=defaultDb,{review=false,history=false}={}){
 if(review)manager(ctx);else driver(db,ctx)
 const data=review?db.prepare(rows+` WHERE ${history?"i.status IN ('formal','one_time','linked')":"i.status='pending'"} ORDER BY i.id DESC LIMIT 200`).all():db.prepare(rows+" WHERE i.employee_id=? AND (dd.dispatch_date=? OR (i.status IN ('draft','pending') AND s.status<>'completed')) ORDER BY i.id DESC LIMIT 100").all(ctx.employeeId,ctx.today||kuchingDate())
 return data.map(r=>({...r,items:db.prepare('SELECT product_name_snapshot name,quantity,unit_price_cents unitPriceCents,line_total_cents totalCents FROM purchase_bill_items WHERE purchase_bill_id=? ORDER BY id').all(r.billId??-1)}))
}
export function cancelIntake(id,ctx={},db=defaultDb){
 driver(db,ctx)
 return withImmediateTransaction(db,()=>{
  const i=db.prepare('SELECT * FROM temporary_customer_intakes WHERE id=?').get(Number(id))
  if(!i||i.employee_id!==Number(ctx.employeeId))fail('INTAKE_PERMISSION',403)
  if(i.status==='cancelled')return {ok:true}
  if(i.status!=='draft'||db.prepare('SELECT 1 FROM purchase_bills WHERE dispatch_stop_id=?').get(i.dispatch_stop_id))fail('INTAKE_STATE')
  db.prepare("UPDATE dispatch_stops SET status='cancelled' WHERE id=?").run(i.dispatch_stop_id)
  db.prepare("UPDATE temporary_customer_intakes SET status='cancelled' WHERE id=?").run(i.id)
  db.prepare("UPDATE branches SET status='inactive',is_active=0,lifecycle_status='TEST_INVALID',status_reason='Unbilled temporary collection cancelled' WHERE id=?").run(i.branch_id)
  db.prepare("UPDATE customers SET status='inactive',is_active=0 WHERE id=(SELECT customer_id FROM branches WHERE id=?)").run(i.branch_id)
  intakeEvent(db,i.id,'cancelled',ctx.employeeId)
  return {ok:true}
 })
}
export function intakeMatchOptions(search,ctx={},db=defaultDb){
 manager(ctx);const q=String(search||'').trim();if(q.length<2)return []
 return db.prepare(`SELECT b.id,b.jodoo_branch_id code,b.branch_name name,c.name customerName,b.phone,b.address FROM branches b JOIN customers c ON c.id=b.customer_id
 WHERE b.is_active=1 AND b.status='active' AND b.lifecycle_status='ACTIVE' AND c.is_active=1
 AND NOT EXISTS(SELECT 1 FROM temporary_customer_intakes i WHERE i.branch_id=b.id AND i.status IN ('draft','pending','cancelled','linked'))
 AND (b.jodoo_branch_id LIKE ? OR b.branch_name LIKE ? OR b.phone LIKE ? OR c.name LIKE ?) ORDER BY b.branch_name LIMIT 30`).all(...Array(4).fill(`%${q}%`))
}
export function reviewIntake(id,payload={},ctx={},db=defaultDb){
 manager(ctx);const decision=payload.decision,reason=String(payload.reason||'').trim()
 if(!['formal','one_time','linked'].includes(decision)||!reason||reason.length>1000)fail('INTAKE_REVIEW',400)
 return withImmediateTransaction(db,()=>{
  const i=db.prepare('SELECT * FROM temporary_customer_intakes WHERE id=?').get(Number(id));if(!i||i.status!=='pending')fail('INTAKE_STATE')
  const bill=db.prepare("SELECT * FROM purchase_bills WHERE dispatch_stop_id=? AND status='issued'").get(i.dispatch_stop_id)
  if(!bill)fail('INTAKE_STATE')
  let target=null
  if(decision==='linked'){
   target=db.prepare(`SELECT b.* FROM branches b JOIN customers c ON c.id=b.customer_id WHERE b.id=? AND b.is_active=1 AND b.status='active' AND b.lifecycle_status='ACTIVE' AND c.is_active=1 AND NOT EXISTS(SELECT 1 FROM temporary_customer_intakes i WHERE i.branch_id=b.id AND i.status IN ('draft','pending','cancelled','linked'))`).get(Number(payload.branchId))
   if(!target||target.id===i.branch_id)fail('INTAKE_TARGET',400)
  }
  // Mark the master relationship only: never rewrite issued bills, GPS or trip ownership.
  if(target)db.prepare("UPDATE branches SET replaced_by_branch_id=?,lifecycle_status='DUPLICATE_REPLACED',is_active=0,status_reason=?,status_changed_at=CURRENT_TIMESTAMP,status_changed_by=? WHERE id=?").run(target.id,reason,ctx.employeeName||String(ctx.employeeId),i.branch_id)
  if(target)db.prepare("UPDATE customers SET is_active=0,status='inactive' WHERE id=(SELECT customer_id FROM branches WHERE id=?)").run(i.branch_id)
  if(decision==='formal')db.prepare("UPDATE customers SET source_system='KCS' WHERE id=(SELECT customer_id FROM branches WHERE id=?)").run(i.branch_id)
  db.prepare('UPDATE temporary_customer_intakes SET status=?,linked_branch_id=?,reviewed_at=CURRENT_TIMESTAMP,reviewed_by=?,review_reason=? WHERE id=?').run(decision,target?.id??null,ctx.employeeName||String(ctx.employeeId),reason,i.id)
  intakeEvent(db,i.id,'reviewed',ctx.employeeId,{decision,branchId:target?.id??null,reason,billId:bill.id})
  return {ok:true,decision,branchId:target?.id??i.branch_id}
 })
}
