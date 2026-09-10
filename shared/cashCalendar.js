import {kuchingDate,addCalendarDays} from './kuchingTime.js'
export function rolloverCashFilters(filters,previous,current){return previous!==current&&filters.from===previous&&filters.to===previous?{...filters,from:current,to:current}:filters}
export function nextKuchingMidnight(now=Date.now()){return Date.parse(addCalendarDays(kuchingDate(now),1)+'T00:00:00+08:00')-Number(now)+50}
export function expenseServiceDate(value,{now=new Date(),allowPast=true}={}){
 const current=kuchingDate(now),date=value==null||value===''?current:String(value)
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T00:00:00Z'))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date||date>current)throw Object.assign(Error('CASH_DATE_INVALID'),{code:'CASH_DATE_INVALID',statusCode:400})
 if(!allowPast&&date!==current)throw Object.assign(Error('CASH_DATE_RESTRICTED'),{code:'CASH_DATE_RESTRICTED',statusCode:403})
 return date
}
