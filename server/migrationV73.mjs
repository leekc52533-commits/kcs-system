export const incomeNoticeSchema=`
CREATE TABLE IF NOT EXISTS income_notifications(
 id INTEGER PRIMARY KEY AUTOINCREMENT,employee_id INTEGER NOT NULL REFERENCES employees(id),update_date TEXT NOT NULL,
 summary_json TEXT NOT NULL,created_at TEXT NOT NULL,read_at TEXT,
 UNIQUE(employee_id,update_date)
);
CREATE TRIGGER IF NOT EXISTS income_notice_snapshot_immutable BEFORE UPDATE OF employee_id,update_date,summary_json,created_at ON income_notifications BEGIN SELECT RAISE(ABORT,'Income notice snapshot is immutable'); END;
CREATE INDEX IF NOT EXISTS income_notice_employee ON income_notifications(employee_id,id DESC);
`
export function applyV73Migration(db){const v=Number(db.prepare('SELECT MAX(version) v FROM schema_meta').get().v);if(v>=73){db.exec(incomeNoticeSchema);return}if(v!==72)throw Error('Schema 72 required');db.exec('BEGIN IMMEDIATE');try{db.exec(incomeNoticeSchema);db.exec('INSERT INTO schema_meta(version) VALUES(73)');db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}}
