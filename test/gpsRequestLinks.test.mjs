import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {schemaSql} from '../server/schema.mjs'
import {repairGpsRequestLinks,resolveGpsRequestBranch} from '../server/gpsRequestLinks.mjs'
test('explicit request links repair orphan GPS once without approving or replacing official coordinates',()=>{
 const db=new DatabaseSync(':memory:');db.exec(schemaSql)
 db.exec(`INSERT INTO customers(id,jodoo_customer_id,name) VALUES(1,'C1','Customer');
 INSERT INTO branches(id,jodoo_branch_id,branch_name,customer_id,latitude,longitude) VALUES(1,'B10495','HARI-HARI MTG',1,1.5721906,110.3021062);
 INSERT INTO special_collection_requests(id,request_type,temporary_customer_name,existing_branch_id,linked_branch_id,requested_collection_date,created_by,status,dedupe_key) VALUES
 (1,'existing','HARI-HARI MTG',1,'10495','2026-09-18','Driver','awaiting_supervisor','key1'),
 (2,'potential_new','HARI-HARI MTG',NULL,NULL,'2026-09-18','Driver','awaiting_supervisor','key2'),
 (3,'existing','Conflict',1,'B999','2026-09-18','Driver','awaiting_supervisor','key3');
 INSERT INTO temporary_locations(id,special_request_id,latitude,longitude,location_source,verification_status) VALUES
 (256,1,2,111,'device','pending_supervisor'),(258,2,2,111,'device','pending_supervisor'),(260,3,2,111,'device','pending_supervisor');`)
 assert.equal(resolveGpsRequestBranch(db,1),1)
 assert.equal(repairGpsRequestLinks(db),1)
 assert.equal(repairGpsRequestLinks(db),0)
 assert.deepEqual(db.prepare('SELECT branch_id FROM temporary_locations ORDER BY id').all().map(r=>r.branch_id),[1,null,null])
 assert.equal(db.prepare('SELECT COUNT(*) n FROM audit_logs').get().n,1)
 assert.equal(db.prepare('SELECT verification_status FROM temporary_locations WHERE id=256').get().verification_status,'pending_supervisor')
 assert.equal(db.prepare('SELECT status FROM special_collection_requests WHERE id=1').get().status,'awaiting_supervisor')
 assert.equal(db.prepare('SELECT latitude FROM branches WHERE id=1').get().latitude,1.5721906)
 db.close()
})
