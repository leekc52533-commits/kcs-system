export const V45_VERSION=45

export function ensureV45Schema(db){db.exec(`
CREATE TABLE IF NOT EXISTS unloading_weight_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dispatch_trip_id INTEGER NOT NULL REFERENCES dispatch_trips(id),
  dispatch_day_id INTEGER NOT NULL REFERENCES dispatch_days(id),
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
  driver_employee_id INTEGER NOT NULL REFERENCES employees(id),
  service_date TEXT NOT NULL,
  trip_number INTEGER NOT NULL,
  vehicle_code_snapshot TEXT NOT NULL,
  registration_number_snapshot TEXT,
  driver_name_snapshot TEXT NOT NULL,
  crew_names_snapshot TEXT,
  unloading_location_name_snapshot TEXT,
  unloading_address_snapshot TEXT,
  estimated_weight_kg REAL,
  gross_weight_kg REAL,
  tare_weight_kg REAL,
  recognized_weight_kg REAL,
  confirmed_weight_kg REAL,
  ocr_text TEXT,
  ocr_candidates_json TEXT,
  ocr_status TEXT NOT NULL DEFAULT 'pending' CHECK(ocr_status IN ('pending','recognized','needs_review','unavailable','failed')),
  photo_storage_key TEXT NOT NULL UNIQUE,
  photo_original_name TEXT NOT NULL,
  photo_content_type TEXT NOT NULL,
  photo_size_bytes INTEGER NOT NULL CHECK(photo_size_bytes>0),
  latitude REAL CHECK(latitude BETWEEN -90 AND 90 OR latitude IS NULL),
  longitude REAL CHECK(longitude BETWEEN -180 AND 180 OR longitude IS NULL),
  accuracy_m REAL,
  device_captured_at TEXT,
  weighed_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_confirmation' CHECK(status IN ('pending_confirmation','confirmed')),
  confirmed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS unloading_weights_date_idx ON unloading_weight_records(service_date,driver_employee_id,status);
CREATE INDEX IF NOT EXISTS unloading_weights_vehicle_idx ON unloading_weight_records(vehicle_id,weighed_at DESC);
`)}

export function applyV45Migration(db){
  const version=Number(db.prepare('SELECT COALESCE(MAX(version),0) version FROM schema_meta').get().version)
  if(version>=V45_VERSION){ensureV45Schema(db);return{schemaVersion:version,noOp:true}}
  if(version!==44)throw new Error(`Schema v44 is required before v45; current schema is v${version}`)
  const before={dispatches:db.prepare('SELECT COUNT(*) n FROM dispatches').get().n,stops:db.prepare('SELECT COUNT(*) n FROM dispatch_stops').get().n,bills:db.prepare('SELECT COUNT(*) n FROM purchase_bills').get().n}
  db.exec('BEGIN IMMEDIATE')
  try{ensureV45Schema(db);db.prepare('INSERT INTO schema_meta(version) VALUES(?)').run(V45_VERSION);const after={dispatches:db.prepare('SELECT COUNT(*) n FROM dispatches').get().n,stops:db.prepare('SELECT COUNT(*) n FROM dispatch_stops').get().n,bills:db.prepare('SELECT COUNT(*) n FROM purchase_bills').get().n};if(JSON.stringify(before)!==JSON.stringify(after))throw new Error('Protected record counts changed during v45 migration');if(db.prepare('PRAGMA foreign_key_check').get())throw new Error('Foreign-key validation failed for v45 schema');db.exec('COMMIT');return{schemaVersion:V45_VERSION,noOp:false,before,after}}catch(error){db.exec('ROLLBACK');throw error}
}
