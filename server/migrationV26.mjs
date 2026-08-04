export const V26_VERSION=26

const columns=(database,table)=>new Set(database.prepare(`PRAGMA table_info("${table}")`).all().map(row=>row.name))
const addColumn=(database,table,name,definition)=>{if(!columns(database,table).has(name))database.exec(`ALTER TABLE "${table}" ADD COLUMN "${name}" ${definition}`)}
const count=(database,sql)=>database.prepare(sql).get().count

export function ensureV26Schema(database){
  addColumn(database,'branch_schedules','recurrence_type','TEXT')
  addColumn(database,'branch_schedules','interval_weeks','INTEGER')
  addColumn(database,'branch_schedules','anchor_date','TEXT')
  addColumn(database,'branch_schedules','effective_date','TEXT')
  addColumn(database,'branch_schedules','monthly_occurrence','INTEGER')
  addColumn(database,'branch_schedules','fixed_weekday','TEXT')
  addColumn(database,'branch_schedules','next_collection_date','TEXT')
  database.exec(`
    CREATE TABLE IF NOT EXISTS schedule_occurrences(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      schedule_id INTEGER NOT NULL REFERENCES branch_schedules(id),
      planned_date TEXT NOT NULL,
      occurrence_source TEXT NOT NULL DEFAULT 'recurrence',
      status TEXT NOT NULL DEFAULT 'planned',
      dispatch_stop_id INTEGER REFERENCES dispatch_stops(id),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(schedule_id,planned_date)
    );
    CREATE INDEX IF NOT EXISTS schedule_occurrences_date_idx ON schedule_occurrences(planned_date,status);
    CREATE INDEX IF NOT EXISTS schedules_recurrence_idx ON branch_schedules(recurrence_type,anchor_date,effective_date,next_collection_date,is_active);
  `)
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
    ensureV26Schema(database)
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
    return{schemaVersion:V26_VERSION,before,after,columnsAdded:['recurrence_type','interval_weeks','anchor_date','effective_date','monthly_occurrence','fixed_weekday','next_collection_date'],occurrenceRows:count(database,'SELECT COUNT(*) count FROM schedule_occurrences')}
  }catch(error){database.exec('ROLLBACK');throw error}
}
