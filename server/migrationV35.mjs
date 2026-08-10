export const V35_VERSION=35
const columns=(db,table)=>new Set(db.prepare(`PRAGMA table_info("${table}")`).all().map(row=>row.name))
const add=(db,name,definition)=>{if(!columns(db,'dispatches').has(name))db.exec(`ALTER TABLE dispatches ADD COLUMN "${name}" ${definition}`)}
const counts=db=>({buyers:db.prepare('SELECT COUNT(*) n FROM buyers').get().n,locations:db.prepare('SELECT COUNT(*) n FROM operational_locations').get().n,dispatches:db.prepare('SELECT COUNT(*) n FROM dispatches').get().n,stops:db.prepare('SELECT COUNT(*) n FROM dispatch_stops').get().n})

export function ensureV35Schema(db){
  add(db,'buyer_reference_id','INTEGER');add(db,'buyer_code','TEXT');add(db,'buyer_name','TEXT')
  add(db,'end_location_reference_type','TEXT');add(db,'end_location_reference_id','INTEGER');add(db,'end_location_name','TEXT');add(db,'end_location_parent_name','TEXT');add(db,'end_address','TEXT')
  add(db,'end_latitude','REAL CHECK (end_latitude BETWEEN -90 AND 90 OR end_latitude IS NULL)');add(db,'end_longitude','REAL CHECK (end_longitude BETWEEN -180 AND 180 OR end_longitude IS NULL)')
}

export function applyV35Migration(db){const version=Number(db.prepare('SELECT COALESCE(MAX(version),0) version FROM schema_meta').get().version);if(version>=V35_VERSION)return{schemaVersion:version,noOp:true,before:counts(db),after:counts(db)};if(version!==34)throw new Error(`Schema v34 is required before v35; current schema is v${version}`);if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw new Error('Database integrity check failed before v35 migration');const before=counts(db);db.exec('BEGIN IMMEDIATE');try{ensureV35Schema(db);db.prepare('INSERT INTO schema_meta(version) VALUES(?)').run(V35_VERSION);const after=counts(db);if(JSON.stringify(before)!==JSON.stringify(after))throw new Error('Protected Buyer/location/dispatch counts changed during v35 migration');db.exec('COMMIT');return{schemaVersion:V35_VERSION,noOp:false,before,after}}catch(error){db.exec('ROLLBACK');throw error}}
