import {db} from '../server/database.mjs'
import {synchronizeRouteScheduleBaseline} from '../server/routeScheduleBaselineService.mjs'
if(process.argv.includes('--check')){
 db.exec('BEGIN IMMEDIATE')
 try{
  const report=synchronizeRouteScheduleBaseline(db)
  db.exec('ROLLBACK')
  console.log('PREFLIGHT=ok')
  console.log('SCHEDULE_CHANGES_ROLLED_BACK=true')
  console.log(`ELIGIBLE_SCHEDULES=${report.applied}`)
  console.log(`PENDING_REVIEW=${report.pending.length}`)
 }catch(error){if(db.isTransaction)db.exec('ROLLBACK');throw error}
}else{
 const report=synchronizeRouteScheduleBaseline(db,{dryRun:!process.argv.includes('--apply')})
 console.log(JSON.stringify(report,null,2))
}
