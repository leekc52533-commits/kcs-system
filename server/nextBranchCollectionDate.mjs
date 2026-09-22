import {nextCollectionDate} from '../shared/scheduleRecurrence.js'

// Read-only suggestion: actual future work plus recurrence with approved exceptions.
export function nextBranchCollectionDate(db,stopId,afterDate){
 const branch=db.prepare('SELECT b.* FROM branches b JOIN dispatch_stops s ON s.branch_id=b.id WHERE s.id=?').get(stopId)
 if(!branch)return null
 const planned=db.prepare("SELECT service_date date,status FROM dispatch_stops WHERE branch_id=? AND service_date>?").all(branch.id,afterDate)
 const unavailable=new Set(planned.filter(s=>['cancelled','completed'].includes(s.status)).map(s=>s.date))
 const dates=planned.filter(s=>!['cancelled','completed'].includes(s.status)).map(s=>s.date)
 if(branch.lifecycle_status==='ACTIVE'&&branch.is_active){
  const schedules=db.prepare('SELECT * FROM branch_schedules WHERE branch_id=? AND is_active=1').all(branch.id)
  for(const schedule of schedules){
   const exceptions=db.prepare('SELECT * FROM schedule_exceptions WHERE schedule_id=?').all(schedule.id)
   const removed=new Set(exceptions.filter(e=>['cancel_date','pause_once','move_date'].includes(e.exception_type)&&e.original_date!==e.target_date).map(e=>e.original_date))
   let next=nextCollectionDate(schedule,afterDate,{includeFrom:false})
   for(let i=0;next&&i<=removed.size+unavailable.size;i++){
    if(!removed.has(next)&&!unavailable.has(next)){dates.push(next);break}
    next=nextCollectionDate(schedule,next,{includeFrom:false})
   }
   for(const e of exceptions)if(e.target_date>afterDate&&['move_date','add_extra_collection','customer_request'].includes(e.exception_type)&&!removed.has(e.target_date)&&!unavailable.has(e.target_date))dates.push(e.target_date)
  }
 }
 return dates.filter(Boolean).sort()[0]||null
}
