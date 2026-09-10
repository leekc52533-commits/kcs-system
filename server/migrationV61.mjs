export const menuSchemaSql=`
CREATE TABLE IF NOT EXISTS company_menu(id INTEGER PRIMARY KEY CHECK(id=1),owner_account_id INTEGER REFERENCES auth_accounts(id),layout_json TEXT,revision INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS company_menu_audit(id INTEGER PRIMARY KEY,account_id INTEGER NOT NULL REFERENCES auth_accounts(id),before_json TEXT,after_json TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
`
export function ensureV61Schema(db){db.exec(menuSchemaSql);db.exec("INSERT OR IGNORE INTO company_menu(id,owner_account_id) SELECT 1,id FROM auth_accounts WHERE lower(username)='kcadmin' AND is_active=1")}
export function applyV61Migration(db){
 const v=Number(db.prepare('SELECT MAX(version) v FROM schema_meta').get().v)
 if(v>=61){ensureV61Schema(db);return}
 if(v!==60)throw Error('Schema 60 required')
 db.exec('BEGIN IMMEDIATE');try{ensureV61Schema(db);db.exec('INSERT INTO schema_meta(version) VALUES(61)');db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}
}
