import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {schemaSql} from '../server/schema.mjs'
import {reconcile,branchMappings,customerMappings} from '../scripts/reconcile-confirmed-customers-20260921.mjs'
import {assertNewIntake} from '../server/intakeDuplicateGuard.mjs'
function fixture(){const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON;'+schemaSql)
 for(const code of new Set([...customerMappings.flat(),...branchMappings.map(b=>b[2])]))db.prepare('INSERT INTO customers(jodoo_customer_id,name) VALUES(?,?)').run(code,code)
 for(const [from,to,parent] of branchMappings){const customer=db.prepare('SELECT id FROM customers WHERE jodoo_customer_id=?').get(parent).id;for(const code of [from,to])db.prepare('INSERT OR IGNORE INTO branches(jodoo_branch_id,branch_name,customer_id) VALUES(?,?,?)').run(code,code,customer)}
 return db}
test('confirmed mappings retire exactly the supplied duplicate IDs, retain canonical masters, and repeat safely',()=>{const db=fixture();try{
 const before=db.prepare('SELECT * FROM branches ORDER BY id').all();const preview=reconcile(db);assert.equal(preview.mode,'preview');assert.deepEqual(db.prepare('SELECT * FROM branches ORDER BY id').all(),before)
 const result=reconcile(db,{apply:true});assert.equal(result.branches.length,5);assert.equal(result.customers.length,4)
 for(const [from,to,parent] of branchMappings){const b=db.prepare('SELECT * FROM branches WHERE jodoo_branch_id=?').get(from),target=db.prepare('SELECT * FROM branches WHERE jodoo_branch_id=?').get(to);assert.equal(b.replaced_by_branch_id,target.id);assert.equal(b.lifecycle_status,'DUPLICATE_REPLACED');assert.equal(target.is_active,1);assert.equal(db.prepare('SELECT jodoo_customer_id c FROM customers WHERE id=?').get(target.customer_id).c,parent)}
 const n=db.prepare('SELECT COUNT(*) n FROM master_change_history').get().n;assert.ok(reconcile(db,{apply:true}).branches.every(b=>b.alreadyLinked));assert.equal(db.prepare('SELECT COUNT(*) n FROM master_change_history').get().n,n)
 }finally{db.close()}})
test('wrong canonical customer and unexpected sibling prevent every repair atomically',()=>{const db=fixture();try{
 db.exec("UPDATE branches SET customer_id=(SELECT id FROM customers WHERE jodoo_customer_id='C10039') WHERE jodoo_branch_id='B10495'")
 assert.throws(()=>reconcile(db,{apply:true}),/mismatch/);assert.equal(db.prepare("SELECT COUNT(*) n FROM branches WHERE lifecycle_status='DUPLICATE_REPLACED'").get().n,0)
 db.exec("UPDATE branches SET customer_id=(SELECT id FROM customers WHERE jodoo_customer_id='C10272') WHERE jodoo_branch_id='B10495'; INSERT INTO branches(jodoo_branch_id,branch_name,customer_id) SELECT 'B99999','Another',id FROM customers WHERE jodoo_customer_id='C10279'")
 assert.throws(()=>reconcile(db,{apply:true}),/other active branches/);assert.equal(db.prepare('SELECT COUNT(*) n FROM master_change_history').get().n,0)
 }finally{db.close()}})
test('new intake guard prevents existing names and safely treats wildcard characters as literal',()=>{const db=fixture();try{
 db.exec("UPDATE branches SET branch_name='HARI-HARI MTG' WHERE jodoo_branch_id='B10495'")
 assert.throws(()=>assertNewIntake(db,'hari'),{code:'PICKUP_EXISTING_REQUIRED'});assert.throws(()=>assertNewIntake(db,'B10495'),{code:'PICKUP_EXISTING_REQUIRED'});assert.doesNotThrow(()=>assertNewIntake(db,'Brand New Shop'));assert.doesNotThrow(()=>assertNewIntake(db,'%'))
 }finally{db.close()}})

test('unfinished work aborts and completed records/proofs remain byte-for-byte after replacement',()=>{const db=fixture();try{
 const id=db.prepare("SELECT id FROM branches WHERE jodoo_branch_id='B10506'").get().id
 db.exec("INSERT INTO dispatches(dispatch_date,status) VALUES('2026-09-21','draft')")
 db.prepare("INSERT INTO dispatch_stops(dispatch_id,branch_id,stop_sequence,status) VALUES(1,?,1,'available')").run(id)
 assert.throws(()=>reconcile(db,{apply:true}),/Unfinished stops/);assert.equal(db.prepare('SELECT COUNT(*) n FROM master_change_history').get().n,0)
 db.exec("UPDATE dispatch_stops SET status='completed';INSERT INTO stop_documents(dispatch_stop_id,storage_key,original_name,content_type,size_bytes) VALUES(1,'original-proof','proof.jpg','image/jpeg',100)")
 const stop=db.prepare('SELECT * FROM dispatch_stops').get(),proof=db.prepare('SELECT * FROM stop_documents').get()
 reconcile(db,{apply:true});assert.deepEqual(db.prepare('SELECT * FROM dispatch_stops').get(),stop);assert.deepEqual(db.prepare('SELECT * FROM stop_documents').get(),proof)
 assert.throws(()=>assertNewIntake(db,'B10506'),{code:'PICKUP_EXISTING_REQUIRED'})
 }finally{db.close()}})
