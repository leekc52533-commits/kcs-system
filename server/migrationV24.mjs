export const V24_VERSION=24

const CATEGORY_SEEDS=[
  ['PAPER','Paper',10,0],
  ['ALUMINIUM','Aluminium',20,0],
  ['SCRAP_IRON','Scrap Iron',30,0],
  ['UNCATEGORIZED','Uncategorized',999,1],
]
const CATEGORY_PRODUCTS={
  PAPER:['OCC','MIXED_PAPER','NEWSPAPER','BLACK_WHITE_PAPER'],
  ALUMINIUM:['ALUMINUM_CAN','ALUMINIUM_ANGLE','MIXED_ALLOY'],
  SCRAP_IRON:['G1','G2'],
}

const columns=(database,table)=>new Set(database.prepare(`PRAGMA table_info("${table}")`).all().map(row=>row.name))
const addColumn=(database,table,name,definition)=>{if(!columns(database,table).has(name))database.exec(`ALTER TABLE "${table}" ADD COLUMN "${name}" ${definition}`)}

export function ensureV24Tables(database){
  database.exec(`
    CREATE TABLE IF NOT EXISTS material_categories(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_code TEXT NOT NULL UNIQUE,
      category_name TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
      is_hidden INTEGER NOT NULL DEFAULT 0 CHECK(is_hidden IN (0,1)),
      system_reserved INTEGER NOT NULL DEFAULT 0 CHECK(system_reserved IN (0,1)),
      sort_order INTEGER NOT NULL DEFAULT 0,
      merged_into_category_id INTEGER REFERENCES material_categories(id),
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)
  addColumn(database,'material_products','category_id','INTEGER REFERENCES material_categories(id)')
  addColumn(database,'material_products','visibility_status',"TEXT NOT NULL DEFAULT 'active'")
  addColumn(database,'material_products','merged_into_product_id','INTEGER REFERENCES material_products(id)')
  addColumn(database,'material_price_levels','previous_price_amount','REAL')
  addColumn(database,'material_price_levels','pending_price_amount','REAL')
  addColumn(database,'material_price_levels','pending_effective_date','TEXT')
  addColumn(database,'material_price_levels','visibility_status',"TEXT NOT NULL DEFAULT 'active'")
  addColumn(database,'material_price_levels','merged_into_price_level_id','INTEGER REFERENCES material_price_levels(id)')
  database.exec(`
    CREATE TABLE IF NOT EXISTS material_product_category_history(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES material_products(id),
      old_category_id INTEGER REFERENCES material_categories(id),
      new_category_id INTEGER NOT NULL REFERENCES material_categories(id),
      reason TEXT NOT NULL,
      changed_by TEXT NOT NULL,
      action TEXT NOT NULL DEFAULT 'category_move',
      changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS branch_product_price_assignments(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES material_products(id),
      price_level_id INTEGER NOT NULL REFERENCES material_price_levels(id),
      assigned_by TEXT NOT NULL,
      assigned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(branch_id,product_id)
    );
    CREATE TABLE IF NOT EXISTS branch_product_price_assignment_history(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      branch_id INTEGER NOT NULL REFERENCES branches(id),
      product_id INTEGER NOT NULL REFERENCES material_products(id),
      old_price_level_id INTEGER REFERENCES material_price_levels(id),
      new_price_level_id INTEGER NOT NULL REFERENCES material_price_levels(id),
      reason TEXT NOT NULL,
      changed_by TEXT NOT NULL,
      action TEXT NOT NULL DEFAULT 'move',
      changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS product_price_group_history(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      price_level_id INTEGER NOT NULL REFERENCES material_price_levels(id),
      product_id INTEGER NOT NULL REFERENCES material_products(id),
      old_price_amount REAL NOT NULL,
      new_price_amount REAL NOT NULL,
      old_effective_date TEXT,
      new_effective_date TEXT NOT NULL,
      affected_branch_count INTEGER NOT NULL DEFAULT 0,
      reason TEXT NOT NULL,
      changed_by TEXT NOT NULL,
      changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS material_master_audit(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      before_json TEXT,
      after_json TEXT,
      reason TEXT NOT NULL,
      changed_by TEXT NOT NULL,
      changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS material_master_merge_links(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      source_id INTEGER NOT NULL,
      target_id INTEGER NOT NULL,
      reason TEXT NOT NULL,
      changed_by TEXT NOT NULL,
      merged_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(entity_type,source_id)
    );
    CREATE INDEX IF NOT EXISTS material_products_category_idx ON material_products(category_id,visibility_status,status);
    CREATE INDEX IF NOT EXISTS branch_product_price_group_idx ON branch_product_price_assignments(product_id,price_level_id,branch_id);
    CREATE INDEX IF NOT EXISTS branch_product_price_branch_idx ON branch_product_price_assignments(branch_id,product_id);
    CREATE INDEX IF NOT EXISTS product_price_group_history_idx ON product_price_group_history(price_level_id,changed_at DESC);
    CREATE INDEX IF NOT EXISTS material_master_audit_idx ON material_master_audit(entity_type,entity_id,changed_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS v24_category_seed_history_unique ON material_product_category_history(product_id,new_category_id,action) WHERE action='migration_v24';
    CREATE UNIQUE INDEX IF NOT EXISTS v24_assignment_seed_history_unique ON branch_product_price_assignment_history(branch_id,product_id,new_price_level_id,action) WHERE action='migration_v24';
  `)
}

export function seedV24Data(database,{actor='Schema v24 category and branch pricing migration'}={}){
  ensureV24Tables(database)
  let categoriesCreated=0,categoryAssignmentsCreated=0,branchAssignmentsCreated=0,assignmentHistoryCreated=0
  for(const [code,name,sort,reserved] of CATEGORY_SEEDS){
    const result=database.prepare(`INSERT OR IGNORE INTO material_categories(category_code,category_name,sort_order,system_reserved,created_by) VALUES(?,?,?,?,?)`).run(code,name,sort,reserved,actor)
    categoriesCreated+=Number(result.changes)
  }
  const categories=Object.fromEntries(database.prepare('SELECT category_code,id FROM material_categories').all().map(row=>[row.category_code,row.id]))
  const products=database.prepare('SELECT id,product_code,category_id FROM material_products ORDER BY id').all()
  for(const product of products){
    const categoryCode=Object.entries(CATEGORY_PRODUCTS).find(([,codes])=>codes.includes(product.product_code))?.[0]||'UNCATEGORIZED'
    const target=categories[categoryCode]
    if(product.category_id==null){
      database.prepare('UPDATE material_products SET category_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(target,product.id)
      database.prepare(`INSERT OR IGNORE INTO material_product_category_history(product_id,old_category_id,new_category_id,reason,changed_by,action) VALUES(?,NULL,?,?,?,'migration_v24')`).run(product.id,target,'Approved initial Category mapping',actor)
      categoryAssignmentsCreated+=1
    }else if(Number(product.category_id)!==Number(target))throw new Error(`Product ${product.product_code} already belongs to an unexpected Category`)
  }
  const candidates=database.prepare(`
    SELECT a.branch_id,a.product_id,a.price_type,
      CASE a.price_type WHEN 'outstation' THEN cpp.outstation_price_level_id ELSE cpp.standard_price_level_id END price_level_id
    FROM branch_product_availability a
    JOIN branches b ON b.id=a.branch_id
    JOIN material_products p ON p.id=a.product_id AND p.product_code<>'OCC'
    JOIN customer_product_pricing cpp ON cpp.customer_id=b.customer_id AND cpp.product_id=a.product_id AND cpp.status='active'
    WHERE a.is_selectable=1
    ORDER BY a.branch_id,a.product_id
  `).all()
  for(const item of candidates){
    if(!item.price_level_id)throw new Error(`Branch ${item.branch_id} Product ${item.product_id} has no uniquely resolved Price Group`)
    const level=database.prepare('SELECT id FROM material_price_levels WHERE id=? AND product_id=?').get(item.price_level_id,item.product_id)
    if(!level)throw new Error(`Price Group ${item.price_level_id} does not belong to Product ${item.product_id}`)
    const existing=database.prepare('SELECT price_level_id FROM branch_product_price_assignments WHERE branch_id=? AND product_id=?').get(item.branch_id,item.product_id)
    if(existing&&Number(existing.price_level_id)!==Number(item.price_level_id))throw new Error(`Branch ${item.branch_id} Product ${item.product_id} has a conflicting v24 assignment`)
    if(!existing){
      database.prepare('INSERT INTO branch_product_price_assignments(branch_id,product_id,price_level_id,assigned_by) VALUES(?,?,?,?)').run(item.branch_id,item.product_id,item.price_level_id,actor)
      branchAssignmentsCreated+=1
    }
    const history=database.prepare(`INSERT OR IGNORE INTO branch_product_price_assignment_history(branch_id,product_id,old_price_level_id,new_price_level_id,reason,changed_by,action) VALUES(?,?,NULL,?,?,?,'migration_v24')`).run(item.branch_id,item.product_id,item.price_level_id,'Proven one-to-one legacy Customer pricing and Branch availability',actor)
    assignmentHistoryCreated+=Number(history.changes)
  }
  return{categoriesCreated,categoryCount:database.prepare('SELECT COUNT(*) count FROM material_categories').get().count,categoryAssignmentsCreated,categorizedProductCount:database.prepare('SELECT COUNT(*) count FROM material_products WHERE category_id IS NOT NULL').get().count,branchAssignmentsCreated,branchAssignmentCount:database.prepare('SELECT COUNT(*) count FROM branch_product_price_assignments').get().count,assignmentHistoryCreated,migrationAssignmentCandidateCount:candidates.length,unassignedPriceLevelCount:database.prepare('SELECT COUNT(*) count FROM material_price_levels WHERE product_id IS NULL').get().count}
}

export function applyV24Migration(database){
  const version=Number(database.prepare('SELECT COALESCE(MAX(version),0) version FROM schema_meta').get().version)
  if(version<23)throw new Error(`Schema v23 is required before v24; current schema is v${version}`)
  const integrity=database.prepare('PRAGMA integrity_check').get().integrity_check
  if(integrity!=='ok')throw new Error(`Database integrity check failed: ${integrity}`)
  database.exec('BEGIN IMMEDIATE')
  try{
    const result=seedV24Data(database)
    database.prepare('INSERT OR IGNORE INTO schema_meta(version) VALUES(?)').run(V24_VERSION)
    database.exec('COMMIT')
    return{schemaVersion:Math.max(version,V24_VERSION),...result}
  }catch(error){database.exec('ROLLBACK');throw error}
}

export {CATEGORY_PRODUCTS,V24_VERSION as SCHEMA_V24}
