import {formatUnitPrice} from '../shared/measurePrecision.js'

export function applyV84Migration(db){
 const version=Number(db.prepare('SELECT COALESCE(MAX(version),0) v FROM schema_meta').get().v)
 if(version>=84)return{noOp:true}
 if(version!==83)throw Error('Schema 83 required')
 db.exec('BEGIN IMMEDIATE')
 try{
  if(!db.prepare('PRAGMA table_info(purchase_bill_items)').all().some(column=>column.name==='unit_price_mills'))db.exec('ALTER TABLE purchase_bill_items ADD COLUMN unit_price_mills INTEGER')
  db.exec('UPDATE purchase_bill_items SET unit_price_mills=unit_price_cents*10 WHERE unit_price_mills IS NULL')
  const catalog=db.prepare('SELECT * FROM sale_price_catalog ORDER BY id').all()
  const winners=new Map()
  for(const row of catalog){
   const price=formatUnitPrice(row.unit_price),key=`${row.description_key}:${price}`
   const winner=winners.get(key)
   if(!winner||row.unit_price===price&&winner.unit_price!==price)winners.set(key,row)
  }
  for(const row of catalog){
   const price=formatUnitPrice(row.unit_price),key=`${row.description_key}:${price}`
   if(winners.get(key).id!==row.id){
    db.prepare('INSERT INTO sale_price_audit(catalog_id,actor,before_json,after_json) VALUES(?,?,?,NULL)').run(row.id,'Price precision normalization',JSON.stringify(row))
    db.prepare('DELETE FROM sale_price_catalog WHERE id=?').run(row.id)
   }
  }
  for(const row of winners.values()){
   const price=formatUnitPrice(row.unit_price)
   if(row.unit_price!==price){
    db.prepare('UPDATE sale_price_catalog SET unit_price=? WHERE id=?').run(price,row.id)
    db.prepare('INSERT INTO sale_price_audit(catalog_id,actor,before_json,after_json) VALUES(?,?,?,?)').run(row.id,'Price precision normalization',JSON.stringify(row),JSON.stringify({...row,unit_price:price}))
   }
  }
  db.prepare('INSERT INTO schema_meta(version) VALUES(84)').run()
  db.exec('COMMIT')
  return{schemaVersion:84}
 }catch(error){db.exec('ROLLBACK');throw error}
}
