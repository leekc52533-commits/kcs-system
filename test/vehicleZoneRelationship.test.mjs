import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {schemaSql} from '../server/schema.mjs'
import {setZoneDefaultVehicles,listZoneDefaultVehicles} from '../server/defaultVehicleService.mjs'
import {listResources,mergeZoneGroups,splitZoneGroup} from '../server/resourceService.mjs'
import {getVehicleDetail} from '../server/vehicleService.mjs'

function fixture(){
  const db=new DatabaseSync(':memory:')
  db.exec(`PRAGMA foreign_keys=ON;${schemaSql}`)
  db.prepare('INSERT INTO schema_meta(version) VALUES(43)').run()
  db.prepare("INSERT INTO vehicles(id,vehicle_code,registration_number,status,operational_status,is_temporary) VALUES(1,'Lorry 1','QAV3468','available','active',0),(2,'Lorry 2','QAA4293N','available','active',0)").run()
  db.prepare("UPDATE zone_groups SET code='KCH-A',name='Kuching A',sort_order=1,is_active=1 WHERE id=1").run()
  db.prepare("INSERT INTO areas(id,jodoo_area_id,name,zone_group_id,confirmed_zone_group_id,zone_assignment_status) VALUES(20,'A20','BDC',1,1,'confirmed')").run()
  return db
}

test('Vehicle Management reads the authoritative Area / Zone vehicle pool',()=>{
  const db=fixture()
  const legacyZoneId=Number(db.prepare("INSERT INTO zone_groups(code,name,sort_order,is_active) VALUES('LEGACY','Legacy Zone',999,1)").run().lastInsertRowid)
  db.prepare('INSERT INTO vehicle_preferred_zones(vehicle_id,zone_group_id) VALUES(1,?)').run(legacyZoneId)
  setZoneDefaultVehicles(1,{vehicleIds:[1,2],reason:'Approved Area / Zone ownership',changedBy:'Supervisor'},db)
  const resources=listResources(db),lorry1=resources.vehicles.find(item=>item.id===1),lorry2=resources.vehicles.find(item=>item.id===2)
  assert.deepEqual(lorry1.assignedZoneIds,[1])
  assert.deepEqual(lorry1.assignedZones,['Kuching A'])
  assert.deepEqual(lorry1.preferredZoneIds,[1])
  assert.deepEqual(lorry1.preferredZones,['Kuching A'])
  assert.deepEqual(lorry2.assignedZoneIds,[1])
  assert.deepEqual(getVehicleDetail(1,db,{includeDocuments:false}).assignedZones.map(item=>item.name),['Kuching A'])
})

test('Zone merge and split preserve the authoritative vehicle pool',()=>{
  const db=fixture(),sourceId=Number(db.prepare("INSERT INTO zone_groups(code,name,sort_order,is_active) VALUES('SOURCE','Source Zone',999,1)").run().lastInsertRowid)
  setZoneDefaultVehicles(1,{vehicleIds:[1],reason:'Target pool',changedBy:'Supervisor'},db)
  setZoneDefaultVehicles(sourceId,{vehicleIds:[2],reason:'Source pool',changedBy:'Supervisor'},db)
  mergeZoneGroups({targetZoneId:1,sourceZoneIds:[sourceId],changedBy:'Supervisor'},db)
  assert.deepEqual(listZoneDefaultVehicles(1,db).map(item=>item.id),[1,2])
  assert.deepEqual(listZoneDefaultVehicles(sourceId,db),[])
  assert.deepEqual({...db.prepare('SELECT default_vehicle_id FROM zone_groups WHERE id=1').get()},{default_vehicle_id:1})
  assert.deepEqual({...db.prepare('SELECT is_active,default_vehicle_id FROM zone_groups WHERE id=?').get(sourceId)},{is_active:0,default_vehicle_id:null})
  assert.deepEqual(listResources(db).vehicles.map(item=>[item.id,item.assignedZoneIds]),[[1,[1]],[2,[1]]])
  const split=splitZoneGroup({sourceZoneId:1,areaIds:[20],name:'Split Zone',changedBy:'Supervisor'},db)
  assert.deepEqual(listZoneDefaultVehicles(split.zone.id,db).map(item=>item.id),[1,2])
  assert.deepEqual({...db.prepare('SELECT default_vehicle_id FROM zone_groups WHERE id=?').get(split.zone.id)},{default_vehicle_id:1})
})

test('Zone merge refuses more than three vehicles without changing either pool',()=>{
  const db=fixture()
  db.prepare("INSERT INTO vehicles(id,vehicle_code,status,operational_status,is_temporary) VALUES(3,'Lorry 3','available','active',0),(4,'Lorry 4','available','active',0)").run()
  const sourceId=Number(db.prepare("INSERT INTO zone_groups(code,name,sort_order,is_active) VALUES('SOURCE','Source Zone',999,1)").run().lastInsertRowid)
  setZoneDefaultVehicles(1,{vehicleIds:[1,2],reason:'Target pool',changedBy:'Supervisor'},db)
  setZoneDefaultVehicles(sourceId,{vehicleIds:[3,4],reason:'Source pool',changedBy:'Supervisor'},db)
  assert.throws(()=>mergeZoneGroups({targetZoneId:1,sourceZoneIds:[sourceId],changedBy:'Supervisor'},db),/maximum 3 Default Vehicles/)
  assert.deepEqual(listZoneDefaultVehicles(1,db).map(item=>item.id),[1,2])
  assert.deepEqual(listZoneDefaultVehicles(sourceId,db).map(item=>item.id),[3,4])
  assert.equal(db.prepare('SELECT is_active FROM zone_groups WHERE id=?').get(sourceId).is_active,1)
  assert.equal(db.prepare('SELECT zone_group_id FROM areas WHERE id=20').get().zone_group_id,1)
})
