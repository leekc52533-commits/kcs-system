import {KCS_WEEKLY_ROUTE_PLAN_V49} from './weeklyRoutePlanV49Data.mjs'
import {KCS_WEEKLY_ROUTE_PLAN_V50_CANDIDATES} from './weeklyRoutePlanV50CandidateData.mjs'
import {ROUTE_PLATES,USER_CONFIRMED_OVERRIDES} from './weeklyRoutePlanV50Service.mjs'

const normalizeBranch=value=>String(value??'').trim().toUpperCase().replace(/\s+/g,'')
const routeKey=row=>`${row.weekday}:${normalizeBranch(row.branchCode)}`
const metadataByBranch=new Map(KCS_WEEKLY_ROUTE_PLAN_V49.entries.map(row=>[normalizeBranch(row[4]),{zoneName:row[5],areaName:row[6]}]))

const candidatesByKey=new Map()
for(const row of KCS_WEEKLY_ROUTE_PLAN_V50_CANDIDATES){
  const key=routeKey(row),group=candidatesByKey.get(key)||[]
  group.push(row);candidatesByKey.set(key,group)
}

const selected=[]
for(const [key,group] of candidatesByKey){
  let row=group[0]
  if(group.length>1){
    const plate=USER_CONFIRMED_OVERRIDES.get(key)
    if(!plate)throw new Error(`Arrange conflict has no confirmed vehicle: ${key}`)
    row=group.find(candidate=>candidate.plate===plate)
    if(!row)throw new Error(`Confirmed vehicle ${plate} is not an Arrange candidate for ${key}`)
  }
  selected.push({...row})
}

for(const [weekday,plate,trip,sequence,branchCode,zoneName,areaName] of KCS_WEEKLY_ROUTE_PLAN_V49.entries){
  if(plate===ROUTE_PLATES.L4)selected.push({weekday,plate,trip,sequence,branchCode,zoneName,areaName})
}

const entries=[]
for(const weekday of [0,1,2,3,4,5,6])for(const plate of Object.values(ROUTE_PLATES)){
  const group=selected.filter(row=>row.weekday===weekday&&row.plate===plate).sort((a,b)=>a.sequence-b.sequence||normalizeBranch(a.branchCode).localeCompare(normalizeBranch(b.branchCode)))
  group.forEach((row,index)=>{
    const metadata=metadataByBranch.get(normalizeBranch(row.branchCode))||row
    entries.push([weekday,plate,Number(row.trip)||1,index+1,normalizeBranch(row.branchCode),metadata.zoneName||'',metadata.areaName||''])
  })
}

if(entries.length!==665)throw new Error(`Arrange route plan must contain 665 rows; found ${entries.length}`)
if(new Set(entries.map(row=>`${row[0]}:${row[4]}`)).size!==entries.length)throw new Error('Arrange route plan contains duplicate branch/weekday rows')

export const KCS_WEEKLY_ROUTE_PLAN_ARRANGE=Object.freeze({
  name:'KCS 7-Day / 5-Vehicle Route Plan — Arrange',
  sourceName:'KCS_7Day_5Vehicle_Route_Plan(2).xlsx [vehicle sheets Arrange]',
  sourceStartDate:'2026-08-26',
  entries:Object.freeze(entries)
})
