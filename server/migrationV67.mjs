export const expenseCorrectionSchema=`
CREATE TABLE IF NOT EXISTS expense_amount_corrections (
 id INTEGER PRIMARY KEY,record_key TEXT NOT NULL,
 old_amount_cents INTEGER NOT NULL CHECK(old_amount_cents>0),
 new_amount_cents INTEGER NOT NULL CHECK(new_amount_cents>0),
 reason TEXT NOT NULL,account_id INTEGER NOT NULL REFERENCES auth_accounts(id),
 actor_name TEXT NOT NULL,created_at TEXT NOT NULL,
 CHECK(old_amount_cents<>new_amount_cents)
);
CREATE INDEX IF NOT EXISTS expense_corrections_record ON expense_amount_corrections(record_key,id);
CREATE TRIGGER IF NOT EXISTS expense_corrections_no_update BEFORE UPDATE ON expense_amount_corrections BEGIN SELECT RAISE(ABORT,'Audit is immutable'); END;
CREATE TRIGGER IF NOT EXISTS expense_corrections_no_delete BEFORE DELETE ON expense_amount_corrections BEGIN SELECT RAISE(ABORT,'Audit is immutable'); END;
`
export function applyV67Migration(db){
 const v=Number(db.prepare('SELECT MAX(version) v FROM schema_meta').get().v)
 if(v>=67){db.exec(expenseCorrectionSchema);return}
 if(v!==66)throw Error('Schema 66 required')
 db.exec('BEGIN IMMEDIATE');try{db.exec(expenseCorrectionSchema);db.exec('INSERT INTO schema_meta(version) VALUES(67)');db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}
}
