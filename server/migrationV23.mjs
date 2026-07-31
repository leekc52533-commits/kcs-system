export const V23_VERSION=23

const columns=(database,table)=>new Set(database.prepare(`PRAGMA table_info(${table})`).all().map(row=>row.name))

export function ensureV23Tables(database){
  const groupColumns=columns(database,'occ_price_groups')
  if(!groupColumns.has('group_name'))database.exec('ALTER TABLE occ_price_groups ADD COLUMN group_name TEXT')
  if(!groupColumns.has('previous_price_amount'))database.exec('ALTER TABLE occ_price_groups ADD COLUMN previous_price_amount REAL')
  if(!groupColumns.has('pending_price_amount'))database.exec('ALTER TABLE occ_price_groups ADD COLUMN pending_price_amount REAL')
  if(!groupColumns.has('pending_effective_date'))database.exec('ALTER TABLE occ_price_groups ADD COLUMN pending_effective_date TEXT')
  database.exec(`
    CREATE TABLE IF NOT EXISTS occ_price_group_price_history(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      occ_price_group_id INTEGER NOT NULL REFERENCES occ_price_groups(id),
      old_price_amount REAL NOT NULL,
      new_price_amount REAL NOT NULL,
      branch_count INTEGER NOT NULL DEFAULT 0,
      effective_date TEXT NOT NULL,
      reason TEXT NOT NULL,
      changed_by TEXT NOT NULL,
      changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS occ_price_group_price_history_group_idx
      ON occ_price_group_price_history(occ_price_group_id,changed_at);
  `)
}

function removeAmountUniqueConstraint(database){
  const sql=database.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='occ_price_groups'").get()?.sql||''
  if(!/UNIQUE\s*\(\s*material_id\s*,\s*price_amount\s*\)/i.test(sql))return false
  database.exec(`
    PRAGMA foreign_keys=OFF;
    BEGIN IMMEDIATE;
    ALTER TABLE branch_occ_price_assignments RENAME TO branch_occ_price_assignments_v22;
    ALTER TABLE branch_occ_price_assignment_history RENAME TO branch_occ_price_assignment_history_v22;
    ALTER TABLE occ_price_groups RENAME TO occ_price_groups_v22;
    CREATE TABLE occ_price_groups(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      material_id INTEGER NOT NULL REFERENCES materials(id),
      item_code TEXT NOT NULL UNIQUE,
      price_amount REAL NOT NULL CHECK(price_amount>=0),
      is_fixed INTEGER NOT NULL DEFAULT 1 CHECK(is_fixed IN (0,1)),
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),
      reason TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      group_name TEXT,
      previous_price_amount REAL,
      pending_price_amount REAL,
      pending_effective_date TEXT
    );
    INSERT INTO occ_price_groups(id,material_id,item_code,price_amount,is_fixed,status,reason,created_by,created_at,updated_at)
      SELECT id,material_id,item_code,price_amount,is_fixed,status,reason,created_by,created_at,updated_at FROM occ_price_groups_v22;
    CREATE TABLE branch_occ_price_assignments(
      branch_id INTEGER PRIMARY KEY REFERENCES branches(id) ON DELETE CASCADE,
      occ_price_group_id INTEGER NOT NULL REFERENCES occ_price_groups(id),
      assigned_by TEXT NOT NULL,
      assigned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO branch_occ_price_assignments SELECT * FROM branch_occ_price_assignments_v22;
    CREATE TABLE branch_occ_price_assignment_history(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      branch_id INTEGER NOT NULL REFERENCES branches(id),
      old_occ_price_group_id INTEGER REFERENCES occ_price_groups(id),
      new_occ_price_group_id INTEGER NOT NULL REFERENCES occ_price_groups(id),
      reason TEXT NOT NULL,
      changed_by TEXT NOT NULL,
      changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO branch_occ_price_assignment_history SELECT * FROM branch_occ_price_assignment_history_v22;
    DROP TABLE branch_occ_price_assignments_v22;
    DROP TABLE branch_occ_price_assignment_history_v22;
    DROP TABLE occ_price_groups_v22;
    CREATE INDEX occ_price_groups_material_idx ON occ_price_groups(material_id,price_amount);
    CREATE INDEX branch_occ_price_group_idx ON branch_occ_price_assignments(occ_price_group_id,branch_id);
    COMMIT;
    PRAGMA foreign_keys=ON;
  `)
  return true
}

export function applyV23Migration(database){
  const version=Number(database.prepare('SELECT COALESCE(MAX(version),0) version FROM schema_meta').get().version)
  if(version>V23_VERSION)return{schemaVersion:version,recreated:false}
  const recreated=removeAmountUniqueConstraint(database)
  database.exec('BEGIN IMMEDIATE')
  try{
    ensureV23Tables(database)
    database.prepare('INSERT OR IGNORE INTO schema_meta(version) VALUES(?)').run(V23_VERSION)
    database.exec('COMMIT')
    return{schemaVersion:V23_VERSION,recreated}
  }catch(error){database.exec('ROLLBACK');throw error}
}
