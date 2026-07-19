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
}

export function getSystemStatus() {
  const tableNames = ['users','customers','branches','branch_schedules','areas','employees','vehicles','operational_locations','dispatches','dispatch_stops','stop_documents','import_batches','jodoo_sync_events','jodoo_outbox_jobs']
  const counts = Object.fromEntries(tableNames.map((table) => [table, db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count]))
  return { database: 'connected', schemaVersion: SCHEMA_VERSION, counts }
}
