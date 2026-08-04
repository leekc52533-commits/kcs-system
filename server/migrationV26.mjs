export const V26_VERSION=26

const columns=(database,table)=>new Set(database.prepare(`PRAGMA table_info("${table}")`).all().map(row=>row.name))
const addColumn=(database,table,name,definition)=>{if(!columns(database,table).has(name))database.exec(`ALTER TABLE "${table}" ADD COLUMN "${name}" ${definition}`)}
const count=(database,sql)=>database.prepare(sql).get().count
const occurrenceConflicts=database=>database.prepare(`SELECT so.branch_id,so.planned_date,COUNT(*) count,GROUP_CONCAT(so.id) occurrence_ids FROM schedule_occurrences so WHERE so.branch_id IS NOT NULL AND so.status<>'cancelled' GROUP BY so.branch_id,so.planned_date HAVING COUNT(*)>1 ORDER BY so.planned_date,so.branch_id`).all()
export const branchServiceDateConflicts=database=>database.prepare(`SELECT ds.branch_id,ds.service_date,COUNT(*) count,GROUP_CONCAT(ds.id) stop_ids,GROUP_CONCAT(COALESCE(ds.source_schedule_id,'')) schedule_ids FROM dispatch_stops ds WHERE ds.service_date IS NOT NULL AND ds.status<>'cancelled' GROUP BY ds.branch_id,ds.service_date HAVING COUNT(*)>1 ORDER BY ds.service_date,ds.branch_id`).all()

export function ensureV26Schema(database){
  database.exec(`CREATE TABLE IF NOT EXISTS schedule_occurrences(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    schedule_id INTEGER NOT NULL REFERENCES branch_schedules(id),
    branch_id INTEGER REFERENCES branches(id),
    planned_date TEXT NOT NULL,
    occurrence_source TEXT NOT NULL DEFAULT 'recurrence',
    status TEXT NOT NULL DEFAULT 'planned',
    dispatch_stop_id INTEGER REFERENCES dispatch_stops(id),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(schedule_id,planned_date)
  )`)
  addColumn(database,'branch_schedules','recurrence_type','TEXT')
  addColumn(database,'branch_schedules','interval_weeks','INTEGER')
  addColumn(database,'branch_schedules','anchor_date','TEXT')
  addColumn(database,'branch_schedules','effective_date','TEXT')
  addColumn(database,'branch_schedules','monthly_occurrence','INTEGER')
  addColumn(database,'branch_schedules','fixed_weekday','TEXT')
  addColumn(database,'branch_schedules','next_collection_date','TEXT')
  addColumn(database,'branch_schedules','superseded_by_schedule_id','INTEGER REFERENCES branch_schedules(id)')
  addColumn(database,'branch_schedules','superseded_reason','TEXT')
  addColumn(database,'branch_schedules','superseded_at','TEXT')
  addColumn(database,'branch_schedules','superseded_by','TEXT')
  addColumn(database,'schedule_occurrences','branch_id','INTEGER REFERENCES branches(id)')
  addColumn(database,'dispatch_stops','service_date','TEXT')
  addColumn(database,'dispatch_stops','dedupe_enforced','INTEGER NOT NULL DEFAULT 0')
  addColumn(database,'dispatch_stops','superseded_by_stop_id','INTEGER REFERENCES dispatch_stops(id)')
  addColumn(database,'dispatch_stops','superseded_reason','TEXT')
  addColumn(database,'dispatch_stops','superseded_at','TEXT')
  addColumn(database,'dispatch_stops','superseded_by','TEXT')
  database.exec(`
    CREATE INDEX IF NOT EXISTS schedule_occurrences_date_idx ON schedule_occurrences(planned_date,status);
    CREATE INDEX IF NOT EXISTS schedules_recurrence_idx ON branch_schedules(recurrence_type,anchor_date,effective_date,next_collection_date,is_active);
    CREATE INDEX IF NOT EXISTS dispatch_stops_branch_service_date_idx ON dispatch_stops(branch_id,service_date,status);
    CREATE UNIQUE INDEX IF NOT EXISTS dispatch_stops_branch_service_date_guard ON dispatch_stops(branch_id,service_date) WHERE service_date IS NOT NULL AND dedupe_enforced=1 AND status<>'cancelled';
  `)
  database.exec(`UPDATE schedule_occurrences SET branch_id=(SELECT branch_id FROM branch_schedules WHERE branch_schedules.id=schedule_occurrences.schedule_id) WHERE branch_id IS NULL`)
  database.exec(`UPDATE dispatch_stops SET service_date=COALESCE((SELECT dd.dispatch_date FROM dispatch_trips dt JOIN dispatch_days dd ON dd.id=dt.dispatch_day_id WHERE dt.id=dispatch_stops.dispatch_trip_id),(SELECT dispatch_date FROM dispatches WHERE id=dispatch_stops.dispatch_id)) WHERE service_date IS NULL`)
  const occurrenceDuplicates=occurrenceConflicts(database)
  if(!occurrenceDuplicates.length)database.exec(`CREATE UNIQUE INDEX IF NOT EXISTS schedule_occurrences_branch_date_unique ON schedule_occurrences(branch_id,planned_date) WHERE branch_id IS NOT NULL AND status<>'cancelled'`)
  return{occurrenceConflicts:occurrenceDuplicates,branchServiceDateConflicts:branchServiceDateConflicts(database)}
}

