import {sundaySettings} from './sundayPlanning.mjs'
import {planningDate} from '../shared/planningDates.js'
import {syncScheduleRouteRows} from './routeSchedulePlanning.mjs'
import {db as defaultDb} from './database.mjs'
import {normalizeCollectionSettings} from '../shared/collectionSettings.js'
import {isSundayCustomerAllowed,nextCollectionDate,recurrenceTypeForFrequency,intervalWeeksForFrequency,validateRecurrenceConfig} from '../shared/scheduleRecurrence.js'
import {kuchingDate} from '../shared/kuchingTime.js'
import {parseTypedId} from '../shared/typedIds.js'

const activeBranch=`b.lifecycle_status='ACTIVE' AND b.is_active=1 AND LOWER(COALESCE(b.status,'active'))='active'`
const json=value=>JSON.stringify(value)
const branchKey=value=>/^b/i.test(String(value).trim())?parseTypedId(value,'branch'):String(value).trim()
const token=(branch,schedule)=>`${branch.updated_at}|${schedule?.updated_at||'MISSING'}`
const days=value=>normalizeCollectionSettings(null,value).assignedWeekdays
const scheduleState=s=>s?{scheduleId:s.jodoo_schedule_id,frequency:s.frequency,weekdays:days(s.days_of_week),recurrenceType:s.recurrence_type,intervalWeeks:s.interval_weeks,anchorDate:s.anchor_date,effectiveDate:s.effective_date,monthlyOccurrence:s.monthly_occurrence,fixedWeekday:s.fixed_weekday,nextCollectionDate:s.next_collection_date}:null

function branch(database,id){
 const select=`SELECT b.*,c.name customer_name,a.name area,z.name zone FROM branches b LEFT JOIN customers c ON c.id=b.customer_id LEFT JOIN areas a ON a.id=b.area_id LEFT JOIN zone_groups z ON z.id=COALESCE(a.confirmed_zone_group_id,a.zone_group_id) WHERE (${activeBranch})`
 // Internal callers use numeric database IDs; HTTP/string callers use external Branch codes.
 // Never fall back from an external code to an unrelated row's primary key.
 if(typeof id==='number')return Number.isSafeInteger(id)&&id>0?database.prepare(`${select} AND b.id=?`).get(id):null
 const key=branchKey(id).toUpperCase()
 const rows=database.prepare(`${select} AND UPPER(TRIM(b.jodoo_branch_id)) IN (?,?)`).all(key,`B${key}`)
 if(rows.length>1)throw Object.assign(new Error(`Ambiguous Branch code ${String(id)}; review duplicate Branch codes before editing.`),{statusCode:409})
 return rows[0]||null
}
const activeSchedules=(database,id)=>database.prepare('SELECT * FROM branch_schedules WHERE branch_id=? AND is_active=1 ORDER BY id').all(id)
function view(database,b){const sunday=sundaySettings(database,b.id),routeOptions=database.prepare('SELECT d.route_number routeNumber,d.display_name name FROM weekly_route_definitions d JOIN weekly_route_plans p ON p.id=d.plan_id WHERE p.is_active=1 ORDER BY d.route_number').all();const homeRoutes=database.prepare('SELECT DISTINCT r.route_number n FROM weekly_route_plan_stops r JOIN weekly_route_plans p ON p.id=r.plan_id WHERE p.is_active=1 AND r.branch_id=? AND r.weekday<>0').all(b.id);const schedules=activeSchedules(database,b.id),s=schedules[0];return{...sunday,homeRouteNumber:sunday.homeRouteNumber||(homeRoutes.length===1?homeRoutes[0].n:null),routeOptions,internalScheduleId:s?.id||null,scheduleId:s?.jodoo_schedule_id||null,scheduleCount:schedules.length,blocked:schedules.length>1,branchId:b.jodoo_branch_id,branchName:b.branch_name,area:b.area,zone:b.zone,frequency:s?.frequency??b.collection_frequency,weekdays:days(s?.days_of_week??b.assigned_weekdays),recurrenceType:s?.recurrence_type||null,intervalWeeks:s?.interval_weeks||null,anchorDate:s?.anchor_date||null,effectiveDate:s?.effective_date||null,monthlyOccurrence:s?.monthly_occurrence||null,fixedWeekday:s?.fixed_weekday||null,nextCollectionDate:s?.next_collection_date||null,updatedAt:token(b,s)} }

export function listCollectionScheduleManagement(params={},database=defaultDb){const args=[],where=[activeBranch];if(params.search){const search=String(params.search).trim(),branchSearch=search.replace(/^b(?=\d)/i,'');where.push('(b.jodoo_branch_id LIKE ? OR b.jodoo_branch_id LIKE ? OR b.branch_name LIKE ?)');args.push(`%${search}%`,`%${branchSearch}%`,`%${search}%`)}return database.prepare(`SELECT b.id FROM branches b WHERE ${where.join(' AND ')} ORDER BY b.jodoo_branch_id`).all(...args).map(({id})=>view(database,branch(database,id)))}
export function getCollectionScheduleManagement(id,database=defaultDb){const b=branch(database,id);return b?view(database,b):null}

