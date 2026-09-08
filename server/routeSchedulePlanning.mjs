import {planningDate} from '../shared/planningDates.js'
import {existingRouteEvidence} from './routePlanningEvidence.mjs'
import {parseScheduleWeekdays,recurrenceTypeForFrequency,validateRecurrenceConfig,weekdayName,isSundayCustomerAllowed,nextCollectionDate} from '../shared/scheduleRecurrence.js'
import {addCalendarDays,kuchingDate} from '../shared/kuchingTime.js'
export const WEEKDAYS=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
export function branchRouteRows(db,branchId){return db.prepare('SELECT r.* FROM weekly_route_plan_stops r JOIN weekly_route_plans p ON p.id=r.plan_id WHERE p.is_active=1 AND r.branch_id=? ORDER BY r.weekday,r.stop_sequence').all(branchId)}

// Used inside the schedule transaction: schedule and fixed Route membership commit together.
export function syncScheduleRouteRows(db,branchId,after,routeNumber){
 const plan=db.prepare('SELECT id FROM weekly_route_plans WHERE is_active=1').get();if(!plan)return
 const rows=branchRouteRows(db,branchId),routes=[...new Set(rows.map(r=>r.route_number))]
 const requested=routeNumber==null?null:Number(routeNumber)
 if(requested!=null&&(!Number.isInteger(requested)||requested<1||requested>5))throw new Error('Invalid Route')
 const weekdays=after.weekdays.map(d=>WEEKDAYS.indexOf(d))
 if(weekdays.some(d=>d<0))throw new Error('Invalid weekday')
 const missing=weekdays.filter(d=>!rows.some(r=>r.weekday===d))
 if(missing.length&&routes.length>1&&!requested)throw new Error('此客户属于多条 ROUTE，请在派车中指定新增星期的 ROUTE。')
 const route=requested||routes[0]
 if(missing.length&&!route)throw new Error('请先在派车中选择客户所属 ROUTE。')
 for(const weekday of missing){
  const ref=rows.find(r=>r.route_number===route)||db.prepare('SELECT * FROM weekly_route_plan_stops WHERE plan_id=? AND route_number=? ORDER BY weekday,stop_sequence LIMIT 1').get(plan.id,route)
  if(!ref)throw new Error('所选 ROUTE 尚无基础路线，请先确认路线资料。')
  const seq=db.prepare('SELECT COALESCE(MAX(stop_sequence),0)+1 n FROM weekly_route_plan_stops WHERE plan_id=? AND weekday=? AND (route_number=? OR vehicle_registration_number=?)').get(plan.id,weekday,route,ref.vehicle_registration_number).n
  db.prepare('INSERT INTO weekly_route_plan_stops(plan_id,weekday,branch_id,vehicle_registration_number,trip_number,stop_sequence,zone_name_snapshot,area_name_snapshot,route_number) VALUES(?,?,?,?,?,?,?,?,?)').run(plan.id,weekday,branchId,ref.vehicle_registration_number,1,seq,ref.zone_name_snapshot,ref.area_name_snapshot,route)
 }
 // A pause keeps geographic membership for later resumption, but generates no collections.
 if(!['paused','on_call'].includes(after.recurrenceType))for(const row of rows)if(!weekdays.includes(row.weekday))db.prepare('DELETE FROM weekly_route_plan_stops WHERE plan_id=? AND weekday=? AND branch_id=?').run(plan.id,row.weekday,branchId)
}

