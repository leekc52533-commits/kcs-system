export const V46_VERSION=46

export function ensureV46Schema(db){db.exec(`
CREATE TABLE IF NOT EXISTS cash_float_accounts (
  employee_id INTEGER PRIMARY KEY REFERENCES employees(id),
  target_float_cents INTEGER NOT NULL CHECK(target_float_cents>=0),
  low_balance_threshold_cents INTEGER NOT NULL CHECK(low_balance_threshold_cents>=0),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
  updated_by_employee_id INTEGER REFERENCES employees(id),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS cash_float_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  transaction_type TEXT NOT NULL CHECK(transaction_type IN ('opening_balance','top_up','cash_purchase','expense','reversal','adjustment')),
  amount_cents INTEGER NOT NULL CHECK(amount_cents<>0),
  service_date TEXT NOT NULL,
  purchase_bill_id INTEGER REFERENCES purchase_bills(id),
  reversed_transaction_id INTEGER REFERENCES cash_float_transactions(id),
  payment_channel TEXT CHECK(payment_channel IN ('Cash','TNG','Bank Transfer','System','Adjustment') OR payment_channel IS NULL),
  description TEXT,
  reference_number TEXT,
  proof_storage_key TEXT UNIQUE,
  proof_original_name TEXT,
  proof_content_type TEXT,
  proof_size_bytes INTEGER CHECK(proof_size_bytes>0 OR proof_size_bytes IS NULL),
  created_by_employee_id INTEGER REFERENCES employees(id),
  created_by_name_snapshot TEXT NOT NULL,
  created_at TEXT NOT NULL,
  voided_at TEXT,
  voided_by_employee_id INTEGER REFERENCES employees(id),
  UNIQUE(purchase_bill_id)
);
CREATE INDEX IF NOT EXISTS cash_float_transactions_employee_idx ON cash_float_transactions(employee_id,service_date DESC,id DESC);
CREATE INDEX IF NOT EXISTS cash_float_transactions_bill_idx ON cash_float_transactions(purchase_bill_id);
CREATE TABLE IF NOT EXISTS cash_float_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  balance_cents INTEGER NOT NULL,
  threshold_cents INTEGER NOT NULL,
  target_float_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','resolved')),
  triggered_at TEXT NOT NULL,
  resolved_at TEXT,
  last_checked_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS cash_float_one_active_alert_idx ON cash_float_alerts(employee_id) WHERE status='active';
CREATE INDEX IF NOT EXISTS cash_float_alerts_status_idx ON cash_float_alerts(status,triggered_at DESC);
`)}

export function applyV46Migration(db){
  const version=Number(db.prepare('SELECT COALESCE(MAX(version),0) version FROM schema_meta').get().version)
  if(version>=V46_VERSION){ensureV46Schema(db);return{schemaVersion:version,noOp:true}}
  if(version!==45)throw new Error(`Schema v45 is required before v46; current schema is v${version}`)
  const before={dispatches:db.prepare('SELECT COUNT(*) n FROM dispatches').get().n,stops:db.prepare('SELECT COUNT(*) n FROM dispatch_stops').get().n,bills:db.prepare('SELECT COUNT(*) n FROM purchase_bills').get().n,weights:db.prepare('SELECT COUNT(*) n FROM unloading_weight_records').get().n}
  db.exec('BEGIN IMMEDIATE')
  try{ensureV46Schema(db);db.prepare('INSERT INTO schema_meta(version) VALUES(?)').run(V46_VERSION);const after={dispatches:db.prepare('SELECT COUNT(*) n FROM dispatches').get().n,stops:db.prepare('SELECT COUNT(*) n FROM dispatch_stops').get().n,bills:db.prepare('SELECT COUNT(*) n FROM purchase_bills').get().n,weights:db.prepare('SELECT COUNT(*) n FROM unloading_weight_records').get().n};if(JSON.stringify(before)!==JSON.stringify(after))throw new Error('Protected record counts changed during v46 migration');if(db.prepare('PRAGMA foreign_key_check').get())throw new Error('Foreign-key validation failed for v46 schema');db.exec('COMMIT');return{schemaVersion:V46_VERSION,noOp:false,before,after}}catch(error){db.exec('ROLLBACK');throw error}
}
