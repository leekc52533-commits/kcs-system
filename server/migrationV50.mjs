export const V50_VERSION=50

export function ensureV50Schema(db){db.exec(`
CREATE TABLE IF NOT EXISTS driver_defer_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dispatch_stop_id INTEGER NOT NULL REFERENCES dispatch_stops(id) ON DELETE CASCADE,
  dispatch_trip_id INTEGER NOT NULL REFERENCES dispatch_trips(id) ON DELETE CASCADE,
  dispatch_day_id INTEGER NOT NULL REFERENCES dispatch_days(id) ON DELETE CASCADE,
  driver_employee_id INTEGER NOT NULL REFERENCES employees(id),
  reason TEXT NOT NULL CHECK(reason IN ('customer_requested_return','no_space_available','other')),
  expected_return_time TEXT NOT NULL CHECK(expected_return_time GLOB '[0-2][0-9]:[0-5][0-9]'),
  expected_return_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','cancelled')),
  requested_at TEXT NOT NULL,
  reviewed_by_employee_id INTEGER REFERENCES employees(id),
  reviewed_by_name_snapshot TEXT,
  review_reason TEXT,
  reviewed_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS driver_defer_requests_one_pending_idx ON driver_defer_requests(dispatch_stop_id) WHERE status='pending';
CREATE INDEX IF NOT EXISTS driver_defer_requests_day_status_idx ON driver_defer_requests(dispatch_day_id,status,requested_at);
`)}

const protectedCounts=db=>({
  dispatches:db.prepare('SELECT COUNT(*) n FROM dispatches').get().n,
  stops:db.prepare('SELECT COUNT(*) n FROM dispatch_stops').get().n,
  bills:db.prepare('SELECT COUNT(*) n FROM purchase_bills').get().n,
  weights:db.prepare('SELECT COUNT(*) n FROM unloading_weight_records').get().n,
  transactions:db.prepare('SELECT COUNT(*) n FROM cash_float_transactions').get().n,
  adminExpenses:db.prepare('SELECT COUNT(*) n FROM admin_expense_records').get().n
})

export function applyV50Migration(db){
  const version=Number(db.prepare('SELECT COALESCE(MAX(version),0) version FROM schema_meta').get().version)
  if(version>=V50_VERSION){ensureV50Schema(db);return{schemaVersion:version,noOp:true}}
  if(version!==49)throw new Error(`Schema v49 is required before v50; current schema is v${version}`)
  const before=protectedCounts(db)
  db.exec('BEGIN IMMEDIATE')
  try{
    ensureV50Schema(db)
    db.prepare('INSERT INTO schema_meta(version) VALUES(?)').run(V50_VERSION)
    const after=protectedCounts(db)
    if(JSON.stringify(before)!==JSON.stringify(after))throw new Error('Protected record counts changed during v50 migration')
    if(db.prepare('PRAGMA foreign_key_check').get())throw new Error('Foreign-key validation failed for v50 schema')
    db.exec('COMMIT')
    return{schemaVersion:V50_VERSION,noOp:false,before,after}
  }catch(error){db.exec('ROLLBACK');throw error}
}
