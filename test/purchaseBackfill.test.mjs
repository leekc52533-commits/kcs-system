import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {schemaSql} from '../server/schema.mjs'
import {applyV28Migration} from '../server/migrationV28.mjs'
import {seedV22MasterData} from '../server/migrationV22.mjs'
import {approveDay,generateWeek,saveDraftAdjustments} from '../server/dispatchService.mjs'
import {startDriverTrip} from '../server/driverExecutionService.mjs'
import {createBackfillPurchase,purchaseBackfillOptions} from '../server/purchaseBackfillService.mjs'
import {ensurePurchaseBackfillSchema} from '../server/purchaseBackfillSchema.mjs'
import {requestBillVoid,decideBillVoid,listBillVoids} from '../server/purchaseBillVoidService.mjs'
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

const input=f=>({serviceDate:date,customerId:2,branchId:2,driverId:1,vehicleId:1,reviewedBillIds:[],weightMethod:'factory',items:[{productId:f.productId,quantity:'35.25',unitPrice:'0.421'}],reason:'Collected, weighed at company; missed bill',confirmCollected:true,requestKey:'backfill-test-00001'})
test('standalone backfill preserves tasks and cash, uses actual service date in Statement and records audit',()=>{
 const f=fixture(),{db}=f,before=db.prepare('SELECT * FROM dispatch_stops').all(),cash=db.prepare('SELECT * FROM cash_float_transactions').all()
 const b=createBackfillPurchase({...input(f),serviceDate:'2026-09-01'},admin,db)
 assert.equal(b.totalCents,1484);assert.deepEqual(db.prepare('SELECT * FROM dispatch_stops').all(),before);assert.deepEqual(db.prepare('SELECT * FROM cash_float_transactions').all(),cash)
 const saved=db.prepare('SELECT * FROM purchase_bills WHERE id=?').get(b.id)
 assert.equal(saved.service_date,'2026-09-01');assert.equal(saved.dispatch_stop_id,null);assert.equal(saved.dispatch_trip_id,null);assert.equal(saved.dispatch_day_id,null)
 const rows=listPurchaseBillArchive({from:'2026-09-01',to:'2026-09-01',paymentMethod:'Credit',exportRange:'1'},db).items
 assert.equal(rows.length,1);assert.equal(rows[0].backfillReason,input(f).reason);assert.equal(rows[0].items[0].unitPrice,0.421);assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);db.close()
})
test('existing first bill allows a confirmed second collection; stale review and retries cannot duplicate',()=>{
 const f=fixture(),p=input(f),first=createBackfillPurchase(p,admin,f.db)
 assert.equal(createBackfillPurchase(p,admin,f.db).id,first.id)
 const next={...p,requestKey:'backfill-test-00002'}
 assert.throws(()=>createBackfillPurchase(next,admin,f.db),e=>e.code==='BACKFILL_REVIEW')
 next.reviewedBillIds=[first.id]
 assert.throws(()=>createBackfillPurchase(next,admin,f.db),e=>e.code==='BACKFILL_ADDITIONAL')
 next.additionalCollectionConfirmed=true
 const second=createBackfillPurchase(next,admin,f.db);assert.notEqual(first.id,second.id);assert.notEqual(first.billNumber,second.billNumber)
 assert.equal(createBackfillPurchase(next,admin,f.db).id,second.id)
 assert.throws(()=>createBackfillPurchase({...next,requestKey:'other-admin-000003'},admin,f.db),e=>e.code==='BACKFILL_REVIEW')
 assert.equal(listPurchaseBillArchive({from:date,to:date,exportRange:'1'},f.db).items.reduce((n,b)=>n+b.totalCents,0),2968)
 dbCheck(f.db);f.db.close()
})
function dbCheck(db){assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0)}
test('permissions, customer ownership, cash, driver/vehicle, reason and precision remain validated',()=>{
 const f=fixture(),p=input(f)
 for(const role of ['office','supervisor','driver','crew']){assert.throws(()=>purchaseBackfillOptions(date,{...admin,role},f.db),e=>e.statusCode===403);assert.throws(()=>createBackfillPurchase(p,{...admin,role},f.db),e=>e.statusCode===403)}
 for(const patch of [{customerId:1},{branchId:1},{driverId:999},{vehicleId:999},{serviceDate:'2026-02-30'},{serviceDate:'2999-01-01'},{confirmCollected:false},{reason:''},{items:[...p.items,...p.items]},{items:[{...p.items[0],quantity:'1.001'}]},{items:[{...p.items[0],unitPrice:'0.0001'}]}])assert.throws(()=>createBackfillPurchase({...p,...patch},admin,f.db))
 assert.equal(f.db.prepare('SELECT COUNT(*) n FROM purchase_bills').get().n,0)
 f.db.prepare("UPDATE auth_accounts SET system_role='office'").run();assert.throws(()=>createBackfillPurchase(p,admin,f.db),e=>e.code==='BACKFILL_ACCESS');f.db.close()
})
test('options include every company and branch even without a task, and reveal existing bills',()=>{
 const f=fixture();f.db.prepare("INSERT INTO branches(jodoo_branch_id,customer_id,branch_name,payment_type) VALUES('B3',2,'No Task Branch','Credit')").run()
 const bill=createBackfillPurchase(input(f),admin,f.db),o=purchaseBackfillOptions(date,admin,f.db)
 assert.equal(o.customers.length,2);assert.equal(o.branches.length,3);assert.ok(o.branches.some(b=>b.name==='No Task Branch'));assert.equal(o.bills[0].billNumber,bill.billNumber);assert.equal(o.bills[0].quantity,35.25);assert.equal(o.bills[0].totalCents,1484);f.db.close()
})
test('audit failure rolls back bill, items and numbering',()=>{
 const f=fixture();f.db.exec("CREATE TRIGGER fail_audit BEFORE INSERT ON purchase_backfill_audit BEGIN SELECT RAISE(ABORT,'audit unavailable'); END;")
 assert.throws(()=>createBackfillPurchase(input(f),admin,f.db),/audit unavailable/)
 for(const table of ['purchase_bills','purchase_bill_items','document_numbers'])assert.equal(f.db.prepare('SELECT COUNT(*) n FROM '+table).get().n,0);f.db.close()
})
test('standalone bills can be voided without touching a stop, and are not offered driver task reissue',()=>{
 const f=fixture(),bill=createBackfillPurchase(input(f),admin,f.db),ctx={employeeId:1,role:'owner_admin'}
 const req=requestBillVoid(bill.id,{reason:'Wrong weight'},ctx,f.db);decideBillVoid(req.id,'approved',{},ctx,f.db)
 assert.equal(f.db.prepare('SELECT status FROM purchase_bills WHERE id=?').get(bill.id).status,'voided');assert.equal(listBillVoids({},ctx,f.db).items[0].canReissue,false);dbCheck(f.db);f.db.close()
})
test('migration preserves existing bill, items, audit, indexes, sequence and foreign keys; rerun is safe',()=>{
 const f=fixture(),db=f.db
 // Reconstruct the pre-upgrade shape, then create an ordinary task-linked bill.
 db.exec('PRAGMA foreign_keys=OFF')
 const sql=db.prepare("SELECT sql FROM sqlite_master WHERE name='purchase_bills'").get().sql
 const old=sql.replace('purchase_bills','old_bills').replace(/(dispatch_(?:stop|trip|day)_id INTEGER) REFERENCES/g,'$1 NOT NULL REFERENCES')
 db.exec(old+'; DROP TABLE purchase_bills; ALTER TABLE old_bills RENAME TO purchase_bills; CREATE UNIQUE INDEX purchase_bills_issued_stop ON purchase_bills(dispatch_stop_id) WHERE status=\'issued\'; PRAGMA foreign_keys=ON;')
 const stop=db.prepare('SELECT * FROM dispatch_stops WHERE id=?').get(f.stops[1]),trip=db.prepare('SELECT * FROM dispatch_trips WHERE id=?').get(stop.dispatch_trip_id)
 db.prepare(`INSERT INTO purchase_bills(bill_number,dispatch_stop_id,dispatch_trip_id,dispatch_day_id,branch_id,customer_id,driver_employee_id,vehicle_id,service_date,customer_name_snapshot,branch_code_snapshot,branch_name_snapshot,driver_name_snapshot,vehicle_code_snapshot,payment_method,weight_method,print_choice,subtotal_cents,total_cents,issued_at) VALUES('OLD',?,?,?,2,2,1,1,?,'C','B2','B','D','V','Credit','factory','no_print',100,100,?)`).run(stop.id,trip.id,trip.dispatch_day_id,date,now.toISOString())
 db.prepare("INSERT INTO purchase_backfill_audit VALUES(1,1,'A','reason','old-key','hash','{}','now')").run()
 db.prepare("INSERT INTO purchase_bill_items(purchase_bill_id,product_id,product_code_snapshot,product_name_snapshot,quantity,unit_price_cents,line_total_cents) VALUES(1,?,'OCC','OCC',5,20,100)").run(f.productId)
 const bills=db.prepare('SELECT * FROM purchase_bills').all(),items=db.prepare('SELECT * FROM purchase_bill_items').all(),audit=db.prepare('SELECT * FROM purchase_backfill_audit').all()
 ensurePurchaseBackfillSchema(db);ensurePurchaseBackfillSchema(db)
 assert.deepEqual(db.prepare('SELECT * FROM purchase_bills').all(),bills);assert.deepEqual(db.prepare('SELECT * FROM purchase_bill_items').all(),items);assert.deepEqual(db.prepare('SELECT * FROM purchase_backfill_audit').all(),audit)
 assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE name='purchase_bills_issued_stop'").get());assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys,1)
 const b=createBackfillPurchase({...input(f),reviewedBillIds:[1],additionalCollectionConfirmed:true},admin,db);assert.ok(b.id>1);dbCheck(db);db.close()
})
