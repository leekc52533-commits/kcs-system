export const V39_VERSION=39

const counts=db=>({
  zones:db.prepare('SELECT COUNT(*) n FROM zone_groups').get().n,
  areas:db.prepare('SELECT COUNT(*) n FROM areas').get().n,
  branches:db.prepare('SELECT COUNT(*) n FROM branches').get().n,
  dispatches:db.prepare('SELECT COUNT(*) n FROM dispatches').get().n,
  stops:db.prepare('SELECT COUNT(*) n FROM dispatch_stops').get().n,
})

export function ensureV39Schema(db){db.exec(`
CREATE TABLE IF NOT EXISTS area_refinement_analyses(id INTEGER PRIMARY KEY AUTOINCREMENT,parent_area_id INTEGER NOT NULL REFERENCES areas(id),status TEXT NOT NULL DEFAULT 'preview' CHECK(status IN ('preview','confirmed','cancelled')),include_existing INTEGER NOT NULL DEFAULT 0 CHECK(include_existing IN (0,1)),created_by TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_by TEXT,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,confirmed_by TEXT,confirmed_at TEXT,reason TEXT);
CREATE TABLE IF NOT EXISTS area_refinement_suggestions(id INTEGER PRIMARY KEY AUTOINCREMENT,analysis_id INTEGER NOT NULL REFERENCES area_refinement_analyses(id) ON DELETE CASCADE,branch_id INTEGER NOT NULL REFERENCES branches(id),current_area_id INTEGER REFERENCES areas(id),proposed_area_name TEXT,action TEXT NOT NULL CHECK(action IN ('move','keep','needs_review','need_gps')),confidence TEXT NOT NULL CHECK(confidence IN ('high','medium','needs_review')),reason TEXT NOT NULL,official_latitude REAL,official_longitude REAL,reverse_address TEXT,road TEXT,locality TEXT,sublocality TEXT,postal_code TEXT,reviewed_by TEXT,reviewed_at TEXT,UNIQUE(analysis_id,branch_id));
CREATE TABLE IF NOT EXISTS area_refinement_children(parent_area_id INTEGER NOT NULL REFERENCES areas(id),child_area_id INTEGER NOT NULL UNIQUE REFERENCES areas(id),analysis_id INTEGER NOT NULL REFERENCES area_refinement_analyses(id),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(parent_area_id,child_area_id));
CREATE INDEX IF NOT EXISTS area_refinement_analyses_parent_idx ON area_refinement_analyses(parent_area_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS area_refinement_suggestions_analysis_idx ON area_refinement_suggestions(analysis_id,action,confidence);
`)}

export function applyV39Migration(db){
  const version=Number(db.prepare('SELECT COALESCE(MAX(version),0) version FROM schema_meta').get().version)
  if(version>=V39_VERSION)return{schemaVersion:version,noOp:true,before:counts(db),after:counts(db)}
  if(version!==38)throw new Error(`Schema v38 is required before v39; current schema is v${version}`)
  if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw new Error('Database integrity check failed before v39 migration')
  const before=counts(db)
  db.exec('BEGIN IMMEDIATE')
  try{
    ensureV39Schema(db)
    if(db.prepare('SELECT COUNT(*) n FROM area_refinement_analyses').get().n!==0)throw new Error('v39 must not create Area refinement analyses automatically')
    db.prepare('INSERT INTO schema_meta(version) VALUES(?)').run(V39_VERSION)
    const after=counts(db)
    if(JSON.stringify(before)!==JSON.stringify(after))throw new Error('Protected Area, Branch or Dispatch counts changed during v39 migration')
    db.exec('COMMIT')
    return{schemaVersion:V39_VERSION,noOp:false,before,after}
  }catch(error){db.exec('ROLLBACK');throw error}
}
