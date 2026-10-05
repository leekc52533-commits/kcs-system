import {nextCollectionDate,normalizeRecurrenceConfig} from '../shared/scheduleRecurrence.js'
import {addCalendarDays,kuchingDate} from '../shared/kuchingTime.js'

// Only explicit clock values/deadlines are interpreted. Free-form opening hours
// and ambiguous instructions remain visible, but never become invented deadlines.
export function collectionDeadline(value){
 const text=String(value||'').trim().toLowerCase()
 const clock='(\\d{1,2})(?::([0-5]\\d))?\\s*(am|pm)?'
 const match=text.match(new RegExp('^(?:before|by|sebelum|latest|最迟|上午|下午)?\\s*'+clock+'\\s*(?:前)?$'))
 if(!match)return null
 let hour=Number(match[1]);const minute=Number(match[2]||0),period=match[3]
 if(!period&&!match[2]&&!/上午|下午/.test(text))return null
 if(period){if(hour<1||hour>12)return null;hour=hour%12+(period==='pm'?12:0)}
 else if(text.includes('下午')&&hour<12)hour+=12
 if(hour>23)return null
 return `${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`
}

export function dueCustomers(db,{now=new Date()}={}){
 const today=kuchingDate(now),groups=new Map()
 for(const b of db.prepare(`SELECT b.id,b.jodoo_branch_id branchCode,b.branch_name branchName,b.time_restriction timeRestriction,
 b.collection_frequency frequency,b.assigned_weekdays days_of_week,c.name customerName FROM branches b JOIN customers c ON c.id=b.customer_id
 WHERE b.is_active=1 AND b.status='active' AND b.lifecycle_status='ACTIVE' AND c.is_active=1 AND c.status='active'`).all())groups.set(b.id,{...b,stops:[],changes:[],schedules:[],bill:null})
 for(const bill of db.prepare("SELECT id,branch_id branchId,service_date date,bill_number number FROM purchase_bills WHERE status='issued' ORDER BY service_date,id").all())if(groups.has(bill.branchId))groups.get(bill.branchId).bill=bill
 for(const schedule of db.prepare('SELECT * FROM branch_schedules WHERE is_active=1 ORDER BY id').all())groups.get(schedule.branch_id)?.schedules.push(schedule)
 const stops=db.prepare(`SELECT b.id,b.jodoo_branch_id branchCode,b.branch_name branchName,b.time_restriction timeRestriction,
 c.name customerName,s.id evidenceStopId,COALESCE(s.service_date,d.dispatch_date) serviceDate,s.status,
 s.completion_outcome outcome,s.arrived_at arrivedAt,s.completed_at completedAt,s.route_number routeNumber,
 e.name driverName,EXISTS(SELECT 1 FROM purchase_bills p WHERE p.dispatch_stop_id=s.id AND p.status='issued') hasBill
 FROM dispatch_stops s JOIN dispatches d ON d.id=s.dispatch_id JOIN branches b ON b.id=s.branch_id
 JOIN customers c ON c.id=b.customer_id LEFT JOIN employees e ON e.id=d.driver_id
 WHERE b.is_active=1 AND b.status='active' AND b.lifecycle_status='ACTIVE' AND c.is_active=1 AND c.status='active'
 ORDER BY serviceDate,s.id`).all()
 for(const s of stops)groups.get(s.id)?.stops.push(s)
 const changes=db.prepare(`SELECT s.branch_id branchId,r.id,r.dispatch_stop_id sourceStopId,r.target_stop_id targetStopId,
 r.source_date sourceDate,COALESCE(v.approved_date,r.target_date) targetDate,r.reason,r.reviewed_by approvedBy,
 r.reviewed_at approvedAt,r.review_reason reviewReason,e.name employeeName
 FROM driver_date_requests r JOIN dispatch_stops s ON s.id=r.dispatch_stop_id
 LEFT JOIN driver_date_reviews v ON v.request_id=r.id LEFT JOIN employees e ON e.id=r.employee_id
 WHERE r.status='approved' AND r.source_date<>COALESCE(v.approved_date,r.target_date)
 ORDER BY julianday(r.reviewed_at),r.id`).all()
 for(const c of changes)groups.get(c.branchId)?.changes.push(c)
 const result=[]
 for(const b of groups.values()){
  // Only an issued purchase bill resets the collection clock. Trip completion,
  // arrival and approved date requests cannot replace its business service date.
  const lastCollection=b.bill
  let dueDate=null,unknownStatus='schedule_unknown'
  if(lastCollection){
   const schedules=b.schedules.length?b.schedules:[b]
   const dates=[]
   for(const schedule of schedules){
    try{
     const config=normalizeRecurrenceConfig(schedule)
     if(['on_call','paused'].includes(config.recurrenceType)){unknownStatus='on_call';continue}
     // Fixed weekdays/monthly rules stay on their calendar; interval weeks restart
     // from the actual bill date, then use the configured weekday on/after it.
     let date
     if(config.recurrenceType==='interval_weeks'&&[2,3].includes(config.intervalWeeks)&&config.fixedWeekday){
      date=nextCollectionDate({frequency:'Weekly',days_of_week:config.fixedWeekday},addCalendarDays(lastCollection.date,7*config.intervalWeeks))
     }else date=nextCollectionDate({...schedule,effective_date:null,effectiveDate:null,anchor_date:lastCollection.date,anchorDate:lastCollection.date,take_date:null,next_take_date:null},lastCollection.date,{includeFrom:false})
     if(date)dates.push(date)
    }catch{/* Incomplete master schedule: show unknown, never invent a deadline. */}
   }
   dueDate=dates.sort()[0]||null
  }
  if(dueDate&&dueDate>today)continue
  const deadlineTime=collectionDeadline(b.timeRestriction)
  const deadline=dueDate?Date.parse(`${deadlineTime?dueDate:addCalendarDays(dueDate,1)}T${deadlineTime||'00:00'}:00+08:00`):null
  const overdueMinutes=deadline==null?null:Math.max(0,Math.floor((+new Date(now)-deadline)/60000))
  const history=b.changes.filter(c=>!lastCollection||c.sourceDate>=lastCollection.date)
  const planned=b.stops.filter(s=>s.status!=='cancelled'&&s.status!=='completed'&&s.serviceDate>=today)[0]
  const current=planned||b.stops.at(-1)
  const visit=dueDate?b.stops.filter(s=>s.arrivedAt&&s.serviceDate>=dueDate).at(-1):null
  let status=!lastCollection?'no_collection':!dueDate?unknownStatus:+new Date(now)>=deadline?(deadlineTime?'timed_out':'overdue'):'today'
  if(visit)status=['no_goods','no_goods_notice'].includes(visit.outcome)?'arrived_no_goods':'arrived'
  result.push({id:b.id,branchCode:b.branchCode,branchName:b.branchName,customerName:b.customerName,
   dueDate,deadlineTime,timeRestriction:b.timeRestriction,newDate:planned?.serviceDate||null,lastBillNumber:lastCollection?.number||null,
   overdueMinutes,overdueStatus:status,
   lastCollectionDate:lastCollection?.date||null,driverName:current?.driverName||'',
   routeNumbers:current?.routeNumber==null?[]:[current.routeNumber],history,
   visits:b.stops.filter(s=>s.arrivedAt||s.completedAt||s.hasBill).map(s=>({id:s.evidenceStopId,date:s.serviceDate,arrivedAt:s.arrivedAt,completedAt:s.completedAt,
    status:s.hasBill&&s.status==='completed'&&s.outcome==='completed'?'collected':s.arrivedAt?(['no_goods','no_goods_notice'].includes(s.outcome)?'arrived_no_goods':'arrived'):s.hasBill?'bill_record':['no_goods','no_goods_notice'].includes(s.outcome)?'reported_no_goods':'completed_unverified',driverName:s.driverName}))})
 }
 return result.sort((a,b)=>(b.overdueMinutes??-1)-(a.overdueMinutes??-1)||String(a.dueDate||'').localeCompare(b.dueDate||'')||a.branchName.localeCompare(b.branchName))
}
