export const V51_VERSION=51

const hasColumn=(db,table,column)=>db.prepare(`PRAGMA table_info(${table})`).all().some(row=>row.name===column)
const count=(db,table)=>db.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n
export function ensureV51Schema(db){
  if(!hasColumn(db,'weekly_route_plan_stops','route_number'))db.exec('ALTER TABLE weekly_route_plan_stops ADD COLUMN route_number INTEGER CHECK(route_number BETWEEN 1 AND 5)')
  if(!hasColumn(db,'dispatch_stops','route_number'))db.exec('ALTER TABLE dispatch_stops ADD COLUMN route_number INTEGER CHECK(route_number BETWEEN 1 AND 5)')
  if(!hasColumn(db,'dispatch_stops','route_stop_sequence'))db.exec('ALTER TABLE dispatch_stops ADD COLUMN route_stop_sequence INTEGER CHECK(route_stop_sequence>0)')
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_route_assignments (
      dispatch_day_id INTEGER NOT NULL REFERENCES dispatch_days(id) ON DELETE CASCADE,
      route_number INTEGER NOT NULL CHECK(route_number BETWEEN 1 AND 5),
      vehicle_id INTEGER REFERENCES vehicles(id),
      assigned_by TEXT,
      assigned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(dispatch_day_id,route_number),
      UNIQUE(dispatch_day_id,vehicle_id)
    );
    CREATE INDEX IF NOT EXISTS weekly_route_plan_stops_route_idx ON weekly_route_plan_stops(plan_id,weekday,route_number,trip_number,stop_sequence);
    CREATE INDEX IF NOT EXISTS dispatch_stops_route_idx ON dispatch_stops(route_number,route_stop_sequence);
    CREATE INDEX IF NOT EXISTS daily_route_assignments_vehicle_idx ON daily_route_assignments(dispatch_day_id,vehicle_id);
  `)
  db.exec(`UPDATE weekly_route_plan_stops SET route_number=CASE UPPER(REPLACE(REPLACE(vehicle_registration_number,' ',''),'-',''))
    WHEN 'QAA4293N' THEN 1 WHEN 'QAB1225B' THEN 2 WHEN 'QM3028M' THEN 3 WHEN 'QTY5028' THEN 4 WHEN 'QM630S' THEN 5 ELSE route_number END
    WHERE route_number IS NULL`)
}

const protectedCounts=db=>({dispatches:count(db,'dispatches'),stops:count(db,'dispatch_stops'),bills:count(db,'purchase_bills'),weights:count(db,'unloading_weight_records'),transactions:count(db,'cash_float_transactions'),adminExpenses:count(db,'admin_expense_records')})

function backfillRouteMetadata(db){
  if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='weekly_route_plans'").get())return
  db.exec(`UPDATE dispatch_stops AS ds SET
    route_number=(SELECT wr.route_number FROM dispatch_trips dt JOIN dispatch_days dd ON dd.id=dt.dispatch_day_id
      JOIN weekly_route_plans wp ON wp.is_active=1 JOIN weekly_route_plan_stops wr ON wr.plan_id=wp.id AND wr.weekday=CAST(strftime('%w',dd.dispatch_date) AS INTEGER) AND wr.branch_id=ds.branch_id
      WHERE dt.id=ds.dispatch_trip_id LIMIT 1),
    route_stop_sequence=(SELECT wr.stop_sequence FROM dispatch_trips dt JOIN dispatch_days dd ON dd.id=dt.dispatch_day_id
      JOIN weekly_route_plans wp ON wp.is_active=1 JOIN weekly_route_plan_stops wr ON wr.plan_id=wp.id AND wr.weekday=CAST(strftime('%w',dd.dispatch_date) AS INTEGER) AND wr.branch_id=ds.branch_id
      WHERE dt.id=ds.dispatch_trip_id LIMIT 1)
    WHERE ds.route_number IS NULL`)
  db.exec(`INSERT OR IGNORE INTO daily_route_assignments(dispatch_day_id,route_number,vehicle_id,assigned_by)
    SELECT dt.dispatch_day_id,ds.route_number,MIN(d.vehicle_id),'v51 existing daily placement'
    FROM dispatch_stops ds JOIN dispatch_trips dt ON dt.id=ds.dispatch_trip_id JOIN dispatches d ON d.id=ds.dispatch_id
    WHERE ds.route_number IS NOT NULL AND ds.status<>'cancelled'
    GROUP BY dt.dispatch_day_id,ds.route_number
    HAVING COUNT(DISTINCT d.vehicle_id)=1 AND MIN(d.vehicle_id) IS NOT NULL`)
}

export function applyV51Migration(db){
  const version=Number(db.prepare('SELECT COALESCE(MAX(version),0) version FROM schema_meta').get().version)
  if(version>=V51_VERSION){ensureV51Schema(db);return{schemaVersion:version,noOp:true}}
  if(version!==50)throw new Error(`Schema v50 is required before v51; current schema is v${version}`)
  const before=protectedCounts(db)
  db.exec('BEGIN IMMEDIATE')
  try{
    ensureV51Schema(db);backfillRouteMetadata(db)
    db.prepare('INSERT INTO schema_meta(version) VALUES(?)').run(V51_VERSION)
    const after=protectedCounts(db)
    if(JSON.stringify(before)!==JSON.stringify(after))throw new Error('Protected record counts changed during v51 migration')
    if(db.prepare('PRAGMA foreign_key_check').get())throw new Error('Foreign-key validation failed for v51 schema')
    db.exec('COMMIT')
    return{schemaVersion:V51_VERSION,noOp:false,before,after,routeAssignments:count(db,'daily_route_assignments')}
  }catch(error){db.exec('ROLLBACK');throw error}
}
