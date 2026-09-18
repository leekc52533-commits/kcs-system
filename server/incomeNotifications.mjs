import {kuchingDate,addCalendarDays} from '../shared/kuchingTime.js'
import {earningsReport} from './earningsService.mjs'
const fail=()=>Object.assign(Error('EARN_ACCESS'),{code:'EARN_ACCESS',statusCode:403})
function employee(db,ctx){const e=db.prepare("SELECT id FROM employees WHERE id=? AND is_active=1 AND employment_status='active'").get(Number(ctx.employeeId));if(!e)throw fail();return e.id}
export function generateDailyIncomeNotifications(db,now=new Date()){
 const updateDate=kuchingDate(now),reportDate=addCalendarDays(updateDate,-1),createdAt=new Date(now).toISOString()
 db.exec('BEGIN IMMEDIATE');try{
  const people=db.prepare(`SELECT DISTINCT e.id FROM employees e LEFT JOIN employee_job_roles j ON j.employee_id=e.id WHERE e.is_active=1 AND e.employment_status='active' AND (lower(e.job_role) IN ('driver','crew','assistant','attendant') OR j.role IN ('Driver','Attendant / Crew') OR EXISTS(SELECT 1 FROM cargo_batch_members m WHERE m.employee_id=e.id))`).all()
  let inserted=0
  for(const e of people){if(db.prepare('SELECT 1 FROM income_notifications WHERE employee_id=? AND update_date=?').get(e.id,updateDate))continue
   const report=earningsReport(db,{employeeId:e.id},reportDate,{personal:true}),item=report.items.find(i=>i.employeeId===e.id)
   const summary={period:report.period,driverKg:item?.driverKg||0,crewKg:item?.crewKg||0,pendingKg:item?.pendingKg||0,amount:item?.amount||0,paidAt:item?.paidAt||null,changed:Boolean(item?.changed)}
   db.prepare('INSERT INTO income_notifications(employee_id,update_date,summary_json,created_at) VALUES(?,?,?,?)').run(e.id,updateDate,JSON.stringify(summary),createdAt);inserted++
  }
  db.exec('COMMIT');return{updateDate,inserted}
 }catch(e){db.exec('ROLLBACK');throw e}
}
export function incomeNotifications(db,ctx){const id=employee(db,ctx);return{unread:db.prepare('SELECT COUNT(*) n FROM income_notifications WHERE employee_id=? AND read_at IS NULL').get(id).n,items:db.prepare('SELECT id,update_date updateDate,summary_json summary,created_at createdAt,read_at readAt FROM income_notifications WHERE employee_id=? ORDER BY read_at IS NULL DESC,id DESC LIMIT 60').all(id).map(r=>({...r,summary:JSON.parse(r.summary)}))}}
export function readIncomeNotification(db,ctx,id){const employeeId=employee(db,ctx),r=db.prepare('SELECT id FROM income_notifications WHERE id=? AND employee_id=?').get(Number(id),employeeId);if(!r)throw fail();db.prepare('UPDATE income_notifications SET read_at=COALESCE(read_at,?) WHERE id=? AND employee_id=?').run(new Date().toISOString(),Number(id),employeeId);return{ok:true}}
// Checks every 30 seconds, uses Kuching's date, and catches up once after a restart.
// Unique employee/day keys make duplicate processes and restarts harmless.
export function startIncomeScheduler(db,{now=()=>new Date(),schedule=setInterval,cancel=clearInterval,onError=e=>console.error('[income update]',e.message)}={}){
 let lastDay=null
 const tick=()=>{const value=now(),day=kuchingDate(value);if(day===lastDay)return;try{generateDailyIncomeNotifications(db,value);lastDay=day}catch(e){onError(e)}}
 tick();const timer=schedule(tick,30000);timer?.unref?.();return()=>cancel(timer)
}
