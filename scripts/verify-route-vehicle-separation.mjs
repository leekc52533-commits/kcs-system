import {DatabaseSync} from 'node:sqlite'
import path from 'node:path'

const databasePath=path.resolve(process.env.KCS_DB_PATH||'data/kcs-dispatch.db'),startDate=process.env.ROUTE_REFRESH_START
if(!/^\d{4}-\d{2}-\d{2}$/.test(startDate||''))throw new Error('ROUTE_REFRESH_START must be YYYY-MM-DD')
const addDays=(date,offset)=>{const value=new Date(`${date}T00:00:00Z`);value.setUTCDate(value.getUTCDate()+offset);return value.toISOString().slice(0,10)}
const db=new DatabaseSync(databasePath);db.exec('PRAGMA foreign_keys=ON;PRAGMA busy_timeout=5000')
try{
  const plan=db.prepare('SELECT id,name,source_name sourceName FROM weekly_route_plans WHERE is_active=1').get()
  const routeCount=db.prepare('SELECT COUNT(*) n FROM weekly_route_plan_stops WHERE plan_id=?').get(plan.id).n
  const missingRouteNumbers=db.prepare('SELECT COUNT(*) n FROM weekly_route_plan_stops WHERE plan_id=? AND route_number IS NULL').get(plan.id).n
  const templateCounts={}
  for(let route=1;route<=5;route+=1)templateCounts[`Route ${route}`]=[0,1,2,3,4,5,6].map(weekday=>db.prepare('SELECT COUNT(*) n FROM weekly_route_plan_stops WHERE plan_id=? AND route_number=? AND weekday=?').get(plan.id,route,weekday).n)
  const days=[]
  for(let offset=0;offset<7;offset+=1){
    const date=addDays(startDate,offset),day=db.prepare('SELECT id,status FROM dispatch_days WHERE dispatch_date=?').get(date)
    if(!day){days.push({date,missing:true});continue}
    const routes=[]
    for(let route=1;route<=5;route+=1){
      const rows=db.prepare(`SELECT ds.route_stop_sequence sequence,b.jodoo_branch_id branchCode,d.vehicle_id vehicleId
        FROM dispatch_stops ds JOIN dispatch_trips dt ON dt.id=ds.dispatch_trip_id JOIN dispatches d ON d.id=ds.dispatch_id JOIN branches b ON b.id=ds.branch_id
        WHERE dt.dispatch_day_id=? AND ds.route_number=? AND ds.status<>'cancelled' ORDER BY ds.route_stop_sequence,ds.id`).all(day.id,route)
      const assignment=db.prepare('SELECT vehicle_id vehicleId FROM daily_route_assignments WHERE dispatch_day_id=? AND route_number=?').get(day.id,route)
      const orderValid=rows.every((row,index)=>index===0||row.sequence>rows[index-1].sequence),vehicles=[...new Set(rows.map(row=>row.vehicleId).filter(Boolean))]
      const placementValid=assignment?vehicles.length<=1&&(!vehicles.length||vehicles[0]===assignment.vehicleId):vehicles.length===0
      routes.push({routeNumber:route,stops:rows.length,vehicleId:assignment?.vehicleId??null,orderValid,placementValid,first:rows[0]?.branchCode??null,last:rows.at(-1)?.branchCode??null})
    }
    const extraVehicleStops=db.prepare(`SELECT COUNT(*) n FROM dispatch_stops ds JOIN dispatch_trips dt ON dt.id=ds.dispatch_trip_id JOIN dispatches d ON d.id=ds.dispatch_id WHERE dt.dispatch_day_id=? AND ds.route_number IS NULL AND ds.status<>'cancelled' AND d.vehicle_id IS NOT NULL`).get(day.id).n
    days.push({date,status:day.status,routes,extraVehicleStops})
  }
  const allRoutesValid=missingRouteNumbers===0&&days.filter(day=>!day.missing&&!['approved','published','in_progress','completed'].includes(day.status)).every(day=>day.extraVehicleStops===0&&day.routes.every(route=>route.orderValid&&route.placementValid))
  console.log(JSON.stringify({databasePath,plan,routeCount,missingRouteNumbers,templateCounts,startDate,allRoutesValid,days,integrity:db.prepare('PRAGMA integrity_check').get().integrity_check,foreignKeyErrors:db.prepare('SELECT COUNT(*) n FROM pragma_foreign_key_check').get().n},null,2))
}finally{db.close()}
