import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {schemaSql} from '../server/schema.mjs'
import {applyV28Migration} from '../server/migrationV28.mjs'
import {seedV22MasterData} from '../server/migrationV22.mjs'
import {approveDay,generateWeek,saveDraftAdjustments} from '../server/dispatchService.mjs'
import {startDriverTrip} from '../server/driverExecutionService.mjs'
import {createBackfillPurchase,purchaseBackfillOptions} from '../server/purchaseBackfillService.mjs'
import {listPurchaseBillArchive} from '../server/purchaseBillArchiveService.mjs'
const date='2026-09-07',now=new Date('2026-09-07T01:00:00Z'),context={employeeId:1,role:'driver',today:date,now}
const admin={id:1,role:'operations_admin'}
function fixture(){
  const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON;'+schemaSql);applyV28Migration(db);seedV22MasterData(db)
  db.prepare("INSERT INTO areas(jodoo_area_id,name) VALUES('A','A')").run()
  db.prepare("INSERT INTO customers(jodoo_customer_id,name,payment_type,default_payment_type) VALUES('C1','Cash Company','Cash','Cash'),('C2','Credit Company','Credit','Credit')").run()
  db.prepare("INSERT INTO branches(jodoo_branch_id,customer_id,area_id,branch_name,address,latitude,longitude,payment_type) VALUES('B1',1,1,'Cash Branch','A',3.1,101.6,'Cash'),('B2',2,1,'Credit Branch','B',3.1,101.6,'Credit')").run()
  db.prepare("INSERT INTO branch_schedules(jodoo_schedule_id,branch_id,source_branch_id,frequency,days_of_week) VALUES('S1',1,'B1','Weekly','Monday'),('S2',2,'B2','Weekly','Monday')").run()
  db.prepare("INSERT INTO vehicles(vehicle_code,status,operational_status) VALUES('V','available','active')").run()
  db.prepare("INSERT INTO employees(employee_code,name,job_role,employment_status,is_active) VALUES('D','Driver','Driver','active',1)").run()
  const product=db.prepare("SELECT id,material_id FROM material_products WHERE product_code='OCC'").get(),level=db.prepare("INSERT INTO material_price_levels(material_id,product_id,price_amount,price_cents,effective_date,is_fixed) VALUES(?,?,0.20,20,'2026-01-01',1)").run(product.material_id,product.id)
  for(const customerId of [1,2])db.prepare('INSERT INTO customer_product_pricing(customer_id,product_id,standard_price_level_id) VALUES(?,?,?)').run(customerId,product.id,Number(level.lastInsertRowid))
  for(const branchId of [1,2])db.prepare('INSERT OR IGNORE INTO branch_product_availability(branch_id,product_id,is_selectable) VALUES(?,?,1)').run(branchId,product.id)
  generateWeek({startDate:date},db);const stops=db.prepare('SELECT id FROM dispatch_stops ORDER BY id').all().map(row=>row.id)
  saveDraftAdjustments({adjustments:stops.map(stopId=>({stopId,vehicleId:1,tripNumber:1})),reason:'test',changedBy:'test'},db);db.prepare('UPDATE dispatches SET driver_id=1').run();approveDay(date,{approvedBy:'Supervisor',reason:'ready'},db)
  const tripId=db.prepare('SELECT id FROM dispatch_trips WHERE EXISTS(SELECT 1 FROM dispatch_stops WHERE dispatch_trip_id=dispatch_trips.id)').get().id;startDriverTrip(tripId,context,db)
  db.prepare("INSERT INTO auth_accounts(employee_id,username,password_hash,role,system_role,is_active) VALUES(1,'manager','hash','admin','operations_admin',1)").run()
  return{db,tripId,stops,productId:product.id}
}

