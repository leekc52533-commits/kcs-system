import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {schemaSql} from '../server/schema.mjs'
import {installWeeklyRoutePlan} from '../server/weeklyRoutePlanService.mjs'
import {generateDay,ensureRollingWeek,getDispatchDay,assignRouteVehicle,assignVehicleDay,approveRoute} from '../server/dispatchService.mjs'
import {getCollectionScheduleManagement,saveCollectionScheduleManagement} from '../server/collectionScheduleManagementService.mjs'
import {applyV54Migration} from '../server/migrationV54.mjs'
const plates=['QAA4293N','QAB1225B','QM3028M','QTY5028','QM630S']
function fixture(){const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON;'+schemaSql);db.exec("INSERT INTO customers(jodoo_customer_id,name) VALUES('C','Customer')");const entries=[]
 for(let r=1;r<=5;r++){
 db.prepare("INSERT INTO branches(jodoo_branch_id,customer_id,branch_name,status,collection_frequency,assigned_weekdays,latitude,longitude) VALUES(?,1,?,'active','Twice a week','[\"Monday\",\"Sunday\"]',1,1)").run('B'+r,r===1?'DVALLEY':'Branch '+r)
 db.prepare("INSERT INTO branch_schedules(jodoo_schedule_id,branch_id,source_branch_id,frequency,days_of_week) VALUES(?,?,?,'Twice a week','Monday,Sunday')").run('S'+r,r,'B'+r)
 db.prepare("INSERT INTO vehicles(vehicle_code,registration_number,status,operational_status) VALUES(?,?,'available','active')").run('Truck'+r,plates[r-1])
 db.prepare("INSERT INTO employees(employee_code,name,job_role,employment_status,is_active) VALUES(?,?,'Driver','active',1)").run('D'+r,'Driver '+r)
 for(const day of [0,1])entries.push([day,plates[r-1],1,1,'B'+r,'',''])
 }
 installWeeklyRoutePlan({name:'Routes',sourceName:'test',entries},{},db)
 // Route 3 has no Sunday service in this fixture.
 db.exec("UPDATE branch_schedules SET days_of_week='Monday',frequency='Weekly' WHERE branch_id=3; DELETE FROM weekly_route_plan_stops WHERE branch_id=3 AND weekday=0")
 generateDay({startDate:'2026-09-07'},db)
 for(let r=1;r<=5;r++){assignRouteVehicle('2026-09-07',r,{vehicleId:r,changedBy:'Manager'},db);assignVehicleDay('2026-09-07',r,{driverId:r,changedBy:'Manager'},db)}
 return db
}
const save=(db,fields)=>{const current=getCollectionScheduleManagement('B1',db);return saveCollectionScheduleManagement('B1',{...current,frequency:'Twice a week',weekdays:['Monday','Sunday'],routeNumber:1,effectiveDate:'2026-09-09',reason:'Sunday cross-route service',expectedUpdatedAt:current.updatedAt,sundayAuthorized:true,...fields},db)}
const board=(db,date,r)=>getDispatchDay(date,db).routeBoards.find(x=>x.routeNumber===r)

test('Sunday combines only due customers in two groups, cross-route override persists, alternates every week',()=>{const db=fixture();try{
 save(db,{sundayRouteNumber:2});generateDay({startDate:'2026-09-13'},db)
 assert.equal(board(db,'2026-09-13',4).customerCount,1);assert.equal(board(db,'2026-09-13',2).customerCount,3)
 assert.equal(board(db,'2026-09-13',4).vehicleId,4);assert.equal(board(db,'2026-09-13',2).vehicleId,2)
 assert.equal(getDispatchDay('2026-09-13',db).stops.filter(s=>s.branchId==='B1'||s.branchId==='1').length,1)
 generateDay({startDate:'2026-09-20'},db)
 assert.equal(board(db,'2026-09-20',4).vehicleId,1);assert.equal(board(db,'2026-09-20',2).vehicleId,5)
 generateDay({startDate:'2026-09-14'},db);assert.equal(board(db,'2026-09-14',1).customerCount,1);assert.equal(board(db,'2026-09-14',1).vehicleId,1)
 assert.equal(getCollectionScheduleManagement('B1',db).sundayRouteNumber,2)
 assert.equal(db.prepare('SELECT route_number n FROM weekly_route_plan_stops WHERE branch_id=1 AND weekday=0').get().n,1)
 const before=db.prepare('SELECT * FROM dispatch_stops WHERE service_date=\'2026-09-13\' ORDER BY id').all();ensureRollingWeek({startDate:'2026-09-09'},db);ensureRollingWeek({startDate:'2026-09-09'},db)
 assert.deepEqual(db.prepare('SELECT * FROM dispatch_stops WHERE service_date=\'2026-09-13\' ORDER BY id').all(),before)
}finally{db.close()}})

