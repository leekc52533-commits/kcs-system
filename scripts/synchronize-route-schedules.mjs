import {db} from '../server/database.mjs'
import {synchronizeRouteScheduleBaseline} from '../server/routeScheduleBaselineService.mjs'
const report=synchronizeRouteScheduleBaseline(db,{dryRun:!process.argv.includes('--apply')})
console.log(JSON.stringify(report,null,2))
