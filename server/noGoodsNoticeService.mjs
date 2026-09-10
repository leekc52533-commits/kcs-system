import {db as defaultDb} from './database.mjs'
import {withImmediateTransaction} from './branchServiceDateGuard.mjs'
import {kuchingDate} from '../shared/kuchingTime.js'
import {canManageDispatch} from '../shared/dispatchAccess.js'
import {activeRouteDriver} from './routeDriverAuthorization.mjs'
import {image} from './driverExecutionService.mjs'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const fail=(code,statusCode=409)=>Object.assign(new Error(code),{code,statusCode})
const stopFor=(db,id)=>db.prepare(`SELECT s.*,t.dispatch_day_id day_id,t.execution_status,t.completed_at trip_completed_at,
 d.vehicle_id,d.driver_id,d.assistant_id,t.dispatch_id,dd.dispatch_date,dd.status day_status
 FROM dispatch_stops s JOIN dispatch_trips t ON t.id=s.dispatch_trip_id JOIN dispatches d ON d.id=t.dispatch_id
 JOIN dispatch_days dd ON dd.id=t.dispatch_day_id WHERE s.id=?`).get(Number(id))
function assigned(db,stop,context){
 const employee=db.prepare("SELECT * FROM employees WHERE id=? AND is_active=1 AND employment_status='active'").get(Number(context.employeeId))
 if(!employee||!stop)throw fail('NG_ACCESS',403)
 const driver=activeRouteDriver(db,employee.id,context.role)
 const crew=context.role==='crew'&&(['crew','assistant','attendant / crew'].includes(String(employee.job_role).toLowerCase())||db.prepare("SELECT 1 FROM employee_job_roles WHERE employee_id=? AND role='Attendant / Crew' AND is_active=1").get(employee.id))
 const owns=driver&&Number(stop.driver_id)===employee.id||crew&&(Number(stop.assistant_id)===employee.id||db.prepare('SELECT 1 FROM dispatch_vehicle_assistants WHERE dispatch_day_id=? AND vehicle_id=? AND employee_id=?').get(stop.day_id,stop.vehicle_id,employee.id))
 if(!owns)throw fail('NG_ACCESS',403)
 return employee
}
const audit=(db,s,actor,type,before,after)=>db.prepare(`INSERT INTO dispatch_change_logs(dispatch_day_id,actor,change_type,entity_type,entity_id,before_json,after_json,requires_reapproval) VALUES(?,?,?,?,?,?,?,0)`).run(s.day_id,String(actor),type,'dispatch_stop',String(s.id),JSON.stringify(before),JSON.stringify(after))
export function activeNoGoodsNotice(db,id){return db.prepare(`SELECT id,contact_method contactMethod,reason,employee_name employeeName,created_at createdAt FROM no_goods_notices WHERE dispatch_stop_id=? AND restored_at IS NULL`).get(id)||null}
export function submitNoGoodsNotice(id,payload={},context={},db=defaultDb,{uploadsRoot}={}){
 const reason=String(payload.reason||'').trim(),method=String(payload.contactMethod||'')
 if(!reason||reason.length>1000||!['phone','whatsapp','sms','onsite'].includes(method))throw fail('NG_DETAILS',400)
 if(!uploadsRoot)throw fail('NG_STORAGE',500)
 const photo=image(payload.photo),key=`no-goods-notices/${crypto.randomUUID()}.${photo.extension}`,file=path.resolve(uploadsRoot,key)
 let written=false
 try{return withImmediateTransaction(db,()=>{
  const s=stopFor(db,id),employee=assigned(db,s,context)
  if(s.dispatch_date!==(context.today||kuchingDate()))throw fail('NG_TODAY')
  const existing=activeNoGoodsNotice(db,s.id);if(existing)return{...existing,idempotent:true}
  if(['cancelled','completed'].includes(s.status)||s.execution_status==='completed'||s.day_status==='completed'||db.prepare('SELECT 1 FROM purchase_bills WHERE dispatch_stop_id=?').get(s.id))throw fail('NG_PROTECTED')
  const createdAt=new Date(context.now||Date.now()).toISOString()
  fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,photo.bytes,{flag:'wx'});written=true
  const before={status:s.status,completion_outcome:s.completion_outcome,completed_at:s.completed_at,completed_by_employee_id:s.completed_by_employee_id,override_note:s.override_note,override_reason:s.override_reason}
  const result=db.prepare(`INSERT INTO no_goods_notices(dispatch_stop_id,employee_id,employee_name,contact_method,reason,storage_key,content_type,original_name,created_at,before_json) VALUES(?,?,?,?,?,?,?,?,?,?)`).run(s.id,employee.id,employee.name,method,reason,key,photo.type,String(payload.photo?.name||'proof'),createdAt,JSON.stringify(before))
  db.prepare("UPDATE dispatch_stops SET status='completed',completion_outcome='no_goods_notice',completed_at=?,completed_by_employee_id=? WHERE id=?").run(createdAt,employee.id,s.id)
  // Preserve pending requests as superseded decisions, so a late approval cannot move a skipped stop.
  db.prepare("UPDATE driver_date_requests SET status='rejected',reviewed_by='System',review_reason='Superseded by No Goods notice',reviewed_at=? WHERE dispatch_stop_id=? AND status='pending'").run(createdAt,s.id)
  db.prepare("UPDATE driver_defer_requests SET status='rejected',reviewed_by_name_snapshot='System',review_reason='Superseded by No Goods notice',reviewed_at=? WHERE dispatch_stop_id=? AND status='pending'").run(createdAt,s.id)
  audit(db,s,employee.id,'no_goods_notice_submitted',before,{noticeId:Number(result.lastInsertRowid),method,reason,arrivedAt:s.arrived_at,recurrenceUnchanged:true})
  return{...activeNoGoodsNotice(db,s.id),idempotent:false}
 })}catch(e){if(written&&fs.existsSync(file))fs.unlinkSync(file);throw e}
}
export function restoreNoGoodsNotice(id,payload={},context={},db=defaultDb){
 if(!canManageDispatch(context))throw fail('NG_ACCESS',403)
 const reason=String(payload.reason||'').trim();if(!reason||reason.length>1000)throw fail('NG_DETAILS',400)
 return withImmediateTransaction(db,()=>{
  const notice=db.prepare('SELECT * FROM no_goods_notices WHERE id=?').get(Number(id));if(!notice)throw fail('NG_PROTECTED')
  if(notice.restored_at)return{id:Number(id),idempotent:true}
  const s=stopFor(db,notice.dispatch_stop_id)
  if(s.dispatch_date!==(context.today||kuchingDate()))throw fail('NG_TODAY')
  if(s.completion_outcome!=='no_goods_notice'||db.prepare('SELECT 1 FROM purchase_bills WHERE dispatch_stop_id=?').get(s.id))throw fail('NG_PROTECTED')
  if(s.execution_status==='completed'){
   // Never create two running trips for the same vehicle.
   if(db.prepare("SELECT 1 FROM dispatch_trips t JOIN dispatches d ON d.id=t.dispatch_id WHERE t.dispatch_day_id=? AND d.vehicle_id=? AND t.execution_status='in_progress' AND t.id<>?").get(s.day_id,s.vehicle_id,s.dispatch_trip_id))throw fail('NG_RUNNING')
   db.prepare("UPDATE dispatch_trips SET execution_status='in_progress',completed_at=NULL,completed_by_employee_id=NULL WHERE id=?").run(s.dispatch_trip_id)
   db.prepare("UPDATE dispatches SET status='in_progress' WHERE id=?").run(s.dispatch_id)
   db.prepare("UPDATE dispatch_days SET status='in_progress' WHERE id=?").run(s.day_id)
  }
  const before=JSON.parse(notice.before_json)
  db.prepare('UPDATE dispatch_stops SET status=?,completion_outcome=?,completed_at=?,completed_by_employee_id=?,override_note=?,override_reason=? WHERE id=?').run(before.status,before.completion_outcome,before.completed_at,before.completed_by_employee_id,before.override_note,before.override_reason,s.id)
  const actor=context.employeeName||String(context.employeeId||context.role)
  db.prepare('UPDATE no_goods_notices SET restored_at=?,restored_by=?,restore_reason=? WHERE id=?').run(new Date().toISOString(),actor,reason,notice.id)
  audit(db,s,actor,'no_goods_notice_restored',{noticeId:notice.id,tripStatus:s.execution_status},{...before,reason})
  return{id:notice.id,stopId:s.id,idempotent:false}
 })
}
export function noGoodsNoticePhoto(id,context={},db=defaultDb){
 const n=db.prepare('SELECT * FROM no_goods_notices WHERE id=?').get(Number(id));if(!n)throw fail('NG_PROTECTED',404)
 if(!canManageDispatch(context))assigned(db,stopFor(db,n.dispatch_stop_id),context)
 return n
}
