export const V49_VERSION=49

export function ensureV49Schema(db){db.exec(`
CREATE TABLE IF NOT EXISTS weekly_route_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_start_date TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS weekly_route_plan_stops (
  plan_id INTEGER NOT NULL REFERENCES weekly_route_plans(id) ON DELETE CASCADE,
  weekday INTEGER NOT NULL CHECK(weekday BETWEEN 0 AND 6),
  branch_id INTEGER NOT NULL REFERENCES branches(id),
  vehicle_registration_number TEXT NOT NULL,
  trip_number INTEGER NOT NULL CHECK(trip_number BETWEEN 1 AND 3),
  stop_sequence INTEGER NOT NULL CHECK(stop_sequence>0),
  zone_name_snapshot TEXT,
  area_name_snapshot TEXT,
  PRIMARY KEY(plan_id,weekday,branch_id),
  UNIQUE(plan_id,weekday,vehicle_registration_number,trip_number,stop_sequence)
);
CREATE UNIQUE INDEX IF NOT EXISTS weekly_route_plans_one_active_idx ON weekly_route_plans(is_active) WHERE is_active=1;
CREATE INDEX IF NOT EXISTS weekly_route_plan_stops_day_idx ON weekly_route_plan_stops(plan_id,weekday,vehicle_registration_number,trip_number,stop_sequence);
`)}

const count=(db,table)=>db.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n
const protectedCounts=db=>({dispatches:count(db,'dispatches'),stops:count(db,'dispatch_stops'),bills:count(db,'purchase_bills'),weights:count(db,'unloading_weight_records'),transactions:count(db,'cash_float_transactions'),adminExpenses:count(db,'admin_expense_records')})

export function applyV49Migration(db){
  const version=Number(db.prepare('SELECT COALESCE(MAX(version),0) version FROM schema_meta').get().version)
  if(version>=V49_VERSION){ensureV49Schema(db);return{schemaVersion:version,noOp:true}}
  if(version!==48)throw new Error(`Schema v48 is required before v49; current schema is v${version}`)
  const before=protectedCounts(db)
  db.exec('BEGIN IMMEDIATE')
  try{
    ensureV49Schema(db)
    db.prepare('INSERT INTO schema_meta(version) VALUES(?)').run(V49_VERSION)
    const after=protectedCounts(db)
    if(JSON.stringify(before)!==JSON.stringify(after))throw new Error('Protected record counts changed during v49 migration')
    if(db.prepare('PRAGMA foreign_key_check').get())throw new Error('Foreign-key validation failed for v49 schema')
    db.exec('COMMIT')
    return{schemaVersion:V49_VERSION,noOp:false,before,after}
  }catch(error){db.exec('ROLLBACK');throw error}
}
