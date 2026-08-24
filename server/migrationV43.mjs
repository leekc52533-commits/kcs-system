export const V43_VERSION=43

export function ensureV43Schema(db){db.exec(`
CREATE TABLE IF NOT EXISTS route_optimization_runs (
 id INTEGER PRIMARY KEY AUTOINCREMENT, dispatch_day_id INTEGER NOT NULL REFERENCES dispatch_days(id), request_hash TEXT NOT NULL,
 provider TEXT NOT NULL DEFAULT 'google', mode TEXT NOT NULL CHECK(mode IN ('day','trip')), status TEXT NOT NULL,
 base_revision INTEGER NOT NULL, trip_id INTEGER, request_summary_json TEXT NOT NULL, result_summary_json TEXT,
 before_snapshot_json TEXT NOT NULL, proposed_snapshot_json TEXT, applied_snapshot_json TEXT, metrics_json TEXT,
 warnings_json TEXT, unassigned_json TEXT, reason TEXT, actor TEXT NOT NULL, correlation_id TEXT NOT NULL,
 cached_from_run_id INTEGER REFERENCES route_optimization_runs(id), expires_at TEXT, applied_at TEXT, rolled_back_at TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS route_optimization_hash_idx ON route_optimization_runs(request_hash,status,expires_at);
CREATE INDEX IF NOT EXISTS route_optimization_day_idx ON route_optimization_runs(dispatch_day_id,created_at DESC);
CREATE TABLE IF NOT EXISTS route_optimization_rules (
 id INTEGER PRIMARY KEY AUTOINCREMENT, branch_id INTEGER REFERENCES branches(id), area_id INTEGER REFERENCES areas(id),
 rule_type TEXT NOT NULL CHECK(rule_type IN ('service_point_gps','fixed_order','route_access','vehicle_preference','time_window','keep_together')),
 rule_json TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed','approved','rejected','revoked')),
 version INTEGER NOT NULL DEFAULT 1, reason TEXT NOT NULL, proposed_by TEXT NOT NULL, approved_by TEXT, approved_at TEXT,
 revoked_by TEXT, revoked_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS route_optimization_rules_idx ON route_optimization_rules(status,rule_type,branch_id,area_id);
CREATE TABLE IF NOT EXISTS route_optimization_feedback (
 id INTEGER PRIMARY KEY AUTOINCREMENT, run_id INTEGER NOT NULL REFERENCES route_optimization_runs(id), dispatch_stop_id INTEGER NOT NULL REFERENCES dispatch_stops(id),
 suggested_vehicle_id INTEGER, suggested_trip_id INTEGER, suggested_sequence INTEGER, final_vehicle_id INTEGER, final_trip_id INTEGER,
 final_sequence INTEGER, reason TEXT NOT NULL, actor TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS route_vehicle_availability (
 id INTEGER PRIMARY KEY AUTOINCREMENT, vehicle_id INTEGER NOT NULL REFERENCES vehicles(id), availability_date TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'available' CHECK(status IN ('available','excluded','maintenance','off_duty')),
 start_time TEXT, end_time TEXT, reason TEXT NOT NULL, changed_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(vehicle_id,availability_date)
);
CREATE INDEX IF NOT EXISTS route_vehicle_availability_date_idx ON route_vehicle_availability(availability_date,status,vehicle_id);
CREATE TABLE IF NOT EXISTS route_employee_availability (
 id INTEGER PRIMARY KEY AUTOINCREMENT, employee_id INTEGER NOT NULL REFERENCES employees(id), availability_date TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'available' CHECK(status IN ('available','excluded','leave','off_duty')),
 start_time TEXT, end_time TEXT, reason TEXT NOT NULL, changed_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(employee_id,availability_date)
);
CREATE INDEX IF NOT EXISTS route_employee_availability_date_idx ON route_employee_availability(availability_date,status,employee_id);
CREATE TABLE IF NOT EXISTS route_optimization_daily_usage (
 usage_date TEXT PRIMARY KEY, request_count INTEGER NOT NULL DEFAULT 0, route_units INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`)}

export function applyV43Migration(db){const version=Number(db.prepare('SELECT COALESCE(MAX(version),0) version FROM schema_meta').get().version);if(version>=V43_VERSION){ensureV43Schema(db);return{schemaVersion:version,noOp:true}}if(version!==42)throw new Error(`Schema v42 is required before v43; current schema is v${version}`);db.exec('BEGIN IMMEDIATE');try{ensureV43Schema(db);db.prepare('INSERT INTO schema_meta(version) VALUES(?)').run(V43_VERSION);if(db.prepare('PRAGMA foreign_key_check').get())throw new Error('Foreign-key validation failed for v43 schema');db.exec('COMMIT');return{schemaVersion:V43_VERSION,noOp:false}}catch(error){db.exec('ROLLBACK');throw error}}
