export const V34_VERSION=34
const columns=(db,table)=>new Set(db.prepare(`PRAGMA table_info("${table}")`).all().map(row=>row.name))
const add=(db,name,definition)=>{if(!columns(db,'dispatches').has(name))db.exec(`ALTER TABLE dispatches ADD COLUMN "${name}" ${definition}`)}
const counts=db=>({employees:db.prepare('SELECT COUNT(*) n FROM employees').get().n,operationalLocations:db.prepare('SELECT COUNT(*) n FROM operational_locations').get().n,dispatches:db.prepare('SELECT COUNT(*) n FROM dispatches').get().n,stops:db.prepare('SELECT COUNT(*) n FROM dispatch_stops').get().n})

export function ensureV34Schema(db){
  add(db,'start_location_type',"TEXT CHECK (start_location_type IS NULL OR start_location_type IN ('factory','employee_home','saved_location','custom'))")
  add(db,'start_location_reference_type','TEXT')
  add(db,'start_location_reference_id','INTEGER')
  add(db,'start_location_name','TEXT')
  add(db,'start_address','TEXT')
  add(db,'start_latitude','REAL CHECK (start_latitude BETWEEN -90 AND 90 OR start_latitude IS NULL)')
  add(db,'start_longitude','REAL CHECK (start_longitude BETWEEN -180 AND 180 OR start_longitude IS NULL)')
}

export function applyV34Migration(db){
  const version=Number(db.prepare('SELECT COALESCE(MAX(version),0) version FROM schema_meta').get().version)
  if(version>=V34_VERSION)return{schemaVersion:version,noOp:true,before:counts(db),after:counts(db)}
  if(version!==33)throw new Error(`Schema v33 is required before v34; current schema is v${version}`)
  if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw new Error('Database integrity check failed before v34 migration')
  const before=counts(db);db.exec('BEGIN IMMEDIATE');try{ensureV34Schema(db);db.prepare('INSERT INTO schema_meta(version) VALUES(?)').run(V34_VERSION);const after=counts(db);if(JSON.stringify(before)!==JSON.stringify(after))throw new Error('Protected employee/location/dispatch counts changed during v34 migration');db.exec('COMMIT');return{schemaVersion:V34_VERSION,noOp:false,before,after}}catch(error){db.exec('ROLLBACK');throw error}
}
