// Historical supplementary bills may exist without a dispatch task. Keep the
// ordinary issued-stop uniqueness rule; never invent a stop for accounting.
export function ensurePurchaseBackfillSchema(db){
 const columns=db.prepare('PRAGMA table_info(purchase_bills)').all()
 if(!columns.some(c=>['dispatch_stop_id','dispatch_trip_id','dispatch_day_id'].includes(c.name)&&c.notnull))return
 if(db.isTransaction)throw Error('Purchase backfill migration requires an outer transaction boundary')
 const enabled=db.prepare('PRAGMA foreign_keys').get().foreign_keys
 const before=db.prepare('PRAGMA foreign_key_check').all()
 if(before.length)throw Error('Foreign key errors must be resolved before purchase backfill migration')
 db.exec('PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE')
 try{
 const original=db.prepare("SELECT sql FROM sqlite_master WHERE name='purchase_bills' AND type='table'").get().sql
 const objects=db.prepare("SELECT sql FROM sqlite_master WHERE tbl_name='purchase_bills' AND type IN ('index','trigger') AND sql IS NOT NULL").all()
 const sequence=db.prepare("SELECT seq FROM sqlite_sequence WHERE name='purchase_bills'").get()?.seq||0
 let sql=original.replace(/CREATE TABLE(?: IF NOT EXISTS)?\s+["`]?purchase_bills["`]?/i,'CREATE TABLE purchase_bills_backfill_upgrade')
 for(const name of ['dispatch_stop_id','dispatch_trip_id','dispatch_day_id'])sql=sql.replace(new RegExp(name+' INTEGER NOT NULL','i'),name+' INTEGER')
 db.exec(sql)
 const names=columns.map(c=>'"'+c.name.replaceAll('"','""')+'"').join(',')
 db.exec(`INSERT INTO purchase_bills_backfill_upgrade(${names}) SELECT ${names} FROM purchase_bills; DROP TABLE purchase_bills; ALTER TABLE purchase_bills_backfill_upgrade RENAME TO purchase_bills;`)
 db.prepare("UPDATE sqlite_sequence SET seq=MAX(seq,?) WHERE name='purchase_bills'").run(sequence)
 for(const o of objects)db.exec(o.sql)
 if(db.prepare('PRAGMA foreign_key_check').get())throw Error('Purchase backfill migration foreign key check failed')
 db.exec('COMMIT')
 }catch(e){db.exec('ROLLBACK');throw e}finally{db.exec(`PRAGMA foreign_keys=${enabled?1:0}`)}
}
