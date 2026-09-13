import {db as defaultDb} from './database.mjs'
import {kuchingDate} from '../shared/kuchingTime.js'
import {canManageDispatch} from '../shared/dispatchAccess.js'
import {withImmediateTransaction} from './branchServiceDateGuard.mjs'
import {applyApprovedDriverOrder} from './driverRouteAdjustmentService.mjs'
import {applyApprovedNoGoods} from './noGoodsNoticeService.mjs'
const fail=code=>{throw Object.assign(Error(code),{code,statusCode:409})}
const manager=ctx=>{if(!canManageDispatch(ctx))throw Object.assign(Error('NG_ACCESS'),{code:'NG_ACCESS',statusCode:403})}
export function listArrangementRequests(ctx,db=defaultDb){
 manager(ctx)
 return db.prepare(`SELECT r.*,b.branch_name branchName,c.name customerName,e.name employeeName,v.registration_number plate,
 json_extract(r.payload_json,'$.direction') direction,ob.branch_name otherBranchName
 FROM driver_arrangement_requests r JOIN dispatch_stops s ON s.id=r.dispatch_stop_id JOIN branches b ON b.id=s.branch_id JOIN customers c ON c.id=b.customer_id JOIN employees e ON e.id=r.employee_id LEFT JOIN vehicles v ON v.id=r.vehicle_id
 LEFT JOIN dispatch_stops os ON os.id=json_extract(r.payload_json,'$.otherStopId') LEFT JOIN branches ob ON ob.id=os.branch_id
 WHERE r.status='pending' ORDER BY r.id`).all().map(({payload_json,...r})=>r)
}
export function reviewArrangementRequest(id,payload,ctx,db=defaultDb){
 manager(ctx);const reason=String(payload.reason||'').trim(),decision=payload.decision
 if(!['approved','rejected'].includes(decision)||!reason||reason.length>1000)fail('ARRANGEMENT_REASON')
 return withImmediateTransaction(db,()=>{
  const r=db.prepare('SELECT * FROM driver_arrangement_requests WHERE id=?').get(Number(id));if(!r)fail('ARRANGEMENT_STALE')
  if(r.status===decision)return{ok:true,idempotent:true};if(r.status!=='pending')fail('ARRANGEMENT_STALE')
  const s=db.prepare('SELECT s.*,t.dispatch_day_id,d.vehicle_id,d.driver_id,dd.dispatch_date FROM dispatch_stops s JOIN dispatch_trips t ON t.id=s.dispatch_trip_id JOIN dispatches d ON d.id=s.dispatch_id JOIN dispatch_days dd ON dd.id=t.dispatch_day_id WHERE s.id=?').get(r.dispatch_stop_id)
  if(decision==='approved'){
   if(!s||r.service_date!==(ctx.today||kuchingDate())||s.dispatch_date!==r.service_date||s.dispatch_trip_id!==r.trip_id||s.vehicle_id!==r.vehicle_id||s.driver_id!==r.driver_id)fail('ARRANGEMENT_STALE')
   if(r.kind==='order')applyApprovedDriverOrder(s.id,JSON.parse(r.payload_json),{employeeId:r.employee_id,role:r.employee_role,today:r.service_date},ctx,db)
   else applyApprovedNoGoods(r,ctx,db)
  }
  const actor=ctx.employeeName||String(ctx.employeeId)
  db.prepare('UPDATE driver_arrangement_requests SET status=?,reviewed_at=CURRENT_TIMESTAMP,reviewed_by=?,review_reason=? WHERE id=?').run(decision,actor,reason,r.id)
  db.prepare("INSERT INTO dispatch_change_logs(dispatch_day_id,actor,change_type,entity_type,entity_id,before_json,after_json,requires_reapproval) VALUES(?,?,'driver_arrangement_reviewed','dispatch_stop',?,?,?,0)").run(s.dispatch_day_id,actor,String(s.id),JSON.stringify({requestId:r.id,status:'pending'}),JSON.stringify({status:decision,kind:r.kind,reason}))
  return{ok:true}
 })
}
export function arrangementProof(id,ctx,db=defaultDb){
 manager(ctx);const r=db.prepare("SELECT payload_json FROM driver_arrangement_requests WHERE id=? AND kind='no_goods'").get(Number(id));if(!r)fail('ARRANGEMENT_STALE');return JSON.parse(r.payload_json)
}
