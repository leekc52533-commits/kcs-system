export const V53_VERSION=53

const count=(db,table)=>db.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n
export function ensureV53Schema(db){
  db.exec(`CREATE TABLE IF NOT EXISTS daily_route_approvals (
    dispatch_day_id INTEGER NOT NULL REFERENCES dispatch_days(id) ON DELETE CASCADE,
    route_number INTEGER NOT NULL CHECK(route_number BETWEEN 1 AND 5),
    route_signature TEXT NOT NULL,
    actor TEXT NOT NULL,
    reason TEXT,
    approved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(dispatch_day_id,route_number)
  )`)
}

const protectedCounts=db=>({dispatches:count(db,'dispatches'),stops:count(db,'dispatch_stops'),bills:count(db,'purchase_bills'),weights:count(db,'unloading_weight_records'),transactions:count(db,'cash_float_transactions'),adminExpenses:count(db,'admin_expense_records')})

export function applyV53Migration(db){
  const version=Number(db.prepare('SELECT COALESCE(MAX(version),0) version FROM schema_meta').get().version)
  if(version>=V53_VERSION){ensureV53Schema(db);return{schemaVersion:version,noOp:true}}
  if(version!==52)throw new Error(`Schema v52 is required before v53; current schema is v${version}`)
  const before=protectedCounts(db)
  db.exec('BEGIN IMMEDIATE')
  try{ensureV53Schema(db);db.prepare('INSERT INTO schema_meta(version) VALUES(?)').run(V53_VERSION);const after=protectedCounts(db);if(JSON.stringify(before)!==JSON.stringify(after))throw new Error('Protected record counts changed during v53 migration');if(db.prepare('PRAGMA foreign_key_check').get())throw new Error('Foreign-key validation failed for v53 schema');db.exec('COMMIT');return{schemaVersion:V53_VERSION,noOp:false,before,after}}
  catch(error){db.exec('ROLLBACK');throw error}
}
