export const salePriceSchema=`CREATE TABLE IF NOT EXISTS sale_price_catalog(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 buyer_id INTEGER NOT NULL REFERENCES buyers(id),
 description TEXT NOT NULL,
 description_key TEXT NOT NULL,
 unit_price TEXT NOT NULL,
 updated_by TEXT NOT NULL,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(buyer_id,description_key)
);
CREATE TABLE IF NOT EXISTS sale_price_audit(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 catalog_id INTEGER NOT NULL,
 actor TEXT NOT NULL,
 before_json TEXT,
 after_json TEXT,
 changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);`
export function applyV80Migration(db){
 const version=Number(db.prepare('SELECT MAX(version) v FROM schema_meta').get().v)
 if(version>=80){db.exec(salePriceSchema);return}
 if(version!==79)throw Error('Schema 79 required')
 db.exec('BEGIN IMMEDIATE')
 try{db.exec(salePriceSchema);db.exec('INSERT INTO schema_meta(version) VALUES(80);COMMIT')}catch(error){db.exec('ROLLBACK');throw error}
}
