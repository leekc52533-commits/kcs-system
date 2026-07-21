import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { schemaSql } from '../server/schema.mjs'
import { assignVehicleDay, generateDay, getDispatchDay, transferVehicleDay, updateStop } from '../server/dispatchService.mjs'
import { updateVehicle } from '../server/resourceService.mjs'
import { addFuelRecord, addMaintenanceRecord, addTyreRecord, addUsageRecord, getVehicleDetail, reminderLevel, updateVehicleCompliance } from '../server/vehicleService.mjs'

function fixture(){
  const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON;'+schemaSql)
  db.prepare("INSERT INTO areas(jodoo_area_id,name) VALUES('A1','North')").run()
  db.prepare("INSERT INTO customers(jodoo_customer_id,name,payment_type,occ_price) VALUES('C1','Alpha','Cash',0.5)").run()
  db.prepare("INSERT INTO branches(jodoo_branch_id,customer_id,area_id,branch_name,latitude,longitude) VALUES('B1',1,1,'Alpha Branch',3.1,101.6)").run()
  db.prepare("INSERT INTO branch_schedules(jodoo_schedule_id,branch_id,source_branch_id,frequency,days_of_week) VALUES('S1',1,'B1','Weekly','Monday')").run()
  db.prepare("INSERT INTO employees(employee_code,name,job_role) VALUES('D1','Driver One','driver')").run()
  db.prepare("INSERT INTO vehicles(vehicle_code,registration_number,operational_status,is_common) VALUES('Lorry 1','QAV3468','available',0),('Lorry 2','QAA4293N','active',1)").run()
  return db
}

test('车辆详情保存法定提醒、保养、燃油、轮胎和使用记录',()=>{
  const db=fixture()
  updateVehicleCompliance(1,{puspakomDueDate:'2027-01-01',roadTaxDueDate:'2027-02-01',nextServiceMileage:120000},db)
  addMaintenanceRecord(1,{date:'2026-07-20',mileage:100000,faultDescription:'Brake noise',labourCost:100,partsCost:200},db)
  addFuelRecord(1,{dateTime:'2026-07-20T08:00',driverId:1,litres:50,pricePerLitre:2,totalAmount:100,fullTank:true},db)
  addTyreRecord(1,{tyrePosition:'Front Left',brand:'Test',installDate:'2026-07-20'},db)
  addUsageRecord(1,{dispatchDate:'2026-07-20',driverId:1,tripsCompleted:2,collectionWeightKg:1000},db)
  const detail=getVehicleDetail(1,db)
  assert.equal(detail.compliance.nextServiceMileage,120000)
  assert.equal(detail.maintenanceRecords[0].totalCost,300)
  assert.equal(detail.fuelRecords[0].fullTank,1)
  assert.equal(detail.tyreRecords[0].tyrePosition,'Front Left')
  assert.equal(detail.usageHistory[0].tripsCompleted,2)
})

test('车辆状态改变保留历史，Sold 车辆禁止物理删除',()=>{
  const db=fixture();updateVehicle(1,{status:'maintenance',statusReason:'Workshop',changedBy:'Manager'},db)
  assert.equal(db.prepare('SELECT new_status value FROM vehicle_status_history WHERE vehicle_id=1').get().value,'maintenance')
  db.prepare("UPDATE vehicles SET operational_status='sold',status='inactive' WHERE id=1").run()
  assert.throws(()=>db.prepare('DELETE FROM vehicles WHERE id=1').run(),/Sold vehicle history cannot be deleted/)
})

test('整车转移会移动 Trip、客户与司机并记录原车 Maintenance',()=>{
  const db=fixture();generateDay({startDate:'2026-07-20'},db);assignVehicleDay('2026-07-20',2,{driverId:1},db)
  const stop=getDispatchDay('2026-07-20',db).unassignedStops[0];updateStop(stop.id,{date:'2026-07-20',vehicleId:2,tripNumber:1},db)
  transferVehicleDay('2026-07-20',2,{targetVehicleId:1,transferDriver:true,setSourceMaintenance:true,reason:'Breakdown',changedBy:'Manager'},db)
  const day=getDispatchDay('2026-07-20',db),target=day.vehicleBoards.find(item=>item.id===1)
  assert.equal(target.driverId,1);assert.equal(target.customerCount,1)
  assert.equal(db.prepare('SELECT operational_status value FROM vehicles WHERE id=2').get().value,'maintenance')
  assert.equal(db.prepare("SELECT COUNT(*) count FROM dispatch_change_logs WHERE change_type='vehicle_route_transferred'").get().count,1)
})

test('到期提醒按 30、14、7 天及过期分级',()=>{
  const date=days=>{const value=new Date();value.setDate(value.getDate()+days);return value.toISOString().slice(0,10)}
  assert.equal(reminderLevel(date(20)).level,'yellow')
  assert.equal(reminderLevel(date(10)).level,'orange')
  assert.equal(reminderLevel(date(5)).level,'red')
  assert.equal(reminderLevel(date(-1)).level,'overdue')
})