const input=f=>({serviceDate:date,customerId:2,stopId:f.stops[1],weightMethod:'factory',items:[{productId:f.productId,quantity:'35.25',unitPrice:'0.421'}],reason:'Collected, weighed at company; missed bill',confirmCollected:true,requestKey:'backfill-test-00001'})
test('historical Credit correction preserves execution and cash, appears in statement range with audit',()=>{
 const f=fixture(),{db}=f,before=db.prepare('SELECT * FROM dispatch_stops').all(),cash=db.prepare('SELECT * FROM cash_float_transactions').all()
 const b=createBackfillPurchase(input(f),admin,db)
 assert.equal(b.totalCents,1484)
 assert.deepEqual(db.prepare('SELECT * FROM dispatch_stops').all(),before)
 assert.deepEqual(db.prepare('SELECT * FROM cash_float_transactions').all(),cash)
 assert.equal(db.prepare('SELECT COUNT(*) n FROM stop_step_records').get().n,0)
 const saved=db.prepare('SELECT * FROM purchase_bills WHERE id=?').get(b.id)
 assert.equal(saved.service_date,date);assert.equal(saved.payment_method,'Credit');assert.notEqual(saved.issued_at.slice(0,10),date)
 const rows=listPurchaseBillArchive({from:date,to:date,paymentMethod:'Credit',exportRange:'1'},db).items
 assert.equal(rows.length,1);assert.equal(rows[0].backfillReason,input(f).reason);assert.equal(rows[0].backfillOperator,'Driver');assert.equal(rows[0].items[0].unitPrice,0.421)
 assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0)
 db.close()
})
test('only active Admin and above can read options or save; session role cannot elevate DB role',()=>{
 const f=fixture();for(const role of ['driver','crew','office','supervisor']){assert.throws(()=>purchaseBackfillOptions(date,{...admin,role},f.db),e=>e.statusCode===403);assert.throws(()=>createBackfillPurchase(input(f),{...admin,role},f.db),e=>e.statusCode===403)}
 f.db.prepare("UPDATE auth_accounts SET system_role='office'").run();assert.throws(()=>createBackfillPurchase(input(f),admin,f.db),e=>e.code==='BACKFILL_ACCESS')
 f.db.prepare("UPDATE auth_accounts SET system_role='owner_admin',is_active=0").run();assert.throws(()=>purchaseBackfillOptions(date,admin,f.db),e=>e.code==='BACKFILL_ACCESS');f.db.close()
})
test('retries return same bill, changed retries and a second request cannot duplicate',()=>{
 const f=fixture(),p=input(f),a=createBackfillPurchase(p,admin,f.db),b=createBackfillPurchase(p,admin,f.db)
 assert.equal(a.id,b.id);assert.equal(b.idempotent,true)
 assert.throws(()=>createBackfillPurchase({...p,reason:'different'},admin,f.db),e=>e.code==='BACKFILL_DUPLICATE')
 assert.throws(()=>createBackfillPurchase({...p,requestKey:'backfill-test-00002'},admin,f.db),e=>e.code==='BACKFILL_DUPLICATE')
 assert.equal(f.db.prepare('SELECT COUNT(*) n FROM purchase_bills').get().n,1);assert.equal(purchaseBackfillOptions(date,admin,f.db).stops.length,0);f.db.close()
})
test('invalid dates, Cash, missing confirmation, duplicate products and bad precision leave no bills',()=>{
 const f=fixture(),p=input(f)
 const bad=[{customerId:1},{serviceDate:'2026-02-30'},{serviceDate:'2999-01-01'},{stopId:f.stops[0]},{confirmCollected:false},{reason:' '},{items:[...p.items,...p.items]},{items:[{...p.items[0],quantity:'1.001'}]},{items:[{...p.items[0],unitPrice:'0.0001'}]}]
 for(const patch of bad)assert.throws(()=>createBackfillPurchase({...p,...patch},admin,f.db))
 assert.equal(f.db.prepare('SELECT COUNT(*) n FROM purchase_bills').get().n,0);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM document_numbers').get().n,0);f.db.close()
})
test('options show named historical Credit task with driver and vehicle; date and invoice revalidated on save',()=>{
 const f=fixture(),o=purchaseBackfillOptions(date,admin,f.db);assert.equal(o.stops.length,1);assert.equal(o.stops[0].branchName,'Credit Branch');assert.equal(o.stops[0].driverName,'Driver');assert.equal(o.stops[0].vehicleCode,'V')
 f.db.prepare("UPDATE dispatch_stops SET invoice_number='paper-1' WHERE id=?").run(f.stops[1]);assert.throws(()=>createBackfillPurchase(input(f),admin,f.db),e=>e.code==='BACKFILL_DUPLICATE');f.db.close()
})
test('audit insertion failure rolls back bill, items and allocated number',()=>{
 const f=fixture();f.db.exec("CREATE TRIGGER fail_audit BEFORE INSERT ON purchase_backfill_audit BEGIN SELECT RAISE(ABORT,'audit unavailable'); END;")
 assert.throws(()=>createBackfillPurchase(input(f),admin,f.db),/audit unavailable/)
 for(const table of ['purchase_bills','purchase_bill_items','document_numbers'])assert.equal(f.db.prepare('SELECT COUNT(*) n FROM '+table).get().n,0);f.db.close()
})

test('company options include every master, including companies with no eligible tasks and duplicate names',()=>{
 const f=fixture();f.db.prepare("INSERT INTO customers(jodoo_customer_id,name) VALUES('NO-TASK','Credit Company')").run()
 const o=purchaseBackfillOptions(date,admin,f.db);assert.equal(o.customers.length,3);assert.equal(o.customers.filter(c=>c.name==='Credit Company').length,2);assert.equal(o.stops.length,1);assert.equal(o.stops[0].customerId,2)
 f.db.prepare("UPDATE customers SET name='Renamed Company' WHERE id=3").run();assert.equal(purchaseBackfillOptions(date,admin,f.db).customers.find(c=>c.id===3).name,'Renamed Company');f.db.close()
})
