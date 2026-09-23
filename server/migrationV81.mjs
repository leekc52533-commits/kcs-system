export const globalSalePriceSchema=`CREATE TABLE IF NOT EXISTS sale_price_catalog(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 description TEXT NOT NULL,
 description_key TEXT NOT NULL UNIQUE,
 unit_price TEXT NOT NULL,
 updated_by TEXT NOT NULL,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS sale_price_audit(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 catalog_id INTEGER NOT NULL,
 actor TEXT NOT NULL,
 before_json TEXT,
 after_json TEXT,
 changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);`

export function applyV81Migration(db){
 const version=Number(db.prepare('SELECT MAX(version) v FROM schema_meta').get().v)
 if(version>=81)return
 if(version!==80)throw Error('Schema 80 required')
 db.exec('BEGIN IMMEDIATE')
 try{
  const columns=new Set(db.prepare('PRAGMA table_info(sale_price_catalog)').all().map(row=>row.name))
  if(columns.has('buyer_id')){
   db.exec('ALTER TABLE sale_price_catalog RENAME TO sale_price_catalog_old')
   db.exec(globalSalePriceSchema)
   db.exec(`INSERT OR IGNORE INTO sale_price_catalog(id,description,description_key,unit_price,updated_by,updated_at)
    SELECT id,description,description_key,unit_price,updated_by,updated_at
    FROM sale_price_catalog_old ORDER BY updated_at DESC,id DESC`)
   db.exec('DROP TABLE sale_price_catalog_old')
  }else db.exec(globalSalePriceSchema)
  db.exec('INSERT INTO schema_meta(version) VALUES(81);COMMIT')
 }catch(error){db.exec('ROLLBACK');throw error}
}
