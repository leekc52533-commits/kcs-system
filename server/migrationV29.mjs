export const V29_VERSION=29
const columns=(db,table)=>new Set(db.prepare(`PRAGMA table_info("${table}")`).all().map(row=>row.name))
const add=(db,table,name,definition)=>{if(!columns(db,table).has(name))db.exec(`ALTER TABLE "${table}" ADD COLUMN "${name}" ${definition}`)}
const counts=db=>({vehicles:db.prepare('SELECT COUNT(*) n FROM vehicles').get().n,dispatches:db.prepare('SELECT COUNT(*) n FROM dispatches').get().n,stops:db.prepare('SELECT COUNT(*) n FROM dispatch_stops').get().n,documents:db.prepare('SELECT COUNT(*) n FROM vehicle_documents').get().n})

export function ensureV29Schema(db){
  for(const [name,definition] of [['registered_owner','TEXT'],['fuel_type','TEXT'],['engine_capacity_cc','INTEGER'],['vehicle_origin','TEXT'],['vehicle_class','TEXT']])add(db,'vehicles',name,definition)
  for(const [name,definition] of [['sha256','TEXT'],['remark','TEXT'],['uploaded_by_account_id','INTEGER REFERENCES auth_accounts(id)'],['version_number','INTEGER NOT NULL DEFAULT 1'],['is_current','INTEGER NOT NULL DEFAULT 1'],['supersedes_document_id','INTEGER REFERENCES vehicle_documents(id)'],['superseded_at','TEXT']])add(db,'vehicle_documents',name,definition)
  db.exec(`CREATE TABLE IF NOT EXISTS vehicle_document_audit(id INTEGER PRIMARY KEY AUTOINCREMENT,vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),document_id INTEGER NOT NULL REFERENCES vehicle_documents(id),previous_document_id INTEGER REFERENCES vehicle_documents(id),action TEXT NOT NULL,document_type TEXT NOT NULL,sha256 TEXT NOT NULL,actor_account_id INTEGER REFERENCES auth_accounts(id),actor_name TEXT NOT NULL,remark TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`)
  const groups=db.prepare('SELECT vehicle_id,document_type FROM vehicle_documents GROUP BY vehicle_id,document_type HAVING COUNT(*)>1').all()
  for(const group of groups){const rows=db.prepare('SELECT id,uploaded_at FROM vehicle_documents WHERE vehicle_id=? AND document_type=? ORDER BY uploaded_at,id').all(group.vehicle_id,group.document_type);rows.forEach((row,index)=>db.prepare('UPDATE vehicle_documents SET version_number=?,is_current=?,supersedes_document_id=?,superseded_at=? WHERE id=?').run(index+1,index===rows.length-1?1:0,index?rows[index-1].id:null,index===rows.length-1?null:rows[index+1].uploaded_at,row.id))}
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS vehicle_document_current_uq ON vehicle_documents(vehicle_id,document_type) WHERE is_current=1;CREATE UNIQUE INDEX IF NOT EXISTS vehicle_document_version_uq ON vehicle_documents(vehicle_id,document_type,version_number)')
}

export function applyV29Migration(db){
  const version=Number(db.prepare('SELECT COALESCE(MAX(version),0) version FROM schema_meta').get().version)
  if(version>=V29_VERSION)return{schemaVersion:version,noOp:true,before:counts(db),after:counts(db)}
  if(version!==28)throw new Error(`Schema v28 is required before v29; current schema is v${version}`)
  if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw new Error('Database integrity check failed before v29 migration')
  const before=counts(db),protectedVehicles=db.prepare('SELECT id,registration_number,capacity_kg,operational_status FROM vehicles ORDER BY id').all()
  db.exec('BEGIN IMMEDIATE')
  try{ensureV29Schema(db);db.prepare('INSERT INTO schema_meta(version) VALUES(?)').run(V29_VERSION);const after=counts(db);if(JSON.stringify(before)!==JSON.stringify(after))throw new Error('Protected vehicle/dispatch/document counts changed during v29 migration');if(JSON.stringify(protectedVehicles)!==JSON.stringify(db.prepare('SELECT id,registration_number,capacity_kg,operational_status FROM vehicles ORDER BY id').all()))throw new Error('Protected vehicle fields changed during v29 migration');db.exec('COMMIT');return{schemaVersion:V29_VERSION,noOp:false,before,after}}
  catch(error){db.exec('ROLLBACK');throw error}
}
