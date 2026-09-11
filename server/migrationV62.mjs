export const temporaryIntakeSchemaSql=`
CREATE TABLE IF NOT EXISTS temporary_customer_intakes (
 id INTEGER PRIMARY KEY, request_key TEXT NOT NULL UNIQUE,
 branch_id INTEGER NOT NULL UNIQUE REFERENCES branches(id),
 dispatch_stop_id INTEGER NOT NULL UNIQUE REFERENCES dispatch_stops(id),
 employee_id INTEGER NOT NULL REFERENCES employees(id),
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','pending','formal','one_time','linked','cancelled')),
 linked_branch_id INTEGER REFERENCES branches(id),
 prices_json TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 reviewed_at TEXT, reviewed_by TEXT, review_reason TEXT
);
CREATE INDEX IF NOT EXISTS temporary_intake_queue ON temporary_customer_intakes(status,created_at);
CREATE TABLE IF NOT EXISTS temporary_customer_intake_events (
 id INTEGER PRIMARY KEY, intake_id INTEGER NOT NULL REFERENCES temporary_customer_intakes(id),
 action TEXT NOT NULL, actor TEXT NOT NULL, details_json TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`
export function applyV62Migration(db){
 const v=Number(db.prepare('SELECT MAX(version) v FROM schema_meta').get().v)
 if(v>=62){db.exec(temporaryIntakeSchemaSql);return}
 if(v!==61)throw Error('Schema 61 required')
 db.exec('BEGIN IMMEDIATE')
 try{db.exec(temporaryIntakeSchemaSql);db.exec('INSERT INTO schema_meta(version) VALUES(62)');db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}
}
