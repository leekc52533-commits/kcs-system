export const V41_VERSION=41

const exists=(db,table)=>Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table))
const count=(db,table)=>exists(db,table)?db.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n:0
const counts=db=>({branches:count(db,'branches'),customers:count(db,'customers'),areas:count(db,'areas'),officialGps:exists(db,'branches')?db.prepare('SELECT COUNT(*) n FROM branches WHERE latitude IS NOT NULL AND longitude IS NOT NULL').get().n:0,dispatches:count(db,'dispatches'),stops:count(db,'dispatch_stops'),routeTemplates:count(db,'route_templates'),analyses:count(db,'area_refinement_analyses'),suggestions:count(db,'area_refinement_suggestions')})
const columns=(db,table)=>new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(row=>row.name))

export function ensureV41Schema(db){
  const existing=columns(db,'branches')
  if(!existing.has('lifecycle_status'))db.exec("ALTER TABLE branches ADD COLUMN lifecycle_status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(lifecycle_status IN ('ACTIVE','TEMPORARILY_PAUSED','CLOSED','DUPLICATE_REPLACED','NOT_COLLECTING','TEST_INVALID'))")
  if(!existing.has('status_reason'))db.exec('ALTER TABLE branches ADD COLUMN status_reason TEXT')
  if(!existing.has('status_changed_at'))db.exec('ALTER TABLE branches ADD COLUMN status_changed_at TEXT')
  if(!existing.has('status_changed_by'))db.exec('ALTER TABLE branches ADD COLUMN status_changed_by TEXT')
  if(!existing.has('replaced_by_branch_id'))db.exec('ALTER TABLE branches ADD COLUMN replaced_by_branch_id INTEGER REFERENCES branches(id)')
  const refreshed=columns(db,'branches'),lifecycleColumns=['lifecycle_status',...(refreshed.has('customer_id')?['customer_id']:[]),...(refreshed.has('area_id')?['area_id']:[])].join(',')
  db.exec(`CREATE INDEX IF NOT EXISTS branches_lifecycle_idx ON branches(${lifecycleColumns});CREATE INDEX IF NOT EXISTS branches_replaced_by_idx ON branches(replaced_by_branch_id);`)
}

export function applyV41Migration(db){
  const version=Number(db.prepare('SELECT COALESCE(MAX(version),0) version FROM schema_meta').get().version)
  if(version>=V41_VERSION)return{schemaVersion:version,noOp:true,before:counts(db),after:counts(db)}
  if(version!==40)throw new Error(`Schema v40 is required before v41; current schema is v${version}`)
  if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw new Error('Database integrity check failed before v41 migration')
  const before=counts(db),legacy={active:db.prepare("SELECT COUNT(*) n FROM branches WHERE is_active=1 AND LOWER(COALESCE(status,'active'))='active'").get().n,paused:db.prepare("SELECT COUNT(*) n FROM branches WHERE LOWER(COALESCE(status,''))='paused'").get().n,closed:db.prepare("SELECT COUNT(*) n FROM branches WHERE LOWER(COALESCE(status,''))='closed'").get().n,ambiguousInactive:db.prepare("SELECT COUNT(*) n FROM branches WHERE is_active=0 AND LOWER(COALESCE(status,'')) NOT IN ('paused','closed')").get().n}
  db.exec('BEGIN IMMEDIATE')
  try{
    ensureV41Schema(db)
    db.exec(`UPDATE branches SET lifecycle_status=CASE WHEN LOWER(COALESCE(status,'active'))='closed' THEN 'CLOSED' WHEN LOWER(COALESCE(status,'active'))='paused' OR is_active=0 THEN 'TEMPORARILY_PAUSED' ELSE 'ACTIVE' END,status_reason=CASE WHEN LOWER(COALESCE(status,'active')) IN ('paused','closed') OR is_active=0 THEN 'Migrated from legacy Branch operational status' ELSE NULL END,status_changed_at=CASE WHEN LOWER(COALESCE(status,'active')) IN ('paused','closed') OR is_active=0 THEN CURRENT_TIMESTAMP ELSE NULL END,status_changed_by=CASE WHEN LOWER(COALESCE(status,'active')) IN ('paused','closed') OR is_active=0 THEN 'System Migration v41' ELSE NULL END,replaced_by_branch_id=NULL`)
    db.prepare('INSERT INTO schema_meta(version) VALUES(?)').run(V41_VERSION)
    const after=counts(db)
    if(JSON.stringify(before)!==JSON.stringify(after))throw new Error('Protected Branch, Customer, GPS, Dispatch, Stop or analysis counts changed during v41 migration')
    if(db.prepare('PRAGMA foreign_key_check').get())throw new Error('Foreign-key validation failed during v41 migration')
    if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw new Error('Database integrity check failed after v41 migration')
    db.exec('COMMIT')
    return{schemaVersion:V41_VERSION,noOp:false,before,after,legacyMapping:legacy,statusCounts:Object.fromEntries(db.prepare('SELECT lifecycle_status status,COUNT(*) n FROM branches GROUP BY lifecycle_status').all().map(row=>[row.status,row.n]))}
  }catch(error){db.exec('ROLLBACK');throw error}
}
