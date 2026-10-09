import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {schemaSql} from '../server/schema.mjs'
import {ensureV22Tables} from '../server/migrationV22.mjs'
import {ensureV24Tables} from '../server/migrationV24.mjs'
import {ensureOccCurrentPrices,currentOccGroups,changeCurrentOccPrice,moveCurrentOccCustomers,applyDueOccPrices,previewOccPriceGrouping,groupOccSpecialPrices} from '../server/occCurrentPrices.mjs'
import {listBranchProducts} from '../server/materialProductService.mjs'
const today='2026-10-09'
function fixture(){
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON;'+schemaSql);ensureV22Tables(db);ensureV24Tables(db)
 db.exec(`INSERT INTO materials(id,material_code,material_name,status) VALUES(1,'OCC','OCC','active');
 INSERT INTO material_products(id,material_id,product_code,full_name,unit) VALUES(1,1,'OCC','OCC','kg');
 INSERT INTO customers(id,jodoo_customer_id,name) VALUES(1,'C1','Company A'),(2,'C2','Company B'),(3,'C3','Special'),(4,'C4','Unpriced');
 INSERT INTO branches(id,jodoo_branch_id,branch_name,customer_id) VALUES(1,'B1','A1',1),(2,'B2','A2',1),(3,'B3','B1',2),(4,'B4','Special1',3);
 INSERT INTO material_price_levels(id,material_id,product_id,price_amount,price_cents,is_fixed,effective_date) VALUES(1,1,1,0.16,16,1,'2026-10-01'),(2,1,1,0.17,17,1,'2026-10-01'),(3,1,1,0.19,19,1,'2026-10-01');
 INSERT INTO customer_product_pricing(customer_id,product_id,standard_price_level_id,outstation_enabled,outstation_price_level_id) VALUES(1,1,1,1,3);
 INSERT INTO customer_material_pricing(customer_id,material_id,standard_price_level_id,status,resolution_state) VALUES(2,1,1,'active','ready');
 INSERT INTO customer_material_pricing(customer_id,material_id,standard_special_price,status,resolution_state) VALUES(3,1,0.18,'active','ready');
 CREATE TABLE test_original_bill(id INTEGER PRIMARY KEY,price REAL,price_level_id INTEGER REFERENCES material_price_levels(id)); INSERT INTO test_original_bill VALUES(1,0.16,1);`)
 ensureOccCurrentPrices(db);return db
}
test('same-price grouping preserves live billing prices, both price types and original records',()=>{const db=fixture();try{
 db.exec("UPDATE customer_material_pricing SET outstation_enabled=1,outstation_special_price=.19,price_type='outstation' WHERE customer_id=3;INSERT INTO customers(id,jodoo_customer_id,name) VALUES(5,'C5','Same price');INSERT INTO branches(id,jodoo_branch_id,branch_name,customer_id) VALUES(5,'B5','Same price branch',5);INSERT INTO customer_material_pricing(customer_id,material_id,standard_special_price,status,resolution_state) VALUES(5,1,.16,'active','ready');")
 const before=[1,2,3,4,5].map(id=>listBranchProducts(id,db).map(p=>[p.productId,p.currentPrice,p.priceType]))
 const bill=JSON.stringify(db.prepare('SELECT * FROM test_original_bill').all()),plan=previewOccPriceGrouping(db,today)
 assert.equal(plan.recordCount,3);assert.equal(plan.items.find(g=>g.price===.16).defaultTarget,'1');assert.equal(plan.items.find(g=>g.price===.18).defaultTarget,'new')
 const result=groupOccSpecialPrices(db,{version:plan.version,changedBy:'KC'},today)
 assert.equal(result.changedCount,3);assert.equal(result.createdGroups,1);assert.equal(currentOccGroups(db,today).special.length,0)
 assert.deepEqual([1,2,3,4,5].map(id=>listBranchProducts(id,db).map(p=>[p.productId,p.currentPrice,p.priceType])),before)
 assert.equal(JSON.stringify(db.prepare('SELECT * FROM test_original_bill').all()),bill)
 const row=db.prepare('SELECT * FROM customer_material_pricing WHERE customer_id=3').get();assert.equal(row.outstation_price_level_id,3);assert.equal(row.outstation_special_price,null);assert.equal(row.price_type,'outstation')
 assert.equal(db.prepare("SELECT COUNT(*) n FROM material_conversion_audit WHERE action='group_same_price' AND changed_by='KC'").get().n,3)
 assert.equal(db.prepare('SELECT COUNT(*) n FROM customer_material_pricing_history').get().n,3)
 assert.throws(()=>groupOccSpecialPrices(db,{version:plan.version},today),/changed/)
 assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[])
 const g=currentOccGroups(db,today).groups.find(g=>g.id===3);changeCurrentOccPrice(db,3,{version:g.version,price:.23,effectiveDate:today,reason:'Group update'},today)
 assert.equal(listBranchProducts(4,db)[0].currentPrice,.23)
 }finally{db.close()}})
