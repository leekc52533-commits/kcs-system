import {ensureV28Schema} from '../server/migrationV28.mjs'
import {driverArrangementSchemaSql} from '../server/migrationV64.mjs'
import {ensureGpsExceptionSchema} from '../server/gpsExceptionSchema.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {schemaSql} from '../server/schema.mjs'
import {installWeeklyRoutePlan} from '../server/weeklyRoutePlanService.mjs'
import {addSupportVehicle,generateDay,getDispatchDay,assignRouteVehicle,assignVehicleDay} from '../server/dispatchService.mjs'
const plates=['QAA4293N','QAB1225B','QM3028M','QTY5028','QM630S']
function fixture(){const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON;'+schemaSql+driverArrangementSchemaSql);ensureGpsExceptionSchema(db);ensureV28Schema(db);db.exec("INSERT INTO customers(jodoo_customer_id,name) VALUES('C','Customer')");const entries=[]
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

test('Sunday support remains independent after regeneration without altering following Sunday',()=>{const db=fixture();try{
 const date='2026-10-04';generateDay({startDate:date},db)
 const before=getDispatchDay(date,db),source=before.routeBoards.find(r=>r.routeNumber===4)
 const used=new Set(before.routeBoards.filter(r=>r.customerCount>0).map(r=>r.vehicleId)),spare=[1,2,3,4,5].find(id=>!used.has(id))
 const result=addSupportVehicle(date,4,{vehicleId:spare,driverId:spare,assistantIds:[],stopIds:[source.stops[0].id],expectedRevision:before.revision},{role:'supervisor',employeeName:'KC'},db)
 const support=result.day.routeBoards.find(r=>r.supportSourceRoute===4);assert.equal(support.customerCount,1);assert.equal(support.vehicleId,spare)
 generateDay({startDate:date},db);const after=getDispatchDay(date,db);assert.equal(after.routeBoards.find(r=>r.routeNumber===support.routeNumber).customerCount,1);assert.equal(after.routeBoards.find(r=>r.routeNumber===4).customerCount,1)
 generateDay({startDate:'2026-10-11'},db);assert.equal(getDispatchDay('2026-10-11',db).routeBoards.find(r=>r.routeNumber===4).customerCount,2)
 }finally{db.close()}})
