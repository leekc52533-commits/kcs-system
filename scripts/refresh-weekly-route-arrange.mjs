import {DatabaseSync} from 'node:sqlite'
import path from 'node:path'
import {generateWeek} from '../server/dispatchService.mjs'

const databasePath=path.resolve(process.env.KCS_DB_PATH||'data/kcs-dispatch.db')
const startDate=process.env.ROUTE_REFRESH_START
if(!/^\d{4}-\d{2}-\d{2}$/.test(startDate||''))throw new Error('ROUTE_REFRESH_START must be YYYY-MM-DD')
const db=new DatabaseSync(databasePath)
db.exec('PRAGMA foreign_keys=ON;PRAGMA busy_timeout=5000')
try{
  const result=generateWeek({startDate,generatedBy:'Owner Admin'},db)
  const days=result.days.map(day=>({date:day.dispatch_date,status:day.status,protected:result.protectedDays.some(item=>item.date===day.dispatch_date),stops:day.previewSummary.stopCount,unassigned:day.previewSummary.unassignedCount,routes:Object.fromEntries(day.routeBoards.map(route=>[`Route ${route.routeNumber}`,{stops:route.customerCount,vehicleId:route.vehicleId,plate:route.registrationNumber||null}])),vehicles:Object.fromEntries(day.vehicleBoards.map(vehicle=>[String(vehicle.registrationNumber||vehicle.vehicle).toUpperCase().replace(/[^A-Z0-9]/g,''),vehicle.customerCount]))}))
  console.log(JSON.stringify({startDate,protectedDays:result.protectedDays,days},null,2))
}finally{db.close()}
