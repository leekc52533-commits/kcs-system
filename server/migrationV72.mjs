export const earningsSchema=`
CREATE TABLE IF NOT EXISTS earnings_rules(id INTEGER PRIMARY KEY AUTOINCREMENT,effective_start TEXT NOT NULL,rules_json TEXT NOT NULL,actor_id INTEGER,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS earnings_payments(period_start TEXT NOT NULL,employee_id INTEGER NOT NULL REFERENCES employees(id),snapshot_json TEXT NOT NULL,actor_id INTEGER NOT NULL,paid_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(period_start,employee_id));
CREATE TRIGGER IF NOT EXISTS earnings_rules_immutable BEFORE UPDATE ON earnings_rules BEGIN SELECT RAISE(ABORT,'Immutable rate version'); END;
CREATE TRIGGER IF NOT EXISTS earnings_rules_no_delete BEFORE DELETE ON earnings_rules BEGIN SELECT RAISE(ABORT,'Permanent rate version'); END;
CREATE TRIGGER IF NOT EXISTS earnings_payments_immutable BEFORE UPDATE ON earnings_payments BEGIN SELECT RAISE(ABORT,'Immutable payment snapshot'); END;
CREATE TRIGGER IF NOT EXISTS earnings_payments_no_delete BEFORE DELETE ON earnings_payments BEGIN SELECT RAISE(ABORT,'Permanent payment snapshot'); END;
`
export function applyV72Migration(db){const v=Number(db.prepare('SELECT MAX(version) v FROM schema_meta').get().v);if(v>=72){db.exec(earningsSchema);return}if(v!==71)throw Error('Schema 71 required');db.exec('BEGIN IMMEDIATE');try{db.exec(earningsSchema);db.exec('INSERT INTO schema_meta(version) VALUES(72)');db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}}
