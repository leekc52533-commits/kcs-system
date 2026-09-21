export const workCloseSchema=`
CREATE TABLE IF NOT EXISTS trip_work_close_requests(
 id INTEGER PRIMARY KEY,trip_id INTEGER NOT NULL REFERENCES dispatch_trips(id),
 employee_id INTEGER NOT NULL REFERENCES employees(id),service_date TEXT NOT NULL,
 reason TEXT NOT NULL,submitted_stops_json TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,reviewed_at TEXT,reviewed_by TEXT,
 review_reason TEXT,actions_json TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS one_pending_trip_work_close ON trip_work_close_requests(trip_id) WHERE status='pending';
`
export function applyV77Migration(db){
 const v=Number(db.prepare('SELECT MAX(version) v FROM schema_meta').get().v)
 if(v>=77){db.exec(workCloseSchema);return}
 if(v!==76)throw Error('Schema 76 required')
 db.exec('BEGIN IMMEDIATE')
 try{db.exec(workCloseSchema);db.exec('INSERT INTO schema_meta(version) VALUES(77);COMMIT')}catch(e){db.exec('ROLLBACK');throw e}
}
