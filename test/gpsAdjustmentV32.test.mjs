import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {schemaSql} from '../server/schema.mjs'
import {applyV32Migration} from '../server/migrationV32.mjs'
import {captureBranchGps,listGpsCollector} from '../server/customerMasterService.mjs'

const v32Columns=['captured_latitude','captured_longitude','captured_accuracy_m','manually_adjusted','adjusted_by','adjusted_at','adjustment_reason','adjustment_distance_m']
function fixture(){const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON;'+schemaSql);db.prepare("INSERT INTO customers(jodoo_customer_id,name,status,is_active) VALUES('C1','Customer','active',1)").run();db.prepare("INSERT INTO branches(jodoo_branch_id,customer_id,branch_name,status,is_active) VALUES('B1',1,'Branch','active',1)").run();return db}

test('v31 to v32 is additive, transactional and idempotent',()=>{
  const db=fixture();db.prepare('INSERT INTO schema_meta(version) VALUES(31)').run();for(const column of [...v32Columns].reverse())db.exec(`ALTER TABLE temporary_locations DROP COLUMN ${column}`)
  const before={branches:db.prepare('SELECT COUNT(*) n FROM branches').get().n,temp:db.prepare('SELECT COUNT(*) n FROM temporary_locations').get().n,stops:db.prepare('SELECT COUNT(*) n FROM dispatch_stops').get().n}
  const first=applyV32Migration(db),second=applyV32Migration(db)
  assert.equal(first.schemaVersion,32);assert.equal(second.noOp,true)
  assert.deepEqual({branches:db.prepare('SELECT COUNT(*) n FROM branches').get().n,temp:db.prepare('SELECT COUNT(*) n FROM temporary_locations').get().n,stops:db.prepare('SELECT COUNT(*) n FROM dispatch_stops').get().n},before)
  assert.deepEqual(v32Columns.filter(column=>!db.prepare('PRAGMA table_info(temporary_locations)').all().some(item=>item.name===column)),[])
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok')
})

test('manual adjustment preserves device GPS and stores final proposal with trusted audit actor',()=>{
  const db=fixture(),item=captureBranchGps('B1',{capturedLatitude:1.5001,capturedLongitude:110.3001,capturedAccuracyM:151,latitude:1.501,longitude:110.301,accuracyM:151,deviceCapturedAt:'2026-08-09T01:00:00.000Z',manuallyAdjusted:true,gpsRemark:'Loading bay',capturedBy:'Field Employee'},db)
  assert.equal(item.captured_latitude,1.5001);assert.equal(item.captured_longitude,110.3001);assert.equal(item.latitude,1.501);assert.equal(item.longitude,110.301)
  assert.equal(item.manually_adjusted,1);assert.equal(item.adjusted_by,'Field Employee');assert.equal(item.adjustment_reason,'Loading bay');assert.ok(item.adjustment_distance_m>0)
  const queue=listGpsCollector({},db)[0]
  assert.equal(queue.capturedLatitude,1.5001);assert.equal(queue.temporaryLatitude,1.501);assert.equal(queue.manuallyAdjusted,1)
  const audit=db.prepare("SELECT changed_by,after_json FROM master_change_history WHERE change_type='temporary_gps_captured'").get()
  assert.equal(audit.changed_by,'Field Employee');assert.match(audit.after_json,/captured_latitude/);assert.match(audit.after_json,/manually_adjusted/)
})

test('unadjusted GPS stores identical captured and final coordinates',()=>{
  const db=fixture(),item=captureBranchGps('B1',{latitude:1.5,longitude:110.3,accuracyM:10,capturedBy:'Driver'},db)
  assert.equal(item.captured_latitude,item.latitude);assert.equal(item.captured_longitude,item.longitude);assert.equal(item.manually_adjusted,0);assert.equal(item.adjusted_by,null)
})
