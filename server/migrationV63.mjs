export const customerPickupSchemaSql=`
CREATE TABLE IF NOT EXISTS existing_customer_pickups (
 dispatch_stop_id INTEGER PRIMARY KEY REFERENCES dispatch_stops(id),
 employee_id INTEGER NOT NULL REFERENCES employees(id),
 kind TEXT NOT NULL CHECK(kind IN ('added','transferred','existing')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS customer_transfer_requests (
 id INTEGER PRIMARY KEY, dispatch_stop_id INTEGER NOT NULL REFERENCES dispatch_stops(id),
 service_date TEXT NOT NULL, requester_employee_id INTEGER NOT NULL REFERENCES employees(id),requester_role TEXT NOT NULL,
 source_trip_id INTEGER NOT NULL REFERENCES dispatch_trips(id),source_dispatch_id INTEGER NOT NULL REFERENCES dispatches(id),
 source_vehicle_id INTEGER REFERENCES vehicles(id),source_driver_id INTEGER REFERENCES employees(id),
 target_trip_id INTEGER NOT NULL REFERENCES dispatch_trips(id),target_vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
 reason TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,reviewed_at TEXT,reviewed_by TEXT,review_reason TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS customer_transfer_pending_stop ON customer_transfer_requests(dispatch_stop_id) WHERE status='pending';
`
export function applyV63Migration(db){
 const v=Number(db.prepare('SELECT MAX(version) v FROM schema_meta').get().v)
 if(v>=63){db.exec(customerPickupSchemaSql);return}
 if(v!==62)throw Error('Schema 62 required')
 db.exec('BEGIN IMMEDIATE');try{db.exec(customerPickupSchemaSql);db.exec('INSERT INTO schema_meta(version) VALUES(63)');db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}
}
