export const V22_VERSION=22
export const BASE_PRODUCT_CODES=['OCC','MIX_PLASTIC','SALI_TIN','G1','G2']

const PRODUCTS=[
  ['OCC','OCC','OCC','OCC','kg',[]],
  ['ALUMINUM_CAN','ALUMINUM_CAN','Aluminum Can','AL/CAN','kg',[[450,'10023','AL/CAN 4.50',1],[500,'10043','AL/CAN 5.00',1]]],
  ['ALUMINIUM_ANGLE','ALUMINIUM_ANGLE','Aluminium Angle','AL/ANGLE','kg',[[380,'10024','ALUMININUM ANGLE',0],[500,'10029','ALUMINIUM ANGLE',1]]],
  ['MIXED_ALLOY','MIXED_ALLOY','Mixed Alloy','MIX.ALOI','kg',[[80,'10036','MIX.ALOI',1]]],
  ['WET_BATTERY','WET_BATTERY','Wet Battery','BATT WET','kg',[[120,'10022','BATT WET',1]]],
  ['DRY_BATTERY','DRY_BATTERY','Dry Battery','BATT DRY','kg',[[160,'10021','BATT DRY',1]]],
  ['SMALL_BATTERY','SMALL_BATTERY','Small Battery','BATT SMALL','kg',[[80,'10020','BATT SMALL',1]]],
  ['COPPER','COPPER','Copper','COPPER','kg',[[1200,'10010','COPPER',1]]],
  ['AIR_CONDITIONER','AIR_CONDITIONER','Air Conditioner','AIR CON','piece',[[2000,'10009','AIR CON',1]]],
  ['MIXED_ELECTRICAL_GOODS','MIXED_ELECTRICAL_GOODS','Mixed Electrical Goods','BARANG ELE','kg',[[10,'10008','BARANG ELE',1]]],
  ['TV_MONITOR','TV_MONITOR','TV / Monitor','TV/MONITOR','piece',[[300,'10007','TV/MONITOR',1]]],
  ['ALL_SCRAPPED','ALL_SCRAPPED','All Scrapped','ALL SCRAP','kg',[[10,'10040','OLD SCRAPPED',1]]],
  ['TANK','TANK','Tank','TANK','kg',[[9000,'10034','TANK',1]]],
  ['NEWSPAPER','NEWSPAPER','Newspaper','NEWS PAPER','kg',[[25,'10025','NEWS PAPER',1]]],
  ['BLACK_WHITE_PAPER','BLACK_WHITE_PAPER','Black & White Paper','B/W','kg',[[30,'10006','B/W',1]]],
  ['MIXED_PAPER','MIXED_PAPER','Mixed Paper','MIX PAPERS','kg',[[5,'10005','MIX PAPERS',1]]],
  ['PLASTIC','MIX_PLASTIC','Plastic','MIX PLASTIC','kg',[[20,'10004','MIX PLASTIC',1]]],
  ['SALI_TIN','SALI_TIN','Sali/Tin','SALI/TIN','kg',[[30,'10001','SALIL/TIN',1]]],
  ['IRON','G1','Scrap Iron G1','G1','kg',[[50,'10003','G1',1]]],
  ['IRON','G2','Scrap Iron G2','G2','kg',[[40,'10002','G2',1]]],
]

const MATERIAL_NAMES=new Map([
  ['OCC','OCC'],['ALUMINUM_CAN','Aluminum Can'],['ALUMINIUM_ANGLE','Aluminium Angle'],
  ['MIXED_ALLOY','Mixed Alloy'],['WET_BATTERY','Wet Battery'],['DRY_BATTERY','Dry Battery'],
  ['SMALL_BATTERY','Small Battery'],['COPPER','Copper'],['AIR_CONDITIONER','Air Conditioner'],
  ['MIXED_ELECTRICAL_GOODS','Mixed Electrical Goods'],['TV_MONITOR','TV / Monitor'],
  ['ALL_SCRAPPED','All Scrapped'],['TANK','Tank'],['NEWSPAPER','Newspaper'],
  ['BLACK_WHITE_PAPER','Black & White Paper'],['MIXED_PAPER','Mixed Paper'],
  ['PLASTIC','Plastic'],['SALI_TIN','Sali/Tin'],['IRON','Iron'],
])

