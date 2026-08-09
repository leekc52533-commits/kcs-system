export const V33_VERSION=33
const columns=(db,table)=>new Set(db.prepare(`PRAGMA table_info("${table}")`).all().map(row=>row.name))
const add=(db,name,definition)=>{if(!columns(db,'employees').has(name))db.exec(`ALTER TABLE employees ADD COLUMN "${name}" ${definition}`)}
const counts=db=>({employees:db.prepare('SELECT COUNT(*) n FROM employees').get().n,dispatches:db.prepare('SELECT COUNT(*) n FROM dispatches').get().n,stops:db.prepare('SELECT COUNT(*) n FROM dispatch_stops').get().n})

export function ensureV33Schema(db){
  add(db,'home_address','TEXT')
  add(db,'home_latitude','REAL CHECK (home_latitude BETWEEN -90 AND 90 OR home_latitude IS NULL)')
  add(db,'home_longitude','REAL CHECK (home_longitude BETWEEN -180 AND 180 OR home_longitude IS NULL)')
  add(db,'home_gps_remark','TEXT')
}

export function applyV33Migration(db){
  const version=Number(db.prepare('SELECT COALESCE(MAX(version),0) version FROM schema_meta').get().version)
  if(version>=V33_VERSION)return{schemaVersion:version,noOp:true,before:counts(db),after:counts(db)}
  if(version!==32)throw new Error(`Schema v32 is required before v33; current schema is v${version}`)
  if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw new Error('Database integrity check failed before v33 migration')
  const before=counts(db);db.exec('BEGIN IMMEDIATE');try{ensureV33Schema(db);db.prepare('INSERT INTO schema_meta(version) VALUES(?)').run(V33_VERSION);const after=counts(db);if(JSON.stringify(before)!==JSON.stringify(after))throw new Error('Protected employee/dispatch counts changed during v33 migration');db.exec('COMMIT');return{schemaVersion:V33_VERSION,noOp:false,before,after}}catch(error){db.exec('ROLLBACK');throw error}
}
