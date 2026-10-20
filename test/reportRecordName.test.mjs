import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {reportRecordName} from '../server/reportRecordName.mjs'
test('numeric references resolve by entity type and never masquerade as branch names',()=>{
 const db=new DatabaseSync(':memory:')
 db.exec(`CREATE TABLE vehicles(id INTEGER,registration_number,vehicle_code);INSERT INTO vehicles VALUES(3,'Q123','V3');CREATE TABLE dispatches(id INTEGER,vehicle_id);INSERT INTO dispatches VALUES(1,3);CREATE TABLE dispatch_trips(id INTEGER,dispatch_id,trip_number);INSERT INTO dispatch_trips VALUES(862,1,2);CREATE TABLE cargo_batches(id INTEGER,code,plate_snapshot);INSERT INTO cargo_batches VALUES(67,'H261019-001','Q123');CREATE TABLE dispatch_days(id INTEGER,dispatch_date);INSERT INTO dispatch_days VALUES(3,'2026-10-19');`)
 assert.deepEqual(reportRecordName(db,{entity_type:'vehicle',entity_id:'3'}),{name:'Q123',nameType:'vehicle'})
 assert.deepEqual(reportRecordName(db,{entity_type:'dispatch_trip',entity_id:'862'}),{name:'2 · Q123 (#862)',nameType:'dispatch_trip'})
 assert.deepEqual(reportRecordName(db,{entity_type:'cargo_batch',entity_id:'67'}),{name:'H261019-001 · Q123',nameType:'cargo_batch'})
 assert.deepEqual(reportRecordName(db,{entity_type:'route',entity_id:'3'}),{name:'3',nameType:'route'})
 assert.deepEqual(reportRecordName(db,{entity_type:'dispatch_stop',entity_id:'862'},'EVERWIN SERIAN'),{name:'EVERWIN SERIAN'})
 assert.equal(reportRecordName(db,{entity_type:'missing',entity_id:'3'}).nameType,'recordReference')
 db.close()
})
