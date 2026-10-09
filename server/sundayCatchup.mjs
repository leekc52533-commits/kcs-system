import {addCalendarDays,kuchingDate} from '../shared/kuchingTime.js'
import {scheduleMatchesDate} from '../shared/scheduleRecurrence.js'
import {isSunday,executionRoute} from './sundayPlanning.mjs'
import {findBranchServiceDateStop,withImmediateTransaction} from './branchServiceDateGuard.mjs'
const normalize=v=>String(v||'').trim().toLowerCase().replace(/[。.!！]+$/u,'').replace(/\s+/g,' ')
const timeReasons=new Set(['tak sempat','tidak sempat membuat kutipan','来不及','来不及收货','时间不足，来不及收货','not enough time','not enough time to collect'])
export const isTimeMiss=r=>r.reasonCode?r.reasonCode==='time':timeReasons.has(normalize(r.reason))
const hasPromises=db=>Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE name='customer_date_promises' AND type='table'").get())
export function ensureSundayCatchupSchema(db){db.exec(`CREATE TABLE IF NOT EXISTS sunday_catchup_tasks(
 sunday_date TEXT NOT NULL,branch_id INTEGER NOT NULL REFERENCES branches(id),
 stop_id INTEGER REFERENCES dispatch_stops(id) ON DELETE SET NULL,
 source_request_id INTEGER NOT NULL REFERENCES driver_date_requests(id),
 state TEXT NOT NULL CHECK(state IN ('active','resolved','manual')),
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(sunday_date,branch_id));`)}
export function sundayCatchupCandidates(db,date){
 if(!isSunday(date))return[]
 const monday=addCalendarDays(date,-6),saturday=addCalendarDays(date,-1)
 const rows=db.prepare(`SELECT r.id requestId,r.source_date sourceDate,r.reason,x.reason_code reasonCode,
 s.branch_id branchId,s.route_number sourceRoute,b.jodoo_branch_id branchCode,b.branch_name branchName
 FROM driver_date_requests r JOIN dispatch_stops s ON s.id=r.dispatch_stop_id
 JOIN branches b ON b.id=s.branch_id JOIN customers c ON c.id=b.customer_id
 LEFT JOIN driver_date_evidence x ON x.request_id=r.id
 WHERE r.status IN ('pending','approved') AND r.source_date BETWEEN ? AND ?
 AND b.is_active=1 AND b.status='active' AND b.lifecycle_status='ACTIVE' AND c.is_active=1 AND c.status='active'
 ORDER BY r.source_date DESC,r.id DESC`).all(monday,saturday)
 const seen=new Set(),items=[]
 for(const row of rows){
  if(!isTimeMiss(row)||seen.has(row.branchId))continue
  seen.add(row.branchId)
  // A real issued purchase bill on or after the missed service date resolves it.
  // Same-day collection counts; neither GPS arrival nor a voided bill is success.
  if(db.prepare("SELECT 1 FROM purchase_bills WHERE branch_id=? AND status='issued' AND service_date>=? AND service_date<=?").get(row.branchId,row.sourceDate,date))continue
  const home=db.prepare(`SELECT w.route_number n FROM weekly_route_plan_stops w JOIN weekly_route_plans p ON p.id=w.plan_id
   WHERE p.is_active=1 AND w.branch_id=? ORDER BY (w.weekday=0) DESC,w.weekday,w.route_number LIMIT 1`).get(row.branchId)
  items.push({...row,routeNumber:executionRoute(db,row.branchId,date,home?.n||row.sourceRoute)})
 }
 return items
}
const messages={
 protected:{zh:'星期天补收清单有变化，但行程已发布或开始执行，请主管核对。',en:'Sunday catch-up eligibility changed after release or departure. Supervisor review is required.',ms:'Senarai kutipan susulan Ahad berubah selepas perjalanan dikeluarkan atau bermula. Penyelia perlu semak.'},
 promise:{zh:'客户已有锁定收货日期，未自动加入星期天，请主管核对。',en:'The customer has a promised collection date. Not added to Sunday; supervisor review is required.',ms:'Pelanggan mempunyai tarikh kutipan yang dijanjikan. Tidak ditambah ke Ahad; penyelia perlu semak.'},
 route:{zh:'星期天补收客户缺少有效路线，请主管安排。',en:'Sunday catch-up customer has no valid route. Please assign a route.',ms:'Pelanggan kutipan susulan Ahad tiada laluan sah. Sila tetapkan laluan.'},
 manual:{zh:'星期天补收任务已有人工调整或执行记录，保留原安排，请主管核对。',en:'Sunday catch-up has manual changes or execution records. The existing arrangement is preserved for supervisor review.',ms:'Kutipan susulan Ahad telah diubah secara manual atau mempunyai rekod pelaksanaan. Aturan dikekalkan untuk semakan penyelia.'}
}
function scheduledNormally(db,branchId,date){
 return db.prepare('SELECT * FROM branch_schedules WHERE branch_id=? AND is_active=1').all(branchId).some(s=>{
  const ex=db.prepare('SELECT * FROM schedule_exceptions WHERE schedule_id=? AND (original_date=? OR target_date=?)').all(s.id,date,date)
  const removed=ex.some(e=>e.original_date===date&&['move_date','cancel_date','pause_once'].includes(e.exception_type)&&(e.exception_type!=='move_date'||e.target_date!==date))
  return !removed&&(scheduleMatchesDate(s,date)||ex.some(e=>e.target_date===date&&['move_date','add_extra_collection','customer_request'].includes(e.exception_type)))
 })
}
export function syncSundayCatchups(db,date,{create,place,invalidate,today=kuchingDate()}={}){
 if(!isSunday(date)||date<today)return{added:0,removed:0,reviews:[]}
 return withImmediateTransaction(db,()=>{
  const day=db.prepare('SELECT * FROM dispatch_days WHERE dispatch_date=?').get(date)
  if(!day)return{added:0,removed:0,reviews:[]}
  ensureSundayCatchupSchema(db)
  const result={added:0,removed:0,reviews:[]},candidates=sundayCatchupCandidates(db,date),wanted=new Map(candidates.map(r=>[r.branchId,r]))
  const warn=(r,key)=>result.reviews.push({date,kind:'sunday_catchup',branchId:r.branchCode||r.branch_id,branchName:r.branchName,message:messages[key].zh,messages:messages[key]})
  const protectedDay=['published','in_progress','completed'].includes(day.status)||db.prepare(`SELECT 1 FROM dispatch_trips t JOIN dispatches d ON d.id=t.dispatch_id WHERE t.dispatch_day_id=? AND (t.execution_status<>'not_started' OR d.status IN ('released','in_progress','completed'))`).get(day.id)
  const promised=branch=>hasPromises(db)&&db.prepare(`SELECT 1 FROM customer_date_promises p JOIN dispatch_stops s ON s.id=p.stop_id WHERE p.branch_id=? AND s.status NOT IN ('completed','cancelled')`).get(branch)
  const touched=stop=>stop.arrived_at||stop.completed_at||!['locked','available'].includes(stop.status)||stop.override_note!=='sunday_catchup'||db.prepare(`SELECT 1 FROM purchase_bills WHERE dispatch_stop_id=? UNION SELECT 1 FROM stop_documents WHERE dispatch_stop_id=? UNION SELECT 1 FROM stop_step_records WHERE dispatch_stop_id=? UNION SELECT 1 FROM driver_date_requests WHERE dispatch_stop_id=? UNION SELECT 1 FROM driver_arrangement_requests WHERE dispatch_stop_id=?`).get(stop.id,stop.id,stop.id,stop.id,stop.id)||db.prepare(`SELECT 1 FROM dispatch_change_logs WHERE entity_type='dispatch_stop' AND entity_id=? AND change_type IN ('route_customer_adjusted','stop_updated','stop_moved_in','driver_trial_order_changed','driver_order_approved')`).get(String(stop.id))||db.prepare("SELECT 1 FROM dispatch_change_logs WHERE dispatch_day_id=? AND change_type IN ('support_vehicle_added','temporary_stops_assigned_to_route','route_day_handover')").get(day.id)
  for(const task of db.prepare('SELECT t.*,b.jodoo_branch_id branchCode,b.branch_name branchName FROM sunday_catchup_tasks t JOIN branches b ON b.id=t.branch_id WHERE sunday_date=? AND state=\'active\'').all(date)){
   if(wanted.has(task.branch_id)&&!promised(task.branch_id))continue
   const stop=db.prepare('SELECT * FROM dispatch_stops WHERE id=?').get(task.stop_id)
   if(!stop){db.prepare("UPDATE sunday_catchup_tasks SET state='manual',updated_at=CURRENT_TIMESTAMP WHERE sunday_date=? AND branch_id=?").run(date,task.branch_id);continue}
   if(scheduledNormally(db,task.branch_id,date)){
    db.prepare("UPDATE sunday_catchup_tasks SET state='manual',updated_at=CURRENT_TIMESTAMP WHERE sunday_date=? AND branch_id=?").run(date,task.branch_id);continue
   }
   if(stop.status==='completed')continue
   if(protectedDay||touched(stop)||(hasPromises(db)&&db.prepare('SELECT 1 FROM customer_date_promises WHERE stop_id=?').get(stop.id))){warn(task,protectedDay?'protected':'manual');continue}
   db.prepare("UPDATE dispatch_stops SET status='cancelled',superseded_reason='sunday_catchup_resolved',superseded_by='System',superseded_at=CURRENT_TIMESTAMP WHERE id=?").run(stop.id)
   db.prepare("UPDATE sunday_catchup_tasks SET state='resolved',updated_at=CURRENT_TIMESTAMP WHERE sunday_date=? AND branch_id=?").run(date,task.branch_id)
   invalidate(date,'sunday_catchup_resolved','dispatch_stop',stop.id,stop,{sourceRequestId:task.source_request_id},'System')
   result.removed++
  }
  for(const row of candidates){
   if(findBranchServiceDateStop(db,row.branchId,date))continue
   if(promised(row.branchId)){warn(row,'promise');continue}
   if(protectedDay){warn(row,'protected');continue}
   if(!Number.isInteger(row.routeNumber)||row.routeNumber<1||row.routeNumber>5){warn(row,'route');continue}
   const old=db.prepare('SELECT * FROM sunday_catchup_tasks WHERE sunday_date=? AND branch_id=?').get(date,row.branchId)
   // A manually removed or rescheduled Sunday occurrence must never be recreated on refresh.
   const cancelled=db.prepare("SELECT id,superseded_reason FROM dispatch_stops WHERE branch_id=? AND service_date=? AND status='cancelled'").all(row.branchId,date)
   if(old&&old.state!=='resolved'||cancelled.some(s=>s.id!==old?.stop_id||s.superseded_reason!=='sunday_catchup_resolved')){warn(row,'manual');continue}
   const vehicle=db.prepare('SELECT vehicle_id id FROM daily_route_assignments WHERE dispatch_day_id=? AND route_number=?').get(day.id,row.routeNumber)
   let stop
   if(old?.stop_id){
    stop=db.prepare('SELECT * FROM dispatch_stops WHERE id=?').get(old.stop_id)
    if(!stop||stop.status!=='cancelled'||stop.superseded_reason!=='sunday_catchup_resolved'){warn(row,'manual');continue}
    db.prepare("UPDATE dispatch_stops SET status='locked',superseded_reason=NULL,superseded_by=NULL,superseded_at=NULL WHERE id=?").run(stop.id)
   }else stop=create({date,branchId:row.branchCode,changedBy:'System'})
   place({stopId:stop.id,date,vehicleId:vehicle?.id||null,routeNumber:row.routeNumber,changedBy:'System'})
   db.prepare("UPDATE dispatch_stops SET override_note='sunday_catchup' WHERE id=?").run(stop.id)
   db.prepare(`INSERT INTO sunday_catchup_tasks(sunday_date,branch_id,stop_id,source_request_id,state) VALUES(?,?,?,?,'active') ON CONFLICT(sunday_date,branch_id) DO UPDATE SET stop_id=excluded.stop_id,source_request_id=excluded.source_request_id,state='active',updated_at=CURRENT_TIMESTAMP`).run(date,row.branchId,stop.id,row.requestId)
   invalidate(date,'sunday_catchup_added','dispatch_stop',stop.id,null,{sourceRequestId:row.requestId,missedDate:row.sourceDate,routeNumber:row.routeNumber},'System')
   result.added++
  }
  return result
 })
}
