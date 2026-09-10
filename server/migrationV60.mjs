export const salesSchemaSql=`
CREATE TABLE IF NOT EXISTS sales_settlements(
 id INTEGER PRIMARY KEY, buyer_id INTEGER NOT NULL REFERENCES buyers(id),buyer_name TEXT NOT NULL,
 vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),vehicle_plate TEXT NOT NULL,
 bill_number TEXT NOT NULL,bill_key TEXT NOT NULL,settlement_date TEXT NOT NULL,
 lines_json TEXT NOT NULL,total_cents INTEGER NOT NULL,rounding_cents INTEGER NOT NULL DEFAULT 0,
 storage_key TEXT NOT NULL,content_type TEXT NOT NULL,remarks TEXT NOT NULL DEFAULT '',
 created_by TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 revision INTEGER NOT NULL DEFAULT 1,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(buyer_id,bill_key)
);
CREATE TABLE IF NOT EXISTS sales_settlement_audit(
 id INTEGER PRIMARY KEY,settlement_id INTEGER NOT NULL REFERENCES sales_settlements(id),
 actor TEXT NOT NULL,before_json TEXT,after_json TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`
export const ensureV60Schema=db=>db.exec(salesSchemaSql)
export function applyV60Migration(db){
 const v=Number(db.prepare('SELECT MAX(version) v FROM schema_meta').get().v)
 if(v>=60){ensureV60Schema(db);return{schemaVersion:v,noOp:true}}
 if(v!==59)throw new Error('Schema 59 is required')
 db.exec('BEGIN IMMEDIATE');try{ensureV60Schema(db);db.exec('INSERT INTO schema_meta(version) VALUES(60)');if(db.prepare('PRAGMA foreign_key_check').get())throw new Error('Foreign-key check failed');db.exec('COMMIT');return{schemaVersion:60}}catch(e){db.exec('ROLLBACK');throw e}
}
