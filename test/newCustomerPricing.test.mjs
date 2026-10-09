import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {schemaSql} from '../server/schema.mjs'
import {ensureV22Tables} from '../server/migrationV22.mjs'
import {ensureV24Tables} from '../server/migrationV24.mjs'
import {newCustomerPricing} from '../server/newCustomerPricing.mjs'
import {createCustomer} from '../server/customerMasterService.mjs'
function fixture(){const db=new DatabaseSync(':memory:');db.exec(schemaSql);ensureV22Tables(db);ensureV24Tables(db);db.exec(`INSERT INTO materials(id,material_code,material_name,status) VALUES(1,'PAPER','Paper','active');
INSERT INTO material_products(id,material_id,product_code,full_name,unit) VALUES(1,1,'OCC','OCC','kg'),(2,1,'OTHER','Other','kg'),(3,1,'MULTI','Multiple','kg'),(4,1,'EMPTY','No price','kg');
INSERT INTO material_price_levels(id,material_id,product_id,price_amount,effective_date) VALUES(1,1,1,0.2,'2020-01-01'),(2,1,2,0.3,'2020-01-01'),(3,1,3,0.4,'2020-01-01'),(4,1,3,0.5,'2020-01-01'),(5,1,2,0.6,'2099-01-01');`);return db}
test('single prices default, OCC always explicit, multiple prices require choice, missing/future excluded',()=>{const db=fixture();try{
 const p=newCustomerPricing(db);assert.equal(p.find(p=>p.productId===1).standardPriceLevelId,null);assert.equal(p.find(p=>p.productId===2).standardPriceLevelId,2);assert.equal(p.find(p=>p.productId===3).standardPriceLevelId,null);assert.equal(p.find(p=>p.productId===4).prices.length,0)
 assert.throws(()=>createCustomer({customerName:'Missing choices'},db),/Select a valid price/);assert.equal(db.prepare('SELECT COUNT(*) n FROM customers').get().n,0)
 const customer=createCustomer({customerName:'Ready',newProductPricing:[{productId:1,standardPriceLevelId:1},{productId:3,standardPriceLevelId:4}]},db)
 const rows=db.prepare('SELECT product_id,standard_price_level_id FROM customer_product_pricing ORDER BY product_id').all()
 assert.deepEqual(rows.map(r=>[r.product_id,r.standard_price_level_id]),[[1,1],[2,2],[3,4]])
 assert.ok(customer.customerId)
 assert.equal(db.prepare("SELECT COUNT(*) n FROM material_conversion_audit WHERE entity_type='customer_product_pricing'").get().n,3)
 }finally{db.close()}})
test('stale or wrong-product prices rejected atomically; hidden products do not get assigned',()=>{const db=fixture();try{
 assert.throws(()=>createCustomer({customerName:'Wrong',newProductPricing:[{productId:1,standardPriceLevelId:2}]},db),/Select a valid price/)
 db.exec("UPDATE material_price_levels SET status='inactive' WHERE id=4;UPDATE material_products SET visibility_status='hidden' WHERE id=1")
 assert.throws(()=>createCustomer({customerName:'Stale',newProductPricing:[{productId:3,standardPriceLevelId:4}]},db),/Select a valid price/)
 createCustomer({customerName:'Automatic'},db)
 assert.deepEqual(db.prepare('SELECT product_id FROM customer_product_pricing ORDER BY product_id').all().map(r=>r.product_id),[2,3])
 }finally{db.close()}})
