import {db as defaultDb} from './database.mjs'
import {canUseCustomerWorkspace} from './customerWorkspaceService.mjs'
import {kuchingDate} from '../shared/kuchingTime.js'
import {nextCollectionDate,parseScheduleWeekdays} from '../shared/scheduleRecurrence.js'

const parse=v=>{try{return JSON.parse(v)||{}}catch{return {}}}
const fields={frequency:'frequency',collection_frequency:'frequency',collectionFrequency:'frequency',weekdays:'weekdays',days_of_week:'weekdays',assigned_weekdays:'weekdays',assignedWeekdays:'weekdays',effective_date:'effectiveDate',effectiveDate:'effectiveDate',anchor_date:'anchorDate',anchorDate:'anchorDate',interval_weeks:'intervalWeeks',intervalWeeks:'intervalWeeks',monthly_occurrence:'monthlyOccurrence',monthlyOccurrence:'monthlyOccurrence',route_number:'routeNumber',routeNumber:'routeNumber',homeRouteNumber:'homeRouteNumber',sundayRouteNumber:'sundayRouteNumber',original_date:'sourceDate',originalDate:'sourceDate',source_date:'sourceDate',sourceDate:'sourceDate',target_date:'targetDate',targetDate:'targetDate',service_date:'serviceDate',serviceDate:'serviceDate',dispatch_date:'serviceDate',date:'serviceDate',time_restriction:'timeConstraint',collectionTimeConstraint:'timeConstraint',status:'status',is_active:'active',scope:'scope'}
// Explicit allowlist: never send entire customer/dispatch snapshots (prices, contacts, proofs).
export function collectionSnapshot(value){const v=typeof value==='string'?parse(value):value;if(!v||typeof v!=='object'||Array.isArray(v))return {};const out={};for(const [k,to] of Object.entries(fields))if(Object.hasOwn(v,k))out[to]=to==='weekdays'?parseScheduleWeekdays(v[k]):v[k];return out}
export function collectionHistory(params,actor,database=defaultDb){
 if(!canUseCustomerWorkspace(actor))throw Object.assign(new Error('Customer management permission required.'),{statusCode:403})
 const code=String(params.branchId||'').trim().replace(/^B/i,'');if(!code)throw Object.assign(new Error('Branch required'),{statusCode:400})
 const matches=database.prepare(`SELECT b.*,c.name customerName,c.status customerStatus,c.is_active customerActive FROM branches b LEFT JOIN customers c ON c.id=b.customer_id WHERE UPPER(TRIM(b.jodoo_branch_id)) IN (?,?)`).all(code.toUpperCase(),'B'+code.toUpperCase())
 if(matches.length!==1)throw Object.assign(new Error('Branch missing or ambiguous'),{statusCode:matches.length?409:404})
 const b=matches[0],today=kuchingDate(),schedules=database.prepare('SELECT * FROM branch_schedules WHERE branch_id=? ORDER BY id').all(b.id)
 const enabled=b.status==='active'&&b.is_active===1&&b.lifecycle_status==='ACTIVE'&&(!b.customer_id||(b.customerStatus==='active'&&b.customerActive===1))
 const routes=database.prepare(`SELECT DISTINCT r.weekday,d.route_number routeNumber,d.display_name name FROM weekly_route_plan_stops r JOIN weekly_route_plans p ON p.id=r.plan_id JOIN weekly_route_definitions d ON d.plan_id=p.id AND d.route_number=r.route_number WHERE p.is_active=1 AND r.branch_id=? ORDER BY r.weekday,d.route_number`).all(b.id)
 const active=schedules.filter(s=>s.is_active===1).map(s=>{let next=null;try{if(enabled)next=nextCollectionDate({...s,daysOfWeek:s.days_of_week},today)}catch{}return{scheduleId:s.jodoo_schedule_id,...collectionSnapshot(s),nextFixedDate:next}})
 const upcoming=database.prepare(`SELECT ds.id,COALESCE(ds.service_date,d.dispatch_date) date,ds.route_number routeNumber,ds.status FROM dispatch_stops ds JOIN dispatches d ON d.id=ds.dispatch_id WHERE ds.branch_id=? AND COALESCE(ds.service_date,d.dispatch_date)>=? AND ds.status NOT IN ('cancelled','completed','superseded') ORDER BY date,ds.id LIMIT 30`).all(b.id,today)
 const events=[],push=e=>events.push({before:{},after:{},...e}),employees=new Map(database.prepare('SELECT id,name FROM employees').all().map(e=>[String(e.id),e.name])),person=v=>employees.get(String(v))||String(v||'')
 const branchKeys=new Set([b.jodoo_branch_id,code,'B'+code])
 for(const h of database.prepare("SELECT * FROM master_change_history WHERE entity_type IN ('branch','branch_schedule') ORDER BY changed_at DESC,id DESC").all()){
  const scheduleMatch=h.change_type.startsWith('collection_schedule_')?schedules.some(s=>String(s.id)===h.entity_id):schedules.some(s=>s.jodoo_schedule_id===h.entity_id)
  if(h.entity_type==='branch'?!branchKeys.has(h.entity_id):!scheduleMatch)continue
  const before=collectionSnapshot(h.before_json),after=collectionSnapshot(h.after_json)
  if(fields[h.field_name]){before[fields[h.field_name]]=h.old_value;after[fields[h.field_name]]=h.new_value}
  if(!Object.keys(before).length&&!Object.keys(after).length)continue
  if(JSON.stringify(before)===JSON.stringify(after))continue
  push({id:'master-'+h.id,type:'master',time:h.changed_at,actor:person(h.changed_by),reason:h.reason,before,after,status:'recorded',scope:h.entity_type==='branch_schedule'?'permanent':'',reference:h.change_type})
 }
 const requests=database.prepare(`SELECT r.*,v.approved_date,v.route_number,v.scope,v.schedule_before_json,v.schedule_after_json,e.name requester FROM driver_date_requests r JOIN dispatch_stops ds ON ds.id=r.dispatch_stop_id LEFT JOIN driver_date_reviews v ON v.request_id=r.id LEFT JOIN employees e ON e.id=r.employee_id WHERE ds.branch_id=? ORDER BY r.id DESC`).all(b.id)
 for(const r of requests)push({id:'request-'+r.id,type:'request',time:r.reviewed_at||r.requested_at,requestedAt:r.requested_at,actor:r.requester,reviewer:person(r.reviewed_by),reviewedAt:r.reviewed_at,reason:r.reason,reviewReason:r.review_reason,status:r.status,scope:r.scope||'',before:{...collectionSnapshot(r.schedule_before_json),sourceDate:r.source_date},after:{...collectionSnapshot(r.schedule_after_json),requestedDate:r.target_date,...(r.status==='approved'?{approvedDate:r.approved_date||r.target_date,routeNumber:r.route_number}:{})}})
 for(const e of database.prepare('SELECT * FROM schedule_exceptions WHERE branch_id=? ORDER BY id DESC').all(b.id)){
  // An approved request already carries the exception plus its requester/reviewer.
  if(requests.some(r=>r.status==='approved'&&r.source_date===e.original_date&&(r.approved_date||r.target_date)===e.target_date&&r.reviewed_at===e.created_at))continue
  push({id:'exception-'+e.id,type:'exception',time:e.created_at,actor:person(e.created_by),reason:e.reason,status:'recorded',scope:e.permanent?'permanent':'once',before:{sourceDate:e.original_date},after:{targetDate:e.target_date},reference:e.exception_type})
 }
 const stopIds=new Set(database.prepare('SELECT id FROM dispatch_stops WHERE branch_id=?').all(b.id).map(s=>String(s.id))),scheduleIds=new Set(schedules.map(s=>String(s.id)))
 for(const h of database.prepare("SELECT * FROM dispatch_change_logs WHERE entity_type IN ('dispatch_stop','branch','schedule') ORDER BY created_at DESC,id DESC").all()){
  if(!(h.entity_type==='dispatch_stop'?stopIds.has(h.entity_id):h.entity_type==='branch'?h.entity_id===String(b.id):scheduleIds.has(h.entity_id)))continue
  const before=collectionSnapshot(h.before_json),after=collectionSnapshot(h.after_json);if(!Object.keys(before).length&&!Object.keys(after).length)continue
  push({id:'dispatch-'+h.id,type:'dispatch',time:h.created_at,actor:person(h.actor),reason:parse(h.after_json).reason||'',before,after,status:'recorded',reference:h.change_type})
 }
 for(const key of ['from','to'])if(params[key]&&!/^\d{4}-\d{2}-\d{2}$/.test(params[key]))throw Object.assign(new Error('Invalid date'),{statusCode:400})
 const localDate=t=>database.prepare("SELECT date(?,'+8 hours') date").get(t).date
 const history=events.filter(e=>(!params.from||localDate(e.time)>=params.from)&&(!params.to||localDate(e.time)<=params.to)).sort((a,b)=>b.time.localeCompare(a.time)||b.id.localeCompare(a.id))
 return {branch:{branchId:b.jodoo_branch_id,branchName:b.branch_name,customerName:b.customerName,status:b.status,customerStatus:b.customerStatus,enabled,timeConstraint:b.time_restriction},current:active,routes,upcoming,history}
}
