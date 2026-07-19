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
ensureColumn('customers', 'phone', 'TEXT')
ensureColumn('customers', 'whatsapp', 'TEXT')
ensureColumn('dispatch_stops', 'dispatch_trip_id', 'INTEGER REFERENCES dispatch_trips(id)')
ensureColumn('dispatch_stops', 'source_schedule_id', 'INTEGER REFERENCES branch_schedules(id)')
ensureColumn('dispatch_stops', 'source_special_request_id', 'INTEGER REFERENCES special_collection_requests(id)')
ensureColumn('dispatch_stops', 'estimated_weight_kg', 'REAL')
ensureColumn('dispatch_stops', 'sequence_locked', 'INTEGER NOT NULL DEFAULT 0')

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
}

export function getSystemStatus() {
  const tableNames = ['users','customers','branches','branch_schedules','areas','employees','vehicles','operational_locations','dispatches','dispatch_stops','dispatch_days','dispatch_trips','special_collection_requests','schedule_exceptions','stop_documents','import_batches','import_errors','jodoo_sync_events','jodoo_outbox_jobs']
  const counts = Object.fromEntries(tableNames.map((table) => [table, db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count]))
  return { database: 'connected', schemaVersion: SCHEMA_VERSION, counts }
}
