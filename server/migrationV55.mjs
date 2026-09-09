export const routeRequestSchemaSql=`
CREATE TABLE IF NOT EXISTS driver_date_requests (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 dispatch_stop_id INTEGER NOT NULL REFERENCES dispatch_stops(id),
 employee_id INTEGER NOT NULL REFERENCES employees(id),
 source_date TEXT NOT NULL,
 target_date TEXT NOT NULL,
 reason TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 reviewed_by TEXT,
 review_reason TEXT,
 reviewed_at TEXT,
 target_stop_id INTEGER REFERENCES dispatch_stops(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS driver_date_request_pending ON driver_date_requests(dispatch_stop_id) WHERE status='pending';
`
export const ensureV55Schema=db=>db.exec(routeRequestSchemaSql)
export function applyV55Migration(db){
 const version=Number(db.prepare('SELECT MAX(version) v FROM schema_meta').get().v)
 if(version>=55){ensureV55Schema(db);return{schemaVersion:version,noOp:true}}
 if(version!==54)throw new Error('Schema 54 is required')
 db.exec('BEGIN IMMEDIATE')
 try{ensureV55Schema(db);db.exec('INSERT INTO schema_meta(version) VALUES(55)');if(db.prepare('PRAGMA foreign_key_check').get())throw new Error('Foreign-key check failed');db.exec('COMMIT');return{schemaVersion:55}}
 catch(e){db.exec('ROLLBACK');throw e}
}