const columns=(database,table)=>new Set(database.prepare(`PRAGMA table_info("${table}")`).all().map(row=>row.name))
const addColumn=(database,table,name,definition)=>{if(!columns(database,table).has(name))database.exec(`ALTER TABLE "${table}" ADD COLUMN "${name}" ${definition}`)}

export function ensureV22Tables(database){
  addColumn(database,'materials','full_name','TEXT')
  addColumn(database,'materials','short_form','TEXT')
  database.exec(`
    CREATE TABLE IF NOT EXISTS material_products(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      material_id INTEGER NOT NULL REFERENCES materials(id),
      product_code TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      short_form TEXT,
      unit TEXT NOT NULL CHECK(unit IN ('kg','piece')),
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(material_id,full_name)
    );
  `)
  addColumn(database,'material_price_levels','product_id','INTEGER REFERENCES material_products(id)')
  addColumn(database,'material_price_levels','price_cents','INTEGER')
  addColumn(database,'material_price_levels','is_fixed','INTEGER NOT NULL DEFAULT 0 CHECK(is_fixed IN (0,1))')
  addColumn(database,'dispatch_stop_material_prices','product_id_snapshot','INTEGER')
  addColumn(database,'dispatch_stop_material_prices','product_full_name_snapshot','TEXT')
  addColumn(database,'dispatch_stop_material_prices','product_short_form_snapshot','TEXT')
  database.exec(`
    CREATE TABLE IF NOT EXISTS legacy_item_product_mappings(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      legacy_item_id TEXT NOT NULL UNIQUE,
      legacy_item_name TEXT NOT NULL,
      product_id INTEGER NOT NULL REFERENCES material_products(id),
      preferred_for_product INTEGER NOT NULL DEFAULT 1 CHECK(preferred_for_product IN (0,1)),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS branch_product_availability(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES material_products(id),
      is_selectable INTEGER NOT NULL DEFAULT 1 CHECK(is_selectable IN (0,1)),
      price_type TEXT NOT NULL DEFAULT 'standard' CHECK(price_type IN ('standard','outstation')),
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(branch_id,product_id)
    );
    CREATE TABLE IF NOT EXISTS customer_product_pricing(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES material_products(id),
      standard_price_level_id INTEGER REFERENCES material_price_levels(id),
      outstation_enabled INTEGER NOT NULL DEFAULT 0 CHECK(outstation_enabled IN (0,1)),
      outstation_price_level_id INTEGER REFERENCES material_price_levels(id),
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),
      legacy_source_json TEXT,
      updated_by TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(customer_id,product_id)
    );
    CREATE TABLE IF NOT EXISTS material_conversion_audit(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      before_json TEXT,
      after_json TEXT,
      changed_by TEXT NOT NULL,
      changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS fixed_product_price_unique
      ON material_price_levels(product_id,price_cents)
      WHERE product_id IS NOT NULL AND is_fixed=1;
    CREATE INDEX IF NOT EXISTS branch_product_availability_branch_idx
      ON branch_product_availability(branch_id,product_id);
    CREATE INDEX IF NOT EXISTS customer_product_pricing_customer_idx
      ON customer_product_pricing(customer_id,product_id);
    CREATE UNIQUE INDEX IF NOT EXISTS material_conversion_legacy_source_unique
      ON material_conversion_audit(entity_type,entity_id,action)
      WHERE entity_type='legacy_item_assignment' AND action='preserve';
  `)
}

const upsertMaterial=(database,code,name,unit,actor)=>{
  let row=database.prepare('SELECT id FROM materials WHERE material_code=?').get(code)
  if(!row){
    const result=database.prepare(`INSERT INTO materials(material_code,material_name,full_name,short_form,unit,status,created_by)
      VALUES(?,?,?,?,?,'active',?)`).run(code,name,name,null,unit,actor)
    row={id:Number(result.lastInsertRowid)}
  }else database.prepare(`UPDATE materials SET full_name=COALESCE(full_name,material_name),short_form=COALESCE(short_form,CASE WHEN material_code='OCC' THEN 'OCC' END) WHERE id=?`).run(row.id)
  return row.id
}

