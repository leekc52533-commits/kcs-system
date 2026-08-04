export const V27_VERSION=27
const columns=(database,table)=>new Set(database.prepare(`PRAGMA table_info("${table}")`).all().map(row=>row.name))
const add=(database,table,name,definition)=>{if(!columns(database,table).has(name))database.exec(`ALTER TABLE "${table}" ADD COLUMN "${name}" ${definition}`)}
export function ensureV27Schema(database){
  add(database,'dispatch_trips','execution_status',"TEXT NOT NULL DEFAULT 'not_started'");add(database,'dispatch_trips','started_at','TEXT');add(database,'dispatch_trips','started_by_employee_id','INTEGER REFERENCES employees(id)')
  add(database,'dispatch_stops','arrival_latitude','REAL');add(database,'dispatch_stops','arrival_longitude','REAL');add(database,'dispatch_stops','arrival_accuracy_m','REAL');add(database,'dispatch_stops','arrival_distance_m','REAL');add(database,'dispatch_stops','arrival_captured_at','TEXT');add(database,'dispatch_stops','arrived_by_employee_id','INTEGER REFERENCES employees(id)')
  database.exec("CREATE INDEX IF NOT EXISTS dispatch_trips_execution_idx ON dispatch_trips(dispatch_day_id,execution_status,trip_number)")
}
export function applyV27Migration(database){
  const version=Number(database.prepare('SELECT COALESCE(MAX(version),0) version FROM schema_meta').get().version);if(version<26)throw new Error(`Schema v26 is required before v27; current schema is v${version}`);if(database.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw new Error('Database integrity check failed before v27 migration')
  const counts=()=>({trips:database.prepare('SELECT COUNT(*) n FROM dispatch_trips').get().n,stops:database.prepare('SELECT COUNT(*) n FROM dispatch_stops').get().n,completed:database.prepare("SELECT COUNT(*) n FROM dispatch_stops WHERE status='completed'").get().n}),before=counts();database.exec('BEGIN IMMEDIATE')
  try{ensureV27Schema(database);database.prepare('INSERT OR IGNORE INTO schema_meta(version) VALUES(?)').run(V27_VERSION);const after=counts();if(JSON.stringify(before)!==JSON.stringify(after))throw new Error('Protected dispatch counts changed during v27 migration');database.exec('COMMIT');return{schemaVersion:V27_VERSION,before,after}}catch(error){database.exec('ROLLBACK');throw error}
}
