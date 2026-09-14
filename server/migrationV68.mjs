export const expenseRequestSchema=`
CREATE TABLE IF NOT EXISTS expense_correction_requests (
 id INTEGER PRIMARY KEY,record_key TEXT NOT NULL,old_amount_cents INTEGER NOT NULL,new_amount_cents INTEGER NOT NULL,
 expected_revision INTEGER NOT NULL,reason TEXT NOT NULL,requester_account_id INTEGER NOT NULL REFERENCES auth_accounts(id),
 requester_name TEXT NOT NULL,created_at TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 reviewer_account_id INTEGER REFERENCES auth_accounts(id),reviewer_name TEXT,review_reason TEXT,reviewed_at TEXT,
 correction_id INTEGER REFERENCES expense_amount_corrections(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS expense_request_pending ON expense_correction_requests(record_key) WHERE status='pending';
`
export function applyV68Migration(db){const v=Number(db.prepare('SELECT MAX(version) v FROM schema_meta').get().v);if(v>=68){db.exec(expenseRequestSchema);return}if(v!==67)throw Error('Schema 67 required');db.exec('BEGIN IMMEDIATE');try{db.exec(expenseRequestSchema);db.exec('INSERT INTO schema_meta(version) VALUES(68)');db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}}
