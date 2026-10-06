import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {linkBerlianBranches} from '../scripts/link-berlian-branches-20261006.mjs'
function fixture(){const db=new DatabaseSync(':memory:');db.exec(`CREATE TABLE customers(id,is_active,status);INSERT INTO customers VALUES(1,1,'active');
 CREATE TABLE branches(id,jodoo_branch_id,branch_name,customer_id,is_active,status,lifecycle_status,replaced_by_branch_id,latitude,longitude,area_id,status_reason,status_changed_by,status_changed_at,updated_at);
 INSERT INTO branches VALUES(1,'10513','Waston Tamna Berlian',1,1,'active','ACTIVE',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(2,'10514','watson taman berlian',1,1,'active','ACTIVE',NULL,1,110,NULL,NULL,NULL,NULL,NULL);
 CREATE TABLE dispatch_stops(id,branch_id,status,service_date);INSERT INTO dispatch_stops VALUES(5,2,'completed','2026-10-06');
 CREATE TABLE purchase_bills(id,branch_id);INSERT INTO purchase_bills VALUES(9,2);
 CREATE TABLE branch_schedules(id,branch_id,is_active);INSERT INTO branch_schedules VALUES(1,1,1),(2,2,1);
 CREATE TABLE master_change_history(entity_type,entity_id,change_type,field_name,old_value,new_value,before_json,after_json,reason,changed_by);`);return db}
test('preview rolls back; apply links only duplicate, preserves history/canonical GPS and is idempotent',()=>{
 const db=fixture();try{
 const target=db.prepare('SELECT * FROM branches WHERE id=1').get()
 assert.equal(linkBerlianBranches(db).retainedHistoricalBills,1);assert.equal(db.prepare('SELECT is_active FROM branches WHERE id=2').get().is_active,1)
 linkBerlianBranches(db,{apply:true});assert.equal(db.prepare('SELECT replaced_by_branch_id FROM branches WHERE id=2').get().replaced_by_branch_id,1)
 assert.deepEqual(db.prepare('SELECT * FROM branches WHERE id=1').get(),target)
 assert.equal(db.prepare('SELECT branch_id FROM purchase_bills').get().branch_id,2);assert.equal(db.prepare('SELECT status FROM dispatch_stops').get().status,'completed')
 assert.equal(linkBerlianBranches(db,{apply:true}).alreadyLinked,true);assert.equal(db.prepare('SELECT COUNT(*) n FROM master_change_history').get().n,1)
 }finally{db.close()}
})
test('unfinished work or wrong identities abort without any changes',()=>{
 const db=fixture();try{
 db.exec("UPDATE dispatch_stops SET status='active'");assert.throws(()=>linkBerlianBranches(db,{apply:true}),/unfinished/)
 assert.equal(db.prepare('SELECT is_active FROM branches WHERE id=2').get().is_active,1)
 db.exec("UPDATE dispatch_stops SET status='completed';UPDATE branches SET branch_name='OTHER' WHERE id=2")
 assert.throws(()=>linkBerlianBranches(db,{apply:true}),/Unexpected name/)
 assert.equal(db.prepare('SELECT COUNT(*) n FROM master_change_history').get().n,0)
 }finally{db.close()}
})
