export const V21_VERSION=21

export function ensureV21Tables(database){
  database.exec(`
    CREATE TABLE IF NOT EXISTS occ_price_groups(id INTEGER PRIMARY KEY AUTOINCREMENT,material_id INTEGER NOT NULL REFERENCES materials(id),item_code TEXT NOT NULL UNIQUE,price_amount REAL NOT NULL CHECK(price_amount>=0),is_fixed INTEGER NOT NULL DEFAULT 1 CHECK(is_fixed IN (0,1)),status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),reason TEXT,created_by TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(material_id,price_amount));
    CREATE TABLE IF NOT EXISTS branch_occ_price_assignments(branch_id INTEGER PRIMARY KEY REFERENCES branches(id) ON DELETE CASCADE,occ_price_group_id INTEGER NOT NULL REFERENCES occ_price_groups(id),assigned_by TEXT NOT NULL,assigned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS branch_occ_price_assignment_history(id INTEGER PRIMARY KEY AUTOINCREMENT,branch_id INTEGER NOT NULL REFERENCES branches(id),old_occ_price_group_id INTEGER REFERENCES occ_price_groups(id),new_occ_price_group_id INTEGER NOT NULL REFERENCES occ_price_groups(id),reason TEXT NOT NULL,changed_by TEXT NOT NULL,changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE INDEX IF NOT EXISTS occ_price_groups_material_idx ON occ_price_groups(material_id,price_amount);
    CREATE INDEX IF NOT EXISTS branch_occ_price_group_idx ON branch_occ_price_assignments(occ_price_group_id,branch_id);
  `)
  const snapshotColumns=new Set(database.prepare('PRAGMA table_info(dispatch_stop_material_prices)').all().map(row=>row.name))
  if(!snapshotColumns.has('occ_price_group_id_snapshot'))database.exec('ALTER TABLE dispatch_stop_material_prices ADD COLUMN occ_price_group_id_snapshot INTEGER')
  if(!snapshotColumns.has('item_code_snapshot'))database.exec('ALTER TABLE dispatch_stop_material_prices ADD COLUMN item_code_snapshot TEXT')
}

export function seedFixedOccPriceGroups(database,{actor='Schema v21 fixed OCC price groups'}={}){
  ensureV21Tables(database)
  let material=database.prepare("SELECT id FROM materials WHERE material_code='OCC'").get()
  if(!material){const result=database.prepare("INSERT INTO materials(material_code,material_name,unit,status,created_by) VALUES('OCC','OCC','kg','active',?)").run(actor);material={id:Number(result.lastInsertRowid)}}
  const insert=database.prepare(`INSERT OR IGNORE INTO occ_price_groups(material_id,item_code,price_amount,is_fixed,status,reason,created_by) VALUES(?,?,?,1,'active','Fixed RM0.15-RM0.60 schedule',?)`)
  for(let cents=15;cents<=60;cents+=1)insert.run(material.id,`OCC-${String(cents).padStart(3,'0')}`,cents/100,actor)
  return{materialId:material.id,fixedGroupCount:database.prepare('SELECT COUNT(*) count FROM occ_price_groups WHERE material_id=? AND is_fixed=1 AND price_amount BETWEEN 0.15 AND 0.60').get(material.id).count,assignmentCount:database.prepare('SELECT COUNT(*) count FROM branch_occ_price_assignments').get().count}
}

export function applyV21Migration(database){
  const version=Number(database.prepare('SELECT COALESCE(MAX(version),0) version FROM schema_meta').get().version)
  if(version>V21_VERSION)return{schemaVersion:version,...seedFixedOccPriceGroups(database)}
  database.exec('BEGIN IMMEDIATE')
  try{ensureV21Tables(database);const result=seedFixedOccPriceGroups(database);database.prepare('INSERT OR IGNORE INTO schema_meta(version) VALUES(?)').run(V21_VERSION);database.exec('COMMIT');return{schemaVersion:V21_VERSION,...result}}
  catch(error){database.exec('ROLLBACK');throw error}
}
