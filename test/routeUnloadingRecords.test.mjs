import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {schemaSql} from '../server/schema.mjs'
import {captureUnloadingRoute,routeUnloadingRecords} from '../server/routeUnloadingService.mjs'

function fixture(){
  const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON;'+schemaSql)
  db.exec(`INSERT INTO customers(jodoo_customer_id,name) VALUES('C1','Customer');
    INSERT INTO branches(jodoo_branch_id,customer_id,branch_name) VALUES('B1',1,'Branch');
    INSERT INTO vehicles(vehicle_code,registration_number) VALUES('V1','PLATE1'),('V2','PLATE2');
    INSERT INTO employees(employee_code,name,job_role) VALUES('D1','Original Driver','Driver'),('D2','Successor','Driver'),('A1','Original Attendant','Attendant / Crew');
    INSERT INTO weekly_dispatch_plans(week_start) VALUES('2026-09-07');
    INSERT INTO dispatch_days(weekly_plan_id,dispatch_date) VALUES(1,'2026-09-07');
    INSERT INTO dispatches(dispatch_date,vehicle_id,driver_id) VALUES('2026-09-07',1,1),('2026-09-07',1,1),('2026-09-07',2,2);
    INSERT INTO dispatch_trips(dispatch_day_id,dispatch_id,trip_number) VALUES(1,1,1),(1,2,2),(1,3,1);
    INSERT INTO dispatch_stops(dispatch_id,branch_id,stop_sequence,dispatch_trip_id,route_number) VALUES(1,1,1,1,1),(3,1,1,3,2);
    INSERT INTO dispatch_vehicle_assistants(dispatch_day_id,vehicle_id,employee_id) VALUES(1,1,3);`)
  return db
}
function record(db,tripId=2){
  return Number(db.prepare(`INSERT INTO unloading_weight_records(dispatch_trip_id,dispatch_day_id,vehicle_id,driver_employee_id,service_date,trip_number,vehicle_code_snapshot,registration_number_snapshot,driver_name_snapshot,crew_names_snapshot,confirmed_weight_kg,photo_storage_key,photo_original_name,photo_content_type,photo_size_bytes,weighed_at,status) VALUES(?,1,1,1,'2026-09-07',2,'V1','PLATE1','Original Driver','Original Attendant',1000,?,'ticket.jpg','image/jpeg',100,'2026-09-07T12:00:00+08:00','confirmed')`).run(tripId,`ticket-${Math.random()}.jpg`).lastInsertRowid)
}
test('unload on an empty trip still associates with its vehicle Route and retains snapshots after reassignment',()=>{
  const db=fixture();try{
    const id=record(db);captureUnloadingRoute(db,id,{tripId:2,dayId:1,vehicleId:1,driverName:'Original Driver'})
    const original=db.prepare('SELECT * FROM unloading_weight_records').all()
    const first=routeUnloadingRecords('2026-09-07',1,db).items[0]
    assert.equal(first.code,'UL-20260907-000001');assert.equal(first.crewParticipants[0].id,3)
    assert.equal(routeUnloadingRecords('2026-09-07',2,db).items.length,0)
    db.exec('UPDATE dispatches SET vehicle_id=2,driver_id=2 WHERE id IN (1,2); UPDATE dispatch_stops SET route_number=2 WHERE id=1; DELETE FROM dispatch_vehicle_assistants;')
    assert.deepEqual(routeUnloadingRecords('2026-09-07',1,db).items[0],first)
    assert.equal(routeUnloadingRecords('2026-09-07',2,db).items.length,0)
    assert.deepEqual(db.prepare('SELECT * FROM unloading_weight_records').all(),original)
    assert.equal(routeUnloadingRecords('2026-09-08',1,db).items.length,0)
  }finally{db.close()}
})
test('multiple unloads retain distinct codes and legacy records are explicitly marked',()=>{
  const db=fixture();try{
    record(db,1);record(db,1)
    const items=routeUnloadingRecords('2026-09-07',1,db).items
    assert.equal(items.length,2);assert.equal(new Set(items.map(row=>row.code)).size,2)
    assert.ok(items.every(row=>row.legacyAssociation&&row.crew==='Original Attendant'))
    assert.equal(routeUnloadingRecords('2026-09-07',2,db).items.length,0)
  }finally{db.close()}
})
test('handover history reports both drivers without changing unloading ownership',()=>{
  const db=fixture();try{
    record(db,1)
    db.prepare("INSERT INTO dispatch_change_logs(dispatch_day_id,actor,change_type,entity_type,entity_id,before_json,after_json) VALUES(1,'Manager','route_day_handover','route','1',?,?)").run(JSON.stringify({vehicleId:1,trips:[{driver_id:1}]}),JSON.stringify({vehicleId:2,driverId:2,reason:'Vehicle change'}))
    const result=routeUnloadingRecords('2026-09-07',1,db)
    assert.equal(result.items[0].driverName,'Original Driver');assert.deepEqual(result.handovers[0].fromDrivers,['Original Driver']);assert.equal(result.handovers[0].toDriver,'Successor')
  }finally{db.close()}
})
