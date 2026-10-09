import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {schemaSql} from '../server/schema.mjs'
import {ensureV21Tables} from '../server/migrationV21.mjs'
import {ensureV22Tables} from '../server/migrationV22.mjs'
import {ensureV24Tables} from '../server/migrationV24.mjs'
import {ensureOccSharedPrices} from '../server/occSharedPriceMigration.mjs'
import {getMaterial,saveCustomerMaterialPricing} from '../server/materialPriceService.mjs'
import {newCustomerPricing} from '../server/newCustomerPricing.mjs'
test('all existing OCC groups reach shared dropdown and save, with no duplicate or historical repricing',()=>{
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON;'+schemaSql);ensureV21Tables(db);ensureV22Tables(db);ensureV24Tables(db)
 try{
 db.exec(`INSERT INTO materials(id,material_code,material_name,status) VALUES(1,'OCC','OCC','active');INSERT INTO material_products(id,material_id,product_code,full_name,unit) VALUES(1,1,'OCC','OCC','kg');INSERT INTO customers(id,jodoo_customer_id,name) VALUES(1,'C10001','Test');INSERT INTO material_price_levels(id,material_id,price_amount,effective_date) VALUES(1,1,0.17,'2026-07-26'),(2,1,0.19,'2026-07-26');`)
 for(let n=15;n<=60;n++)db.prepare("INSERT INTO occ_price_groups(material_id,item_code,price_amount,created_by) VALUES(1,?,?,'test')").run('OCC-'+n,n/100)
 assert.equal(ensureOccSharedPrices(db,'2026-10-09').created,44)
 const levels=getMaterial(1,db).priceLevels;assert.equal(levels.length,46);assert.equal(levels.find(p=>p.id===1).effectiveDate,'2026-07-26')
 const id=levels.find(p=>p.priceAmount===.35).id
 saveCustomerMaterialPricing(1,[{materialId:1,standardPriceLevelId:id}],{changedBy:'KC',reason:'Select OCC'},db)
 assert.equal(db.prepare('SELECT standard_price_level_id FROM customer_material_pricing').get().standard_price_level_id,id)
 assert.equal(newCustomerPricing(db,'2026-10-09')[0].prices.length,46)
 db.prepare("UPDATE material_price_levels SET status='inactive',visibility_status='hidden' WHERE id=?").run(id)
 assert.equal(ensureOccSharedPrices(db,'2026-10-10').created,0)
 assert.equal(db.prepare('SELECT COUNT(*) n FROM material_price_levels').get().n,46)
 assert.equal(db.prepare('SELECT status FROM material_price_levels WHERE id=?').get(id).status,'inactive')
 assert.equal(db.prepare('SELECT standard_price_level_id FROM customer_material_pricing').get().standard_price_level_id,id)
 assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[])
 }finally{db.close()}
})
