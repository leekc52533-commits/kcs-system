import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {schemaSql} from '../server/schema.mjs'
import {ensureV22Tables} from '../server/migrationV22.mjs'
import {ensureV24Tables} from '../server/migrationV24.mjs'
import {ensureOccCurrentPrices,currentOccGroups,changeCurrentOccPrice,moveCurrentOccCustomers,applyDueOccPrices} from '../server/occCurrentPrices.mjs'
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
const grp=(db,id)=>currentOccGroups(db,today).groups.find(g=>g.id===id)
test('current groups include product and material fallback, special prices separate; restart preserves references',()=>{const db=fixture();try{
 const data=currentOccGroups(db,today),g=grp(db,1);assert.equal(g.customerCount,2);assert.equal(g.branchCount,3);assert.equal(data.special[0].customerName,'Special');assert.equal(data.unpriced[0].customerName,'Unpriced')
 const before=JSON.stringify(db.prepare('SELECT * FROM material_price_levels').all());ensureOccCurrentPrices(db);assert.equal(JSON.stringify(db.prepare('SELECT * FROM material_price_levels').all()),before);assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[])
 }finally{db.close()}})
test('whole-group update reaches actual billing price, keeps IDs, same-price group and old bill unchanged',()=>{const db=fixture();try{
 const before=db.prepare('SELECT * FROM customer_product_pricing').all(),g=grp(db,1)
 changeCurrentOccPrice(db,1,{version:g.version,price:.17,effectiveDate:today,reason:'Test',changedBy:'KC'},today)
 assert.equal(listBranchProducts(1,db)[0].currentPrice,.17);assert.equal(listBranchProducts(3,db)[0].currentPrice,.17);assert.equal(listBranchProducts(4,db)[0].currentPrice,.18)
 assert.equal(grp(db,2).price,.17);assert.equal(grp(db,1).id,1);assert.deepEqual(db.prepare('SELECT * FROM customer_product_pricing').all(),before)
 assert.equal(db.prepare('SELECT price FROM test_original_bill').get().price,.16);assert.equal(db.prepare('SELECT changed_by FROM occ_current_price_changes').get().changed_by,'KC')
 ensureOccCurrentPrices(db);assert.equal(grp(db,1).price,.17);assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[])
 }finally{db.close()}})
test('future price only starts on effective day and cannot be overwritten by stale preview',()=>{const db=fixture();try{
 const g=grp(db,1);changeCurrentOccPrice(db,1,{version:g.version,price:.22,effectiveDate:'2099-10-10',reason:'Later'},today)
 assert.equal(listBranchProducts(1,db)[0].currentPrice,.16);assert.equal(grp(db,1).pending.price,.22)
 assert.throws(()=>changeCurrentOccPrice(db,1,{version:g.version,price:.23,effectiveDate:today,reason:'Stale'},today),/changed/)
 applyDueOccPrices(db,'2099-10-10');assert.equal(listBranchProducts(1,db)[0].currentPrice,.22);assert.equal(db.prepare("SELECT COUNT(*) n FROM occ_current_price_changes WHERE state='applied'").get().n,1)
 applyDueOccPrices(db,'2099-10-10');assert.equal(db.prepare('SELECT COUNT(*) n FROM occ_current_price_changes').get().n,1)
 }finally{db.close()}})
test('moves current company assignments atomically, handles fallback, preserves other type and stale selection',()=>{const db=fixture();try{
 const a=grp(db,1),b=grp(db,2);moveCurrentOccCustomers(db,{sourceId:1,targetId:2,sourceVersion:a.version,targetVersion:b.version,keys:a.members.map(m=>m.key),reason:'Move',changedBy:'KC'},today)
 assert.equal(listBranchProducts(1,db)[0].currentPrice,.17);assert.equal(listBranchProducts(3,db)[0].currentPrice,.17)
 assert.equal(db.prepare('SELECT outstation_price_level_id id FROM customer_product_pricing').get().id,3)
 assert.equal(db.prepare('SELECT COUNT(*) n FROM material_conversion_audit').get().n,2)
 assert.throws(()=>moveCurrentOccCustomers(db,{sourceId:1,targetId:2,sourceVersion:a.version,targetVersion:b.version,keys:a.members.map(m=>m.key),reason:'Stale'},today),/changed/)
 const source=grp(db,2),target=grp(db,3);assert.throws(()=>moveCurrentOccCustomers(db,{sourceId:2,targetId:3,sourceVersion:source.version,targetVersion:target.version,keys:[source.members[0].key,'invalid'],reason:'Invalid'},today),/changed/)
 assert.equal(listBranchProducts(1,db)[0].currentPrice,.17)
 }finally{db.close()}})
test('invalid date, price, blank reason and concurrent membership change are rejected',()=>{const db=fixture();try{
 const g=grp(db,1),p={version:g.version,price:.20,effectiveDate:today,reason:'Test'}
 for(const invalid of [{price:''},{price:0},{price:.1234},{effectiveDate:'2026-02-30'},{effectiveDate:'2026-10-08'},{reason:''}])assert.throws(()=>changeCurrentOccPrice(db,1,{...p,...invalid},today))
 db.exec('UPDATE customer_product_pricing SET standard_price_level_id=2 WHERE customer_id=1');assert.throws(()=>changeCurrentOccPrice(db,1,p,today),/changed/)
 assert.equal(db.prepare('SELECT COUNT(*) n FROM occ_current_price_changes').get().n,0)
 }finally{db.close()}})
