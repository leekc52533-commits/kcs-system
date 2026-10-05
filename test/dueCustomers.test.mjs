import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {collectionDeadline,dueCustomers} from '../server/dueCustomers.mjs'
function fixture(){
 const db=new DatabaseSync(':memory:')
 db.exec(`CREATE TABLE customers(id,name,is_active,status);INSERT INTO customers VALUES(1,'Customer',1,'active');
 CREATE TABLE branches(id,jodoo_branch_id,branch_name,time_restriction,customer_id,is_active,status,lifecycle_status,collection_frequency,assigned_weekdays);
 INSERT INTO branches VALUES(1,'B1','DIY PMK',NULL,1,1,'active','ACTIVE','Weekly','Monday,Thursday');
 CREATE TABLE employees(id,name);INSERT INTO employees VALUES(1,'Driver');
 CREATE TABLE dispatches(id,dispatch_date,driver_id);INSERT INTO dispatches VALUES(1,'2026-10-01',1);
 CREATE TABLE dispatch_stops(id,branch_id,dispatch_id,service_date,status,completion_outcome,arrived_at,completed_at,route_number);
 CREATE TABLE purchase_bills(id INTEGER PRIMARY KEY,branch_id,service_date,bill_number,dispatch_stop_id,status); CREATE TABLE branch_schedules(id,branch_id,is_active,frequency,days_of_week,recurrence_type,interval_weeks,anchor_date,effective_date,monthly_occurrence,fixed_weekday);
 CREATE TABLE driver_date_requests(id,dispatch_stop_id,target_stop_id,employee_id,source_date,target_date,reason,status,reviewed_by,reviewed_at,review_reason);
 CREATE TABLE driver_date_reviews(request_id,approved_date);`)
 return db
}
const now=new Date('2026-10-05T11:00:00+08:00')
function stop(db,id,date,status='locked',outcome=null,arrived=null,completed=null){db.prepare('INSERT INTO dispatch_stops VALUES(?,1,1,?,?,?,?,?,1)').run(id,date,status,outcome,arrived,completed)}
function bill(db,id,date,status='issued'){db.prepare('INSERT INTO purchase_bills VALUES(?,1,?,?,?,?)').run(id,date,'P'+id,id,status)}
test('bill service date is the anchor even without completed trip; old tasks and approved changes do not reset it',()=>{
 const db=fixture();try{
 stop(db,1,'2026-09-01');stop(db,2,'2026-10-01');bill(db,2,'2026-10-01')
 db.exec("INSERT INTO driver_date_requests VALUES(1,1,NULL,1,'2026-09-01','2026-10-20','Later','approved','Manager','2026-10-04',NULL)")
 const row=dueCustomers(db,{now})[0];assert.equal(row.lastCollectionDate,'2026-10-01');assert.equal(row.dueDate,'2026-10-05');assert.equal(row.overdueStatus,'today');assert.equal(row.lastBillNumber,'P2')
 assert.equal(dueCustomers(db,{now:new Date('2026-10-05T16:00:00Z')})[0].overdueStatus,'overdue')
 db.exec("UPDATE branches SET time_restriction='before 10am'");assert.equal(dueCustomers(db,{now})[0].overdueMinutes,60)
 bill(db,3,'2026-10-05');assert.deepEqual(dueCustomers(db,{now}),[])
 db.exec("UPDATE purchase_bills SET status='voided' WHERE id=3");assert.equal(dueCustomers(db,{now})[0].lastCollectionDate,'2026-10-01')
 }finally{db.close()}
})
test('no bills remains unknown even with completed stops; customers without generated trips are included',()=>{
 const db=fixture();try{
 let row=dueCustomers(db,{now})[0];assert.equal(row.overdueStatus,'no_collection');assert.equal(row.dueDate,null);assert.equal(row.overdueMinutes,null)
 stop(db,1,'2026-09-01','completed','completed',null,'2026-09-01');assert.equal(dueCustomers(db,{now})[0].overdueStatus,'no_collection')
 bill(db,1,'2026-10-01');db.exec("UPDATE branches SET collection_frequency='On Call',assigned_weekdays=NULL")
 row=dueCustomers(db,{now})[0];assert.equal(row.overdueStatus,'on_call');assert.equal(row.overdueMinutes,null)
 db.exec("UPDATE branches SET lifecycle_status='PAUSED'");assert.deepEqual(dueCustomers(db,{now}),[])
 }finally{db.close()}
})
test('arrival and no goods do not reset bill clock and are not labelled unvisited',()=>{
 const db=fixture();try{
 bill(db,1,'2026-09-28');stop(db,2,'2026-10-03','completed','no_goods','2026-10-03T10:00:00+08:00','2026-10-03T10:01:00+08:00')
 const row=dueCustomers(db,{now})[0];assert.equal(row.dueDate,'2026-10-01');assert.equal(row.lastCollectionDate,'2026-09-28');assert.equal(row.overdueStatus,'arrived_no_goods')
 }finally{db.close()}
})
test('interval weeks restarts from bill and monthly fixed weekday follows calendar; malformed schedules do not guess',()=>{
 const db=fixture();try{
 bill(db,1,'2026-09-01')
 db.exec("INSERT INTO branch_schedules VALUES(1,1,1,'Every 2 Weeks','Tuesday','interval_weeks',2,'2026-08-25',NULL,NULL,'Tuesday')")
 assert.equal(dueCustomers(db,{now})[0].dueDate,'2026-09-15')
 db.exec("UPDATE branch_schedules SET frequency='Monthly',recurrence_type='monthly',monthly_occurrence=1,fixed_weekday='Monday',days_of_week='Monday'")
 assert.equal(dueCustomers(db,{now})[0].dueDate,'2026-09-07')
 db.exec("UPDATE branch_schedules SET monthly_occurrence=NULL")
 assert.equal(dueCustomers(db,{now})[0].overdueStatus,'schedule_unknown')
 assert.equal(collectionDeadline('10:30'),'10:30');assert.equal(collectionDeadline('after 10am'),null)
 }finally{db.close()}
})
