import {kuchingDate} from '../shared/kuchingTime.js'
// Legacy OCC groups are read-only. Bridge once into the current shared catalog;
// subsequent edits/archival belong to that catalog and must never be undone.
export function ensureOccSharedPrices(db,today=kuchingDate()){
 db.exec(`CREATE TABLE IF NOT EXISTS occ_shared_price_bridge(
  legacy_group_id INTEGER PRIMARY KEY REFERENCES occ_price_groups(id),
  price_level_id INTEGER NOT NULL REFERENCES material_price_levels(id),
  action TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
 )`)
 const product=db.prepare("SELECT p.id,p.material_id FROM material_products p JOIN materials m ON m.id=p.material_id WHERE p.product_code='OCC' AND m.material_code='OCC' AND p.status='active' AND m.status='active' AND p.visibility_status='active'").get()
 if(!product)return {created:0}
 db.exec('SAVEPOINT occ_shared_prices')
 try{
 let created=0
 const groups=db.prepare("SELECT g.* FROM occ_price_groups g WHERE g.material_id=? AND g.status='active' AND g.price_amount>0 AND NOT EXISTS(SELECT 1 FROM occ_shared_price_bridge b WHERE b.legacy_group_id=g.id) ORDER BY g.id").all(product.material_id)
 for(const g of groups){
  // Reuse a current group, including deliberately inactive/hidden groups.
  let level=db.prepare('SELECT id,product_id FROM material_price_levels WHERE material_id=? AND price_amount=? AND (product_id=? OR product_id IS NULL) ORDER BY (product_id IS NOT NULL) DESC,id LIMIT 1').get(product.material_id,g.price_amount,product.id),action='reused'
  if(!level){
   const id=db.prepare(`INSERT INTO material_price_levels(material_id,product_id,price_amount,price_cents,is_fixed,effective_date,status,reason,created_by,visibility_status) VALUES(?,?,?,?,0,?,'active',?,'KCS OCC catalog bridge','active')`).run(product.material_id,product.id,g.price_amount,Math.round(g.price_amount*100),today,`Imported existing OCC group ${g.id} (${g.item_code})`).lastInsertRowid
   level={id};created++;action='created'
  }else if(level.product_id==null){db.prepare('UPDATE material_price_levels SET product_id=? WHERE id=?').run(product.id,level.id);action='linked'}
  db.prepare('INSERT INTO occ_shared_price_bridge(legacy_group_id,price_level_id,action) VALUES(?,?,?)').run(g.id,level.id,action)
 }
 db.exec('RELEASE occ_shared_prices');return {created}
 }catch(e){db.exec('ROLLBACK TO occ_shared_prices; RELEASE occ_shared_prices');throw e}
}
