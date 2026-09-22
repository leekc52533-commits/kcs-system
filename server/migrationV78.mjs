export const dateEvidenceSchema=`CREATE TABLE IF NOT EXISTS driver_date_evidence(
 request_id INTEGER PRIMARY KEY REFERENCES driver_date_requests(id),reason_code TEXT NOT NULL,
 details_json TEXT NOT NULL,storage_key TEXT,content_type TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);`
export function applyV78Migration(db){
 const v=Number(db.prepare('SELECT MAX(version) v FROM schema_meta').get().v)
 if(v>=78){db.exec(dateEvidenceSchema);return}
 if(v!==77)throw Error('Schema 77 required')
 db.exec('BEGIN IMMEDIATE');try{db.exec(dateEvidenceSchema);db.exec('INSERT INTO schema_meta(version) VALUES(78);COMMIT')}catch(e){db.exec('ROLLBACK');throw e}
}
