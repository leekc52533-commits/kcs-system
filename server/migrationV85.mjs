import {canonicalSaleMaterial} from '../shared/sales.js'

// Keep original bill photos and audits; only the material labels are standardized.
export function applyV85Migration(db){
 const version=Number(db.prepare('SELECT COALESCE(MAX(version),0) v FROM schema_meta').get().v)
 if(version>=85)return{noOp:true}
 if(version!==84)throw Error('Schema 84 required')
 db.exec('BEGIN IMMEDIATE')
 try{
  const catalog=db.prepare('SELECT * FROM sale_price_catalog ORDER BY CASE WHEN description_key=? THEN 0 ELSE 1 END,id').all('occ')
  const kept=new Map()
  for(const row of catalog){
   const name=canonicalSaleMaterial(row.description),key=name.toLowerCase()+':'+row.unit_price
   if(name!==row.description){
    const winner=kept.get(key)
    if(winner){
     db.prepare('INSERT INTO sale_price_audit(catalog_id,actor,before_json,after_json) VALUES(?,?,?,NULL)').run(row.id,'OCC OCR alias normalization',JSON.stringify(row))
     db.prepare('DELETE FROM sale_price_catalog WHERE id=?').run(row.id)
     continue
    }
    db.prepare('UPDATE sale_price_catalog SET description=?,description_key=? WHERE id=?').run(name,name.toLowerCase(),row.id)
    db.prepare('INSERT INTO sale_price_audit(catalog_id,actor,before_json,after_json) VALUES(?,?,?,?)').run(row.id,'OCC OCR alias normalization',JSON.stringify(row),JSON.stringify({...row,description:name,description_key:name.toLowerCase()}))
   }
   kept.set(key,row.id)
  }
  for(const row of db.prepare('SELECT id,lines_json FROM sales_settlements').all()){
   const lines=JSON.parse(row.lines_json),normalized=lines.map(line=>({...line,description:canonicalSaleMaterial(line.description)}))
   if(JSON.stringify(lines)!==JSON.stringify(normalized))db.prepare('UPDATE sales_settlements SET lines_json=? WHERE id=?').run(JSON.stringify(normalized),row.id)
  }
  db.prepare('INSERT INTO schema_meta(version) VALUES(85)').run()
  db.exec('COMMIT')
  return{schemaVersion:85}
 }catch(error){db.exec('ROLLBACK');throw error}
}
