import {db as defaultDb} from './database.mjs'
import {normalizeCollectionFrequency} from '../shared/collectionSettings.js'
import {isSundayCustomerAllowed,nextCollectionDate,normalizeRecurrenceConfig,validateRecurrenceConfig} from '../shared/scheduleRecurrence.js'

const text=value=>String(value??'').trim()
const json=value=>JSON.stringify(value??null)
const byId=(database,id)=>database.prepare(`SELECT s.*,b.branch_name,c.name customer_name FROM branch_schedules s JOIN branches b ON b.id=s.branch_id LEFT JOIN customers c ON c.id=b.customer_id WHERE s.id=?`).get(Number(id))

export function configureScheduleRecurrence(scheduleId,payload={},database=defaultDb){
  const before=byId(database,scheduleId)
  if(!before)throw new Error('Schedule not found.')
  const reason=text(payload.reason),changedBy=text(payload.changedBy)||'Supervisor'
  if(!reason)throw new Error('Reason is required.')
  const frequency=normalizeCollectionFrequency(payload.frequency??before.frequency)
  const candidate={
    frequency,
    recurrenceType:payload.recurrenceType,
    intervalWeeks:payload.intervalWeeks,
    anchorDate:payload.anchorDate,
    effectiveDate:payload.effectiveDate,
    monthlyOccurrence:payload.monthlyOccurrence,
    fixedWeekday:payload.fixedWeekday??before.fixed_weekday??before.days_of_week,
  }
  const config=validateRecurrenceConfig(candidate)
  const existingDays=String(before.days_of_week||'').split(/[,;/]/).map(item=>item.trim()).filter(Boolean)
  if(existingDays.length&&config.fixedWeekday&&!existingDays.includes(config.fixedWeekday))throw new Error('Existing Weekday cannot be changed by recurrence configuration.')
  if(config.fixedWeekday==='Sunday'&&!existingDays.includes('Sunday')&&!isSundayCustomerAllowed({customerName:before.customer_name,branchName:before.branch_name}))throw new Error('Sunday is restricted to approved customers.')
  const nextDate=['on_call','paused'].includes(config.recurrenceType)?null:nextCollectionDate(candidate,config.effectiveDate||config.anchorDate||new Date().toISOString().slice(0,10))
  database.exec('BEGIN IMMEDIATE')
  try{
    database.prepare(`UPDATE branch_schedules SET frequency=?,days_of_week=?,recurrence_type=?,interval_weeks=?,anchor_date=?,effective_date=?,monthly_occurrence=?,fixed_weekday=?,next_collection_date=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(
      frequency,['on_call','paused'].includes(config.recurrenceType)?null:(config.fixedWeekday||before.days_of_week),config.recurrenceType,config.intervalWeeks,config.anchorDate,config.effectiveDate,config.monthlyOccurrence,config.fixedWeekday||null,nextDate,Number(scheduleId))
    const after=byId(database,scheduleId)
    database.prepare(`INSERT INTO master_change_history(entity_type,entity_id,change_type,before_json,after_json,reason,changed_by) VALUES('branch_schedule',?,'recurrence_configured',?,?,?,?)`).run(String(scheduleId),json(before),json(after),reason,changedBy)
    database.exec('COMMIT')
    return after
  }catch(error){database.exec('ROLLBACK');throw error}
}

export function getScheduleRecurrence(scheduleId,database=defaultDb){
  const item=byId(database,scheduleId)
  if(!item)throw new Error('Schedule not found.')
  return{...item,normalized:normalizeRecurrenceConfig(item)}
}