export function routeScheduleProposals(db,today=kuchingDate()){
 const result=[]
 const branches=db.prepare("SELECT b.*,c.name customer_name FROM branches b LEFT JOIN customers c ON c.id=b.customer_id WHERE b.lifecycle_status='ACTIVE' AND b.is_active=1 AND LOWER(b.status)='active' AND COALESCE(c.is_active,1)=1").all()
 for(const b of branches){
  const schedules=db.prepare('SELECT * FROM branch_schedules WHERE branch_id=? AND is_active=1').all(b.id),s=schedules[0],type=recurrenceTypeForFrequency(s?.frequency||b.collection_frequency)
  if(['paused','on_call'].includes(type))continue
  let rows=branchRouteRows(db,b.id),inferred=false
  if(!rows.length&&['interval_weeks','monthly'].includes(type)&&b.area_id){
   const areaRows=db.prepare('SELECT r.* FROM weekly_route_plan_stops r JOIN weekly_route_plans p ON p.id=r.plan_id JOIN branches b ON b.id=r.branch_id WHERE p.is_active=1 AND b.area_id=? ORDER BY r.weekday,r.stop_sequence').all(b.area_id)
   if(new Set(areaRows.map(r=>r.route_number)).size===1){rows=areaRows;inferred=true}
  }
  const item={branchId:b.jodoo_branch_id,branchName:b.branch_name,internalBranchId:b.id,frequency:s?.frequency||b.collection_frequency,routeNumber:rows[0]?.route_number,routeSource:inferred?'same_area_suggestion':'current_fixed_route'}
  if(schedules.length>1){result.push({...item,blocked:true,issue:'多份有效收货排程，需要主管核对（未删除或合并）',scheduleEvidence:schedules.map(x=>({scheduleId:x.jodoo_schedule_id,frequency:x.frequency,weekdays:parseScheduleWeekdays(x.days_of_week),anchorDate:planningDate(x.anchor_date),effectiveDate:planningDate(x.effective_date)}))});continue}
  if(!rows.length){const evidence=existingRouteEvidence(db,b);result.push({...item,issue:evidence.message,routeEvidence:evidence});continue}
  const weekdays=[...new Set(rows.map(r=>WEEKDAYS[r.weekday]))]
  if(type==='weekly'){
   const frequencies={1:'Once a week',2:'Twice a week',3:'3 times a week',4:'4 times a week',5:'5 times a week',6:'6 times a week',7:'Daily'}
   if(!frequencies[weekdays.length]){result.push({...item,issue:'路线表每周次数需要核对'});continue}
   const same=s&&JSON.stringify([...parseScheduleWeekdays(s.days_of_week)].sort())===JSON.stringify([...weekdays].sort())&&s.frequency===frequencies[weekdays.length]
   if(!same){
    // Mirror the schedule editor's Sunday rule before classifying an automatic proposal.
    // Existing Sunday schedules are grandfathered; a Route row alone is not approval.
    const previousWeekdays=parseScheduleWeekdays(s?s.days_of_week:b.assigned_weekdays)
    const sundayConflict=weekdays.includes('Sunday')&&!previousWeekdays.includes('Sunday')&&!isSundayCustomerAllowed({customerName:b.customer_name,branchName:b.branch_name})
    result.push({...item,automatic:!sundayConflict,...(sundayConflict?{issueCode:'SUNDAY_REVIEW_REQUIRED',issue:'路线表包含星期日，但现有排程未获星期日许可；保留原排程，请主管核对收货星期'}:{}),proposal:{frequency:frequencies[weekdays.length],weekdays,anchorDate:planningDate(s?.anchor_date)||'',effectiveDate:planningDate(s?.effective_date)||today,monthlyOccurrence:null}})
   }
  }else{
   const oldDay=s?.fixed_weekday||parseScheduleWeekdays(s?.days_of_week)[0],fixed=weekdays.includes(oldDay)?oldDay:weekdays[0]
   const dateFields=['anchor_date','next_take_date','take_date','effective_date']
   const dateWarnings=dateFields.filter(field=>s?.[field]&&!planningDate(s[field])).map(field=>`原${{anchor_date:'周期起算日期',next_take_date:'预计收货日期',take_date:'收货日期',effective_date:'生效日期'}[field]}无效，需要核对`)
   const anchorFields=['anchor_date','next_take_date','take_date']
   const sourceField=anchorFields.find(field=>planningDate(s?.[field]))
   let anchor=sourceField?planningDate(s[sourceField]):null
   const lastRows=db.prepare("SELECT COALESCE(ds.service_date,d.dispatch_date) date FROM dispatch_stops ds JOIN dispatches d ON d.id=ds.dispatch_id WHERE ds.branch_id=? AND ds.status='completed' AND ds.arrived_at IS NOT NULL AND EXISTS(SELECT 1 FROM purchase_bills p WHERE p.dispatch_stop_id=ds.id AND p.status='issued') ORDER BY COALESCE(ds.service_date,d.dispatch_date) DESC").all(b.id)
   const last=lastRows.map(r=>planningDate(r.date)).find(date=>date&&date<today)||null
   const basedOn=anchor?'existing_schedule':last?'last_collection':'proposed_first_date'
   anchor=anchor||last||today
   const originalAnchorDate=anchor
   for(let i=0;i<7&&weekdayName(anchor)!==fixed;i++)anchor=addCalendarDays(anchor,1)
   if(basedOn!=='proposed_first_date'&&originalAnchorDate!==anchor)dateWarnings.push('原起算星期与所属路线不同，已列出对齐路线日的建议，需确认')
   const effective=planningDate(s?.effective_date)||today
   const n=Math.floor((Number(anchor.slice(-2))-1)/7)+1
   const monthlyOccurrence=type==='monthly'?([-1,1,2,3,4].includes(Number(s?.monthly_occurrence))?Number(s.monthly_occurrence):(n===5?-1:n)):null
   const proposal={frequency:type==='monthly'?'Monthly':(/3/.test(item.frequency)?'Every 3 Weeks':'Every 2 Weeks'),weekdays:[fixed],anchorDate:anchor,effectiveDate:effective,monthlyOccurrence}
   const config={...proposal,daysOfWeek:proposal.weekdays}
   let nextDate=null
   try{validateRecurrenceConfig(config);nextDate=nextCollectionDate(config,today)}catch{dateWarnings.push('周期规则需要核对，暂不提供下次日期')}
   let valid=false;try{validateRecurrenceConfig(s||{});valid=!!s&&s.recurrence_type===type&&oldDay===fixed&&!inferred&&dateWarnings.length===0&&(!s.anchor_date||s.anchor_date===planningDate(s.anchor_date))&&(!s.effective_date||s.effective_date===planningDate(s.effective_date))}catch{}
   if(valid)continue
   result.push({...item,automatic:false,issue:'确认低频客户周期及所属 ROUTE',basedOn,sourceField:sourceField||null,originalAnchorDate,lastCollectionDate:last,dateWarnings,nextCollectionDate:nextDate,proposal})
  }
 }
 return result
}
