export const V52_VERSION=52

const count=(db,table)=>db.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n
export function ensureV52Schema(db){
  db.exec(`CREATE TABLE IF NOT EXISTS weekly_route_definitions (
    plan_id INTEGER NOT NULL REFERENCES weekly_route_plans(id) ON DELETE CASCADE,
    route_number INTEGER NOT NULL CHECK(route_number BETWEEN 1 AND 5),
    display_name TEXT NOT NULL,
    updated_by TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(plan_id,route_number)
  )`)
  db.exec(`INSERT OR IGNORE INTO weekly_route_definitions(plan_id,route_number,display_name,updated_by)
    SELECT DISTINCT plan_id,route_number,'Route '||route_number,'Schema v52 migration'
    FROM weekly_route_plan_stops WHERE route_number BETWEEN 1 AND 5`)
}

const protectedCounts=db=>({dispatches:count(db,'dispatches'),stops:count(db,'dispatch_stops'),bills:count(db,'purchase_bills'),weights:count(db,'unloading_weight_records'),transactions:count(db,'cash_float_transactions'),adminExpenses:count(db,'admin_expense_records')})

export function applyV52Migration(db){
  const version=Number(db.prepare('SELECT COALESCE(MAX(version),0) version FROM schema_meta').get().version)
  if(version>=V52_VERSION){ensureV52Schema(db);return{schemaVersion:version,noOp:true}}
  if(version!==51)throw new Error(`Schema v51 is required before v52; current schema is v${version}`)
  const before=protectedCounts(db)
  db.exec('BEGIN IMMEDIATE')
  try{
    ensureV52Schema(db)
    db.prepare('INSERT INTO schema_meta(version) VALUES(?)').run(V52_VERSION)
    const after=protectedCounts(db)
    if(JSON.stringify(before)!==JSON.stringify(after))throw new Error('Protected record counts changed during v52 migration')
    if(db.prepare('PRAGMA foreign_key_check').get())throw new Error('Foreign-key validation failed for v52 schema')
    db.exec('COMMIT')
    return{schemaVersion:V52_VERSION,noOp:false,before,after,routeDefinitions:count(db,'weekly_route_definitions')}
  }catch(error){db.exec('ROLLBACK');throw error}
}
