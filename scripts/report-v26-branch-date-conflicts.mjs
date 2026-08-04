import {DatabaseSync} from 'node:sqlite'
import {listBranchServiceDateConflicts,listOccurrenceConflicts} from '../server/branchServiceDateGuard.mjs'

const databasePath=process.argv[2]
if(!databasePath)throw new Error('Database path is required')
const db=new DatabaseSync(databasePath,{readOnly:true})
try{
  const conflicts=listBranchServiceDateConflicts(db).map(conflict=>({...conflict,stops:db.prepare(`SELECT ds.id stopId,ds.status,ds.stop_sequence stopSequence,ds.source_schedule_id internalScheduleId,s.jodoo_schedule_id scheduleId,b.jodoo_branch_id branchId,b.branch_name branchName,c.name customerName,d.id dispatchId,d.status dispatchStatus,COALESCE(ds.service_date,dd.dispatch_date,d.dispatch_date) serviceDate,
    (SELECT COUNT(*) FROM stop_documents x WHERE x.dispatch_stop_id=ds.id) documents,
    (SELECT COUNT(*) FROM stop_step_records x WHERE x.dispatch_stop_id=ds.id) stepRecords,
    (SELECT COUNT(*) FROM dispatch_stop_material_prices x WHERE x.dispatch_stop_id=ds.id) materialRows,
    (SELECT COUNT(*) FROM temporary_locations x WHERE x.dispatch_stop_id=ds.id) locationRows,
    ds.collected_weight_kg collectedWeightKg,ds.completed_at completedAt,ds.invoice_number invoiceNumber
    FROM dispatch_stops ds JOIN branches b ON b.id=ds.branch_id LEFT JOIN customers c ON c.id=b.customer_id LEFT JOIN branch_schedules s ON s.id=ds.source_schedule_id JOIN dispatches d ON d.id=ds.dispatch_id LEFT JOIN dispatch_trips dt ON dt.id=ds.dispatch_trip_id LEFT JOIN dispatch_days dd ON dd.id=dt.dispatch_day_id
    WHERE ds.branch_id=? AND COALESCE(ds.service_date,dd.dispatch_date,d.dispatch_date)=? AND ds.status<>'cancelled' ORDER BY ds.id`).all(conflict.branch_id,conflict.service_date)}))
  console.log(JSON.stringify({databasePath,schemaVersion:db.prepare('SELECT MAX(version) version FROM schema_meta').get().version,integrity:db.prepare('PRAGMA integrity_check').get().integrity_check,stopConflicts:conflicts,occurrenceConflicts:listOccurrenceConflicts(db)},null,2))
}finally{db.close()}
