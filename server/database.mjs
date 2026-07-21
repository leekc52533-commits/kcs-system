import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import './config.mjs'
import { SCHEMA_VERSION, schemaSql } from './schema.mjs'

const serverDir = path.dirname(fileURLToPath(import.meta.url))
const projectDir = path.resolve(serverDir, '..')
export const dataDir = path.resolve(process.env.KCS_DATA_DIR || path.join(projectDir, 'data'))
export const uploadsDir = path.join(dataDir, 'uploads')
export const databasePath = path.resolve(process.env.KCS_DB_PATH || path.join(dataDir, 'kcs-dispatch.db'))

fs.mkdirSync(uploadsDir, { recursive: true })
export const db = new DatabaseSync(databasePath)
db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;')
db.exec(schemaSql)

function ensureColumn(table, column, definition) {
  const columns = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((item) => item.name))
  if (!columns.has(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
}
ensureColumn('branches', 'source_customer_id', 'TEXT')
ensureColumn('branches', 'source_area_id', 'TEXT')
ensureColumn('branches', 'time_restriction', 'TEXT')
ensureColumn('areas', 'zone_group_id', 'INTEGER REFERENCES zone_groups(id)')
ensureColumn('customers', 'phone', 'TEXT')
ensureColumn('customers', 'whatsapp', 'TEXT')
ensureColumn('dispatch_stops', 'dispatch_trip_id', 'INTEGER REFERENCES dispatch_trips(id)')
ensureColumn('dispatch_stops', 'source_schedule_id', 'INTEGER REFERENCES branch_schedules(id)')
ensureColumn('dispatch_stops', 'source_special_request_id', 'INTEGER REFERENCES special_collection_requests(id)')
ensureColumn('dispatch_stops', 'estimated_weight_kg', 'REAL')
ensureColumn('dispatch_stops', 'sequence_locked', 'INTEGER NOT NULL DEFAULT 0')
ensureColumn('vehicles', 'is_temporary', 'INTEGER NOT NULL DEFAULT 0')
ensureColumn('vehicles', 'temporary_date', 'TEXT')
ensureColumn('vehicles', 'vehicle_name', 'TEXT')
ensureColumn('vehicles', 'default_base_location_id', 'INTEGER REFERENCES operational_locations(id)')
ensureColumn('vehicles', 'official_sequence', 'INTEGER')
ensureColumn('vehicles', 'brand', 'TEXT')
ensureColumn('vehicles', 'model', 'TEXT')
ensureColumn('vehicles', 'manufacture_year', 'INTEGER')
ensureColumn('vehicles', 'registration_date', 'TEXT')
ensureColumn('vehicles', 'vehicle_type', 'TEXT')
ensureColumn('vehicles', 'chassis_number', 'TEXT')
ensureColumn('vehicles', 'engine_number', 'TEXT')
ensureColumn('vehicles', 'gross_vehicle_weight_kg', 'REAL')
ensureColumn('vehicles', 'unladen_weight_kg', 'REAL')
ensureColumn('vehicles', 'operational_status', "TEXT NOT NULL DEFAULT 'active'")
ensureColumn('vehicles', 'is_common', 'INTEGER NOT NULL DEFAULT 1')
ensureColumn('vehicles', 'remark', 'TEXT')
ensureColumn('vehicles', 'sold_at', 'TEXT')
ensureColumn('employees', 'employment_status', "TEXT NOT NULL DEFAULT 'active'")
ensureColumn('employees', 'default_base_location_id', 'INTEGER REFERENCES operational_locations(id)')
ensureColumn('employees', 'default_area_id', 'INTEGER REFERENCES areas(id)')
db.exec(`
  CREATE INDEX IF NOT EXISTS areas_zone_group_idx ON areas(zone_group_id, name);
  CREATE TRIGGER IF NOT EXISTS areas_zone_required_insert BEFORE INSERT ON areas
  WHEN NEW.zone_group_id IS NULL BEGIN SELECT RAISE(ABORT,'Area must belong to a Zone Group'); END;
  CREATE TRIGGER IF NOT EXISTS areas_zone_required_update BEFORE UPDATE OF zone_group_id ON areas
  WHEN NEW.zone_group_id IS NULL BEGIN SELECT RAISE(ABORT,'Area must belong to a Zone Group'); END;
`)

const currentVersion = Number(db.prepare('SELECT COALESCE(MAX(version), 0) AS version FROM schema_meta').get().version)
if (currentVersion === 0) {
  db.prepare('INSERT INTO schema_meta (version) VALUES (?)').run(SCHEMA_VERSION)
} else {
  if (currentVersion < 2) db.exec(`
    PRAGMA foreign_keys = OFF;
    BEGIN IMMEDIATE;
    ALTER TABLE stop_step_records RENAME TO stop_step_records_v1;
    CREATE TABLE stop_step_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dispatch_stop_id INTEGER NOT NULL REFERENCES dispatch_stops(id) ON DELETE CASCADE,
      step_key TEXT NOT NULL,
      completed_by INTEGER REFERENCES users(id),
      completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      payload_json TEXT,
      UNIQUE(dispatch_stop_id, step_key)
    );
    INSERT INTO stop_step_records (id, dispatch_stop_id, step_key, completed_by, completed_at, payload_json)
      SELECT id, dispatch_stop_id, step_key, completed_by, completed_at, payload_json FROM stop_step_records_v1;
    DROP TABLE stop_step_records_v1;
    INSERT INTO schema_meta (version) VALUES (2);
    COMMIT;
    PRAGMA foreign_keys = ON;
  `)
  if (currentVersion < 3) db.prepare('INSERT OR IGNORE INTO schema_meta (version) VALUES (3)').run()
  if (currentVersion < 4) db.prepare('INSERT OR IGNORE INTO schema_meta (version) VALUES (4)').run()
  if (currentVersion < 5) db.prepare('INSERT OR IGNORE INTO schema_meta (version) VALUES (5)').run()
  if (currentVersion < 6) db.prepare('INSERT OR IGNORE INTO schema_meta (version) VALUES (6)').run()
  if (currentVersion < 7) db.prepare('INSERT OR IGNORE INTO schema_meta (version) VALUES (7)').run()
  if (currentVersion < 8) db.prepare('INSERT OR IGNORE INTO schema_meta (version) VALUES (8)').run()
  if (currentVersion < 9) {
    const groups = db.prepare('SELECT id FROM zone_groups ORDER BY sort_order,id LIMIT 5').all()
    const drivers = db.prepare("SELECT DISTINCT TRIM(default_driver_name) driver FROM areas WHERE TRIM(COALESCE(default_driver_name,''))<>'' ORDER BY driver LIMIT 5").all()
    for (let index=0; index<drivers.length && index<groups.length; index+=1) {
      db.prepare('UPDATE zone_groups SET source_driver=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(drivers[index].driver,groups[index].id)
      db.prepare('UPDATE areas SET zone_group_id=? WHERE TRIM(default_driver_name)=?').run(groups[index].id,drivers[index].driver)
    }
    if (groups[0]) db.prepare('UPDATE areas SET zone_group_id=? WHERE zone_group_id IS NULL').run(groups[0].id)
    db.prepare('INSERT OR IGNORE INTO schema_meta (version) VALUES (9)').run()
  }
  if (currentVersion < 10) db.prepare('INSERT OR IGNORE INTO schema_meta (version) VALUES (10)').run()
}

const officialVehicles = [
  ['Lorry 1','QAV3468','available',0,null],
  ['Lorry 2','QAA4293N','active',1,null],
  ['Lorry 3','QAB1225B','active',1,null],
  ['Lorry 4','QM3028M','active',1,'Hino'],
  ['Lorry 5','QTY5028','active',1,'Hino'],
  ['Lorry 6','QM630S','active',1,'Foton']
]

function normalizeOfficialVehicles() {
  db.exec('BEGIN IMMEDIATE')
  try {
    for (let index=0; index<officialVehicles.length; index+=1) {
      const [code,registration,operationalStatus,isCommon,existingName]=officialVehicles[index]
      const sequence=index+1
      let target=db.prepare('SELECT * FROM vehicles WHERE official_sequence=? OR vehicle_code=? ORDER BY id LIMIT 1').get(sequence,code)
      const plateMatch=db.prepare("SELECT * FROM vehicles WHERE REPLACE(REPLACE(UPPER(COALESCE(registration_number,'')),' ',''),'-','')=? ORDER BY id LIMIT 1").get(registration)
      if(!target&&plateMatch)target=plateMatch
      if(!target){const result=db.prepare(`INSERT INTO vehicles(vehicle_code,registration_number,status,operational_status,official_sequence,is_common,vehicle_name) VALUES(?,?,'available',?,?,?,?)`).run(code,registration,operationalStatus,sequence,isCommon,existingName);target={id:Number(result.lastInsertRowid)}}
      if(plateMatch&&plateMatch.id!==target.id){
        for(const [table,column] of [['dispatches','vehicle_id'],['special_collection_requests','vehicle_id']])db.prepare(`UPDATE ${table} SET ${column}=? WHERE ${column}=?`).run(target.id,plateMatch.id)
        db.prepare('UPDATE vehicles SET vehicle_name=COALESCE(?,vehicle_name),capacity_kg=COALESCE(?,capacity_kg),default_base_location_id=COALESCE(?,default_base_location_id),remark=COALESCE(remark,?) WHERE id=?').run(plateMatch.vehicle_name,plateMatch.capacity_kg,plateMatch.default_base_location_id,`Merged legacy vehicle record #${plateMatch.id}`,target.id)
        db.prepare('DELETE FROM vehicles WHERE id=?').run(plateMatch.id)
      }
      db.prepare(`UPDATE vehicles SET vehicle_code=?,registration_number=?,official_sequence=?,operational_status=?,is_common=?,status='available',is_temporary=0,temporary_date=NULL,vehicle_name=COALESCE(vehicle_name,?),updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(code,registration,sequence,operationalStatus,isCommon,existingName,target.id)
    }
    let sold=db.prepare("SELECT * FROM vehicles WHERE REPLACE(REPLACE(UPPER(COALESCE(registration_number,'')),' ',''),'-','')='QTW2704'").get()
    if(!sold){const result=db.prepare("INSERT INTO vehicles(vehicle_code,registration_number,status,operational_status,is_common,sold_at,remark) VALUES('Former Vehicle','QTW2704','inactive','sold',0,CURRENT_TIMESTAMP,'Vehicle sold; retained for history only')").run();sold={id:Number(result.lastInsertRowid)}}
    db.prepare("UPDATE vehicles SET operational_status='sold',status='inactive',official_sequence=NULL,is_common=0,sold_at=COALESCE(sold_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP WHERE id=?").run(sold.id)
    db.exec('COMMIT')
  } catch(error){db.exec('ROLLBACK');throw error}
}
normalizeOfficialVehicles()
db.exec(`CREATE TRIGGER IF NOT EXISTS sold_vehicle_no_delete BEFORE DELETE ON vehicles WHEN OLD.operational_status='sold' BEGIN SELECT RAISE(ABORT,'Sold vehicle history cannot be deleted'); END;`)

export function getSystemStatus() {
  const tableNames = ['users','customers','branches','branch_schedules','zone_groups','areas','employees','vehicles','vehicle_documents','vehicle_maintenance_records','vehicle_fuel_records','vehicle_tyre_records','vehicle_compliance_reminders','vehicle_status_history','vehicle_usage_history','operational_locations','dispatches','dispatch_stops','dispatch_days','dispatch_trips','special_collection_requests','schedule_exceptions','stop_documents','import_batches','import_errors','jodoo_sync_events','jodoo_outbox_jobs']
  const counts = Object.fromEntries(tableNames.map((table) => [table, db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count]))
  return { database: 'connected', schemaVersion: SCHEMA_VERSION, counts }
}
