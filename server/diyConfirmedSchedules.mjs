import {syncScheduleRouteRows} from './routeSchedulePlanning.mjs'
import {nextCollectionDate,parseScheduleWeekdays} from '../shared/scheduleRecurrence.js'
import {kuchingDate} from '../shared/kuchingTime.js'
const plan=[
 {code:'10389',name:'DIY TEBEDU',keep:'10422',retire:'10419',oldKeep:['Monday','Thursday'],oldRetire:['Tuesday','Friday'],frequency:'Every 2 Weeks',weekdays:['Thursday'],recurrenceType:'interval_weeks',intervalWeeks:2,anchorDate:'2026-09-17',effectiveDate:'2026-09-09'},
 {code:'10408',name:'DIY SJC',keep:'10414',retire:'10423',oldKeep:['Monday','Thursday'],oldRetire:['Wednesday','Saturday'],frequency:'Twice a week',weekdays:['Monday','Thursday'],recurrenceType:'weekly',intervalWeeks:null,anchorDate:null,effectiveDate:'2026-09-09'}
]
const reason='KC confirmed: B10389 every 2 weeks Thursday starting 2026-09-17; B10408 Monday and Thursday. Retain superseded history.'
const sameDays=(a,b)=>JSON.stringify([...parseScheduleWeekdays(a)].sort())===JSON.stringify([...b].sort())
export function applyDiyConfirmedSchedules(db,{apply=false,today=kuchingDate()}={}){
 const output=[];db.exec('BEGIN IMMEDIATE')
 try{
 for(const p of plan){
 const branches=db.prepare("SELECT * FROM branches WHERE UPPER(TRIM(jodoo_branch_id)) IN (?,?)").all(p.code,'B'+p.code)
 if(branches.length!==1||branches[0].branch_name!==p.name||branches[0].is_active!==1)throw Error('Branch identity changed: '+p.code)
 const branch=branches[0],rows=db.prepare('SELECT * FROM branch_schedules WHERE branch_id=? ORDER BY id').all(branch.id),keep=rows.find(s=>s.jodoo_schedule_id===p.keep),retire=rows.find(s=>s.jodoo_schedule_id===p.retire),active=rows.filter(s=>s.is_active===1)
 if(!keep||!retire)throw Error('Schedule identity changed: '+p.code)
 const already=active.length===1&&active[0].id===keep.id&&retire.is_active===0&&retire.superseded_by_schedule_id===keep.id&&keep.frequency===p.frequency&&sameDays(keep.days_of_week,p.weekdays)&&keep.anchor_date===p.anchorDate&&keep.effective_date===p.effectiveDate
 if(already){output.push({branch:p.code,status:'already_applied'});continue}
 if(active.length!==2||!keep.is_active||!retire.is_active||keep.frequency!=='Weekly'||retire.frequency!=='Weekly'||!sameDays(keep.days_of_week,p.oldKeep)||!sameDays(retire.days_of_week,p.oldRetire)||keep.updated_at!=='2026-07-19 10:07:16'||retire.updated_at!=='2026-07-19 10:07:16')throw Error('Schedule changed since KC review: '+p.code)
 const after={...p,fixedWeekday:p.weekdays.length===1?p.weekdays[0]:null,monthlyOccurrence:null};after.nextCollectionDate=nextCollectionDate({...after,daysOfWeek:p.weekdays},today)
 db.prepare('UPDATE branch_schedules SET is_active=0,superseded_by_schedule_id=?,superseded_reason=?,superseded_at=CURRENT_TIMESTAMP,superseded_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(keep.id,reason,'KC',retire.id)
 db.prepare('UPDATE branch_schedules SET frequency=?,days_of_week=?,recurrence_type=?,interval_weeks=?,anchor_date=?,effective_date=?,monthly_occurrence=NULL,fixed_weekday=?,next_collection_date=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(p.frequency,JSON.stringify(p.weekdays),p.recurrenceType,p.intervalWeeks,p.anchorDate,p.effectiveDate,after.fixedWeekday,after.nextCollectionDate,keep.id)
 db.prepare('UPDATE branches SET collection_frequency=?,assigned_weekdays=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(p.frequency,JSON.stringify(p.weekdays),branch.id)
 syncScheduleRouteRows(db,branch.id,after)
 const before=JSON.stringify({branch,schedules:rows}),saved=JSON.stringify({after,retired:p.retire,reason,changedBy:'KC'})
 db.prepare("INSERT INTO master_change_history(entity_type,entity_id,change_type,field_name,before_json,after_json,reason,changed_by) VALUES('branch_schedule',?,'confirmed_duplicate_resolution','collection_schedule',?,?,?,'KC')").run(String(keep.id),before,saved,reason)
 db.prepare("INSERT INTO audit_logs(action,entity_type,entity_id,before_json,after_json) VALUES('confirmed_duplicate_resolution','branch_schedule',?,?,?)").run(String(keep.id),before,saved)
 const existingStops=db.prepare("SELECT ds.id,ds.status,ds.source_schedule_id,COALESCE(ds.service_date,d.dispatch_date) serviceDate FROM dispatch_stops ds LEFT JOIN dispatches d ON d.id=ds.dispatch_id WHERE ds.branch_id=? AND COALESCE(ds.service_date,d.dispatch_date)>=? AND ds.status<>'cancelled'").all(branch.id,today)
 output.push({branch:'B'+p.code,name:p.name,kept:p.keep,retired:p.retire,frequency:p.frequency,weekdays:p.weekdays,anchorDate:p.anchorDate,nextCollectionDate:after.nextCollectionDate,existingStopsForSupervisorReview:existingStops})
 }
 if(db.prepare('PRAGMA foreign_key_check').all().length)throw Error('Foreign key check failed')
 db.exec(apply?'COMMIT':'ROLLBACK');return{applied:apply,items:output}
 }catch(error){db.exec('ROLLBACK');throw error}
}
