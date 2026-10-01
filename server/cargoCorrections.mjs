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
`
export function cargoAttributionSql(db){
 return db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='cargo_unload_corrections'").get()
  ?{join:'LEFT JOIN cargo_unload_corrections c ON c.record_id=u.record_id',batchId:'COALESCE(c.batch_id,u.batch_id)'}
  :{join:'',batchId:'u.batch_id'}
}
