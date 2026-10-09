import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {schemaSql} from '../server/schema.mjs'
import {driverArrangementSchemaSql} from '../server/migrationV64.mjs'
import {ensureV28Schema} from '../server/migrationV28.mjs'
import {generateDay,createStop,syncSundayCatchupDay,ensureRollingWeek} from '../server/dispatchService.mjs'
import {sundayCatchupCandidates} from '../server/sundayCatchup.mjs'
import {ensureCustomerDatePromiseSchema} from '../server/customerDatePromise.mjs'
const sunday='2026-10-11',today='2026-10-09'
function fixture(){
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON;'+schemaSql+driverArrangementSchemaSql);ensureV28Schema(db)
 db.exec("INSERT INTO customers(jodoo_customer_id,name) VALUES('C','Customer');INSERT INTO employees(employee_code,name,job_role) VALUES('D','Driver','Driver');INSERT INTO vehicles(vehicle_code,status,operational_status) VALUES('V','available','active');INSERT INTO weekly_route_plans(name,source_name,created_by) VALUES('Plan','Test','Test')")
 for(let n=1;n<=10;n++)db.prepare("INSERT INTO branches(jodoo_branch_id,customer_id,branch_name,status,lifecycle_status) VALUES(?,1,?,'active','ACTIVE')").run('B'+n,'Branch '+n)
 for(let n=1;n<=5;n++)db.prepare('INSERT INTO weekly_route_definitions(plan_id,route_number,display_name) VALUES(1,?,?)').run(n,'Route '+n)
 for(const date of ['2026-10-03','2026-10-05','2026-10-07','2026-10-09','2026-10-10',sunday,'2026-10-12'])generateDay({startDate:date},db)
 const stop=(branch,date)=>{
  let s=db.prepare("SELECT * FROM dispatch_stops WHERE branch_id=? AND service_date=? AND status<>'cancelled'").get(branch,date)
  if(!s){s=createStop({branchId:'B'+branch,date},db);db.prepare('UPDATE dispatch_stops SET route_number=? WHERE id=?').run(branch%5+1,s.id)}return s
 }
 const miss=(branch,date,code='time',status='approved',reason='Tak sempat')=>{
  const s=stop(branch,date),r=db.prepare('INSERT INTO driver_date_requests(dispatch_stop_id,employee_id,source_date,target_date,reason,status) VALUES(?,1,?,?,?,?)').run(s.id,date,'2026-10-12',reason,status)
  if(code)db.prepare('INSERT INTO driver_date_evidence(request_id,reason_code,details_json) VALUES(?,?,?)').run(r.lastInsertRowid,code,JSON.stringify({reasonCode:code}))
  return Number(r.lastInsertRowid)
 }
 const bill=(branch,date,status='issued')=>{
  const s=stop(branch,date),day=db.prepare('SELECT dispatch_day_id id FROM dispatch_trips WHERE id=?').get(s.dispatch_trip_id)
  const r=db.prepare(`INSERT INTO purchase_bills(bill_number,dispatch_stop_id,dispatch_trip_id,dispatch_day_id,branch_id,customer_id,driver_employee_id,vehicle_id,service_date,customer_name_snapshot,branch_code_snapshot,branch_name_snapshot,driver_name_snapshot,vehicle_code_snapshot,payment_method,weight_method,print_choice,subtotal_cents,total_cents,status,issued_at) VALUES(?,?,?,?,?,1,1,1,?,'Customer',?,'Branch','Driver','V','Credit','on_site','no_print',100,100,?,?)`).run('P-'+branch+'-'+date,s.id,s.dispatch_trip_id,day.id,branch,date,'B'+branch,status,date+'T10:00:00+08:00')
  return Number(r.lastInsertRowid)
 }
 const sync=()=>syncSundayCatchupDay(sunday,db,{today})
 return{db,miss,bill,stop,sync}
}
test('latest unresolved time miss wins regardless of weekly frequency; bill service dates and voids, not planned dates or arrival',()=>{
 const{db,miss,bill,stop,sync}=fixture()
 miss(1,'2026-10-05') // once weekly, missed
 miss(2,'2026-10-05');miss(2,'2026-10-10') // twice, dedupe
 bill(3,'2026-10-05');miss(3,'2026-10-07');bill(3,'2026-10-10') // M/W/S, collected Saturday
 bill(4,'2026-10-05');bill(4,'2026-10-07');miss(4,'2026-10-10') // later miss after earlier successes
 miss(5,'2026-10-03') // previous week
 miss(6,'2026-10-07','customer');miss(7,'2026-10-07','full')
 miss(8,'2026-10-07',null,'pending','  TAK SEMPAT.  ');bill(8,'2026-10-10','voided')
 miss(9,'2026-10-07','time','rejected');miss(10,'2026-10-07','uncontacted')
 db.prepare("UPDATE dispatch_stops SET arrived_at='2026-10-10T10:00:00+08:00' WHERE id=?").run(stop(1,'2026-10-10').id)
 assert.deepEqual(sundayCatchupCandidates(db,sunday).map(r=>r.branchId).sort((a,b)=>a-b),[1,2,4,8])
 assert.equal(sync().added,4);assert.equal(sync().added,0)
 assert.equal(db.prepare("SELECT COUNT(*) n FROM dispatch_stops WHERE service_date=? AND status<>'cancelled'").get(sunday).n,4)
 assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0)
 db.close()
})
test('later successful bill removes only automatic extra, retains regular Sunday stop, and a void restores one occurrence',()=>{
 const{db,miss,bill,stop,sync}=fixture();miss(1,'2026-10-07');miss(2,'2026-10-07');const regular=stop(2,sunday)
 assert.equal(sync().added,1);const original=db.prepare('SELECT stop_id id FROM sunday_catchup_tasks WHERE branch_id=1').get().id
 const b=bill(1,'2026-10-10');bill(2,'2026-10-10')
 assert.equal(sync().removed,1);assert.equal(db.prepare('SELECT status FROM dispatch_stops WHERE id=?').get(regular.id).status,'locked')
 db.prepare("UPDATE purchase_bills SET status='voided' WHERE id=?").run(b)
 assert.equal(sync().added,1);assert.equal(db.prepare('SELECT stop_id id FROM sunday_catchup_tasks WHERE branch_id=1').get().id,original)
 assert.equal(sync().added,0);db.close()
})
test('Sunday groups and per-branch exception route apply; new additions invalidate prior approval and persist on refresh',()=>{
 const{db,miss,sync}=fixture();miss(3,'2026-10-07');miss(4,'2026-10-07')
 db.exec("INSERT INTO branch_sunday_settings(branch_id,home_route_number,sunday_route_number,sunday_confirmed,updated_by,reason) VALUES(3,4,2,1,'Test','Sunday exception')")
 db.prepare("UPDATE dispatch_days SET status='approved' WHERE dispatch_date=?").run(sunday)
 assert.equal(sync().added,2)
 const rows=db.prepare("SELECT branch_id,route_number FROM dispatch_stops WHERE service_date=? AND status<>'cancelled' ORDER BY branch_id").all(sunday)
 assert.deepEqual(rows.map(r=>[r.branch_id,r.route_number]),[[3,2],[4,2]])
 assert.equal(db.prepare('SELECT status FROM dispatch_days WHERE dispatch_date=?').get(sunday).status,'reapproval_required')
 generateDay({startDate:sunday},db);ensureRollingWeek({startDate:today},db)
 assert.equal(db.prepare("SELECT COUNT(*) n FROM dispatch_stops WHERE service_date=? AND status<>'cancelled'").get(sunday).n,2);db.close()
})
test('promised dates, inactive branches, manually cancelled Sundays and running work are preserved',()=>{
 const{db,miss,stop,sync}=fixture();const req=miss(1,'2026-10-07');miss(2,'2026-10-07');miss(3,'2026-10-07');miss(4,'2026-10-07')
 ensureCustomerDatePromiseSchema(db);const promised=stop(1,'2026-10-12')
 db.prepare("INSERT INTO customer_date_promises VALUES(?,?,?,?,?,'Supervisor',CURRENT_TIMESTAMP)").run(req,promised.id,1,'2026-10-12','once')
 db.exec("UPDATE branches SET lifecycle_status='TEMPORARILY_PAUSED' WHERE id=2")
 const cancelled=stop(3,sunday);db.prepare("UPDATE dispatch_stops SET status='cancelled' WHERE id=?").run(cancelled.id)
 db.prepare("UPDATE dispatch_days SET status='in_progress' WHERE dispatch_date=?").run(sunday)
 const result=sync();assert.equal(result.added,0);assert.equal(result.reviews.length,3)
 assert.equal(db.prepare('SELECT service_date FROM dispatch_stops WHERE id=?').get(promised.id).service_date,'2026-10-12');db.close()
})
test('audit failure rolls back all catch-up additions',()=>{
 const{db,miss,sync}=fixture();miss(1,'2026-10-07')
 db.exec("CREATE TRIGGER catchup_fail BEFORE INSERT ON dispatch_change_logs WHEN NEW.change_type='sunday_catchup_added' BEGIN SELECT RAISE(ABORT,'Audit failed'); END")
 assert.throws(sync,/Audit failed/)
 assert.equal(db.prepare("SELECT COUNT(*) n FROM dispatch_stops WHERE service_date=?").get(sunday).n,0)
 db.exec('DROP TRIGGER catchup_fail');assert.equal(sync().added,1);db.close()
})
