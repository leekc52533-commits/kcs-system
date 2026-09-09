// The production connection is read-only. Legacy service import initialization
// is isolated in a disposable database, never pointed at the production file.
import {DatabaseSync} from 'node:sqlite'
import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {scheduleMatchesDate,validateRecurrenceConfig,parseScheduleWeekdays} from '../shared/scheduleRecurrence.js'
import {addCalendarDays,kuchingDate} from '../shared/kuchingTime.js'
const source=process.env.KCS_DB_PATH
if(!source)throw Error('KCS_DB_PATH required')
const start=process.argv.find(x=>/^\d{4}-\d{2}-\d{2}$/.test(x))||addCalendarDays(kuchingDate(),1)
const temporary=mkdtempSync(path.join(tmpdir(),'kcs-readiness-'))
process.env.KCS_DATA_DIR=temporary;process.env.KCS_DB_PATH=path.join(temporary,'import-only.sqlite')
let db,importDb
try{
 const {getDispatchWeek}=await import('../server/dispatchService.mjs');importDb=(await import('../server/database.mjs')).db
 db=new DatabaseSync(source,{readOnly:true});db.exec('PRAGMA query_only=ON;PRAGMA busy_timeout=10000;BEGIN')
 const week=getDispatchWeek({startDate:start},db)
 const branches=db.prepare("SELECT b.id,b.jodoo_branch_id code,b.branch_name name,b.collection_frequency frequency,b.assigned_weekdays weekdays,b.latitude,b.longitude FROM branches b LEFT JOIN customers c ON c.id=b.customer_id WHERE b.is_active=1 AND b.lifecycle_status='ACTIVE' AND LOWER(b.status)='active' AND COALESCE(c.is_active,1)=1").all()
 const schedules=db.prepare('SELECT * FROM branch_schedules WHERE is_active=1').all(),exceptions=db.prepare('SELECT * FROM schedule_exceptions').all()
 const label=b=>({branch:'B'+String(b.code).replace(/^B/i,''),name:b.name})
 const scheduleIssues=[],onCallOrPaused=[],noFixedRoute=[]
 for(const b of branches){const rows=schedules.filter(s=>s.branch_id===b.id)
 if(rows.length>1)scheduleIssues.push({...label(b),issue:'MULTIPLE_ACTIVE_SCHEDULES',schedules:rows.map(s=>({id:s.jodoo_schedule_id,frequency:s.frequency,weekdays:parseScheduleWeekdays(s.days_of_week)}))})
 if(!rows.length){if(/on.?call|paused/i.test(b.frequency||''))onCallOrPaused.push({...label(b),frequency:b.frequency});else scheduleIssues.push({...label(b),issue:'NO_ACTIVE_SCHEDULE',frequency:b.frequency,weekdays:b.weekdays});continue}
 for(const s of rows){try{const config=validateRecurrenceConfig(s);if(['on_call','paused'].includes(config.recurrenceType)){onCallOrPaused.push({...label(b),frequency:s.frequency});continue}if(!config.weekdays.length&&!config.fixedWeekday)throw Error('No collection weekdays');if(!db.prepare('SELECT 1 FROM weekly_route_plan_stops r JOIN weekly_route_plans p ON p.id=r.plan_id WHERE p.is_active=1 AND r.branch_id=?').get(b.id))noFixedRoute.push(label(b))}catch(e){scheduleIssues.push({...label(b),issue:'INVALID_RECURRENCE',schedule:s.jodoo_schedule_id,detail:e.message})}}
 }
 const accounts=db.prepare('SELECT employee_id,role,is_active,locked_until FROM auth_accounts').all()
 const days=[]
 for(let offset=0;offset<7;offset++){
 const date=addCalendarDays(start,offset),day=week.days.find(d=>d.dispatch_date===date)
 const raw=db.prepare("SELECT s.id,s.branch_id,s.status,s.route_number,s.source_special_request_id,s.override_reason,s.superseded_reason FROM dispatch_stops s JOIN dispatches d ON d.id=s.dispatch_id WHERE COALESCE(s.service_date,d.dispatch_date)=?").all(date),live=raw.filter(s=>s.status!=='cancelled')
 const missing=[],cancelledDue=[],unexpected=[],duplicates=[];const due=new Set()
 for(const b of branches){const expected=schedules.filter(s=>s.branch_id===b.id).some(s=>{const extra=exceptions.some(e=>e.schedule_id===s.id&&e.target_date===date&&['move_date','add_extra_collection','customer_request'].includes(e.exception_type));const removed=exceptions.some(e=>e.schedule_id===s.id&&e.original_date===date&&['move_date','cancel_date','pause_once'].includes(e.exception_type));return !removed&&(extra||scheduleMatchesDate(s,date))})
 if(expected){due.add(b.id);if(!live.some(s=>s.branch_id===b.id)){const cancelled=raw.filter(s=>s.branch_id===b.id&&s.status==='cancelled');if(cancelled.length)cancelledDue.push({...label(b),reasons:cancelled.map(s=>s.superseded_reason)});else missing.push(label(b))}}
 const stops=live.filter(s=>s.branch_id===b.id);if(stops.length>1)duplicates.push({...label(b),stopIds:stops.map(s=>s.id)});if(stops.length&&!expected)unexpected.push({...label(b),stopIds:stops.map(s=>s.id),hasTemporaryOrManualReason:stops.some(s=>s.source_special_request_id||s.override_reason)})
 }
 const vehicles=(day?.vehicleBoards||[]).filter(v=>v.customerCount>0).map(v=>{const ids=[v.driverId,...v.assistantIds].filter(Boolean);return{plate:v.registrationNumber,vehicleId:v.id,stops:v.customerCount,driver:v.driver,driverId:v.driverId,crew:v.assistants.map(a=>a.name),staffIds:ids,staffIssues:ids.flatMap(id=>{const employee=week.employees.find(e=>e.id===id),account=accounts.find(a=>a.employee_id===id);return !employee?[{id,issue:'EMPLOYEE_NOT_ACTIVE'}]:!account||!account.is_active?[{id,name:employee.name,issue:'NO_ACTIVE_LOGIN'}]:account.locked_until&&Date.parse(account.locked_until)>Date.now()?[{id,name:employee.name,issue:'LOGIN_LOCKED'}]:[]}),missingDriver:!v.driverId,missingCrew:!v.assistantIds.length,capacityKg:v.capacityKg,missingWeightCount:v.missingWeightCount,estimatedTotalWeightKg:v.estimatedWeightKg,estimatedDayOverCapacity:v.overCapacity}})
 const staffConflicts=[];for(const id of new Set(vehicles.flatMap(v=>v.staffIds))){const assigned=vehicles.filter(v=>v.staffIds.includes(id));if(assigned.length>1)staffConflicts.push({employeeId:id,vehicles:assigned.map(v=>v.plate)})}
 const visibleIds=new Set(day?.stops.map(s=>s.id)||[])
 days.push({date,dayExists:Boolean(day),dayStatus:day?.status,expectedCustomers:due.size,activeStops:live.length,routes:day?.routeBoards.map(r=>({route:r.name,customers:r.customerCount,plate:r.registrationNumber,approval:r.approvalStatus}))||[],missingDueCustomers:missing,cancelledDueCustomersForReview:cancelledDue,duplicateCustomers:duplicates,stopsOutsideCurrentScheduleForReview:unexpected,unassignedStops:day?.unassignedStops.map(s=>({id:s.id,branch:s.branchId,name:s.branchName}))||[],stopsMissingRoute:live.filter(s=>!s.route_number).map(s=>s.id),stopsNotVisibleInPlanner:live.filter(s=>!visibleIds.has(s.id)).map(s=>s.id),missingGps:day?.stops.filter(s=>!Number.isFinite(s.latitude)||!Number.isFinite(s.longitude)||s.latitude===0||s.longitude===0).map(s=>({branch:s.branchId,name:s.branchName}))||[],vehicles,staffConflicts,specialRequests:day?.specialRequests.map(r=>({id:r.id,status:r.status,branch:r.existingBranchId,requestedDate:r.requestedCollectionDate}))||[]})
 }
 console.log(JSON.stringify({readOnly:true,checkedAt:new Date().toISOString(),startDate:start,endDate:addCalendarDays(start,6),activeBranches:branches.length,scheduleIssues,recurringCustomersWithoutFixedRoute:noFixedRoute,onCallOrPaused,days,integrity:db.prepare('PRAGMA integrity_check').get().integrity_check,foreignKeyErrors:db.prepare('PRAGMA foreign_key_check').all().length},null,2));db.exec('ROLLBACK')
}catch(e){console.error(e.stack);process.exitCode=1}finally{db?.close();importDb?.close();rmSync(temporary,{recursive:true,force:true})}
