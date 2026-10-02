// Append-only, explicitly approved attribution corrections. Original links stay immutable.
export const cargoCorrectionSchema=`
CREATE TABLE IF NOT EXISTS cargo_unload_corrections(
 record_id INTEGER PRIMARY KEY REFERENCES cargo_batch_unloads(record_id),
 original_batch_id INTEGER NOT NULL REFERENCES cargo_batches(id),
 batch_id INTEGER NOT NULL REFERENCES cargo_batches(id),
 reference TEXT NOT NULL,reason TEXT NOT NULL,approved_by TEXT NOT NULL,
 before_json TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER IF NOT EXISTS cargo_corrections_no_update BEFORE UPDATE ON cargo_unload_corrections BEGIN SELECT RAISE(ABORT,'Permanent cargo correction'); END;
CREATE TRIGGER IF NOT EXISTS cargo_corrections_no_delete BEFORE DELETE ON cargo_unload_corrections BEGIN SELECT RAISE(ABORT,'Permanent cargo correction'); END;
CREATE TABLE IF NOT EXISTS cargo_unload_correction_revisions(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 record_id INTEGER NOT NULL REFERENCES cargo_batch_unloads(record_id),
 previous_batch_id INTEGER NOT NULL REFERENCES cargo_batches(id),
 batch_id INTEGER NOT NULL REFERENCES cargo_batches(id),
 reference TEXT NOT NULL,reason TEXT NOT NULL,approved_by TEXT NOT NULL,
 before_json TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(reference,record_id)
);
CREATE INDEX IF NOT EXISTS cargo_revision_record ON cargo_unload_correction_revisions(record_id,id DESC);
CREATE TRIGGER IF NOT EXISTS cargo_revisions_no_update BEFORE UPDATE ON cargo_unload_correction_revisions BEGIN SELECT RAISE(ABORT,'Permanent cargo correction revision'); END;
CREATE TRIGGER IF NOT EXISTS cargo_revisions_no_delete BEFORE DELETE ON cargo_unload_correction_revisions BEGIN SELECT RAISE(ABORT,'Permanent cargo correction revision'); END;
`
const hasTable=(db,name)=>Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name))
export function cargoAttributionSql(db){
 const original=hasTable(db,'cargo_unload_corrections'),revisions=hasTable(db,'cargo_unload_correction_revisions')
 const join=[revisions?'LEFT JOIN cargo_unload_correction_revisions cr ON cr.id=(SELECT MAX(r.id) FROM cargo_unload_correction_revisions r WHERE r.record_id=u.record_id)':'',original?'LEFT JOIN cargo_unload_corrections c ON c.record_id=u.record_id':''].filter(Boolean).join(' ')
 const ids=[revisions?'cr.batch_id':null,original?'c.batch_id':null,'u.batch_id'].filter(Boolean)
 return{join,batchId:ids.length>1?`COALESCE(${ids.join(',')})`:ids[0]}
}
export function isAttributionOnlyBatch(db,id){
 return ['cargo_unload_corrections','cargo_unload_correction_revisions'].some(table=>hasTable(db,table)&&Boolean(db.prepare(`SELECT 1 FROM ${table} WHERE batch_id=? LIMIT 1`).get(id)))
}
