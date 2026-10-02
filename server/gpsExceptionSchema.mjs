export function ensureGpsExceptionSchema(db){
 db.exec(`CREATE TABLE IF NOT EXISTS gps_arrival_requests(
 id INTEGER PRIMARY KEY, stop_id INTEGER NOT NULL REFERENCES dispatch_stops(id),
 service_date TEXT NOT NULL, employee_id INTEGER NOT NULL REFERENCES employees(id),
 employee_role TEXT NOT NULL, trip_id INTEGER NOT NULL, vehicle_id INTEGER NOT NULL,
 reason TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, reviewed_at TEXT, reviewed_by TEXT, review_reason TEXT);
 CREATE UNIQUE INDEX IF NOT EXISTS gps_arrival_one_pending ON gps_arrival_requests(stop_id) WHERE status='pending';`)
}
