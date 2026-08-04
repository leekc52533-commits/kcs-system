import {DatabaseSync} from 'node:sqlite'

for(const path of process.argv.slice(2)){
  const database=new DatabaseSync(path,{readOnly:true}),count=sql=>database.prepare(sql).get().count
  try{console.log(JSON.stringify({path,schema:database.prepare('SELECT MAX(version) version FROM schema_meta').get().version,integrity:database.prepare('PRAGMA integrity_check').get().integrity_check,branches:count('SELECT COUNT(*) count FROM branches'),schedules:count('SELECT COUNT(*) count FROM branch_schedules'),activeSchedules:count('SELECT COUNT(*) count FROM branch_schedules WHERE is_active=1'),dispatches:count('SELECT COUNT(*) count FROM dispatches'),stops:count('SELECT COUNT(*) count FROM dispatch_stops'),cancelledStops:count("SELECT COUNT(*) count FROM dispatch_stops WHERE status='cancelled'"),weekdays:count("SELECT COUNT(*) count FROM branches WHERE assigned_weekdays IS NOT NULL AND TRIM(assigned_weekdays)<>''"),dispatchAudits:count('SELECT COUNT(*) count FROM dispatch_change_logs'),masterHistory:count('SELECT COUNT(*) count FROM master_change_history')},null,2))}finally{database.close()}
}
