import {withImmediateTransaction} from './branchServiceDateGuard.mjs'
const fail=(code,statusCode=400)=>{throw Object.assign(Error(code),{code,statusCode})}
const employee=(db,ctx)=>{if(!['driver','crew'].includes(ctx?.role)||!db.prepare("SELECT id FROM employees WHERE id=? AND is_active=1 AND employment_status='active'").get(ctx.employeeId))fail('LEAVE_DENIED',403);return ctx.employeeId}
const manager=ctx=>{if(!['owner_admin','operations_admin','supervisor'].includes(ctx?.role))fail('LEAVE_DENIED',403)}
const validDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s
export function ownLeave(db,ctx){const id=employee(db,ctx);return{items:db.prepare('SELECT * FROM leave_requests WHERE employee_id=? ORDER BY requested_at DESC,id DESC').all(id)}}
export function requestLeave(db,ctx,p,now=new Date()){return withImmediateTransaction(db,()=>{
 const id=employee(db,ctx),reason=typeof p.reason==='string'?p.reason.trim():''
 if(!validDate(p.startDate)||!validDate(p.endDate)||p.startDate>p.endDate||!reason||reason.length>1000)fail('LEAVE_INVALID')
 const overlap=db.prepare("SELECT * FROM leave_requests WHERE employee_id=? AND status IN ('pending','approved') AND start_date<=? AND end_date>=?").get(id,p.endDate,p.startDate)
 if(overlap){if(overlap.start_date===p.startDate&&overlap.end_date===p.endDate&&overlap.reason===reason)return ownLeave(db,ctx);fail('LEAVE_OVERLAP',409)}
 db.prepare('INSERT INTO leave_requests(employee_id,account_id,start_date,end_date,reason,requested_at) VALUES(?,?,?,?,?,?)').run(id,ctx.id,p.startDate,p.endDate,reason,now.toISOString())
 return ownLeave(db,ctx)
})}
export function pendingLeave(db,ctx,all=false){manager(ctx);return{items:db.prepare("SELECT r.*,e.name FROM leave_requests r JOIN employees e ON e.id=r.employee_id WHERE (?=1 OR r.status='pending') ORDER BY r.requested_at DESC,r.id DESC").all(all?1:0)}}
export function reviewLeave(db,ctx,id,p,now=new Date()){manager(ctx);return withImmediateTransaction(db,()=>{
 const r=db.prepare('SELECT * FROM leave_requests WHERE id=?').get(Number(id))
 if(!r||r.status!=='pending')fail('LEAVE_STALE',409)
 if(r.account_id===ctx.id||r.employee_id===ctx.employeeId)fail('LEAVE_DENIED',403)
 if(!['approved','rejected'].includes(p.decision))fail('LEAVE_INVALID')
 db.prepare('UPDATE leave_requests SET status=?,reviewed_by=?,reviewed_at=? WHERE id=?').run(p.decision,ctx.id,now.toISOString(),r.id)
 return{ id:r.id,status:p.decision }
})}