test('Sunday manual vehicle and driver choice survives refresh and never carries into Monday or next Sunday',()=>{const db=fixture();try{
 generateDay({startDate:'2026-09-13'},db);assignRouteVehicle('2026-09-13',4,{vehicleId:3,changedBy:'Supervisor'},db);assignVehicleDay('2026-09-13',3,{driverId:5,changedBy:'Supervisor'},db)
 ensureRollingWeek({startDate:'2026-09-09'},db);assert.equal(board(db,'2026-09-13',4).vehicleId,3)
 generateDay({startDate:'2026-09-14'},db);assert.equal(board(db,'2026-09-14',4).vehicleId,4);assert.equal(getDispatchDay('2026-09-14',db).vehicleBoards.find(v=>v.id===3).driverId,3)
 generateDay({startDate:'2026-09-20'},db);assert.equal(board(db,'2026-09-20',4).vehicleId,1);assert.equal(board(db,'2026-09-20',2).vehicleId,5)
 assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0)
}finally{db.close()}})

test('preview validates missing home Route without writes; Sunday authorization required for newly added Sunday',()=>{const db=fixture();try{
 db.exec("DELETE FROM weekly_route_plan_stops WHERE branch_id=1; UPDATE branch_schedules SET days_of_week='Monday',frequency='Weekly' WHERE branch_id=1")
 const before=db.prepare('SELECT * FROM branch_schedules').all()
 assert.throws(()=>save(db,{routeNumber:undefined,dryRun:true}),e=>e.statusCode===400)
 assert.throws(()=>save(db,{sundayAuthorized:false,dryRun:true}),e=>e.statusCode===400)
 save(db,{routeNumber:4,dryRun:true});assert.deepEqual(db.prepare('SELECT * FROM branch_schedules').all(),before);assert.equal(db.prepare('SELECT count(*) n FROM branch_sunday_settings').get().n,0)
 save(db,{routeNumber:4});assert.equal(getCollectionScheduleManagement('B1',db).sundayConfirmed,1)
}finally{db.close()}})

test('v54 migration adds settings without changing stops and is repeatable',()=>{const db=fixture();try{
 db.exec('INSERT INTO schema_meta(version) VALUES(53); DROP TABLE branch_sunday_settings; DROP TABLE sunday_dispatch_setup')
 const before=db.prepare('SELECT * FROM dispatch_stops').all();applyV54Migration(db);assert.deepEqual(db.prepare('SELECT * FROM dispatch_stops').all(),before);assert.equal(applyV54Migration(db).noOp,true)
}finally{db.close()}})

test('changing a Sunday exception updates an untouched Sunday once, without changing its Monday Route',()=>{const db=fixture();try{
 generateDay({startDate:'2026-09-13'},db);save(db,{sundayRouteNumber:2});ensureRollingWeek({startDate:'2026-09-09'},db)
 assert.equal(board(db,'2026-09-13',2).customerCount,3);assert.equal(board(db,'2026-09-13',4).customerCount,1)
 assert.equal(board(db,'2026-09-14',1).customerCount,1)
 const before=db.prepare('SELECT * FROM dispatch_stops ORDER BY id').all();ensureRollingWeek({startDate:'2026-09-09'},db);assert.deepEqual(db.prepare('SELECT * FROM dispatch_stops ORDER BY id').all(),before)
}finally{db.close()}})

test('approved Sunday is preserved and reported instead of silently regrouped',()=>{const db=fixture();try{
 generateDay({startDate:'2026-09-13'},db);approveRoute('2026-09-13',4,{approvedBy:'Manager'},db);db.exec('DELETE FROM sunday_dispatch_setup')
 const before=db.prepare("SELECT s.* FROM dispatch_stops s WHERE service_date='2026-09-13' ORDER BY id").all()
 const result=ensureRollingWeek({startDate:'2026-09-09'},db);assert.ok(result.scheduleReview.some(x=>x.kind==='sunday_review'))
 assert.deepEqual(db.prepare("SELECT s.* FROM dispatch_stops s WHERE service_date='2026-09-13' ORDER BY id").all(),before)
 assert.equal(board(db,'2026-09-13',4).approvalStatus,'approved')
}finally{db.close()}})

test('Sunday follows the duty vehicles crew, and an explicitly cleared crew stays cleared',()=>{const db=fixture();try{
 db.exec("INSERT INTO employees(employee_code,name,job_role,employment_status,is_active) VALUES('A','Crew','Assistant','active',1)")
 assignVehicleDay('2026-09-07',4,{assistantIds:[6],changedBy:'Manager'},db)
 generateDay({startDate:'2026-09-13'},db);assert.deepEqual(getDispatchDay('2026-09-13',db).vehicleBoards.find(v=>v.id===4).assistantIds,[6])
 assignVehicleDay('2026-09-13',4,{assistantIds:[],changedBy:'Manager'},db);ensureRollingWeek({startDate:'2026-09-09'},db)
 assert.deepEqual(getDispatchDay('2026-09-13',db).vehicleBoards.find(v=>v.id===4).assistantIds,[])
}finally{db.close()}})