export function seedV22MasterData(database,{actor='Schema v22 material products'}={}){
  ensureV22Tables(database)
  const productIds={}
  let priceGroupsCreated=0
  for(const [materialCode,productCode,fullName,shortForm,unit,levels] of PRODUCTS){
    const materialId=upsertMaterial(database,materialCode,MATERIAL_NAMES.get(materialCode),unit,actor)
    let product=database.prepare('SELECT id FROM material_products WHERE product_code=?').get(productCode)
    if(!product){
      const result=database.prepare(`INSERT INTO material_products(material_id,product_code,full_name,short_form,unit,created_by)
        VALUES(?,?,?,?,?,?)`).run(materialId,productCode,fullName,shortForm,unit,actor)
      product={id:Number(result.lastInsertRowid)}
    }
    productIds[productCode]=product.id
    for(const [priceCents,legacyId,legacyName,preferred] of levels){
      let level=database.prepare('SELECT id FROM material_price_levels WHERE product_id=? AND price_cents=? AND is_fixed=1').get(product.id,priceCents)
      if(!level){
        const result=database.prepare(`INSERT INTO material_price_levels(material_id,product_id,price_amount,price_cents,is_fixed,effective_date,status,reason,created_by)
          VALUES(?,?,?,?,1,'2026-07-29','active','Legacy non-OCC fixed price group',?)`).run(materialId,product.id,priceCents/100,priceCents,actor)
        level={id:Number(result.lastInsertRowid)};priceGroupsCreated+=1
      }
      database.prepare(`INSERT INTO legacy_item_product_mappings(legacy_item_id,legacy_item_name,product_id,preferred_for_product)
        VALUES(?,?,?,?) ON CONFLICT(legacy_item_id) DO UPDATE SET legacy_item_name=excluded.legacy_item_name,product_id=excluded.product_id,preferred_for_product=excluded.preferred_for_product`).run(legacyId,legacyName,product.id,preferred)
    }
  }
  database.exec('DROP TRIGGER IF EXISTS branches_seed_base_products')
  database.exec(`
    CREATE TRIGGER branches_seed_base_products AFTER INSERT ON branches
    BEGIN
      INSERT OR IGNORE INTO branch_product_availability(branch_id,product_id,is_selectable,created_by)
      SELECT NEW.id,id,1,'Branch creation default' FROM material_products
      WHERE product_code IN ('OCC','MIX_PLASTIC','SALI_TIN','G1','G2');
    END;
  `)
  const before=database.prepare('SELECT COUNT(*) count FROM branch_product_availability').get().count
  database.prepare(`INSERT OR IGNORE INTO branch_product_availability(branch_id,product_id,is_selectable,created_by)
    SELECT b.id,p.id,1,? FROM branches b CROSS JOIN material_products p
    WHERE p.product_code IN ('OCC','MIX_PLASTIC','SALI_TIN','G1','G2')`).run(actor)
  const after=database.prepare('SELECT COUNT(*) count FROM branch_product_availability').get().count
  return{
    materialCount:database.prepare('SELECT COUNT(*) count FROM materials').get().count,
    productCount:database.prepare('SELECT COUNT(*) count FROM material_products').get().count,
    nonOccFixedPriceGroupCount:database.prepare(`SELECT COUNT(*) count FROM material_price_levels pl JOIN material_products p ON p.id=pl.product_id WHERE p.product_code<>'OCC' AND pl.is_fixed=1`).get().count,
    baseAvailabilityCreated:after-before,
    baseAvailabilityCount:database.prepare(`SELECT COUNT(*) count FROM branch_product_availability a JOIN material_products p ON p.id=a.product_id WHERE p.product_code IN ('OCC','MIX_PLASTIC','SALI_TIN','G1','G2')`).get().count,
    priceGroupsCreated,
    productIds,
  }
}

export function applyV22Migration(database){
  const version=Number(database.prepare('SELECT COALESCE(MAX(version),0) version FROM schema_meta').get().version)
  if(version<21)throw new Error(`Schema v21 is required before v22; current schema is v${version}`)
  const integrity=database.prepare('PRAGMA integrity_check').get().integrity_check
  if(integrity!=='ok')throw new Error(`Database integrity check failed: ${integrity}`)
  database.exec('BEGIN IMMEDIATE')
  try{
    const result=seedV22MasterData(database)
    database.prepare('INSERT OR IGNORE INTO schema_meta(version) VALUES(?)').run(V22_VERSION)
    database.exec('COMMIT')
    return{schemaVersion:Math.max(version,V22_VERSION),...result}
  }catch(error){database.exec('ROLLBACK');throw error}
}

export {PRODUCTS as V22_PRODUCTS}
