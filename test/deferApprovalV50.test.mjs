import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {schemaSql} from '../server/schema.mjs'
import {applyV50Migration} from '../server/migrationV50.mjs'

test('v50 defer approval migration is additive, indexed and idempotent',()=>{const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON;'+schemaSql);db.exec('DELETE FROM schema_meta;INSERT INTO schema_meta(version) VALUES(49)');const before={stops:db.prepare('SELECT COUNT(*) n FROM dispatch_stops').get().n,bills:db.prepare('SELECT COUNT(*) n FROM purchase_bills').get().n};const first=applyV50Migration(db),second=applyV50Migration(db);assert.equal(first.schemaVersion,50);assert.equal(second.noOp,true);assert.deepEqual(before,{stops:db.prepare('SELECT COUNT(*) n FROM dispatch_stops').get().n,bills:db.prepare('SELECT COUNT(*) n FROM purchase_bills').get().n});assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='driver_defer_requests'").get());assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE type='index' AND name='driver_defer_requests_one_pending_idx'").get());assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.equal(db.prepare('SELECT COUNT(*) n FROM pragma_foreign_key_check').get().n,0);db.close()})
