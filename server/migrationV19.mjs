export const V19_VERSION=19

export function ensureV19Tables(database){
  database.exec(`
    CREATE TABLE IF NOT EXISTS customer_material_pricing(id INTEGER PRIMARY KEY AUTOINCREMENT,customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,material_id INTEGER NOT NULL REFERENCES materials(id),standard_price_level_id INTEGER REFERENCES material_price_levels(id),standard_special_price REAL CHECK(standard_special_price>=0 OR standard_special_price IS NULL),standard_effective_date TEXT,outstation_enabled INTEGER NOT NULL DEFAULT 0 CHECK(outstation_enabled IN (0,1)),outstation_price_level_id INTEGER REFERENCES material_price_levels(id),outstation_special_price REAL CHECK(outstation_special_price>=0 OR outstation_special_price IS NULL),outstation_effective_date TEXT,status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),updated_by TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,CHECK((standard_price_level_id IS NOT NULL AND standard_special_price IS NULL) OR (standard_price_level_id IS NULL AND standard_special_price IS NOT NULL)),CHECK(outstation_enabled=0 OR ((outstation_price_level_id IS NOT NULL AND outstation_special_price IS NULL) OR (outstation_price_level_id IS NULL AND outstation_special_price IS NOT NULL))),UNIQUE(customer_id,material_id));
    CREATE TABLE IF NOT EXISTS customer_material_pricing_history(id INTEGER PRIMARY KEY AUTOINCREMENT,customer_material_pricing_id INTEGER NOT NULL REFERENCES customer_material_pricing(id),customer_id INTEGER NOT NULL REFERENCES customers(id),material_id INTEGER NOT NULL REFERENCES materials(id),before_json TEXT,after_json TEXT NOT NULL,affected_standard_branch_count INTEGER NOT NULL DEFAULT 0,affected_outstation_branch_count INTEGER NOT NULL DEFAULT 0,reason TEXT NOT NULL,changed_by TEXT NOT NULL,changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS branch_material_price_selections(id INTEGER PRIMARY KEY AUTOINCREMENT,branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,material_id INTEGER NOT NULL REFERENCES materials(id),customer_material_pricing_id INTEGER REFERENCES customer_material_pricing(id),price_type TEXT NOT NULL DEFAULT 'standard' CHECK(price_type IN ('standard','outstation')),uses_legacy_price INTEGER NOT NULL DEFAULT 0 CHECK(uses_legacy_price IN (0,1)),legacy_price_level_id INTEGER REFERENCES material_price_levels(id),legacy_special_price REAL,legacy_effective_date TEXT,assigned_by TEXT,assigned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(branch_id,material_id));
    CREATE TABLE IF NOT EXISTS branch_material_price_selection_history(id INTEGER PRIMARY KEY AUTOINCREMENT,branch_id INTEGER NOT NULL REFERENCES branches(id),material_id INTEGER NOT NULL REFERENCES materials(id),old_price_type TEXT,new_price_type TEXT,old_customer_material_pricing_id INTEGER,new_customer_material_pricing_id INTEGER,reason TEXT NOT NULL,changed_by TEXT NOT NULL,changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE INDEX IF NOT EXISTS customer_material_pricing_customer_idx ON customer_material_pricing(customer_id,status);
    CREATE INDEX IF NOT EXISTS customer_material_pricing_material_idx ON customer_material_pricing(material_id,status);
    CREATE INDEX IF NOT EXISTS customer_material_pricing_history_customer_idx ON customer_material_pricing_history(customer_id,changed_at DESC);
    CREATE INDEX IF NOT EXISTS branch_material_price_selections_branch_idx ON branch_material_price_selections(branch_id);
    CREATE INDEX IF NOT EXISTS branch_material_price_selections_pricing_idx ON branch_material_price_selections(customer_material_pricing_id,price_type);
  `)
}

export function syncV18BranchPricesToV19(database,{actor='Schema v19 compatibility migration'}={}){
  ensureV19Tables(database)
  database.prepare(`INSERT OR IGNORE INTO customer_material_pricing(customer_id,material_id,standard_price_level_id,standard_special_price,standard_effective_date,outstation_enabled,status,updated_by)
    SELECT b.customer_id,bmp.material_id,bmp.price_level_id,bmp.special_price,bmp.effective_date,0,'active',?
    FROM branch_material_prices bmp JOIN branches b ON b.id=bmp.branch_id
    WHERE b.customer_id IS NOT NULL AND bmp.status='active' GROUP BY b.customer_id,bmp.material_id`).run(actor)
  database.prepare(`INSERT OR IGNORE INTO branch_material_price_selections(branch_id,material_id,customer_material_pricing_id,price_type,uses_legacy_price,legacy_price_level_id,legacy_special_price,legacy_effective_date,assigned_by)
    SELECT bmp.branch_id,bmp.material_id,cmp.id,'standard',1,bmp.price_level_id,bmp.special_price,bmp.effective_date,?
    FROM branch_material_prices bmp JOIN branches b ON b.id=bmp.branch_id
    LEFT JOIN customer_material_pricing cmp ON cmp.customer_id=b.customer_id AND cmp.material_id=bmp.material_id
    WHERE bmp.status='active'`).run(actor)
  return{customerPricingCount:database.prepare('SELECT COUNT(*) count FROM customer_material_pricing').get().count,branchSelectionCount:database.prepare('SELECT COUNT(*) count FROM branch_material_price_selections').get().count,legacySelectionCount:database.prepare('SELECT COUNT(*) count FROM branch_material_price_selections WHERE uses_legacy_price=1').get().count}
}

export function applyV19Migration(database){
  const version=Number(database.prepare('SELECT COALESCE(MAX(version),0) version FROM schema_meta').get().version)
  if(version>=V19_VERSION)return syncV18BranchPricesToV19(database)
  database.exec('BEGIN IMMEDIATE')
  try{ensureV19Tables(database);const result=syncV18BranchPricesToV19(database);database.prepare('INSERT OR IGNORE INTO schema_meta(version) VALUES(?)').run(V19_VERSION);database.exec('COMMIT');return result}catch(error){database.exec('ROLLBACK');throw error}
}
