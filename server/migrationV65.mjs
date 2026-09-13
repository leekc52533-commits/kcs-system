export const noticeBoardSchemaSql=`
CREATE TABLE IF NOT EXISTS employee_notices (
 id INTEGER PRIMARY KEY,title TEXT NOT NULL,body TEXT NOT NULL,
 priority TEXT NOT NULL CHECK(priority IN ('normal','urgent')),
 audience TEXT NOT NULL CHECK(audience IN ('all','selected')),
 publisher_id INTEGER NOT NULL REFERENCES employees(id),publisher_name TEXT NOT NULL,
 request_key TEXT NOT NULL UNIQUE,request_json TEXT NOT NULL,created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS employee_notice_receipts (
 notice_id INTEGER NOT NULL REFERENCES employee_notices(id),employee_id INTEGER NOT NULL REFERENCES employees(id),
 employee_name TEXT NOT NULL,read_at TEXT,PRIMARY KEY(notice_id,employee_id)
);
CREATE INDEX IF NOT EXISTS employee_notice_inbox ON employee_notice_receipts(employee_id,notice_id);
`
export function applyV65Migration(db){
 const v=Number(db.prepare('SELECT MAX(version) v FROM schema_meta').get().v)
 if(v>=65){db.exec(noticeBoardSchemaSql);return}
 if(v!==64)throw Error('Schema 64 required')
 db.exec('BEGIN IMMEDIATE');try{db.exec(noticeBoardSchemaSql);db.exec('INSERT INTO schema_meta(version) VALUES(65)');db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}
}
