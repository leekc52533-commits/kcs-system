export const noGoodsNoticeSchemaSql=`
CREATE TABLE IF NOT EXISTS no_goods_notices (
 id INTEGER PRIMARY KEY, dispatch_stop_id INTEGER NOT NULL REFERENCES dispatch_stops(id),
 employee_id INTEGER NOT NULL REFERENCES employees(id), employee_name TEXT NOT NULL,
 contact_method TEXT NOT NULL CHECK(contact_method IN ('phone','whatsapp','sms','onsite')),
 reason TEXT NOT NULL, storage_key TEXT NOT NULL UNIQUE, content_type TEXT NOT NULL,
 original_name TEXT NOT NULL, created_at TEXT NOT NULL, before_json TEXT NOT NULL,
 restored_at TEXT, restored_by TEXT, restore_reason TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS no_goods_notice_active ON no_goods_notices(dispatch_stop_id) WHERE restored_at IS NULL;
`
export const ensureV59Schema=db=>db.exec(noGoodsNoticeSchemaSql)
export function applyV59Migration(db){
 const version=Number(db.prepare('SELECT MAX(version) v FROM schema_meta').get().v)
 if(version>=59){ensureV59Schema(db);return{schemaVersion:version,noOp:true}}
 if(version!==58)throw new Error('Schema 58 is required')
 db.exec('BEGIN IMMEDIATE')
 try{ensureV59Schema(db);db.exec('INSERT INTO schema_meta(version) VALUES(59)');if(db.prepare('PRAGMA foreign_key_check').get())throw new Error('Foreign-key check failed');db.exec('COMMIT');return{schemaVersion:59}}
 catch(e){db.exec('ROLLBACK');throw e}
}