function normalized(payload,before,b){
  for(const field of ['anchorDate','effectiveDate'])if(payload[field]&&!planningDate(payload[field]))throw new Error(`${field} must be a valid calendar date.`)
  payload={...payload,anchorDate:planningDate(payload.anchorDate),effectiveDate:planningDate(payload.effectiveDate)}
  const settings=normalizeCollectionSettings(payload.frequency,payload.weekdays)
  if(!settings.collectionFrequency)throw new Error('Collection Frequency is required.')
  const expected={ 'Once a week':1,'Twice a week':2,'3 times a week':3,'4 times a week':4,'5 times a week':5,'6 times a week':6,Daily:7,'Every 2 Weeks':1,'Every 3 Weeks':1,Monthly:1,'On Call':0,Paused:0}[settings.collectionFrequency]
  if(settings.assignedWeekdays.length!==expected)throw new Error(`${settings.collectionFrequency} requires exactly ${expected} collection weekday${expected===1?'':'s'}.`)
  if(settings.frequencyWarning)throw new Error(settings.frequencyWarning)
  if(settings.assignedWeekdays.includes('Sunday')&&!before?.weekdays.includes('Sunday')&&!isSundayCustomerAllowed({customerName:b.customer_name,branchName:b.branch_name})&&!payload.sundayAuthorized)throw Object.assign(new Error('请由主管确认星期日收货。'),{statusCode:400})
  const recurrenceType=recurrenceTypeForFrequency(settings.collectionFrequency),intervalWeeks=intervalWeeksForFrequency(settings.collectionFrequency),fixedWeekday=settings.assignedWeekdays.length===1?settings.assignedWeekdays[0]:null
  if(payload.recurrenceType&&payload.recurrenceType!==recurrenceType)throw new Error('Recurrence type does not match Collection Frequency.')
  const config=validateRecurrenceConfig({frequency:settings.collectionFrequency,daysOfWeek:settings.assignedWeekdays,recurrenceType,intervalWeeks,anchorDate:payload.anchorDate,effectiveDate:payload.effectiveDate,fixedWeekday,monthlyOccurrence:payload.monthlyOccurrence})
  const after={sundayRouteNumber:payload.sundayRouteNumber==null||payload.sundayRouteNumber===''?null:Number(payload.sundayRouteNumber),frequency:settings.collectionFrequency,weekdays:settings.assignedWeekdays,recurrenceType,intervalWeeks,anchorDate:config.anchorDate,effectiveDate:config.effectiveDate,monthlyOccurrence:config.monthlyOccurrence,fixedWeekday}
  after.nextCollectionDate=['on_call','paused'].includes(recurrenceType)?null:nextCollectionDate({...after,daysOfWeek:after.weekdays},kuchingDate())
  return after
}
function externalId(database,branchId){const base=`KCS-${branchId}`;let candidate=base,index=1;while(database.prepare('SELECT 1 FROM branch_schedules WHERE jodoo_schedule_id=?').get(candidate))candidate=`${base}-${++index}`;return candidate}
function futureStopWarning(database,b,after){const from=after.effectiveDate||after.anchorDate||kuchingDate(),count=database.prepare(`SELECT COUNT(*) n FROM dispatch_stops ds JOIN dispatches d ON d.id=ds.dispatch_id WHERE ds.branch_id=? AND d.dispatch_date>=? AND LOWER(COALESCE(ds.status,'pending')) NOT IN ('cancelled')`).get(b.id,from).n;return{futureStopCount:count,warnings:count?[`${count} existing future Dispatch Stop(s) will be checked against the new schedule; approved or executed records require supervisor review.`]:[]}}

