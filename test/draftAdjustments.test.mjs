import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {schemaSql} from '../server/schema.mjs'
import {approveDay,generateWeek,saveDraftAdjustments} from '../server/dispatchService.mjs'

function fixture(path=':memory:'){
  const db=new DatabaseSync(path);db.exec('PRAGMA foreign_keys=ON;'+schemaSql)
  db.prepare("INSERT INTO areas(jodoo_area_id,name) VALUES('A1','North')").run()
  db.prepare("INSERT INTO customers(jodoo_customer_id,name) VALUES('C1','Alpha')").run()
  db.prepare("INSERT INTO branches(jodoo_branch_id,customer_id,area_id,branch_name) VALUES('B1',1,1,'Alpha One'),('B2',1,1,'Alpha Two')").run()
  db.prepare("INSERT INTO branch_schedules(jodoo_schedule_id,branch_id,source_branch_id,frequency,days_of_week) VALUES('S1',1,'B1','Weekly','Monday'),('S2',2,'B2','Weekly','Monday')").run()
  db.prepare("INSERT INTO vehicles(vehicle_code,registration_number,status,operational_status) VALUES('V1','ABC1','available','available'),('V2','ABC2','available','available')").run()
  generateWeek({startDate:'2026-07-20'},db)
  return db
}
const stop=(db,branch=1,date='2026-07-20')=>db.prepare('SELECT id FROM dispatch_stops WHERE branch_id=? AND service_date=?').get(branch,date).id
const save=(db,adjustments,reason='Supervisor route preparation')=>saveDraftAdjustments({adjustments,reason,changedBy:'Supervisor'},db)

test('Unassigned Stop supports single and batch vehicle/Trip assignment with continuous sequence',()=>{const db=fixture();save(db,[{stopId:stop(db,1),vehicleId:1,tripNumber:2},{stopId:stop(db,2),vehicleId:1,tripNumber:2}]);const rows=db.prepare('SELECT ds.stop_sequence sequence,dt.trip_number trip,d.vehicle_id vehicle FROM dispatch_stops ds JOIN dispatch_trips dt ON dt.id=ds.dispatch_trip_id JOIN dispatches d ON d.id=ds.dispatch_id WHERE ds.branch_id IN(1,2) ORDER BY ds.stop_sequence').all().map(row=>({...row}));assert.deepEqual(rows,[{sequence:1,trip:2,vehicle:1},{sequence:2,trip:2,vehicle:1}])})
test('Assigned Stop can return to Unassigned without changing missing weight to zero',()=>{const db=fixture(),id=stop(db);save(db,[{stopId:id,vehicleId:1,tripNumber:1}]);save(db,[{stopId:id,unassigned:true}]);const row=db.prepare('SELECT ds.estimated_weight_kg weight,dt.trip_number trip,d.vehicle_id vehicle FROM dispatch_stops ds JOIN dispatch_trips dt ON dt.id=ds.dispatch_trip_id JOIN dispatches d ON d.id=ds.dispatch_id WHERE ds.id=?').get(id);assert.deepEqual({...row},{weight:null,trip:0,vehicle:null})})
test('Occurrence-only date move preserves fixed Schedule and regeneration does not restore original Stop',()=>{const db=fixture(),id=stop(db);save(db,[{stopId:id,serviceDate:'2026-07-21',dateMode:'occurrence',unassigned:true}]);assert.equal(db.prepare('SELECT days_of_week value FROM branch_schedules WHERE id=1').get().value,'Monday');generateWeek({startDate:'2026-07-20'},db);assert.equal(db.prepare("SELECT COUNT(*) n FROM dispatch_stops WHERE branch_id=1 AND status<>'cancelled'").get().n,1);assert.equal(db.prepare('SELECT service_date value FROM dispatch_stops WHERE id=?').get(id).value,'2026-07-21')})
test('Recurring date move updates only the corresponding Schedule',()=>{const db=fixture(),id=stop(db);save(db,[{stopId:id,serviceDate:'2026-07-21',dateMode:'recurring',unassigned:true}]);assert.equal(db.prepare('SELECT days_of_week value FROM branch_schedules WHERE id=1').get().value,'Tuesday');assert.equal(db.prepare('SELECT days_of_week value FROM branch_schedules WHERE id=2').get().value,'Monday');assert.equal(db.prepare('SELECT permanent value FROM schedule_exceptions WHERE schedule_id=1').get().value,1)})
test('Branch plus service-date conflict rejects the entire batch',()=>{const db=fixture(),first=stop(db,1),second=stop(db,2);db.prepare('UPDATE dispatch_stops SET branch_id=1 WHERE id=?').run(second);assert.throws(()=>save(db,[{stopId:first,vehicleId:1,tripNumber:1},{stopId:second,serviceDate:'2026-07-20',vehicleId:2,tripNumber:1}]),/Duplicate Branch Service Date/);assert.equal(db.prepare('SELECT COUNT(*) n FROM dispatches WHERE vehicle_id IS NOT NULL').get().n,0)})
test('Approved route cannot be adjusted through supervisor Draft API',()=>{const db=fixture(),id=stop(db);approveDay('2026-07-20',{},db);assert.throws(()=>save(db,[{stopId:id,vehicleId:1,tripNumber:1}]),/protected/);assert.equal(db.prepare('SELECT COUNT(*) n FROM dispatches WHERE vehicle_id IS NOT NULL').get().n,0)})
test('Transaction failure rolls back prior Stop and Audit changes',()=>{const db=fixture(),first=stop(db,1),second=stop(db,2);approveDay('2026-07-20',{},db);assert.throws(()=>save(db,[{stopId:first,vehicleId:1,tripNumber:1},{stopId:second,vehicleId:2,tripNumber:1}]),/protected/);assert.equal(db.prepare("SELECT COUNT(*) n FROM dispatch_change_logs WHERE change_type='supervisor_draft_adjustment'").get().n,0)})
test('Every saved adjustment has before/after Audit and database integrity remains ok',()=>{const db=fixture(),id=stop(db);save(db,[{stopId:id,vehicleId:1,tripNumber:3}]);const audit=db.prepare("SELECT before_json beforeJson,after_json afterJson FROM dispatch_change_logs WHERE change_type='supervisor_draft_adjustment'").get();assert.ok(JSON.parse(audit.beforeJson).id);assert.equal(JSON.parse(audit.afterJson).trip_number,undefined);assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok')})
test('Fresh local file database keeps integrity after draft adjustments',()=>{const directory=mkdtempSync(join(tmpdir(),'kcs-draft-adjustment-')),path=join(directory,'draft.sqlite');try{const db=fixture(path),id=stop(db);save(db,[{stopId:id,vehicleId:1,tripNumber:1}]);assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.equal(db.prepare("SELECT COUNT(*) n FROM dispatch_change_logs WHERE change_type='supervisor_draft_adjustment'").get().n,1);db.close()}finally{rmSync(directory,{recursive:true,force:true})}})
