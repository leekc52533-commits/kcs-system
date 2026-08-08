export const V31_VERSION=31
const columns=(db,table)=>new Set(db.prepare(`PRAGMA table_info("${table}")`).all().map(row=>row.name))
const add=(db,table,name,definition)=>{if(!columns(db,table).has(name))db.exec(`ALTER TABLE "${table}" ADD COLUMN "${name}" ${definition}`)}
const counts=db=>({branches:db.prepare('SELECT COUNT(*) n FROM branches').get().n,temporaryLocations:db.prepare('SELECT COUNT(*) n FROM temporary_locations').get().n,dispatches:db.prepare('SELECT COUNT(*) n FROM dispatches').get().n,stops:db.prepare('SELECT COUNT(*) n FROM dispatch_stops').get().n})

export function ensureV31Schema(db){
  for(const [name,definition] of [['address','TEXT'],['state','TEXT'],['street','TEXT'],['city','TEXT'],['street_number','TEXT'],['postal_code','TEXT'],['reverse_geocode_provider','TEXT']])add(db,'temporary_locations',name,definition)
  for(const [name,definition] of [['gps_address','TEXT'],['gps_state','TEXT'],['gps_street','TEXT'],['gps_city','TEXT'],['gps_street_number','TEXT'],['gps_postal_code','TEXT'],['gps_remark','TEXT'],['gps_reverse_geocode_provider','TEXT']])add(db,'branches',name,definition)
  db.exec(`CREATE TABLE IF NOT EXISTS branch_gps_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    branch_id INTEGER NOT NULL REFERENCES branches(id),
    action TEXT NOT NULL CHECK(action IN ('approved','withdrawn')),
    latitude REAL,longitude REAL,address TEXT,state TEXT,street TEXT,city TEXT,street_number TEXT,postal_code TEXT,remark TEXT,reverse_geocode_provider TEXT,
    actor TEXT NOT NULL,reason TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );CREATE INDEX IF NOT EXISTS branch_gps_history_branch_idx ON branch_gps_history(branch_id,created_at)`)
}

export function applyV31Migration(db){
  const version=Number(db.prepare('SELECT COALESCE(MAX(version),0) version FROM schema_meta').get().version)
  if(version>=V31_VERSION)return{schemaVersion:version,noOp:true,before:counts(db),after:counts(db)}
  if(version!==30)throw new Error(`Schema v30 is required before v31; current schema is v${version}`)
  if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw new Error('Database integrity check failed before v31 migration')
  const before=counts(db);db.exec('BEGIN IMMEDIATE');try{ensureV31Schema(db);db.prepare('INSERT INTO schema_meta(version) VALUES(?)').run(V31_VERSION);const after=counts(db);if(JSON.stringify(before)!==JSON.stringify(after))throw new Error('Protected Branch/temporary GPS/dispatch counts changed during v31 migration');db.exec('COMMIT');return{schemaVersion:V31_VERSION,noOp:false,before,after}}catch(error){db.exec('ROLLBACK');throw error}
}