test('multiple matching groups require explicit choice, wrong prices rejected without partial writes',()=>{const db=fixture();try{
 db.exec("INSERT INTO material_price_levels(id,material_id,product_id,price_amount,effective_date) VALUES(4,1,1,.18,'2026-10-01'),(5,1,1,.18,'2026-10-01')")
 const plan=previewOccPriceGrouping(db,today);assert.equal(plan.items[0].options.length,2);assert.equal(plan.items[0].defaultTarget,'')
 assert.throws(()=>groupOccSpecialPrices(db,{version:plan.version},today),/Select a matching/)
 assert.throws(()=>groupOccSpecialPrices(db,{version:plan.version,choices:{'0.18':1}},today),/Select a matching/)
 assert.equal(db.prepare('SELECT standard_special_price p FROM customer_material_pricing WHERE customer_id=3').get().p,.18)
 groupOccSpecialPrices(db,{version:plan.version,choices:{'0.18':5},changedBy:'KC'},today)
 assert.equal(db.prepare('SELECT standard_price_level_id id FROM customer_material_pricing WHERE customer_id=3').get().id,5)
 }finally{db.close()}})
test('pending repricing, hidden groups, changed drafts and overridden legacy specials are never silently adopted',()=>{const db=fixture();try{
 db.exec("INSERT INTO material_price_levels(id,material_id,product_id,price_amount,effective_date,visibility_status) VALUES(4,1,1,.18,'2026-10-01','active'),(5,1,1,.18,'2026-10-01','hidden')")
 const g=currentOccGroups(db,today).groups.find(g=>g.id===4);changeCurrentOccPrice(db,4,{version:g.version,price:.25,effectiveDate:'2099-10-10',reason:'Later'},today)
 const plan=previewOccPriceGrouping(db,today);assert.equal(plan.items[0].options.length,0)
 db.exec("UPDATE customer_material_pricing SET standard_special_price=.21 WHERE customer_id=3")
 assert.throws(()=>groupOccSpecialPrices(db,{version:plan.version},today),/changed/)
 assert.equal(db.prepare('SELECT COUNT(*) n FROM material_price_levels').get().n,5)
 const fresh=previewOccPriceGrouping(db,today);groupOccSpecialPrices(db,{version:fresh.version},today);assert.equal(listBranchProducts(4,db)[0].currentPrice,.21)
 db.exec("UPDATE customer_material_pricing SET standard_price_level_id=NULL,standard_special_price=.33 WHERE customer_id=3;INSERT INTO customer_product_pricing(customer_id,product_id,standard_price_level_id) VALUES(3,1,1)")
 assert.equal(previewOccPriceGrouping(db,today).recordCount,0);assert.equal(listBranchProducts(4,db)[0].currentPrice,.16)
 }finally{db.close()}})
