import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { schemaSql } from '../server/schema.mjs'
import { approveDay, createScheduleException, driverToday, generateWeek, getDispatchDay, publishDay, updateStop, updateTrip } from '../server/dispatchService.mjs'
import { addTemporaryLocation, createSpecialRequest, scheduleSpecialRequest } from '../server/specialRequestService.mjs'

function fixture(){
  const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON;'+schemaSql)
  db.prepare("INSERT INTO areas(jodoo_area_id,name) VALUES('A1','North')").run()
  db.prepare("INSERT INTO customers(jodoo_customer_id,name,payment_type,occ_price) VALUES('C1','Alpha','Cash',0.55)").run()
  db.prepare("INSERT INTO branches(jodoo_branch_id,customer_id,area_id,branch_name,address,latitude,longitude) VALUES('B1',1,1,'Alpha Branch','Address',3.1,101.6)").run()
  db.prepare("INSERT INTO branch_schedules(jodoo_schedule_id,branch_id,source_branch_id,frequency,days_of_week) VALUES('S1',1,'B1','Weekly','Monday')").run()
  db.prepare("INSERT INTO employees(employee_code,name,job_role) VALUES('D1','Driver One','driver'),('D2','Driver Two','driver')").run()
  db.prepare("INSERT INTO vehicles(vehicle_code,registration_number) VALUES('V1','ABC1')").run()
  return db
}
const prepareDay=(db,date='2026-07-20')=>{generateWeek({startDate:date},db);const day=getDispatchDay(date,db);for(const trip of day.trips)updateTrip(trip.id,{vehicleId:1,driverId:1},db);return getDispatchDay(date,db)}

test('生成未来七天草稿且重复生成不会重复站点',()=>{const db=fixture();const first=generateWeek({startDate:'2026-07-20'},db);assert.equal(first.days.length,7);assert.equal(first.days[0].status,'draft');const count=db.prepare('SELECT COUNT(*) count FROM dispatch_stops').get().count;generateWeek({startDate:'2026-07-20'},db);assert.equal(db.prepare('SELECT COUNT(*) count FROM dispatch_stops').get().count,count)})
test('司机看不到未发布路线',()=>{const db=fixture();prepareDay(db);assert.equal(driverToday({driverId:1,date:'2026-07-20'},db).trips.length,0)})
test('司机只看到当天发布且分配给自己的路线',()=>{const db=fixture();prepareDay(db);approveDay('2026-07-20',{},db);publishDay('2026-07-20',{},db);assert.equal(driverToday({driverId:1,date:'2026-07-20'},db).trips.length,1);assert.equal(driverToday({driverId:2,date:'2026-07-20'},db).trips.length,0);assert.equal(driverToday({driverId:1,date:'2026-07-21'},db).trips.length,0)})
test('已批准路线改变后变成需要重新批准并保留修改记录',()=>{const db=fixture();const day=prepareDay(db);approveDay('2026-07-20',{},db);updateStop(day.stops[0].id,{stopSequence:2,changedBy:'Manager'},db);assert.equal(getDispatchDay('2026-07-20',db).status,'reapproval_required');assert.equal(db.prepare('SELECT COUNT(*) count FROM dispatch_change_logs').get().count>0,true)})
test('老客户临时请求可以直接加入路线且不会重复加入',()=>{const db=fixture();prepareDay(db);const request=createSpecialRequest({existingBranchId:'B1',requestedCollectionDate:'2026-07-20',createdBy:'Office'},db);scheduleSpecialRequest(request.id,{date:'2026-07-20',tripNumber:1},db);scheduleSpecialRequest(request.id,{date:'2026-07-20',tripNumber:1},db);assert.equal(db.prepare('SELECT COUNT(*) count FROM dispatch_stops WHERE source_special_request_id=?').get(request.id).count,1)})

for(const [field,,label] of [['customerId','CNEW','CustomerID'],['branchId','BNEW','BranchID'],['occPrice',0.5,'OCC Price'],['paymentType','Cash','Payment Type']]){
  test(`新客户缺少 ${label} 时不能发布`,()=>{const db=fixture();prepareDay(db);const complete={customerId:'CNEW',branchId:'BNEW',occPrice:0.5,paymentType:'Cash'};delete complete[field];const request=createSpecialRequest({temporaryCustomerName:'New Shop',address:'New address',requestedCollectionDate:'2026-07-20',createdBy:'Office',...complete},db);scheduleSpecialRequest(request.id,{date:'2026-07-20',vehicleId:1,tripNumber:1},db);approveDay('2026-07-20',{},db);assert.throws(()=>publishDay('2026-07-20',{},db),new RegExp(label.replace(' ','|')) )})
}

test('已承诺客户未安排时不能发布',()=>{const db=fixture();prepareDay(db);createSpecialRequest({existingBranchId:'B1',requestedCollectionDate:'2026-07-20',promisedToCustomer:true,createdBy:'Office'},db);approveDay('2026-07-20',{},db);assert.throws(()=>publishDay('2026-07-20',{},db),/已承诺客户/)})
test('临时改期建立 exception 但不修改固定排程',()=>{const db=fixture();createScheduleException({scheduleId:'S1',type:'move_date',originalDate:'2026-07-20',targetDate:'2026-07-21',createdBy:'Manager'},db);assert.equal(db.prepare("SELECT days_of_week value FROM branch_schedules WHERE jodoo_schedule_id='S1'").get().value,'Monday');assert.equal(db.prepare('SELECT permanent FROM schedule_exceptions').get().permanent,0)})
test('周计划拖到其他日期会自动建立 Schedule Exception',()=>{const db=fixture();const monday=prepareDay(db),tuesday=getDispatchDay('2026-07-21',db);updateStop(monday.stops[0].id,{date:'2026-07-21',tripId:tuesday.trips[0].id,changedBy:'Manager'},db);const exception=db.prepare("SELECT original_date originalDate,target_date targetDate,permanent FROM schedule_exceptions WHERE exception_type='move_date'").get();assert.deepEqual({...exception},{originalDate:'2026-07-20',targetDate:'2026-07-21',permanent:0});assert.equal(db.prepare("SELECT days_of_week value FROM branch_schedules WHERE jodoo_schedule_id='S1'").get().value,'Monday')})
test('永久改期更新固定排程',()=>{const db=fixture();createScheduleException({scheduleId:'S1',type:'move_date',originalDate:'2026-07-20',targetDate:'2026-07-21',dayOfWeek:'Tuesday',permanent:true,createdBy:'Manager'},db);assert.equal(db.prepare("SELECT days_of_week value FROM branch_schedules WHERE jodoo_schedule_id='S1'").get().value,'Tuesday')})
test('临时 GPS 不会自动覆盖正式 GPS',()=>{const db=fixture();const before=db.prepare('SELECT latitude,longitude FROM branches WHERE id=1').get();addTemporaryLocation({branchId:1,latitude:4,longitude:102,locationSource:'Driver Captured'},db);assert.deepEqual(db.prepare('SELECT latitude,longitude FROM branches WHERE id=1').get(),before);assert.equal(db.prepare('SELECT verification_status status FROM temporary_locations').get().status,'pending_supervisor')})
test('相同临时请求不会重复建立',()=>{const db=fixture();const payload={existingBranchId:'B1',requestedCollectionDate:'2026-07-20',createdBy:'Office'};const a=createSpecialRequest(payload,db),b=createSpecialRequest(payload,db);assert.equal(a.id,b.id);assert.equal(b.deduplicated,true)})
