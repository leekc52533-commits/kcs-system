import {DatabaseSync} from 'node:sqlite'
import path from 'node:path'
import {KCS_WEEKLY_ROUTE_PLAN_ARRANGE} from '../server/weeklyRoutePlanArrangeData.mjs'
import {effectiveWeeklyRoutePlate,SUNDAY_ROUTE_ALTERNATION,sundayRoutePlateForDate} from '../server/weeklyRouteAlternation.mjs'

const databasePath=path.resolve(process.env.KCS_DB_PATH||'data/kcs-dispatch.db')
const startDate=process.env.ROUTE_REFRESH_START
if(!/^\d{4}-\d{2}-\d{2}$/.test(startDate||''))throw new Error('ROUTE_REFRESH_START must be YYYY-MM-DD')
const normalize=value=>String(value||'').trim().toUpperCase().replace(/\s+/g,'')
const branchCode=value=>{const code=normalize(value);return /^\d+$/.test(code)?`B${code}`:code}
const addDays=(date,offset)=>{const value=new Date(`${date}T00:00:00Z`);value.setUTCDate(value.getUTCDate()+offset);return value.toISOString().slice(0,10)}
const weekday=date=>new Date(`${date}T00:00:00Z`).getUTCDay()
const routePlates=[...new Set(KCS_WEEKLY_ROUTE_PLAN_ARRANGE.entries.map(row=>normalize(row[1])))].sort()
const expectedFor=(plate,day)=>KCS_WEEKLY_ROUTE_PLAN_ARRANGE.entries.filter(row=>normalize(row[1])===plate&&row[0]===day).sort((a,b)=>a[2]-b[2]||a[3]-b[3]).map(row=>branchCode(row[4]))
const counts=Object.fromEntries(routePlates.map(plate=>[plate,[0,1,2,3,4,5,6].map(day=>expectedFor(plate,day).length)]))
const expectedForDate=(plate,date)=>KCS_WEEKLY_ROUTE_PLAN_ARRANGE.entries.filter(row=>row[0]===weekday(date)&&effectiveWeeklyRoutePlate({date,weekday:row[0],branchCode:row[4],plate:row[1]})===plate).sort((a,b)=>a[2]-b[2]||a[3]-b[3]).map(row=>branchCode(row[4]))
const db=new DatabaseSync(databasePath)
db.exec('PRAGMA foreign_keys=ON;PRAGMA busy_timeout=5000')
try{
  const rows=db.prepare(`SELECT dd.dispatch_date date,COALESCE(v.registration_number,v.vehicle_code,'') plate,
      b.jodoo_branch_id branchCode,dt.trip_number tripNumber,ds.stop_sequence stopSequence
    FROM dispatch_days dd JOIN dispatch_trips dt ON dt.dispatch_day_id=dd.id
    JOIN dispatches d ON d.id=dt.dispatch_id LEFT JOIN vehicles v ON v.id=d.vehicle_id
    JOIN dispatch_stops ds ON ds.dispatch_trip_id=dt.id JOIN branches b ON b.id=ds.branch_id
    WHERE dd.dispatch_date BETWEEN ? AND ? AND ds.status<>'cancelled'
    ORDER BY dd.dispatch_date,dt.trip_number,ds.stop_sequence,ds.id`).all(startDate,addDays(startDate,6))
  const days=[]
  for(let offset=0;offset<7;offset+=1){
    const date=addDays(startDate,offset),day=weekday(date),dayRows=rows.filter(row=>row.date===date)
    const expectedOwner=new Map()
    for(const plate of routePlates)for(const code of expectedForDate(plate,date))expectedOwner.set(code,plate)
    const misplaced=dayRows.map(row=>({plate:normalize(row.plate),branchCode:branchCode(row.branchCode)})).filter(row=>expectedOwner.has(row.branchCode)&&expectedOwner.get(row.branchCode)!==row.plate)
    const vehicles={}
    for(const plate of routePlates){
      const expected=expectedForDate(plate,date),actual=dayRows.filter(row=>normalize(row.plate)===plate).map(row=>branchCode(row.branchCode))
      const actualSet=new Set(actual),expectedDue=expected.filter(code=>actualSet.has(code))
      const unexpected=actual.filter(code=>!expected.includes(code))
      const orderMatches=unexpected.length===0&&JSON.stringify(actual)===JSON.stringify(expectedDue)
      vehicles[plate]={count:actual.length,orderMatches,unexpected}
    }
    days.push({date,weekday:day,misplaced,vehicles})
  }
  const allVehiclesMatch=days.every(day=>day.misplaced.length===0&&Object.values(day.vehicles).every(vehicle=>vehicle.orderMatches))
  if(!allVehiclesMatch)throw new Error(`Daily route verification failed: ${JSON.stringify(days)}`)
  const sundays=days.filter(day=>day.weekday===0).map(day=>({date:day.date,plate:sundayRoutePlateForDate(day.date),branchCount:SUNDAY_ROUTE_ALTERNATION.branchCodes.length}))
  console.log(JSON.stringify({sourceName:KCS_WEEKLY_ROUTE_PLAN_ARRANGE.sourceName,templateCountsSunToSat:counts,startDate,allVehiclesMatch,sundays,days},null,2))
}finally{db.close()}
