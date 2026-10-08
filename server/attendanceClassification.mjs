import {kuchingDate} from '../shared/kuchingTime.js'

// Absence requires affirmative work-day evidence, never just missing GPS or a record.
export function classifyAttendance(row,date,today,{availability,leave,pendingLeave,assigned=false,pendingClock=false}={}){
 const start=availability?.status==='available'&&/^\d{2}:\d{2}$/.test(availability.start_time||'')?availability.start_time:'08:00'
 if(row.clocked_at){
  const time=new Date(row.clocked_at).getTime(),deadline=Date.parse(`${date}T${start}:00+08:00`)
  return Number.isFinite(time)?(time>deadline?'late':'on_time'):'review'
 }
 if(leave||availability?.status==='leave')return 'leave'
 if(availability?.status==='off_duty')return 'rest'
 if(pendingLeave||pendingClock||availability?.status==='excluded')return 'review'
 if(date>=today)return 'not_clocked'
 return availability?.status==='available'||assigned?'absent':'review'
}

export function attendanceEvidence(db,now=new Date()){
 const today=kuchingDate(now),key=(id,date)=>`${id}:${date}`
 const availability=new Map(db.prepare('SELECT * FROM route_employee_availability').all().map(r=>[key(r.employee_id,r.availability_date),r]))
 const leaves=db.prepare("SELECT employee_id,start_date,end_date,status FROM leave_requests WHERE status IN ('approved','pending')").all()
 const assigned=new Set(db.prepare(`SELECT d.driver_id employee_id,d.dispatch_date date FROM dispatches d JOIN dispatch_trips t ON t.dispatch_id=d.id JOIN dispatch_days day ON day.id=t.dispatch_day_id WHERE day.status IN ('approved','published','in_progress','completed')
 UNION SELECT d.assistant_id,d.dispatch_date FROM dispatches d JOIN dispatch_trips t ON t.dispatch_id=d.id JOIN dispatch_days day ON day.id=t.dispatch_day_id WHERE day.status IN ('approved','published','in_progress','completed')
 UNION SELECT a.employee_id,day.dispatch_date FROM dispatch_vehicle_assistants a JOIN dispatch_days day ON day.id=a.dispatch_day_id WHERE day.status IN ('approved','published','in_progress','completed')`).all().filter(r=>r.employee_id).map(r=>key(r.employee_id,r.date)))
 const pending=new Set(db.prepare("SELECT employee_id,work_date FROM attendance_requests WHERE status='pending'").all().map(r=>key(r.employee_id,r.work_date)))
 return {today,availability,leaves,assigned,classify(row,date){const id=row.employeeId,k=key(id,date),matching=leaves.filter(l=>l.employee_id===id&&l.start_date<=date&&l.end_date>=date);return classifyAttendance(row,date,today,{availability:availability.get(k),leave:matching.some(l=>l.status==='approved'),pendingLeave:matching.some(l=>l.status==='pending'),assigned:assigned.has(k),pendingClock:pending.has(k)})}}
}
