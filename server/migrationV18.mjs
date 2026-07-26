export const V18_VERSION=18
const LEGACY_EFFECTIVE_DATE='2000-01-01'

export function ensureV18Tables(database){
  database.exec(`
    CREATE TABLE IF NOT EXISTS materials(id INTEGER PRIMARY KEY AUTOINCREMENT,material_code TEXT NOT NULL UNIQUE,material_name TEXT NOT NULL UNIQUE,unit TEXT NOT NULL DEFAULT 'kg',status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),created_by TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS material_price_levels(id INTEGER PRIMARY KEY AUTOINCREMENT,material_id INTEGER NOT NULL REFERENCES materials(id),price_amount REAL NOT NULL CHECK(price_amount>=0),effective_date TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),reason TEXT,created_by TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(material_id,price_amount,effective_date));
    CREATE TABLE IF NOT EXISTS branch_material_prices(id INTEGER PRIMARY KEY AUTOINCREMENT,branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,material_id INTEGER NOT NULL REFERENCES materials(id),price_level_id INTEGER REFERENCES material_price_levels(id),special_price REAL CHECK(special_price>=0 OR special_price IS NULL),effective_date TEXT,status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),assigned_by TEXT,assigned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,CHECK((price_level_id IS NOT NULL AND special_price IS NULL) OR (price_level_id IS NULL AND special_price IS NOT NULL)),UNIQUE(branch_id,material_id));
    CREATE TABLE IF NOT EXISTS material_price_history(id INTEGER PRIMARY KEY AUTOINCREMENT,price_level_id INTEGER NOT NULL REFERENCES material_price_levels(id),old_price REAL NOT NULL,new_price REAL NOT NULL,old_effective_date TEXT,new_effective_date TEXT NOT NULL,affected_branch_count INTEGER NOT NULL DEFAULT 0,reason TEXT NOT NULL,changed_by TEXT NOT NULL,changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS branch_material_price_history(id INTEGER PRIMARY KEY AUTOINCREMENT,branch_id INTEGER NOT NULL REFERENCES branches(id),material_id INTEGER NOT NULL REFERENCES materials(id),old_price_level_id INTEGER,new_price_level_id INTEGER,old_special_price REAL,new_special_price REAL,reason TEXT NOT NULL,changed_by TEXT NOT NULL,changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS dispatch_stop_material_prices(id INTEGER PRIMARY KEY AUTOINCREMENT,dispatch_stop_id INTEGER NOT NULL REFERENCES dispatch_stops(id) ON DELETE CASCADE,material_id INTEGER NOT NULL REFERENCES materials(id),material_name_snapshot TEXT NOT NULL,unit_snapshot TEXT NOT NULL,price_snapshot REAL NOT NULL,price_source TEXT NOT NULL CHECK(price_source IN ('price_level','special_price')),price_level_id_snapshot INTEGER,effective_date_snapshot TEXT,captured_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(dispatch_stop_id,material_id));
    CREATE INDEX IF NOT EXISTS material_price_levels_material_idx ON material_price_levels(material_id,status,effective_date);
    CREATE INDEX IF NOT EXISTS branch_material_prices_branch_idx ON branch_material_prices(branch_id,status);
    CREATE INDEX IF NOT EXISTS branch_material_prices_material_idx ON branch_material_prices(material_id,price_level_id,status);
    CREATE INDEX IF NOT EXISTS material_price_history_level_idx ON material_price_history(price_level_id,changed_at DESC);
    CREATE INDEX IF NOT EXISTS branch_material_price_history_branch_idx ON branch_material_price_history(branch_id,changed_at DESC);
  `)
}

export function syncLegacyOccPrices(database,{actor='Schema v18 legacy OCC migration'}={}){
  ensureV18Tables(database)
  const seeds=[['OCC','OCC'],['BRISTOL_PAPER','Bristol Paper'],['ALUMINUM_CAN','Aluminum Can'],['PLASTIC','Plastic'],['IRON','Iron']]
  const insertMaterial=database.prepare("INSERT OR IGNORE INTO materials(material_code,material_name,unit,status,created_by) VALUES(?,?,'kg','active',?)")
  for(const [code,name] of seeds)insertMaterial.run(code,name,actor)
  const occ=database.prepare("SELECT id FROM materials WHERE material_code='OCC'").get()
  const prices=database.prepare(`SELECT DISTINCT ROUND(COALESCE(b.occ_price,c.occ_price),6) price FROM branches b LEFT JOIN customers c ON c.id=b.customer_id WHERE COALESCE(b.occ_price,c.occ_price) IS NOT NULL ORDER BY price`).all()
  const insertLevel=database.prepare("INSERT OR IGNORE INTO material_price_levels(material_id,price_amount,effective_date,status,reason,created_by) VALUES(?,?,?,'active','Legacy OCC automatic conversion',?)")
  for(const item of prices)insertLevel.run(occ.id,item.price,LEGACY_EFFECTIVE_DATE,actor)
  database.prepare(`INSERT OR IGNORE INTO branch_material_prices(branch_id,material_id,price_level_id,effective_date,status,assigned_by)
    SELECT b.id,?,pl.id,?,'active',? FROM branches b LEFT JOIN customers c ON c.id=b.customer_id
    JOIN material_price_levels pl ON pl.material_id=? AND pl.price_amount=ROUND(COALESCE(b.occ_price,c.occ_price),6) AND pl.effective_date=?
    WHERE COALESCE(b.occ_price,c.occ_price) IS NOT NULL`).run(occ.id,LEGACY_EFFECTIVE_DATE,actor,occ.id,LEGACY_EFFECTIVE_DATE)
  return{materialId:occ.id,priceLevelCount:database.prepare('SELECT COUNT(*) count FROM material_price_levels WHERE material_id=?').get(occ.id).count,branchCount:database.prepare('SELECT COUNT(*) count FROM branch_material_prices WHERE material_id=?').get(occ.id).count}
}

export function applyV18Migration(database){
  const version=Number(database.prepare('SELECT COALESCE(MAX(version),0) version FROM schema_meta').get().version)
  if(version>=V18_VERSION)return syncLegacyOccPrices(database)
  database.exec('BEGIN IMMEDIATE')
  try{
    ensureV18Tables(database)
    const result=syncLegacyOccPrices(database)
    database.prepare('INSERT OR IGNORE INTO schema_meta(version) VALUES(?)').run(V18_VERSION)
    database.exec('COMMIT')
    return result
  }catch(error){database.exec('ROLLBACK');throw error}
}
