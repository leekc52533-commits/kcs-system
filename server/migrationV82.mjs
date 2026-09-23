export const multiSalePriceSchema=`CREATE TABLE IF NOT EXISTS sale_price_catalog(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 description TEXT NOT NULL,
 description_key TEXT NOT NULL,
 unit_price TEXT NOT NULL,
 updated_by TEXT NOT NULL,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(description_key,unit_price)
);
CREATE TABLE IF NOT EXISTS sale_price_audit(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 catalog_id INTEGER NOT NULL,
 actor TEXT NOT NULL,
 before_json TEXT,
 after_json TEXT,
 changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);`

export function applyV82Migration(db){
 const version=Number(db.prepare('SELECT MAX(version) v FROM schema_meta').get().v)
 if(version>=82)return
 if(version!==81)throw Error('Schema 81 required')
 db.exec('BEGIN IMMEDIATE')
 try{
  db.exec('ALTER TABLE sale_price_catalog RENAME TO sale_price_catalog_old')
  db.exec(multiSalePriceSchema)
  db.exec(`INSERT INTO sale_price_catalog(id,description,description_key,unit_price,updated_by,updated_at)
   SELECT id,description,description_key,unit_price,updated_by,updated_at FROM sale_price_catalog_old`)
  db.exec('DROP TABLE sale_price_catalog_old')
  db.exec('INSERT INTO schema_meta(version) VALUES(82);COMMIT')
 }catch(error){db.exec('ROLLBACK');throw error}
}
