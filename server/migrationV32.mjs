export const V32_VERSION=32
const columns=(db,table)=>new Set(db.prepare(`PRAGMA table_info("${table}")`).all().map(row=>row.name))
const add=(db,table,name,definition)=>{if(!columns(db,table).has(name))db.exec(`ALTER TABLE "${table}" ADD COLUMN "${name}" ${definition}`)}
const counts=db=>({branches:db.prepare('SELECT COUNT(*) n FROM branches').get().n,temporaryLocations:db.prepare('SELECT COUNT(*) n FROM temporary_locations').get().n,dispatches:db.prepare('SELECT COUNT(*) n FROM dispatches').get().n,stops:db.prepare('SELECT COUNT(*) n FROM dispatch_stops').get().n})

export function ensureV32Schema(db){
  for(const [name,definition]of[['captured_latitude','REAL'],['captured_longitude','REAL'],['captured_accuracy_m','REAL'],['manually_adjusted','INTEGER NOT NULL DEFAULT 0'],['adjusted_by','TEXT'],['adjusted_at','TEXT'],['adjustment_reason','TEXT'],['adjustment_distance_m','REAL']])add(db,'temporary_locations',name,definition)
}

export function applyV32Migration(db){
  const version=Number(db.prepare('SELECT COALESCE(MAX(version),0) version FROM schema_meta').get().version)
  if(version>=V32_VERSION)return{schemaVersion:version,noOp:true,before:counts(db),after:counts(db)}
  if(version!==31)throw new Error(`Schema v31 is required before v32; current schema is v${version}`)
  if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw new Error('Database integrity check failed before v32 migration')
  const before=counts(db);db.exec('BEGIN IMMEDIATE');try{ensureV32Schema(db);db.prepare('INSERT INTO schema_meta(version) VALUES(?)').run(V32_VERSION);const after=counts(db);if(JSON.stringify(before)!==JSON.stringify(after))throw new Error('Protected GPS/dispatch counts changed during v32 migration');db.exec('COMMIT');return{schemaVersion:V32_VERSION,noOp:false,before,after}}catch(error){db.exec('ROLLBACK');throw error}
}
