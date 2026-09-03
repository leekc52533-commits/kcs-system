export const V48_VERSION=48

export function ensureV48Schema(db){db.exec(`
CREATE TABLE IF NOT EXISTS admin_expense_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  service_date TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('Fuel','Services','Repair','Spare Parts','Road Tax','Puspakom','Insurance','Other')),
  description TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK(amount_cents>0),
  payment_method TEXT NOT NULL CHECK(payment_method IN ('Cash','Bank Transfer','TNG','Card')),
  reference_number TEXT,
  receipt_storage_key TEXT UNIQUE,
  receipt_original_name TEXT,
  receipt_content_type TEXT,
  receipt_size_bytes INTEGER CHECK(receipt_size_bytes>0 OR receipt_size_bytes IS NULL),
  created_by_employee_id INTEGER REFERENCES employees(id),
  created_by_name_snapshot TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS admin_expense_date_idx ON admin_expense_records(service_date DESC,id DESC);
CREATE INDEX IF NOT EXISTS admin_expense_category_idx ON admin_expense_records(category,service_date DESC);
`)}

export function applyV48Migration(db){
  const version=Number(db.prepare('SELECT COALESCE(MAX(version),0) version FROM schema_meta').get().version)
  if(version>=V48_VERSION){ensureV48Schema(db);return{schemaVersion:version,noOp:true}}
  if(version!==47)throw new Error(`Schema v47 is required before v48; current schema is v${version}`)
  const before={dispatches:db.prepare('SELECT COUNT(*) n FROM dispatches').get().n,stops:db.prepare('SELECT COUNT(*) n FROM dispatch_stops').get().n,bills:db.prepare('SELECT COUNT(*) n FROM purchase_bills').get().n,weights:db.prepare('SELECT COUNT(*) n FROM unloading_weight_records').get().n,transactions:db.prepare('SELECT COUNT(*) n FROM cash_float_transactions').get().n}
  db.exec('BEGIN IMMEDIATE')
  try{
    ensureV48Schema(db)
    db.prepare('INSERT INTO schema_meta(version) VALUES(?)').run(V48_VERSION)
    const after={dispatches:db.prepare('SELECT COUNT(*) n FROM dispatches').get().n,stops:db.prepare('SELECT COUNT(*) n FROM dispatch_stops').get().n,bills:db.prepare('SELECT COUNT(*) n FROM purchase_bills').get().n,weights:db.prepare('SELECT COUNT(*) n FROM unloading_weight_records').get().n,transactions:db.prepare('SELECT COUNT(*) n FROM cash_float_transactions').get().n}
    if(JSON.stringify(before)!==JSON.stringify(after))throw new Error('Protected record counts changed during v48 migration')
    if(db.prepare('PRAGMA foreign_key_check').get())throw new Error('Foreign-key validation failed for v48 schema')
    db.exec('COMMIT')
    return{schemaVersion:V48_VERSION,noOp:false,before,after,adminExpenses:0}
  }catch(error){db.exec('ROLLBACK');throw error}
}
