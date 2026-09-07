import {db} from '../server/database.mjs'
import {carryForwardVehicleDrivers} from '../server/dispatchService.mjs'
import {kuchingDate} from '../shared/kuchingTime.js'

const startDate=process.env.ROUTE_TEAM_START||kuchingDate()
const result=carryForwardVehicleDrivers({startDate},db)
const integrity=db.prepare('PRAGMA integrity_check').get().integrity_check
const foreignKeyErrors=db.prepare('PRAGMA foreign_key_check').all().length
const conflicts=db.prepare(`SELECT COUNT(*) count FROM (
  SELECT dt.dispatch_day_id,e.employee_id FROM (
    SELECT dt.dispatch_day_id,d.vehicle_id,d.driver_id employee_id FROM dispatch_trips dt JOIN dispatches d ON d.id=dt.dispatch_id WHERE d.driver_id IS NOT NULL
    UNION ALL SELECT dispatch_day_id,vehicle_id,employee_id FROM dispatch_vehicle_assistants
  ) e JOIN dispatch_trips dt ON dt.dispatch_day_id=e.dispatch_day_id JOIN dispatches d ON d.id=dt.dispatch_id AND d.vehicle_id=e.vehicle_id
  GROUP BY dt.dispatch_day_id,e.employee_id HAVING COUNT(DISTINCT e.vehicle_id)>1
)`).get().count
console.log(JSON.stringify({...result,integrity,foreignKeyErrors,conflicts}))
