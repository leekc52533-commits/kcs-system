export const RECURRENCE_TYPES=['weekly','interval_weeks','monthly','on_call','paused']
export const MONTHLY_OCCURRENCES=[1,2,3,4,-1]
export const MONTHLY_OCCURRENCE_LABELS={1:'First',2:'Second',3:'Third',4:'Fourth','-1':'Last'}

const DAYS=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
const clean=value=>String(value??'').trim()
const key=value=>clean(value).toLowerCase().replace(/[’']/g,"'").replace(/\s+/g,' ')
const dateOnly=value=>{const text=clean(value);return /^\d{4}-\d{2}-\d{2}(?:T|$)/.test(text)?text.slice(0,10):null}
const dateObject=value=>{const iso=dateOnly(value);return iso?new Date(`${iso}T00:00:00Z`):null}
const addDays=(value,count)=>{const date=dateObject(value);if(!date)return null;date.setUTCDate(date.getUTCDate()+count);return date.toISOString().slice(0,10)}
const compare=(a,b)=>String(a).localeCompare(String(b))
const daysBetween=(a,b)=>(dateObject(b)-dateObject(a))/86400000
export const weekdayName=value=>{const date=dateObject(value);return date?DAYS[date.getUTCDay()]:null}

export function parseScheduleWeekdays(value){
  if(Array.isArray(value))return [...new Set(value.map(clean).filter(x=>DAYS.includes(x)))]
  if(!clean(value))return[]
  try{const parsed=JSON.parse(value);if(Array.isArray(parsed))return parseScheduleWeekdays(parsed)}catch{}
  return [...new Set(clean(value).replace(/^\[|\]$/g,'').split(/[,;/]/).map(x=>x.replaceAll('"','').trim()).filter(x=>DAYS.includes(x)))]
}

export function recurrenceTypeForFrequency(frequency){
  const value=key(frequency)
  if(['on call','on-call','call'].includes(value))return'on_call'
  if(value==='paused')return'paused'
  if(['every 2 weeks','2 weeks','biweekly','fortnightly'].includes(value))return'interval_weeks'
  if(['every 3 weeks','3 weeks'].includes(value))return'interval_weeks'
  if(value==='monthly')return'monthly'
  return'weekly'
}

export function intervalWeeksForFrequency(frequency){
  const value=key(frequency)
  if(['every 2 weeks','2 weeks','biweekly','fortnightly'].includes(value))return 2
  if(['every 3 weeks','3 weeks'].includes(value))return 3
  return null
}

export function normalizeMonthlyOccurrence(value){
  if(value==null||value==='')return null
  const aliases={first:1,second:2,third:3,fourth:4,last:-1}
  const normalized=aliases[key(value)]??Number(value)
  if(!MONTHLY_OCCURRENCES.includes(normalized))throw new Error('Monthly occurrence must be First, Second, Third, Fourth, or Last.')
  return normalized
}

export function monthlyWeekdayDate(year,monthIndex,weekday,occurrence){
  if(!DAYS.includes(weekday))throw new Error(`Invalid fixed weekday "${weekday}".`)
  const normalized=normalizeMonthlyOccurrence(occurrence)
  if(normalized==null)throw new Error('Monthly occurrence is required.')
  const weekdayIndex=DAYS.indexOf(weekday)
  if(normalized===-1){
    const last=new Date(Date.UTC(year,monthIndex+1,0))
    const offset=(last.getUTCDay()-weekdayIndex+7)%7
    last.setUTCDate(last.getUTCDate()-offset)
    return last.toISOString().slice(0,10)
  }
  const first=new Date(Date.UTC(year,monthIndex,1))
  const offset=(weekdayIndex-first.getUTCDay()+7)%7
  first.setUTCDate(1+offset+(normalized-1)*7)
  if(first.getUTCMonth()!==monthIndex)throw new Error('The requested monthly occurrence does not exist in this month.')
  return first.toISOString().slice(0,10)
}

export function normalizeRecurrenceConfig(schedule={}){
  const frequency=clean(schedule.frequency)
  const recurrenceType=clean(schedule.recurrence_type||schedule.recurrenceType)||recurrenceTypeForFrequency(frequency)
  if(!RECURRENCE_TYPES.includes(recurrenceType))throw new Error(`Invalid recurrence type "${recurrenceType}".`)
  const weekdays=parseScheduleWeekdays(schedule.fixed_weekday||schedule.fixedWeekday||schedule.days_of_week||schedule.daysOfWeek)
  const fixedWeekday=clean(schedule.fixed_weekday||schedule.fixedWeekday)||(weekdays.length===1?weekdays[0]:'')
  const intervalWeeks=Number(schedule.interval_weeks??schedule.intervalWeeks??intervalWeeksForFrequency(frequency))||null
  const anchorDate=dateOnly(schedule.anchor_date||schedule.anchorDate||schedule.next_take_date||schedule.nextTakeDate||schedule.take_date||schedule.takeDate)
  const effectiveDate=dateOnly(schedule.effective_date||schedule.effectiveDate)||anchorDate
  const monthlyOccurrence=normalizeMonthlyOccurrence(schedule.monthly_occurrence??schedule.monthlyOccurrence)
  return{frequency,recurrenceType,weekdays,fixedWeekday,intervalWeeks,anchorDate,effectiveDate,monthlyOccurrence}
}

export function validateRecurrenceConfig(schedule={}){
  const config=normalizeRecurrenceConfig(schedule)
  if(['on_call','paused'].includes(config.recurrenceType))return config
  if(config.recurrenceType==='weekly')return config
  if(!config.fixedWeekday||!DAYS.includes(config.fixedWeekday))throw new Error('A valid fixed weekday is required for interval or monthly recurrence.')
  if(!config.anchorDate)throw new Error('Anchor Date is required for interval or monthly recurrence.')
  if(config.recurrenceType==='interval_weeks'){
    if(![2,3].includes(config.intervalWeeks))throw new Error('Interval Weeks must be 2 or 3.')
    if(weekdayName(config.anchorDate)!==config.fixedWeekday)throw new Error('Anchor Date must fall on the fixed weekday.')
  }
  if(config.recurrenceType==='monthly'&&config.monthlyOccurrence==null)throw new Error('Monthly occurrence is required.')
  return config
}

export function scheduleMatchesDate(schedule,date){
  const target=dateOnly(date);if(!target)return false
  let config
  try{config=normalizeRecurrenceConfig(schedule)}catch{return false}
  if(['on_call','paused'].includes(config.recurrenceType))return false
  const start=[config.anchorDate,config.effectiveDate].filter(Boolean).sort(compare).at(-1)
  if(start&&compare(target,start)<0)return false
  if(config.recurrenceType==='weekly')return config.weekdays.includes(weekdayName(target))
  try{validateRecurrenceConfig(schedule)}catch{return false}
  if(config.recurrenceType==='interval_weeks'){
    if(weekdayName(target)!==config.fixedWeekday)return false
    const elapsed=daysBetween(config.anchorDate,target)
    return elapsed>=0&&elapsed%(config.intervalWeeks*7)===0
  }
  const value=dateObject(target)
  return monthlyWeekdayDate(value.getUTCFullYear(),value.getUTCMonth(),config.fixedWeekday,config.monthlyOccurrence)===target
}

export function nextCollectionDate(schedule,fromDate,{includeFrom=true,maxDays=800}={}){
  let current=dateOnly(fromDate);if(!current)throw new Error('A valid from date is required.')
  if(!includeFrom)current=addDays(current,1)
  for(let offset=0;offset<=maxDays;offset+=1){if(scheduleMatchesDate(schedule,current))return current;current=addDays(current,1)}
  return null
}

const normalizedName=value=>key(value).replace(/[^a-z0-9 ]/g,'').replace(/\s+/g,' ').trim()
export function isSundayCustomerAllowed({customerName,branchName}={}){
  const customer=normalizedName(customerName),branch=normalizedName(branchName)
  if(['everrise','everwin','sjm','dvalley'].includes(customer))return true
  return customer.startsWith('farley')&&(branch.includes('farley ks')||branch.includes('farley mall'))
}
