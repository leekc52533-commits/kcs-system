export const V47_VERSION=47

export function ensureV47Schema(db){db.exec(`
CREATE TABLE IF NOT EXISTS cash_float_members (
  employee_id INTEGER PRIMARY KEY REFERENCES employees(id),
  is_selected INTEGER NOT NULL DEFAULT 1 CHECK(is_selected IN (0,1)),
  updated_by_employee_id INTEGER REFERENCES employees(id),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS cash_float_members_selected_idx ON cash_float_members(is_selected,employee_id);
`)}

export function applyV47Migration(db){
  const version=Number(db.prepare('SELECT COALESCE(MAX(version),0) version FROM schema_meta').get().version)
  if(version>=V47_VERSION){ensureV47Schema(db);return{schemaVersion:version,noOp:true}}
  if(version!==46)throw new Error(`Schema v46 is required before v47; current schema is v${version}`)
  const before={dispatches:db.prepare('SELECT COUNT(*) n FROM dispatches').get().n,stops:db.prepare('SELECT COUNT(*) n FROM dispatch_stops').get().n,bills:db.prepare('SELECT COUNT(*) n FROM purchase_bills').get().n,weights:db.prepare('SELECT COUNT(*) n FROM unloading_weight_records').get().n,transactions:db.prepare('SELECT COUNT(*) n FROM cash_float_transactions').get().n}
  db.exec('BEGIN IMMEDIATE')
  try{
    ensureV47Schema(db)
    db.exec(`INSERT OR IGNORE INTO cash_float_members(employee_id,is_selected)
      SELECT e.id,1 FROM employees e
      WHERE e.is_active=1 AND e.employment_status='active' AND (
        lower(COALESCE(e.job_role,'')) IN ('driver','crew','assistant') OR
        EXISTS(SELECT 1 FROM employee_job_roles r WHERE r.employee_id=e.id AND r.is_active=1 AND r.role IN ('Driver','Attendant / Crew')) OR
        EXISTS(SELECT 1 FROM cash_float_accounts a WHERE a.employee_id=e.id)
      )`)
    db.prepare('INSERT INTO schema_meta(version) VALUES(?)').run(V47_VERSION)
    const after={dispatches:db.prepare('SELECT COUNT(*) n FROM dispatches').get().n,stops:db.prepare('SELECT COUNT(*) n FROM dispatch_stops').get().n,bills:db.prepare('SELECT COUNT(*) n FROM purchase_bills').get().n,weights:db.prepare('SELECT COUNT(*) n FROM unloading_weight_records').get().n,transactions:db.prepare('SELECT COUNT(*) n FROM cash_float_transactions').get().n}
    if(JSON.stringify(before)!==JSON.stringify(after))throw new Error('Protected record counts changed during v47 migration')
    if(db.prepare('PRAGMA foreign_key_check').get())throw new Error('Foreign-key validation failed for v47 schema')
    db.exec('COMMIT')
    return{schemaVersion:V47_VERSION,noOp:false,before,after,selectedEmployees:db.prepare('SELECT COUNT(*) n FROM cash_float_members WHERE is_selected=1').get().n}
  }catch(error){db.exec('ROLLBACK');throw error}
}
