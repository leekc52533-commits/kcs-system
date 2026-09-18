export const attendanceSchema=`
CREATE TABLE IF NOT EXISTS attendance_settings(
 employee_id INTEGER PRIMARY KEY REFERENCES employees(id),mode TEXT NOT NULL CHECK(mode IN ('home','company')),
 location_id INTEGER REFERENCES operational_locations(id),radius_m INTEGER NOT NULL DEFAULT 200 CHECK(radius_m BETWEEN 20 AND 5000),
 revision INTEGER NOT NULL DEFAULT 1,changed_by INTEGER NOT NULL,changed_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS attendance_settings_history(
 id INTEGER PRIMARY KEY,employee_id INTEGER NOT NULL REFERENCES employees(id),payload_json TEXT NOT NULL,changed_by INTEGER NOT NULL,changed_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS attendance_records(
 id INTEGER PRIMARY KEY,employee_id INTEGER NOT NULL REFERENCES employees(id),work_date TEXT NOT NULL,clocked_at TEXT NOT NULL,
 mode TEXT NOT NULL,latitude REAL NOT NULL,longitude REAL NOT NULL,accuracy_m REAL NOT NULL,device_captured_at TEXT NOT NULL,
 location_id INTEGER REFERENCES operational_locations(id),location_name TEXT,center_latitude REAL,center_longitude REAL,radius_m INTEGER,distance_m REAL,
 account_id INTEGER NOT NULL,UNIQUE(employee_id,work_date)
);
`
export function applyV75Migration(db){const v=Number(db.prepare('SELECT MAX(version) v FROM schema_meta').get().v);if(v>=75){db.exec(attendanceSchema);return}if(v!==74)throw Error('Schema 74 required');db.exec('BEGIN IMMEDIATE');try{db.exec(attendanceSchema);db.exec('INSERT INTO schema_meta(version) VALUES(75)');db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}}
