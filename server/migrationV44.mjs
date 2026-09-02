export const V44_VERSION=44

export function ensureV44Schema(db){db.exec(`
CREATE TABLE IF NOT EXISTS purchase_bills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bill_number TEXT NOT NULL UNIQUE,
  dispatch_stop_id INTEGER NOT NULL UNIQUE REFERENCES dispatch_stops(id),
  dispatch_trip_id INTEGER NOT NULL REFERENCES dispatch_trips(id),
  dispatch_day_id INTEGER NOT NULL REFERENCES dispatch_days(id),
  branch_id INTEGER NOT NULL REFERENCES branches(id),
  customer_id INTEGER REFERENCES customers(id),
  driver_employee_id INTEGER NOT NULL REFERENCES employees(id),
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
  service_date TEXT NOT NULL,
  customer_name_snapshot TEXT NOT NULL,
  branch_code_snapshot TEXT NOT NULL,
  branch_name_snapshot TEXT NOT NULL,
  driver_name_snapshot TEXT NOT NULL,
  vehicle_code_snapshot TEXT NOT NULL,
  registration_number_snapshot TEXT,
  payment_method TEXT NOT NULL CHECK(payment_method IN ('Cash','Credit')),
  weight_method TEXT NOT NULL CHECK(weight_method IN ('on_site','factory','estimated')),
  print_choice TEXT NOT NULL CHECK(print_choice IN ('print','no_print')),
  subtotal_cents INTEGER NOT NULL CHECK(subtotal_cents>=0),
  total_cents INTEGER NOT NULL CHECK(total_cents>=0),
  status TEXT NOT NULL DEFAULT 'issued' CHECK(status IN ('issued','voided')),
  issued_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS purchase_bills_date_idx ON purchase_bills(service_date,driver_employee_id,status);
CREATE INDEX IF NOT EXISTS purchase_bills_branch_idx ON purchase_bills(branch_id,issued_at DESC);
CREATE TABLE IF NOT EXISTS purchase_bill_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  purchase_bill_id INTEGER NOT NULL REFERENCES purchase_bills(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES material_products(id),
  material_id INTEGER REFERENCES materials(id),
  product_code_snapshot TEXT NOT NULL,
  product_name_snapshot TEXT NOT NULL,
  short_form_snapshot TEXT,
  unit_snapshot TEXT,
  quantity REAL NOT NULL CHECK(quantity>0),
  unit_price_cents INTEGER NOT NULL CHECK(unit_price_cents>0),
  line_total_cents INTEGER NOT NULL CHECK(line_total_cents>=0),
  price_type_snapshot TEXT,
  price_group_id_snapshot INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(purchase_bill_id,product_id)
);
CREATE INDEX IF NOT EXISTS purchase_bill_items_bill_idx ON purchase_bill_items(purchase_bill_id,id);
CREATE TABLE IF NOT EXISTS purchase_payment_proofs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  purchase_bill_id INTEGER NOT NULL REFERENCES purchase_bills(id) ON DELETE CASCADE,
  uploaded_by_employee_id INTEGER NOT NULL REFERENCES employees(id),
  storage_key TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK(size_bytes>0),
  created_at TEXT NOT NULL,
  UNIQUE(purchase_bill_id)
);
CREATE INDEX IF NOT EXISTS purchase_payment_proofs_bill_idx ON purchase_payment_proofs(purchase_bill_id,created_at DESC);
`)}

export function applyV44Migration(db){
  const version=Number(db.prepare('SELECT COALESCE(MAX(version),0) version FROM schema_meta').get().version)
  if(version>=V44_VERSION){ensureV44Schema(db);return{schemaVersion:version,noOp:true}}
  if(version!==43)throw new Error(`Schema v43 is required before v44; current schema is v${version}`)
  const count=()=>({dispatches:db.prepare('SELECT COUNT(*) n FROM dispatches').get().n,stops:db.prepare('SELECT COUNT(*) n FROM dispatch_stops').get().n})
  const before=count()
  db.exec('BEGIN IMMEDIATE')
  try{
    ensureV44Schema(db)
    db.prepare('INSERT INTO schema_meta(version) VALUES(?)').run(V44_VERSION)
    const after=count()
    if(JSON.stringify(before)!==JSON.stringify(after))throw new Error('Protected dispatch counts changed during v44 migration')
    if(db.prepare('PRAGMA foreign_key_check').get())throw new Error('Foreign-key validation failed for v44 schema')
    db.exec('COMMIT')
    return{schemaVersion:V44_VERSION,noOp:false,before,after}
  }catch(error){db.exec('ROLLBACK');throw error}
}
