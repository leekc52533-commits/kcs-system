import {DatabaseSync} from 'node:sqlite'

const databasePath=process.argv[2],ids=process.argv.slice(3)
if(!databasePath||!ids.length)throw new Error('Usage: node inspect-v26-legacy-schedules.mjs <database> <schedule-id>...')
const database=new DatabaseSync(databasePath,{readOnly:true})
try{
  const schedules=ids.map(id=>{
    const schedule=database.prepare('SELECT * FROM branch_schedules WHERE jodoo_schedule_id=?').get(id)
    if(!schedule)return{scheduleId:id,missing:true}
    const stops=database.prepare(`SELECT ds.id stopId,ds.status,ds.stop_sequence stopSequence,COALESCE(ds.service_date,dd.dispatch_date,d.dispatch_date) serviceDate,d.id dispatchId,d.status dispatchStatus,
      (SELECT COUNT(*) FROM stop_documents x WHERE x.dispatch_stop_id=ds.id) documents,
      (SELECT COUNT(*) FROM stop_step_records x WHERE x.dispatch_stop_id=ds.id) stepRecords,
      (SELECT COUNT(*) FROM dispatch_stop_material_prices x WHERE x.dispatch_stop_id=ds.id) materialRows,
      (SELECT COUNT(*) FROM temporary_locations x WHERE x.dispatch_stop_id=ds.id) locationRows,
      ds.collected_weight_kg collectedWeightKg,ds.completed_at completedAt,ds.invoice_number invoiceNumber
      FROM dispatch_stops ds JOIN dispatches d ON d.id=ds.dispatch_id LEFT JOIN dispatch_trips dt ON dt.id=ds.dispatch_trip_id LEFT JOIN dispatch_days dd ON dd.id=dt.dispatch_day_id WHERE ds.source_schedule_id=? ORDER BY serviceDate,ds.id`).all(schedule.id)
    const businessStops=stops.filter(stop=>stop.status==='completed'||stop.documents||stop.stepRecords||stop.materialRows||stop.locationRows||stop.collectedWeightKg!=null||stop.completedAt||stop.invoiceNumber)
    return{scheduleId:id,internalScheduleId:schedule.id,branchId:schedule.source_branch_id,internalBranchId:schedule.branch_id,isActive:schedule.is_active,frequency:schedule.frequency,weekdays:schedule.days_of_week,createdAt:schedule.created_at,updatedAt:schedule.updated_at,stopCount:stops.length,businessStopCount:businessStops.length,stops}
  })
  console.log(JSON.stringify({databasePath,integrity:database.prepare('PRAGMA integrity_check').get().integrity_check,schedules},null,2))
}finally{database.close()}
