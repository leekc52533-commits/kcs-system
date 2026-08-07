export const V30_VERSION=30
const columns=(db,table)=>new Set(db.prepare(`PRAGMA table_info("${table}")`).all().map(row=>row.name))
const add=(db,table,name,definition)=>{if(!columns(db,table).has(name))db.exec(`ALTER TABLE "${table}" ADD COLUMN "${name}" ${definition}`)}
const counts=db=>({buyers:db.prepare('SELECT COUNT(*) n FROM buyers').get().n,locations:db.prepare('SELECT COUNT(*) n FROM operational_locations').get().n,dispatches:db.prepare('SELECT COUNT(*) n FROM dispatches').get().n,stops:db.prepare('SELECT COUNT(*) n FROM dispatch_stops').get().n})
export function ensureV30Schema(db){
  add(db,'operational_locations','accepted_materials','TEXT')
  add(db,'operational_locations','unloading_restrictions','TEXT')
  add(db,'operational_locations','pricing_notes','TEXT')
  db.exec("CREATE TABLE IF NOT EXISTS system_sequences(name TEXT PRIMARY KEY,next_value INTEGER NOT NULL);INSERT OR IGNORE INTO system_sequences(name,next_value) VALUES('buyer_branch',10001);CREATE INDEX IF NOT EXISTS operational_locations_buyer_idx ON operational_locations(buyer_id,status,is_active)")
}
export function applyV30Migration(db){
  const version=Number(db.prepare('SELECT COALESCE(MAX(version),0) version FROM schema_meta').get().version)
  if(version>=V30_VERSION)return{schemaVersion:version,noOp:true,before:counts(db),after:counts(db)}
  if(version!==29)throw new Error(`Schema v29 is required before v30; current schema is v${version}`)
  if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw new Error('Database integrity check failed before v30 migration')
  const before=counts(db);db.exec('BEGIN IMMEDIATE');try{ensureV30Schema(db);db.prepare('INSERT INTO schema_meta(version) VALUES(?)').run(V30_VERSION);const after=counts(db);if(JSON.stringify(before)!==JSON.stringify(after))throw new Error('Protected Buyer/location/dispatch counts changed during v30 migration');db.exec('COMMIT');return{schemaVersion:V30_VERSION,noOp:false,before,after}}catch(error){db.exec('ROLLBACK');throw error}
}
