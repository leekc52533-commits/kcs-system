export const driverArrangementSchemaSql=`
CREATE TABLE IF NOT EXISTS driver_arrangement_requests (
 id INTEGER PRIMARY KEY,dispatch_stop_id INTEGER NOT NULL REFERENCES dispatch_stops(id),
 service_date TEXT NOT NULL,employee_id INTEGER NOT NULL REFERENCES employees(id),employee_role TEXT NOT NULL,
 trip_id INTEGER NOT NULL REFERENCES dispatch_trips(id),vehicle_id INTEGER REFERENCES vehicles(id),driver_id INTEGER REFERENCES employees(id),
 kind TEXT NOT NULL CHECK(kind IN ('order','no_goods')),reason TEXT NOT NULL,payload_json TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,reviewed_at TEXT,reviewed_by TEXT,review_reason TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS driver_arrangement_pending ON driver_arrangement_requests(dispatch_stop_id,kind) WHERE status='pending';
`
export function applyV64Migration(db){
 const v=Number(db.prepare('SELECT MAX(version) v FROM schema_meta').get().v)
 if(v>=64){db.exec(driverArrangementSchemaSql);return}
 if(v!==63)throw Error('Schema 63 required')
 db.exec('BEGIN IMMEDIATE');try{db.exec(driverArrangementSchemaSql);db.exec('INSERT INTO schema_meta(version) VALUES(64)');db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}
}
