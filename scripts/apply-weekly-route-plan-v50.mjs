import {DatabaseSync} from 'node:sqlite'
import path from 'node:path'
import {KCS_WEEKLY_ROUTE_PLAN_V50_CANDIDATES} from '../server/weeklyRoutePlanV50CandidateData.mjs'
import {applyWeeklyRoutePlanV50} from '../server/weeklyRoutePlanV50Service.mjs'
const databasePath=path.resolve(process.env.KCS_DB_PATH||'data/kcs-dispatch.db'),apply=process.argv.includes('--apply')
const db=new DatabaseSync(databasePath);db.exec('PRAGMA foreign_keys=ON;PRAGMA busy_timeout=5000')
try{
  console.log(JSON.stringify({databasePath,...applyWeeklyRoutePlanV50(KCS_WEEKLY_ROUTE_PLAN_V50_CANDIDATES,{apply},db),integrity:db.prepare('PRAGMA integrity_check').get().integrity_check,foreignKeyErrors:db.prepare('SELECT COUNT(*) n FROM pragma_foreign_key_check').get().n},null,2))
}finally{db.close()}
