export const V40_VERSION=40

const counts=db=>({
  zones:db.prepare('SELECT COUNT(*) n FROM zone_groups').get().n,
  areas:db.prepare('SELECT COUNT(*) n FROM areas').get().n,
  branches:db.prepare('SELECT COUNT(*) n FROM branches').get().n,
  dispatches:db.prepare('SELECT COUNT(*) n FROM dispatches').get().n,
  stops:db.prepare('SELECT COUNT(*) n FROM dispatch_stops').get().n,
  analyses:db.prepare('SELECT COUNT(*) n FROM area_refinement_analyses').get().n,
  suggestions:db.prepare('SELECT COUNT(*) n FROM area_refinement_suggestions').get().n,
})

const columns=(db,table)=>new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(row=>row.name))

export function ensureV40Schema(db){
  const existing=columns(db,'area_refinement_analyses')
  if(!existing.has('scope_type'))db.exec("ALTER TABLE area_refinement_analyses ADD COLUMN scope_type TEXT NOT NULL DEFAULT 'area' CHECK(scope_type IN ('area','zone'))")
  if(!existing.has('zone_group_id'))db.exec('ALTER TABLE area_refinement_analyses ADD COLUMN zone_group_id INTEGER REFERENCES zone_groups(id)')
  db.exec(`
    UPDATE area_refinement_analyses SET scope_type='area' WHERE scope_type IS NULL;
    CREATE INDEX IF NOT EXISTS area_refinement_analyses_zone_idx ON area_refinement_analyses(zone_group_id,scope_type,status,created_at DESC);
  `)
}

export function applyV40Migration(db){
  const version=Number(db.prepare('SELECT COALESCE(MAX(version),0) version FROM schema_meta').get().version)
  if(version>=V40_VERSION)return{schemaVersion:version,noOp:true,before:counts(db),after:counts(db)}
  if(version!==39)throw new Error(`Schema v39 is required before v40; current schema is v${version}`)
  if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw new Error('Database integrity check failed before v40 migration')
  const before=counts(db),legacyIds=db.prepare("SELECT GROUP_CONCAT(id,',') ids FROM area_refinement_analyses ORDER BY id").get().ids
  db.exec('BEGIN IMMEDIATE')
  try{
    ensureV40Schema(db)
    const preservedIds=db.prepare("SELECT GROUP_CONCAT(id,',') ids FROM area_refinement_analyses ORDER BY id").get().ids
    if(preservedIds!==legacyIds)throw new Error('Existing Area refinement Analysis IDs were not preserved')
    db.prepare('INSERT INTO schema_meta(version) VALUES(?)').run(V40_VERSION)
    const after=counts(db)
    if(JSON.stringify(before)!==JSON.stringify(after))throw new Error('Protected Zone, Area, Branch, Dispatch or Preview counts changed during v40 migration')
    if(db.prepare('PRAGMA foreign_key_check').get())throw new Error('Foreign-key validation failed during v40 migration')
    db.exec('COMMIT')
    return{schemaVersion:V40_VERSION,noOp:false,before,after}
  }catch(error){db.exec('ROLLBACK');throw error}
}