export function applyV26Migration(database){
  const version=Number(database.prepare('SELECT COALESCE(MAX(version),0) version FROM schema_meta').get().version)
  if(version<25)throw new Error(`Schema v25 is required before v26; current schema is v${version}`)
  const integrity=database.prepare('PRAGMA integrity_check').get().integrity_check
  if(integrity!=='ok')throw new Error(`Database integrity check failed: ${integrity}`)
  const before={
    branches:count(database,'SELECT COUNT(*) count FROM branches'),
    schedules:count(database,'SELECT COUNT(*) count FROM branch_schedules'),
    weekdays:count(database,"SELECT COUNT(*) count FROM branches WHERE assigned_weekdays IS NOT NULL AND TRIM(assigned_weekdays)<>''"),
    dispatches:count(database,'SELECT COUNT(*) count FROM dispatches'),
    dispatchStops:count(database,'SELECT COUNT(*) count FROM dispatch_stops'),
  }
  database.exec('BEGIN IMMEDIATE')
  try{
    const guard=ensureV26Schema(database)
    database.prepare('INSERT OR IGNORE INTO schema_meta(version) VALUES(?)').run(V26_VERSION)
    const after={
      branches:count(database,'SELECT COUNT(*) count FROM branches'),
      schedules:count(database,'SELECT COUNT(*) count FROM branch_schedules'),
      weekdays:count(database,"SELECT COUNT(*) count FROM branches WHERE assigned_weekdays IS NOT NULL AND TRIM(assigned_weekdays)<>''"),
      dispatches:count(database,'SELECT COUNT(*) count FROM dispatches'),
      dispatchStops:count(database,'SELECT COUNT(*) count FROM dispatch_stops'),
    }
    if(JSON.stringify(before)!==JSON.stringify(after))throw new Error('Protected v25 data counts changed during v26 migration')
    database.exec('COMMIT')
    return{schemaVersion:V26_VERSION,before,after,columnsAdded:['recurrence_type','interval_weeks','anchor_date','effective_date','monthly_occurrence','fixed_weekday','next_collection_date','schedule_occurrences.branch_id','dispatch_stops.service_date','dispatch_stops.dedupe_enforced','supersession audit fields'],occurrenceRows:count(database,'SELECT COUNT(*) count FROM schedule_occurrences'),occurrenceConflicts:guard.occurrenceConflicts,branchServiceDateConflicts:guard.branchServiceDateConflicts,routeGenerationBlocked:guard.occurrenceConflicts.length>0||guard.branchServiceDateConflicts.length>0}
  }catch(error){database.exec('ROLLBACK');throw error}
}
