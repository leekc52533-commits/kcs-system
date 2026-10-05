import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {collectionDeadline,dueCustomers} from '../server/dueCustomers.mjs'
function fixture(){
 const db=new DatabaseSync(':memory:')
 db.exec(`CREATE TABLE customers(id,name,is_active,status);INSERT INTO customers VALUES(1,'Customer',1,'active');
 CREATE TABLE branches(id,jodoo_branch_id,branch_name,time_restriction,customer_id,is_active,status,lifecycle_status);
 INSERT INTO branches VALUES(1,'B1','DIY PMK',NULL,1,1,'active','ACTIVE');
 CREATE TABLE employees(id,name);INSERT INTO employees VALUES(1,'Driver');
 CREATE TABLE dispatches(id,dispatch_date,driver_id);INSERT INTO dispatches VALUES(1,'2026-10-01',1);
 CREATE TABLE dispatch_stops(id,branch_id,dispatch_id,service_date,status,completion_outcome,arrived_at,completed_at,route_number);
 CREATE TABLE purchase_bills(dispatch_stop_id,status);
 CREATE TABLE driver_date_requests(id,dispatch_stop_id,target_stop_id,employee_id,source_date,target_date,reason,status,reviewed_by,reviewed_at,review_reason);
 CREATE TABLE driver_date_reviews(request_id,approved_date);`)
 return db
}
const now=new Date('2026-10-05T11:00:00+08:00')
function stop(db,id,date,status='locked',outcome=null,arrived=null,completed=null){db.prepare('INSERT INTO dispatch_stops VALUES(?,1,1,?,?,?,?,?,1)').run(id,date,status,outcome,arrived,completed)}
test('date-only deadline follows Malaysia midnight, explicit time follows clock; unknown text is not guessed',()=>{
 const db=fixture();try{
 stop(db,1,'2026-10-05')
 assert.equal(dueCustomers(db,{now})[0].overdueStatus,'today')
 assert.equal(dueCustomers(db,{now:new Date('2026-10-05T16:00:00Z')})[0].overdueStatus,'overdue')
 db.exec("UPDATE branches SET time_restriction='before 10am'")
 assert.equal(dueCustomers(db,{now})[0].overdueMinutes,60)
 assert.equal(dueCustomers(db,{now})[0].overdueStatus,'timed_out')
 assert.equal(collectionDeadline('10:30'), '10:30')
 for(const text of ['after 10am','10','08:00 - 17:00','25:00','unknown'])assert.equal(collectionDeadline(text),null)
 }finally{db.close()}
})
test('issued completed October 1 collection clears old misses, but not a subsequent missed trip',()=>{
 const db=fixture();try{
 stop(db,1,'2026-09-21');stop(db,2,'2026-10-01','completed','completed','2026-10-01T09:59:24+08:00','2026-10-01T10:19:20+08:00')
 db.exec("INSERT INTO purchase_bills VALUES(2,'issued')")
 assert.deepEqual(dueCustomers(db,{now}),[])
 stop(db,3,'2026-10-04')
 let row=dueCustomers(db,{now})[0];assert.equal(row.originalDate,'2026-10-04');assert.equal(row.lastCollectionDate,'2026-10-01');assert.equal(row.visits[0].status,'collected')
 db.exec("UPDATE branches SET lifecycle_status='PAUSED'")
 assert.deepEqual(dueCustomers(db,{now}),[])
 }finally{db.close()}
})
test('arrived no goods and a valid bill without completion are not labelled unvisited; unverified no goods is distinct',()=>{
 for(const kind of ['arrival','bill','unverified']){
 const db=fixture();try{
 stop(db,1,'2026-10-02');stop(db,2,'2026-10-03','completed','no_goods',kind==='arrival'?'2026-10-03T10:00:00+08:00':null,'2026-10-03T10:10:00+08:00')
 if(kind==='bill')db.exec("INSERT INTO purchase_bills VALUES(2,'issued')")
 const result=dueCustomers(db,{now})
 if(kind==='unverified'){assert.equal(result.length,1);assert.equal(result[0].visits[0].status,'reported_no_goods')}
 else assert.deepEqual(result,[])
 }finally{db.close()}}
})
test('approved repeated reschedules retain original deadline even when target is future; rejected changes do not',()=>{
 const db=fixture();try{
 stop(db,1,'2026-10-01','cancelled');stop(db,2,'2026-10-03','cancelled');stop(db,3,'2026-10-08')
 db.exec(`INSERT INTO driver_date_requests VALUES(1,1,2,1,'2026-10-01','2026-10-03','No time','approved','Manager','2026-10-01T12:00:00+08:00',NULL),
 (2,2,3,1,'2026-10-03','2026-10-08','No time','approved','Manager','2026-10-03T12:00:00+08:00',NULL),
 (3,3,NULL,1,'2026-09-01','2026-10-09','No time','rejected','Manager',NULL,NULL)`)
 const row=dueCustomers(db,{now})[0]
 assert.equal(row.originalDate,'2026-10-01');assert.equal(row.newDate,'2026-10-08');assert.equal(row.history.length,2);assert.equal(row.driverName,'Driver')
 assert.equal(db.prepare('SELECT status FROM dispatch_stops WHERE id=1').get().status,'cancelled')
 }finally{db.close()}
})
