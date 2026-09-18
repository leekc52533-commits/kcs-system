import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {cargoBatchSchema} from '../server/migrationV71.mjs'
import {earningsSchema} from '../server/migrationV72.mjs'
import {backfill,candidates} from '../scripts/backfill-verified-earnings-20260918.mjs'
function fixture(){const db=new DatabaseSync(':memory:');db.exec(`PRAGMA foreign_keys=ON;
CREATE TABLE employees(id INTEGER PRIMARY KEY,name);
CREATE TABLE vehicles(id INTEGER PRIMARY KEY,registration_number);
CREATE TABLE dispatch_trips(id INTEGER PRIMARY KEY);
CREATE TABLE unloading_weight_records(id INTEGER PRIMARY KEY,vehicle_id,service_date,status,registration_number_snapshot,driver_employee_id,driver_name_snapshot,crew_names_snapshot,confirmed_weight_kg,ocr_text);
CREATE TABLE sales_settlements(id INTEGER PRIMARY KEY,vehicle_id,lines_json);
CREATE TABLE audit_logs(action,entity_type,entity_id,after_json);
INSERT INTO employees VALUES(2,'MOHAMMAD FAIS MOHAMAD REZZY'),(16,'PHANG KHONG YEN'),(101,'QAIRUL HIQMAH BIN ABDULL'),(102,'MUHAMMAD ISMAIL BIN JUKI');
INSERT INTO vehicles VALUES(4,'QM3028M'),(5,'QTY5028');`+cargoBatchSchema+earningsSchema)
for(const c of candidates)db.prepare('INSERT INTO unloading_weight_records VALUES(?,?,?,?,?,?,?,?,?,?)').run(c.id,c.vehicle,c.date,'confirmed',c.plate,c.driver,c.driverName,c.crew,c.weight,'TICKET NUMBER : '+c.ticket.replace(/\D/g,'').padStart(6,'0'))
for(const id of [1,13]){const cs=candidates.filter(c=>c.sale===id);db.prepare('INSERT INTO sales_settlements VALUES(?,?,?)').run(id,cs[0].vehicle,JSON.stringify(cs.map(c=>({slipNumber:c.ticket,deliveryDate:c.date,weightKg:c.weight}))))}return db}
test('preview writes nothing; apply links only verified historical records and rerun is idempotent',()=>{const db=fixture();try{assert.equal(backfill(db).kg,4540);assert.equal(db.prepare('SELECT COUNT(*) n FROM cargo_batches').get().n,0);const r=backfill(db,{apply:true});assert.equal(r.kg,4540);assert.equal(r.applied.length,4);assert.equal(db.prepare('SELECT COUNT(*) n FROM cargo_batch_members').get().n,8);assert.equal(db.prepare('SELECT COUNT(*) n FROM audit_logs').get().n,4);const again=backfill(db,{apply:true});assert.equal(again.applied.length,0);assert.equal(again.alreadyLinked.length,4);assert.equal(db.prepare('SELECT COUNT(*) n FROM cargo_batch_notifications').get().n,0)}finally{db.close()}})
test('ambiguous crew, OCR, changed date, duplicate ticket and paid periods never assign historical earnings',()=>{for(const sql of ["UPDATE employees SET name='Other' WHERE id=101", "UPDATE unloading_weight_records SET ocr_text='' WHERE id=19", "UPDATE unloading_weight_records SET service_date='2026-09-13' WHERE id=19", "INSERT INTO unloading_weight_records SELECT 100,vehicle_id,service_date,status,registration_number_snapshot,driver_employee_id,driver_name_snapshot,crew_names_snapshot,confirmed_weight_kg,ocr_text FROM unloading_weight_records WHERE id=19", "INSERT INTO earnings_payments(period_start,employee_id,snapshot_json,actor_id) VALUES('2026-09-01',16,'{}',16)", "INSERT INTO sales_settlements SELECT 99,vehicle_id,lines_json FROM sales_settlements WHERE id=1"]){const db=fixture();try{db.exec(sql);const r=backfill(db,{apply:true});assert.ok(r.skipped.some(x=>x.id===19));assert.equal(db.prepare('SELECT 1 FROM cargo_batch_unloads WHERE record_id=19').get(),undefined)}finally{db.close()}}})
test('database error rolls back every imported link',()=>{const db=fixture();try{db.exec("CREATE TRIGGER refuse_audit BEFORE INSERT ON audit_logs BEGIN SELECT RAISE(ABORT,'test failure'); END");assert.throws(()=>backfill(db,{apply:true}),/test failure/);assert.equal(db.prepare('SELECT COUNT(*) n FROM cargo_batches').get().n,0)}finally{db.close()}})
