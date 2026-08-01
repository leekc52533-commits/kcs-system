import assert from 'node:assert/strict'
import test from 'node:test'
import {DatabaseSync} from 'node:sqlite'
import {schemaSql} from '../server/schema.mjs'
import {applyV22Migration} from '../server/migrationV22.mjs'
import {applyV24Migration} from '../server/migrationV24.mjs'
import {changeProductGroupPrice,getCategory,getPriceGroup,listCategories,moveProductBranches} from '../server/materialCatalogService.mjs'

function fixture(){
  const db=new DatabaseSync(':memory:');db.exec(`PRAGMA foreign_keys=ON;${schemaSql}`)
  db.prepare('INSERT OR IGNORE INTO schema_meta(version) VALUES(21)').run()
  db.prepare("INSERT INTO customers(jodoo_customer_id,name) VALUES('C1','Customer')").run()
  db.prepare("INSERT INTO branches(jodoo_branch_id,customer_id,branch_name) VALUES('B1',1,'One'),('B2',1,'Two'),('B3',1,'Three'),('B4',1,'Four'),('B5',1,'Five')").run()
  applyV22Migration(db);db.prepare('INSERT OR IGNORE INTO schema_meta(version) VALUES(23)').run()
  const g1=db.prepare("SELECT id FROM material_products WHERE product_code='G1'").get(),levels=db.prepare('SELECT id FROM material_price_levels WHERE product_id=? ORDER BY price_cents').all(g1.id)
  db.prepare("INSERT INTO material_price_levels(material_id,product_id,price_amount,price_cents,is_fixed,effective_date,status,reason,created_by) SELECT material_id,product_id,.55,55,1,'2026-08-01','active','fixture','test' FROM material_price_levels WHERE id=?").run(levels[0].id)
  const target=db.prepare('SELECT id FROM material_price_levels WHERE product_id=? AND price_cents=55').get(g1.id)
  db.prepare("INSERT INTO customer_product_pricing(customer_id,product_id,standard_price_level_id,updated_by) VALUES(1,?,?,'test')").run(g1.id,levels[0].id)
  return{db,g1:g1.id,source:levels[0].id,target:target.id}
}

test('v24 creates approved Categories and is idempotent',()=>{const{db}=fixture(),first=applyV24Migration(db),second=applyV24Migration(db);assert.equal(first.categoryCount,4);assert.equal(first.categorizedProductCount,20);assert.equal(second.categoriesCreated,0);assert.equal(second.categoryAssignmentsCreated,0);assert.equal(second.branchAssignmentsCreated,0);const categories=listCategories(db).items;assert.deepEqual(categories.map(item=>item.category_name),['Paper','Aluminium','Scrap Iron','Uncategorized']);assert.deepEqual(getCategory(categories.find(item=>item.category_name==='Scrap Iron').id,db).products.map(item=>item.product_code).sort(),['G1','G2']);assert.equal(db.prepare("SELECT COUNT(*) count FROM material_products p JOIN material_categories c ON c.id=p.category_id WHERE c.category_code='UNCATEGORIZED'").get().count,11);assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok')})

test('v24 migrates only proven non-OCC Branch assignments and preserves OCC compatibility levels unassigned',()=>{const{db,g1,source}=fixture();const result=applyV24Migration(db);assert.equal(result.migrationAssignmentCandidateCount,5);assert.equal(result.branchAssignmentCount,5);assert.equal(db.prepare('SELECT COUNT(*) count FROM branch_product_price_assignments WHERE product_id=? AND price_level_id=?').get(g1,source).count,5);assert.equal(result.unassignedPriceLevelCount,0);assert.equal(db.prepare('SELECT COUNT(*) count FROM branch_product_price_assignment_history WHERE action=\'migration_v24\'').get().count,5)})

test('generic Product Price Group moves five Branches atomically and audits each move',()=>{const{db,source,target}=fixture();applyV24Migration(db);const result=moveProductBranches(source,target,[1,2,3,4,5],{reason:'Approved test',changedBy:'Owner'},db);assert.equal(result.changedCount,5);assert.equal(getPriceGroup(source,db).branch_count,0);assert.equal(getPriceGroup(target,db).branch_count,5);assert.equal(db.prepare("SELECT COUNT(*) count FROM branch_product_price_assignment_history WHERE action='move'").get().count,5);assert.throws(()=>moveProductBranches(source,target,[1],{reason:'stale',changedBy:'Owner'},db),/no longer belong/);assert.equal(getPriceGroup(target,db).branch_count,5)})

test('generic group repricing keeps Branch membership and creates immutable history',()=>{const{db,source}=fixture();applyV24Migration(db);const before=db.prepare('SELECT GROUP_CONCAT(branch_id) ids FROM branch_product_price_assignments WHERE price_level_id=?').get(source).ids;const result=changeProductGroupPrice(source,{newPrice:.6,effectiveDate:'2026-08-10',reason:'Market adjustment',changedBy:'Owner'},db);assert.equal(result.price_amount,.6);assert.equal(db.prepare('SELECT GROUP_CONCAT(branch_id) ids FROM branch_product_price_assignments WHERE price_level_id=?').get(source).ids,before);const history=db.prepare('SELECT * FROM product_price_group_history WHERE price_level_id=?').get(source);assert.equal(history.old_price_amount,.5);assert.equal(history.new_price_amount,.6);assert.equal(history.affected_branch_count,5)})

test('source and target Product mismatch and missing reason are rejected before writes',()=>{const{db,source,target}=fixture();applyV24Migration(db);const plastic=db.prepare("SELECT l.id FROM material_price_levels l JOIN material_products p ON p.id=l.product_id WHERE p.product_code='MIX_PLASTIC'").get();assert.throws(()=>moveProductBranches(source,plastic.id,[1],{reason:'bad'},db),/same Product/);assert.throws(()=>moveProductBranches(source,target,[1],{reason:''},db),/reason/);assert.equal(getPriceGroup(source,db).branch_count,5)})
