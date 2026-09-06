import crypto from 'node:crypto'
import {DatabaseSync} from 'node:sqlite'
import path from 'node:path'
import {KCS_WEEKLY_ROUTE_PLAN_V49} from '../server/weeklyRoutePlanV49Data.mjs'
import {inspectWeeklyRoutePlan,installWeeklyRoutePlan} from '../server/weeklyRoutePlanService.mjs'

const databasePath=path.resolve(process.env.KCS_DB_PATH||'data/kcs-dispatch.db')
const apply=process.argv.includes('--apply')
const db=new DatabaseSync(databasePath)
db.exec('PRAGMA foreign_keys=ON;PRAGMA busy_timeout=5000')
const hash=value=>crypto.createHash('sha256').update(value).digest('hex')

try{
  const before=inspectWeeklyRoutePlan(KCS_WEEKLY_ROUTE_PLAN_V49,db)
  const result=apply?installWeeklyRoutePlan(KCS_WEEKLY_ROUTE_PLAN_V49,{changedBy:'Owner Admin'},db):null
  const after=inspectWeeklyRoutePlan(KCS_WEEKLY_ROUTE_PLAN_V49,db)
  console.log(JSON.stringify({
    mode:apply?'apply':'inspect',
    databasePath,
    noOp:result?.noOp??before.matchesExact,
    before:{matchesExact:before.matchesExact,routeCount:before.activeRouteCount,currentHash:hash(before.currentSnapshot)},
    after:{matchesExact:after.matchesExact,routeCount:after.activeRouteCount,currentHash:hash(after.currentSnapshot),expectedHash:hash(after.expectedSnapshot)},
    entryCount:after.entryCount,
    branchCount:after.branchCount,
    vehiclePlates:after.vehiclePlates,
    integrity:db.prepare('PRAGMA integrity_check').get().integrity_check,
    foreignKeyErrors:db.prepare('SELECT COUNT(*) n FROM pragma_foreign_key_check').get().n
  },null,2))
}finally{db.close()}
