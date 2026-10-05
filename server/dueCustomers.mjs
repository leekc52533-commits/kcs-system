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
 const stops=db.prepare(`SELECT b.id,b.jodoo_branch_id branchCode,b.branch_name branchName,b.time_restriction timeRestriction,
 c.name customerName,s.id evidenceStopId,COALESCE(s.service_date,d.dispatch_date) serviceDate,s.status,
 s.completion_outcome outcome,s.arrived_at arrivedAt,s.completed_at completedAt,s.route_number routeNumber,
 e.name driverName,EXISTS(SELECT 1 FROM purchase_bills p WHERE p.dispatch_stop_id=s.id AND p.status='issued') hasBill
 FROM dispatch_stops s JOIN dispatches d ON d.id=s.dispatch_id JOIN branches b ON b.id=s.branch_id
 JOIN customers c ON c.id=b.customer_id LEFT JOIN employees e ON e.id=d.driver_id
 WHERE b.is_active=1 AND b.status='active' AND b.lifecycle_status='ACTIVE' AND c.is_active=1 AND c.status='active'
 ORDER BY serviceDate,s.id`).all()
 for(const s of stops){if(!groups.has(s.id))groups.set(s.id,{...s,stops:[],changes:[]});groups.get(s.id).stops.push(s)}
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
  // Arrival or a valid bill is evidence against "no arrival record", even if a
  // collector has not completed the trip. Only completed + issued means collected.
  const evidence=b.stops.filter(s=>s.arrivedAt||s.hasBill)
  const lastEvidence=evidence.reduce((last,s)=>s.serviceDate>last?s.serviceDate:last,'')
  const lastCollection=b.stops.filter(s=>s.status==='completed'&&s.outcome==='completed'&&s.completedAt&&s.hasBill).at(-1)
  const candidates=b.stops.filter(s=>s.status!=='cancelled'&&!s.arrivedAt&&!s.hasBill).map(s=>({date:s.serviceDate,stop:s}))
  for(const c of b.changes){const s=b.stops.find(s=>s.evidenceStopId===c.sourceStopId);if(s)candidates.push({date:c.sourceDate,stop:s})}
  const original=candidates.filter(x=>/^\d{4}-\d{2}-\d{2}$/.test(x.date||'')&&x.date<=today&&x.date>lastEvidence).sort((a,b)=>a.date.localeCompare(b.date))[0]
  if(!original)continue
  const deadlineTime=collectionDeadline(b.timeRestriction)
  const deadline=Date.parse(`${deadlineTime?original.date:addCalendarDays(original.date,1)}T${deadlineTime||'00:00'}:00+08:00`)
  const overdueMinutes=Math.max(0,Math.floor((+new Date(now)-deadline)/60000))
  const history=b.changes.filter(c=>c.sourceDate>=original.date)
  const latest=history.at(-1)
  const current=b.stops.find(s=>s.evidenceStopId===latest?.targetStopId)||original.stop
  result.push({id:b.id,branchCode:b.branchCode,branchName:b.branchName,customerName:b.customerName,
   originalDate:original.date,deadlineTime,timeRestriction:b.timeRestriction,newDate:latest?.targetDate||original.date,
   overdueMinutes,overdueStatus:+new Date(now)>=deadline?(deadlineTime?'timed_out':'overdue'):'today',
   lastCollectionDate:lastCollection?.serviceDate||null,driverName:current.driverName||original.stop.driverName||'',
   routeNumbers:current.routeNumber==null?[]:[current.routeNumber],history,
   visits:b.stops.filter(s=>s.arrivedAt||s.completedAt||s.hasBill).map(s=>({id:s.evidenceStopId,date:s.serviceDate,arrivedAt:s.arrivedAt,completedAt:s.completedAt,
    status:s.hasBill&&s.status==='completed'&&s.outcome==='completed'?'collected':s.arrivedAt?(['no_goods','no_goods_notice'].includes(s.outcome)?'arrived_no_goods':'arrived'):s.hasBill?'bill_record':['no_goods','no_goods_notice'].includes(s.outcome)?'reported_no_goods':'completed_unverified',driverName:s.driverName}))})
 }
 return result.sort((a,b)=>b.overdueMinutes-a.overdueMinutes||a.originalDate.localeCompare(b.originalDate)||a.branchName.localeCompare(b.branchName))
}
