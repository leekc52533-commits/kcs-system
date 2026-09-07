import {db} from '../server/database.mjs'
import {carryForwardRouteVehicles} from '../server/dispatchService.mjs'
import {kuchingDate} from '../shared/kuchingTime.js'
const result=carryForwardRouteVehicles({startDate:process.env.ROUTE_TEAM_START||kuchingDate()},db)
const integrity=db.prepare('PRAGMA integrity_check').get().integrity_check
const foreignKeyErrors=db.prepare('PRAGMA foreign_key_check').all().length
if(integrity!=='ok'||foreignKeyErrors)throw new Error('Database validation failed')
console.log(JSON.stringify({...result,integrity,foreignKeyErrors}))
