import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {schemaSql} from '../server/schema.mjs'
import {routeRequestSchemaSql} from '../server/migrationV55.mjs'
import {temporaryIntakeSchemaSql} from '../server/migrationV62.mjs'
import {customerPickupSchemaSql} from '../server/migrationV63.mjs'
import {driverArrangementSchemaSql} from '../server/migrationV64.mjs'
import {dashboardRecentActivity} from '../server/dashboardRecentActivity.mjs'
test('24-hour window uses durable timestamps across requests and changes, excludes pending/no-ops, never deletes history',()=>{
 const db=new DatabaseSync(':memory:');db.exec(schemaSql+routeRequestSchemaSql+temporaryIntakeSchemaSql+customerPickupSchemaSql+driverArrangementSchemaSql);db.exec('PRAGMA foreign_keys=OFF')
 // FK enforcement is off in this isolated fixture: unrelated route trees are not needed.
 db.exec(`INSERT INTO branches(id,jodoo_branch_id,branch_name) VALUES(1,'B1','Actual Name');
 INSERT INTO dispatch_stops(id,dispatch_id,branch_id,stop_sequence) VALUES(1,1,1,1);
 INSERT INTO driver_date_requests(id,dispatch_stop_id,employee_id,source_date,target_date,reason,status,reviewed_at,reviewed_by) VALUES
 (1,1,1,'2026-09-17','2026-09-18','request','approved','2026-09-17 11:00:00','KC'),
 (2,1,1,'2026-09-17','2026-09-18','request','rejected','2026-09-16 12:00:00','KC'),
 (3,1,1,'2026-09-17','2026-09-18','request','pending',NULL,NULL);
 INSERT INTO driver_defer_requests(dispatch_stop_id,dispatch_trip_id,dispatch_day_id,driver_employee_id,reason,expected_return_time,expected_return_at,status,requested_at,reviewed_at) VALUES(1,1,1,1,'other','12:00','2026-09-17','approved','2026-09-17','2026-09-17T19:30:00+08:00');
 INSERT INTO master_change_history(entity_type,entity_id,change_type,before_json,after_json,changed_by,changed_at) VALUES
 ('branch','B1','update','{"status":"active"}','{"status":"paused"}','KC','2026-09-17 11:40:00'),
 ('branch','B1','update','{}','{}','KC','2026-09-17 11:45:00'),
 ('branch','B1','update','{"updatedAt":"old","status":"active"}','{"status":"active","updatedAt":"new"}','KC','2026-09-17 11:46:00');`)
 const before=db.prepare('SELECT total_changes() n').get().n,actor={role:'office'},result=dashboardRecentActivity(actor,db,'2026-09-17T12:00:00Z')
 assert.deepEqual(result.items.map(i=>i.kind),['data','defer','date']);assert.equal(result.items[2].name,'Actual Name');assert.equal(result.items[2].actor,'KC')
 assert.deepEqual(dashboardRecentActivity(actor,db,'2026-09-18T12:00:00Z').items,[])
 assert.equal(db.prepare('SELECT count(*) n FROM driver_date_requests').get().n,3)
 assert.equal(db.prepare('SELECT total_changes() n').get().n,before)
 assert.throws(()=>dashboardRecentActivity({role:'driver'},db),{statusCode:403});db.close()
})
