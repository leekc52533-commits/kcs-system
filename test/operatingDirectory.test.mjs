import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {schemaSql} from '../server/schema.mjs'
import {ensureV28Schema} from '../server/migrationV28.mjs'
import {listCustomers,listBranches,getCustomer,getBranch,updateCustomer} from '../server/customerMasterService.mjs'
import {listBranchLifecycleReview,changeBranchLifecycle} from '../server/branchLifecycleService.mjs'

function fixture(){
 const db=new DatabaseSync(':memory:');db.exec(schemaSql);ensureV28Schema(db)
 db.exec(`INSERT INTO customers(id,jodoo_customer_id,name,status,is_active) VALUES
 (1,'10001','Active','active',1),(2,'10002','Paused','paused',0),(3,'10003','Closed','closed',0),(4,'10004','Disabled','active',0);
 INSERT INTO branches(id,jodoo_branch_id,customer_id,branch_name,lifecycle_status,status,is_active) VALUES
 (1,'10001',1,'Working','ACTIVE','active',1),
 (2,'10002',1,'Paused branch','TEMPORARILY_PAUSED','paused',0),
 (3,'10003',1,'Closed branch','CLOSED','closed',0),
 (4,'10004',1,'Duplicate branch','DUPLICATE_REPLACED','paused',0),
 (5,'10005',1,'Not collecting','NOT_COLLECTING','paused',0),
 (6,'10006',1,'Test branch','TEST_INVALID','paused',0),
 (7,'10007',2,'Parent paused','ACTIVE','active',1),
 (8,'10008',3,'Parent closed','ACTIVE','active',1),
 (9,'10009',1,'Legacy mismatch','ACTIVE','paused',0),
 (10,'10010',4,'Parent disabled','ACTIVE','active',1);`)
 return db
}
test('normal directories and review partition inactive records without rewriting or losing direct access',()=>{
 const db=fixture(),before=db.prepare('SELECT * FROM branches ORDER BY id').all()
 assert.deepEqual(listCustomers({operating:'active'},db).items.map(x=>x.customerId),['10001'])
 assert.deepEqual(listCustomers({operating:'inactive'},db).items.map(x=>x.customerId).sort(),['10002','10003','10004'])
 assert.equal(listCustomers({operating:'active',search:'Closed'},db).pagination.total,0)
 assert.deepEqual(listBranches({operating:'active'},db).items.map(x=>x.branchId),['10001'])
 assert.equal(listBranches({operating:'active',search:'Duplicate'},db).pagination.total,0)
 assert.equal(listBranches({operating:'inactive'},db).pagination.total,9)
 const review=listBranchLifecycleReview({},db)
 assert.equal(review.items.length,9)
 assert.equal(review.items.find(x=>x.branchId==='10007').parentInactive,1)
 assert.equal(review.items.find(x=>x.branchId==='10009').lifecycleStatus,'TEMPORARILY_PAUSED')
 assert.equal(review.counts.TEMPORARILY_PAUSED,3)
 assert.equal(listBranchLifecycleReview({status:'CLOSED'},db).items.length,2)
 assert.ok(getCustomer('10003',db));assert.ok(getBranch('10004',db))
 assert.deepEqual(db.prepare('SELECT * FROM branches ORDER BY id').all(),before);db.close()
})
test('restoring a customer or branch returns it to normal listings and preserves original IDs',()=>{
 const db=fixture()
 updateCustomer('10002',{status:'active',reason:'Business resumed'},db)
 assert.ok(listCustomers({operating:'active'},db).items.some(x=>x.customerId==='10002'))
 assert.ok(listBranches({operating:'active'},db).items.some(x=>x.branchId==='10007'))
 assert.ok(!listBranchLifecycleReview({},db).items.some(x=>x.branchId==='10007'))
 changeBranchLifecycle('10002',{lifecycleStatus:'ACTIVE',reason:'Resumed'},{changedBy:'Supervisor'},db)
 assert.ok(listBranches({operating:'active'},db).items.some(x=>x.branchId==='10002'))
 assert.equal(db.prepare('SELECT COUNT(*) n FROM branches').get().n,10)
 assert.equal(db.prepare('SELECT COUNT(*) n FROM customers').get().n,4)
 db.close()
})
