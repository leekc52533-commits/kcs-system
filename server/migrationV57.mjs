export const billVoidSchemaSql=`
CREATE TABLE IF NOT EXISTS purchase_bill_void_requests (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 purchase_bill_id INTEGER NOT NULL REFERENCES purchase_bills(id),
 requested_by INTEGER NOT NULL REFERENCES employees(id),
 requested_name TEXT NOT NULL,
 reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 2000),
 requested_at TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 reviewed_by INTEGER REFERENCES employees(id), reviewed_name TEXT, reviewed_at TEXT, review_note TEXT,
 reversal_transaction_id INTEGER UNIQUE REFERENCES cash_float_transactions(id),
 replacement_bill_id INTEGER UNIQUE REFERENCES purchase_bills(id),
 stop_snapshot_json TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS purchase_void_open ON purchase_bill_void_requests(purchase_bill_id) WHERE status IN ('pending','approved');
CREATE TABLE IF NOT EXISTS purchase_bill_void_events (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 request_id INTEGER NOT NULL REFERENCES purchase_bill_void_requests(id),
 action TEXT NOT NULL,
 actor_id INTEGER NOT NULL REFERENCES employees(id),
 actor_name TEXT NOT NULL, created_at TEXT NOT NULL, detail_json TEXT NOT NULL
);
`
export const ensureV57Schema=db=>db.exec(billVoidSchemaSql)
export function applyV57Migration(db){
 const version=Number(db.prepare('SELECT MAX(version) v FROM schema_meta').get().v)
 if(version>=57){ensureV57Schema(db);return}
 if(version!==56)throw Error('Schema 56 is required')
 const foreignKeys=db.prepare('PRAGMA foreign_keys').get().foreign_keys
 db.exec('PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE')
 try{
  const sql=db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='purchase_bills'").get().sql
  if(/dispatch_stop_id INTEGER NOT NULL UNIQUE/i.test(sql)){
   const indexes=db.prepare("SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name='purchase_bills' AND sql IS NOT NULL").all()
   const sequence=db.prepare("SELECT seq FROM sqlite_sequence WHERE name='purchase_bills'").get()?.seq||0
   const columns=db.prepare('PRAGMA table_info(purchase_bills)').all().map(x=>'"'+x.name+'"').join(',')
   db.exec(sql.replace(/CREATE TABLE(?: IF NOT EXISTS)?\s+["`]?purchase_bills["`]?/i,'CREATE TABLE purchase_bills_v57').replace(/dispatch_stop_id INTEGER NOT NULL UNIQUE/i,'dispatch_stop_id INTEGER NOT NULL'))
   db.exec(`INSERT INTO purchase_bills_v57(${columns}) SELECT ${columns} FROM purchase_bills; DROP TABLE purchase_bills; ALTER TABLE purchase_bills_v57 RENAME TO purchase_bills;`)
   db.prepare("UPDATE sqlite_sequence SET seq=MAX(seq,?) WHERE name='purchase_bills'").run(sequence)
   for(const index of indexes)db.exec(index.sql)
  }
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS purchase_bills_issued_stop ON purchase_bills(dispatch_stop_id) WHERE status='issued'")
  ensureV57Schema(db)
  db.exec('INSERT INTO schema_meta(version) VALUES(57)')
  if(db.prepare('PRAGMA foreign_key_check').get())throw Error('Foreign key check failed')
  db.exec('COMMIT')
 }catch(e){db.exec('ROLLBACK');throw e}finally{db.exec(`PRAGMA foreign_keys=${foreignKeys?1:0}`)}
}
