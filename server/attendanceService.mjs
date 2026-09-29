import {kuchingDate} from '../shared/kuchingTime.js'
import {withImmediateTransaction} from './branchServiceDateGuard.mjs'
const fail=(code,statusCode=409)=>{throw Object.assign(Error(code),{code,statusCode})}
const canManage=ctx=>['owner_admin','operations_admin'].includes(ctx?.role)||ctx?.permissions?.includes('employee_manage')
function manager(ctx){if(!canManage(ctx))fail('ATTENDANCE_DENIED',403)}
function employee(db,id){const e=db.prepare("SELECT id FROM employees WHERE id=? AND is_active=1 AND employment_status='active'").get(Number(id));if(!e)fail('ATTENDANCE_DENIED',403);return e.id}
const setting=(db,id)=>db.prepare('SELECT employee_id employeeId,mode,location_id locationId,radius_m radiusM,revision FROM attendance_settings WHERE employee_id=?').get(id)||{employeeId:id,mode:'company',locationId:defaultYard(db),radiusM:200,revision:0}
const yards=db=>db.prepare("SELECT id,name,latitude,longitude FROM operational_locations WHERE is_active=1 AND status='active' AND (operational_type='Company Yard' OR (operational_type IS NULL AND location_type='depot')) ORDER BY name").all()
const defaultYard=db=>{const locations=yards(db);return locations.length===1?locations[0].id:null}
const coordinates=(lat,lng)=>typeof lat==='number'&&Number.isFinite(lat)&&lat>=-90&&lat<=90&&typeof lng==='number'&&Number.isFinite(lng)&&lng>=-180&&lng<=180
export function attendanceSetup(db,ctx,id){manager(ctx);if(!db.prepare('SELECT id FROM employees WHERE id=?').get(Number(id)))fail('ATTENDANCE_DENIED',404);return{...setting(db,Number(id)),locations:yards(db),records:db.prepare('SELECT * FROM attendance_records WHERE employee_id=? ORDER BY work_date DESC LIMIT 31').all(Number(id))}}
export function saveAttendanceSetup(db,ctx,id,p,now=new Date()){manager(ctx);return withImmediateTransaction(db,()=>{
 employee(db,id);const old=setting(db,Number(id));if(p.revision!==old.revision)fail('ATTENDANCE_STALE')
 if(!['home','company'].includes(p.mode)||!Number.isInteger(p.radiusM)||p.radiusM<20||p.radiusM>5000)fail('ATTENDANCE_INVALID',400)
 const location=p.mode==='company'?yards(db).find(l=>l.id===Number(p.locationId||defaultYard(db))):null
 if(p.mode==='company'&&(!location||!coordinates(location.latitude,location.longitude)))fail('ATTENDANCE_LOCATION')
 const timestamp=now.toISOString()
 db.prepare(`INSERT INTO attendance_settings(employee_id,mode,location_id,radius_m,changed_by,changed_at) VALUES(?,?,?,?,?,?) ON CONFLICT(employee_id) DO UPDATE SET mode=excluded.mode,location_id=excluded.location_id,radius_m=excluded.radius_m,revision=revision+1,changed_by=excluded.changed_by,changed_at=excluded.changed_at`).run(Number(id),p.mode,location?.id||null,p.radiusM,ctx.id,timestamp)
 db.prepare('INSERT INTO attendance_settings_history(employee_id,payload_json,changed_by,changed_at) VALUES(?,?,?,?)').run(Number(id),JSON.stringify({before:old,after:setting(db,Number(id))}),ctx.id,timestamp)
 return attendanceSetup(db,ctx,id)
})}
export function attendanceStatus(db,ctx,now=new Date()){
 const id=employee(db,ctx.employeeId),config=setting(db,id),date=kuchingDate(now)
 return{request:db.prepare('SELECT id,status,requested_at,reason FROM attendance_requests WHERE employee_id=? AND work_date=?').get(id,date)||null,date,serverTime:now.toISOString(),configured:Boolean(config.mode),mode:config.mode,record:db.prepare('SELECT id,work_date,clocked_at,mode FROM attendance_records WHERE employee_id=? AND work_date=?').get(id,date)||null}
}
function distance(a,b,c,d){const rad=n=>n*Math.PI/180,x=Math.sin(rad(c-a)/2)**2+Math.cos(rad(a))*Math.cos(rad(c))*Math.sin(rad(d-b)/2)**2;return 6371000*2*Math.atan2(Math.sqrt(x),Math.sqrt(Math.max(0,1-x)))}
export function clockIn(db,ctx,p,now=new Date()){return withImmediateTransaction(db,()=>{
 const state=attendanceStatus(db,ctx,now);if(state.record)return state
 if(!state.configured)fail('ATTENDANCE_SETUP')
 const config=setting(db,ctx.employeeId),age=now.getTime()-Date.parse(p.deviceCapturedAt)
 if(!coordinates(p.latitude,p.longitude)||typeof p.accuracyM!=='number'||!Number.isFinite(p.accuracyM)||p.accuracyM<0||p.accuracyM>100||!Number.isFinite(age)||age>120000||age< -30000)fail('ATTENDANCE_GPS',400)
 const location=config.mode==='company'?yards(db).find(l=>l.id===config.locationId):null
 let meters=null
 if(config.mode==='company'){
  if(!location||!coordinates(location.latitude,location.longitude))fail('ATTENDANCE_LOCATION')
  meters=distance(p.latitude,p.longitude,location.latitude,location.longitude)
  if(p.accuracyM>Math.min(100,config.radiusM/2))fail('ATTENDANCE_GPS',400)
  if(meters>config.radiusM)fail('ATTENDANCE_OUTSIDE')
 }
 db.prepare(`INSERT INTO attendance_records(employee_id,work_date,clocked_at,mode,latitude,longitude,accuracy_m,device_captured_at,location_id,location_name,center_latitude,center_longitude,radius_m,distance_m,account_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(ctx.employeeId,state.date,now.toISOString(),config.mode,p.latitude,p.longitude,p.accuracyM,p.deviceCapturedAt,location?.id||null,location?.name||null,location?.latitude??null,location?.longitude??null,location?config.radiusM:null,meters,ctx.id)
 return attendanceStatus(db,ctx,now)
})}
export function attendanceDaily(db,ctx,date=kuchingDate()){manager(ctx);if(date==='all'){const today=kuchingDate();return{date:today,items:[...db.prepare(`SELECT e.id employeeId,e.name,r.mode,r.work_date,r.clocked_at,r.latitude,r.longitude,r.accuracy_m FROM attendance_records r JOIN employees e ON e.id=r.employee_id ORDER BY r.work_date DESC,e.name`).all(),...attendanceDaily(db,ctx,today).items.filter(r=>!r.clocked_at).map(r=>({...r,work_date:today}))]}}if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T00:00:00Z'))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)fail('ATTENDANCE_INVALID',400);return{date,items:db.prepare(`SELECT e.id employeeId,e.name,COALESCE(r.mode,s.mode,'company') mode,r.clocked_at,r.latitude,r.longitude,r.accuracy_m FROM employees e LEFT JOIN attendance_settings s ON s.employee_id=e.id LEFT JOIN attendance_records r ON r.employee_id=e.id AND r.work_date=? WHERE (e.is_active=1 AND e.employment_status='active') OR r.id IS NOT NULL ORDER BY e.name`).all(date)}}

const canReview=ctx=>['owner_admin','operations_admin','supervisor'].includes(ctx?.role)
export function requestAttendance(db,ctx,p,now=new Date()){return withImmediateTransaction(db,()=>{
 if(!['driver','crew'].includes(ctx?.role))fail('ATTENDANCE_DENIED',403)
 const state=attendanceStatus(db,ctx,now);if(state.record||state.request)return state
 const reason=String(p.reason||'').trim(),age=now.getTime()-Date.parse(p.deviceCapturedAt)
 if(!reason||reason.length>1000)fail('ATTENDANCE_REASON',400)
 if(!coordinates(p.latitude,p.longitude)||!Number.isFinite(p.accuracyM)||p.accuracyM<0||p.accuracyM>100||!Number.isFinite(age)||age>120000||age< -30000)fail('ATTENDANCE_GPS',400)
 db.prepare('INSERT INTO attendance_requests(employee_id,account_id,work_date,requested_at,reason,gps_json) VALUES(?,?,?,?,?,?)').run(ctx.employeeId,ctx.id,state.date,now.toISOString(),reason,JSON.stringify({latitude:p.latitude,longitude:p.longitude,accuracyM:p.accuracyM,deviceCapturedAt:p.deviceCapturedAt}))
 return attendanceStatus(db,ctx,now)
})}
export function attendanceRequests(db,ctx){if(!canReview(ctx))fail('ATTENDANCE_DENIED',403);return {items:db.prepare("SELECT r.*,e.name FROM attendance_requests r JOIN employees e ON e.id=r.employee_id WHERE r.status='pending' ORDER BY r.requested_at,r.id").all()}}
export function reviewAttendance(db,ctx,id,p,now=new Date()){if(!canReview(ctx))fail('ATTENDANCE_DENIED',403);return withImmediateTransaction(db,()=>{
 const r=db.prepare('SELECT * FROM attendance_requests WHERE id=?').get(Number(id))
 if(!r||r.status!=='pending')fail('ATTENDANCE_STALE')
 if(r.account_id===ctx.id||r.employee_id===ctx.employeeId)fail('ATTENDANCE_DENIED',403)
 if(!['approved','rejected'].includes(p.decision))fail('ATTENDANCE_INVALID',400)
 let status=p.decision
 if(db.prepare('SELECT id FROM attendance_records WHERE employee_id=? AND work_date=?').get(r.employee_id,r.work_date))status='superseded'
 if(status==='approved'){
  employee(db,r.employee_id);const g=JSON.parse(r.gps_json)
  db.prepare('INSERT INTO attendance_records(employee_id,work_date,clocked_at,mode,latitude,longitude,accuracy_m,device_captured_at,account_id) VALUES(?,?,?,?,?,?,?,?,?)').run(r.employee_id,r.work_date,r.requested_at,'approved',g.latitude,g.longitude,g.accuracyM,g.deviceCapturedAt,r.account_id)
 }
 db.prepare('UPDATE attendance_requests SET status=?,reviewed_by=?,reviewed_at=? WHERE id=?').run(status,ctx.id,now.toISOString(),r.id)
 return {id:r.id,status}
})}
