export const cargoBatchSchema=`
CREATE TABLE IF NOT EXISTS cargo_batches(
 id INTEGER PRIMARY KEY AUTOINCREMENT,code TEXT UNIQUE,vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),plate_snapshot TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('prepared','active','closed')),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 created_by_employee_id INTEGER NOT NULL REFERENCES employees(id),started_at TEXT,collection_date TEXT,
 start_trip_id INTEGER REFERENCES dispatch_trips(id),driver_employee_id INTEGER REFERENCES employees(id),driver_name_snapshot TEXT,
 eligible_crew_json TEXT NOT NULL DEFAULT '[]',closed_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS cargo_current_vehicle ON cargo_batches(vehicle_id) WHERE status IN ('prepared','active');
CREATE TABLE IF NOT EXISTS cargo_batch_members(
 batch_id INTEGER NOT NULL REFERENCES cargo_batches(id),employee_id INTEGER NOT NULL REFERENCES employees(id),
 name_snapshot TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('driver','crew')),confirmed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(batch_id,employee_id)
);
CREATE TABLE IF NOT EXISTS cargo_batch_unloads(
 record_id INTEGER PRIMARY KEY REFERENCES unloading_weight_records(id),batch_id INTEGER NOT NULL REFERENCES cargo_batches(id),
 ticket_number TEXT NOT NULL,mode TEXT NOT NULL CHECK(mode IN ('partial','full','supplement')),
 submitted_by_employee_id INTEGER NOT NULL REFERENCES employees(id),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 next_batch_id INTEGER REFERENCES cargo_batches(id)
);
CREATE TABLE IF NOT EXISTS cargo_batch_notifications(
 batch_id INTEGER NOT NULL REFERENCES cargo_batches(id),employee_id INTEGER NOT NULL REFERENCES employees(id),
 acknowledged_at TEXT,PRIMARY KEY(batch_id,employee_id)
);
CREATE TRIGGER IF NOT EXISTS cargo_members_no_update BEFORE UPDATE ON cargo_batch_members BEGIN SELECT RAISE(ABORT,'Cargo participation is immutable'); END;
CREATE TRIGGER IF NOT EXISTS cargo_members_no_delete BEFORE DELETE ON cargo_batch_members BEGIN SELECT RAISE(ABORT,'Cargo participation is permanent'); END;
CREATE TRIGGER IF NOT EXISTS cargo_unloads_no_update BEFORE UPDATE ON cargo_batch_unloads BEGIN SELECT RAISE(ABORT,'Cargo unloading link is immutable'); END;
CREATE TRIGGER IF NOT EXISTS cargo_unloads_no_delete BEFORE DELETE ON cargo_batch_unloads BEGIN SELECT RAISE(ABORT,'Cargo unloading link is permanent'); END;
`
export function applyV71Migration(db){const v=Number(db.prepare('SELECT MAX(version) v FROM schema_meta').get().v);if(v>=71){db.exec(cargoBatchSchema);return}if(v!==70)throw Error('Schema 70 required');db.exec('BEGIN IMMEDIATE');try{db.exec(cargoBatchSchema);db.exec('INSERT INTO schema_meta(version) VALUES(71)');db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}}
