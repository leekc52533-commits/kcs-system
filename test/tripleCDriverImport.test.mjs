import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {importDrivers} from '../scripts/import-triple-c-drivers-20260918.mjs'
import {earningsReport} from '../server/earningsService.mjs'
import {earningsSchema} from '../server/migrationV72.mjs'
function fixture(){const db=new DatabaseSync(':memory:');db.exec(`
CREATE TABLE employees(id INTEGER PRIMARY KEY,name,job_role,is_active,employment_status);
CREATE TABLE employee_job_roles(employee_id,role);
CREATE TABLE vehicles(id INTEGER PRIMARY KEY,registration_number);
CREATE TABLE dispatches(vehicle_id,dispatch_date,driver_id);
CREATE TABLE sales_settlements(id INTEGER PRIMARY KEY,buyer_name,vehicle_id,vehicle_plate,lines_json,revision DEFAULT 1,updated_at);
CREATE TABLE sales_settlement_audit(settlement_id,actor,before_json,after_json);
CREATE TABLE audit_logs(action,entity_type,entity_id,after_json);
CREATE TABLE cargo_batches(id INTEGER PRIMARY KEY,vehicle_id,collection_date,plate_snapshot,code);
CREATE TABLE cargo_batch_unloads(record_id,batch_id,ticket_number);
CREATE TABLE cargo_batch_members(batch_id,employee_id,name_snapshot,role);
CREATE TABLE unloading_weight_records(id INTEGER PRIMARY KEY,vehicle_id,service_date,confirmed_weight_kg,status);
INSERT INTO employees VALUES(1,'Driver A','driver',1,'active'),(2,'Crew B','crew',1,'active');
INSERT INTO vehicles VALUES(10,'AAA');
INSERT INTO dispatches VALUES(10,'2026-09-15',1);
`+earningsSchema)
 db.prepare('INSERT INTO sales_settlements(id,buyer_name,vehicle_id,vehicle_plate,lines_json) VALUES(8,\'TRIPLE C SDN BHD\',10,\'AAA\',?)').run(JSON.stringify([{slipNumber:'TN-20808',deliveryDate:'2074-09-15',weightKg:1110}]))
 return db}
test('authorized date repair and driver-only allocation flow into earnings, with no duplicate rerun',()=>{const db=fixture();try{
 const r=importDrivers(db);assert.equal(r.corrected.length,1);assert.equal(r.added.length,1)
 const owner={role:'owner_admin',employeeId:1};let report=earningsReport(db,owner,'2026-09-15');assert.equal(report.items.find(e=>e.employeeId===1).driverKg,1110);assert.equal(report.items.find(e=>e.employeeId===2).amount,0);assert.equal(report.companyKg,1110)
 assert.equal(importDrivers(db).added.length,0)
 assert.equal(earningsReport(db,{role:'crew',employeeId:2},'2026-09-15',{personal:true}).items.length,1)
 db.exec("INSERT INTO cargo_batches VALUES(1,10,'2026-09-15','AAA','H1');INSERT INTO cargo_batch_unloads VALUES(1,1,'TN-20808');INSERT INTO cargo_batch_members VALUES(1,1,'Driver A','driver');INSERT INTO unloading_weight_records VALUES(1,10,'2026-09-15',1110,'confirmed')")
 report=earningsReport(db,owner,'2026-09-15');assert.equal(report.companyKg,1110);assert.equal(report.items.find(e=>e.employeeId===1).driverKg,1110)
 }finally{db.close()}})
test('ambiguous drivers and other factories do not get allocations',()=>{for(const sql of ["INSERT INTO dispatches VALUES(10,'2026-09-15',2)","UPDATE sales_settlements SET buyer_name='OTHER FACTORY'","UPDATE sales_settlements SET vehicle_plate='BBB'"]){const db=fixture();try{db.exec(sql);assert.equal(importDrivers(db).added.length,0)}finally{db.close()}}})
test('changed source is pending, not silently paid at stale weight',()=>{const db=fixture();try{importDrivers(db);db.prepare('UPDATE sales_settlements SET lines_json=?').run(JSON.stringify([{slipNumber:'TN-20808',deliveryDate:'2026-09-15',weightKg:2000}]));const r=earningsReport(db,{role:'owner_admin'},'2026-09-15');assert.equal(r.items.find(e=>e.employeeId===1).amount,0);assert.equal(r.items.find(e=>e.employeeId===1).pendingKg,1110)}finally{db.close()}})