function saveCollectionScheduleManagementInternal(id,payload={},database=defaultDb){const reason=String(payload.reason||'').trim();if(!reason)throw new Error('Reason is required.');const initial=branch(database,id);if(!initial)throw Object.assign(new Error('Active Branch not found.'),{statusCode:404});let schedules=activeSchedules(database,initial.id);if(schedules.length>1)throw Object.assign(new Error('Blocked: Multiple active Schedules exist for this Branch.'),{statusCode:409});payload={...payload,sundayRouteNumber:payload.sundayRouteNumber===undefined?sundaySettings(database,initial.id).sundayRouteNumber??null:payload.sundayRouteNumber};const previousSunday=sundaySettings(database,initial.id);const before={...(scheduleState(schedules[0])||{frequency:initial.collection_frequency,weekdays:days(initial.assigned_weekdays)}),homeRouteNumber:previousSunday.homeRouteNumber||null,sundayRouteNumber:previousSunday.sundayRouteNumber||null};let after;try{after=normalized(payload,before,initial)}catch(e){if(!e.code)e.statusCode=e.statusCode||400;throw e}const impact=futureStopWarning(database,initial,after);if(payload.dryRun===true){database.exec('SAVEPOINT schedule_preview');try{syncScheduleRouteRows(database,initial.id,after,payload.routeNumber);return{dryRun:true,action:schedules.length?'update':'create',before,after,...impact}}finally{database.exec('ROLLBACK TO schedule_preview; RELEASE schedule_preview')}}
  const ownsTransaction=!database.isTransaction;if(ownsTransaction)database.exec('BEGIN IMMEDIATE');try{const current=branch(database,id);schedules=activeSchedules(database,current.id);if(schedules.length>1)throw Object.assign(new Error('Blocked: Multiple active Schedules exist for this Branch.'),{statusCode:409});if(!payload.expectedUpdatedAt||payload.expectedUpdatedAt!==token(current,schedules[0]))throw Object.assign(new Error('Conflict: Branch or Schedule changed. Reload before saving.'),{statusCode:409});
    database.prepare('UPDATE branches SET collection_frequency=?,assigned_weekdays=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(after.frequency,after.weekdays.length?json(after.weekdays):null,current.id)
    let schedule=schedules[0],action='update';if(!schedule){action='create';const result=database.prepare(`INSERT INTO branch_schedules(jodoo_schedule_id,branch_id,source_branch_id,frequency,days_of_week,recurrence_type,interval_weeks,anchor_date,effective_date,monthly_occurrence,fixed_weekday,next_collection_date,is_active) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,1)`).run(externalId(database,current.jodoo_branch_id),current.id,current.jodoo_branch_id,after.frequency,after.weekdays.length?json(after.weekdays):null,after.recurrenceType,after.intervalWeeks,after.anchorDate,after.effectiveDate,after.monthlyOccurrence,after.fixedWeekday,after.nextCollectionDate);schedule=database.prepare('SELECT * FROM branch_schedules WHERE id=?').get(result.lastInsertRowid)}else{database.prepare(`UPDATE branch_schedules SET frequency=?,days_of_week=?,recurrence_type=?,interval_weeks=?,anchor_date=?,effective_date=?,monthly_occurrence=?,fixed_weekday=?,next_collection_date=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(after.frequency,after.weekdays.length?json(after.weekdays):null,after.recurrenceType,after.intervalWeeks,after.anchorDate,after.effectiveDate,after.monthlyOccurrence,after.fixedWeekday,after.nextCollectionDate,schedule.id)}
    syncScheduleRouteRows(database,current.id,after,payload.routeNumber);
    const previous=sundaySettings(database,current.id);database.prepare(`INSERT INTO branch_sunday_settings(branch_id,home_route_number,sunday_route_number,sunday_confirmed,effective_date,updated_by,reason) VALUES(?,?,?,?,?,?,?) ON CONFLICT(branch_id) DO UPDATE SET home_route_number=excluded.home_route_number,sunday_route_number=excluded.sunday_route_number,sunday_confirmed=excluded.sunday_confirmed,effective_date=excluded.effective_date,updated_by=excluded.updated_by,reason=excluded.reason,updated_at=CURRENT_TIMESTAMP`).run(current.id,payload.routeNumber?Number(payload.routeNumber):previous.homeRouteNumber||null,after.sundayRouteNumber,after.weekdays.includes('Sunday')?1:0,after.effectiveDate,payload.changedBy||'Unknown',reason);
    after.homeRouteNumber=payload.routeNumber?Number(payload.routeNumber):previous.homeRouteNumber||null;
    const detail={branchId:current.jodoo_branch_id,scheduleId:schedule.jodoo_schedule_id,action,before,after,reason,changedBy:payload.changedBy};database.prepare(`INSERT INTO master_change_history(entity_type,entity_id,change_type,field_name,before_json,after_json,reason,changed_by) VALUES('branch_schedule',?,?,'collection_schedule',?,?,?,?)`).run(String(schedule.id),`collection_schedule_${action}d`,json(before),json(after),reason,payload.changedBy||'Unknown');database.prepare(`INSERT INTO audit_logs(action,entity_type,entity_id,before_json,after_json) VALUES(?,'branch_schedule',?,?,?)`).run(`collection_schedule_${action}d`,String(schedule.id),json(before),json(detail));if(ownsTransaction)database.exec('COMMIT');return{dryRun:false,action,item:getCollectionScheduleManagement(id,database),before,after,...impact}
  }catch(error){if(ownsTransaction)database.exec('ROLLBACK');throw error}}

export function saveCollectionScheduleManagement(id,payload={},database=defaultDb){
 try{return saveCollectionScheduleManagementInternal(id,payload,database)}catch(error){
  if(error.statusCode===400)error.publicDetails={details:{scheduleValidationMessage:error.message}}
  throw error
 }
}
