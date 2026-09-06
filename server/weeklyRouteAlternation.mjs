import {normalizePlate} from './weeklyRoutePlanService.mjs'

const DAY_MS=24*60*60*1000

export const SUNDAY_ROUTE_ALTERNATION=Object.freeze({
  anchorDate:'2026-09-06',
  anchorPlate:'QTY5028',
  alternatePlate:'QAA4293N',
  branchCodes:Object.freeze([
    'B10151','B10142','B10164','B10104','B10204','B10134','B10135',
    'B10167','B10145','B10177','B10144','B10275','B10310'
  ])
})

const normalizeBranch=value=>{const code=String(value??'').trim().toUpperCase().replace(/\s+/g,'');return /^\d+$/.test(code)?`B${code}`:code}
const alternatingBranches=new Set(SUNDAY_ROUTE_ALTERNATION.branchCodes)

export const isAlternatingSundayBranch=branchCode=>alternatingBranches.has(normalizeBranch(branchCode))

export function sundayRoutePlateForDate(date){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(date||'')))throw new Error('Sunday route date must be YYYY-MM-DD')
  const target=Date.parse(`${date}T00:00:00Z`),anchor=Date.parse(`${SUNDAY_ROUTE_ALTERNATION.anchorDate}T00:00:00Z`)
  if(new Date(target).getUTCDay()!==0)throw new Error('Sunday route alternation can only be resolved for Sunday')
  const weeks=Math.round((target-anchor)/(7*DAY_MS))
  return normalizePlate(weeks%2===0?SUNDAY_ROUTE_ALTERNATION.anchorPlate:SUNDAY_ROUTE_ALTERNATION.alternatePlate)
}

export function effectiveWeeklyRoutePlate({date,weekday,branchCode,plate}){
  return Number(weekday)===0&&isAlternatingSundayBranch(branchCode)?sundayRoutePlateForDate(date):normalizePlate(plate)
}
