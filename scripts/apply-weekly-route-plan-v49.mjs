import {DatabaseSync} from 'node:sqlite'
import path from 'node:path'
import {installWeeklyRoutePlan} from '../server/weeklyRoutePlanService.mjs'
const databasePath=path.resolve(process.env.KCS_DB_PATH||'data/kcs-dispatch.db')
const db=new DatabaseSync(databasePath)
db.exec('PRAGMA foreign_keys=ON;PRAGMA busy_timeout=5000')
try{
  const version=Number(db.prepare('SELECT COALESCE(MAX(version),0) version FROM schema_meta').get().version)
  if(version!==49)throw new Error(`Schema v49 is required before applying the weekly route plan; current schema is v${version}`)
  console.log(JSON.stringify({databasePath,...installWeeklyRoutePlan(undefined,{changedBy:'Approved route plan import'},db),integrity:db.prepare('PRAGMA integrity_check').get().integrity_check,foreignKeyErrors:db.prepare('SELECT COUNT(*) n FROM pragma_foreign_key_check').get().n},null,2))
}finally{db.close()}
