import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import {schemaSql,SCHEMA_VERSION} from '../server/schema.mjs'
import {applyV28Migration} from '../server/migrationV28.mjs'
import {applyV44Migration} from '../server/migrationV44.mjs'
import {seedV22MasterData} from '../server/migrationV22.mjs'
import {approveDay,generateWeek,saveDraftAdjustments} from '../server/dispatchService.mjs'
import {arriveAtStop,completeDriverStop,startDriverTrip} from '../server/driverExecutionService.mjs'
import {createPurchaseBill,getPurchaseBilling,uploadPurchasePaymentProof} from '../server/purchaseBillingService.mjs'

const date='2026-09-07',now=new Date('2026-09-07T01:00:00Z'),context={employeeId:1,role:'driver',today:date,now}
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

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
  return{db,tripId,stops,productId:product.id}
}
const arrive=(db,id)=>arriveAtStop(id,{latitude:3.1001,longitude:101.6001,accuracy:10,captured_at:'2026-09-07T00:59:30Z'},context,db)

test('v44 migration is additive, preserves dispatch counts and is idempotent',()=>{
  const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON;'+schemaSql);db.exec('DROP TABLE purchase_payment_proofs;DROP TABLE purchase_bill_items;DROP TABLE purchase_bills;DELETE FROM schema_meta;INSERT INTO schema_meta(version) VALUES(43)')
  const first=applyV44Migration(db),second=applyV44Migration(db);assert.equal(first.schemaVersion,44);assert.deepEqual(first.before,first.after);assert.equal(second.noOp,true);assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok')
})

test('Cash requires electronic Bill and payment proof before next Stop',()=>{
  const{db,stops,productId}=fixture();arrive(db,stops[0]);assert.throws(()=>completeDriverStop(stops[0],context,db),/electronic Purchase Bill/)
  const billing=getPurchaseBilling(stops[0],context,db);assert.equal(billing.stop.paymentMethod,'Cash');assert.equal(billing.products[0].productCode,'OCC');assert.equal(billing.products[0].currentPrice,0.2)
  const created=createPurchaseBill(stops[0],{weightMethod:'on_site',printChoice:'print',items:[{productId,quantity:61.6}]},context,db);assert.equal(created.totalCents,1232);assert.match(created.billNumber,/^P20260907-/);assert.equal(created.printChoice,'print')
  assert.throws(()=>completeDriverStop(stops[0],context,db),/payment proof/)
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'kcs-pay-'));const proof=uploadPurchasePaymentProof(stops[0],{photo:{name:'bank.png',dataUrl:png}},context,db,{uploadsRoot:root});assert.equal(proof.idempotent,false);assert.equal(uploadPurchasePaymentProof(stops[0],{photo:{name:'again.png',dataUrl:png}},context,db,{uploadsRoot:root}).idempotent,true)
  assert.equal(completeDriverStop(stops[0],context,db).nextStopId,stops[1]);assert.equal(db.prepare('SELECT payment_status FROM dispatch_stops WHERE id=?').get(stops[0]).payment_status,'verified_for_route');fs.rmSync(root,{recursive:true,force:true})
})

test('Credit always saves an electronic Bill but permits Print or No Print and needs no proof',()=>{
  const{db,stops,productId}=fixture();arrive(db,stops[0]);const root=fs.mkdtempSync(path.join(os.tmpdir(),'kcs-pay-'));createPurchaseBill(stops[0],{weightMethod:'on_site',printChoice:'print',items:[{productId,quantity:1}]},context,db);uploadPurchasePaymentProof(stops[0],{photo:{name:'cash.png',dataUrl:png}},context,db,{uploadsRoot:root});completeDriverStop(stops[0],context,db)
  arrive(db,stops[1]);const created=createPurchaseBill(stops[1],{weightMethod:'factory',printChoice:'no_print',items:[{productId,quantity:50}]},context,db);assert.equal(created.paymentMethod,'Credit');assert.equal(created.printChoice,'no_print');assert.equal(completeDriverStop(stops[1],context,db).status,'completed');assert.equal(db.prepare('SELECT COUNT(*) n FROM purchase_payment_proofs').get().n,1);fs.rmSync(root,{recursive:true,force:true})
})

test('electronic Bill stores immutable price snapshots and duplicate submission is idempotent',()=>{
  const{db,stops,productId}=fixture();arrive(db,stops[0]);const first=createPurchaseBill(stops[0],{weightMethod:'estimated',printChoice:'no_print',items:[{productId,quantity:10}]},context,db);db.prepare('UPDATE material_price_levels SET price_amount=0.30 WHERE product_id=?').run(productId);const second=createPurchaseBill(stops[0],{weightMethod:'estimated',printChoice:'no_print',items:[{productId,quantity:99}]},context,db);assert.equal(second.idempotent,true);assert.equal(second.totalCents,first.totalCents);assert.equal(second.items[0].unitPriceCents,20);assert.equal(SCHEMA_VERSION,44)
})

test('driver Purchase Bill UI stays English-only, shows only the Branch name and can remove an unsubmitted Item',()=>{const source=fs.readFileSync(new URL('../src/AuthPages.jsx',import.meta.url),'utf8'),css=fs.readFileSync(new URL('../src/App.css',import.meta.url),'utf8'),start=source.indexOf('function PurchaseReceipt'),end=source.indexOf('const stopMapUrl'),billing=source.slice(start,end);assert.match(billing,/<p>PURCHASE<\/p>/);assert.match(billing,/translate="no"/);assert.match(billing,/notranslate/);assert.match(billing,/receipt-total-label/);assert.match(billing,/PaymentMethodLabel/);assert.match(css,/receipt-total-label::before\{content:"Total"\}/);assert.match(css,/payment-method-label\.payment-cash::before\{content:"Cash"\}/);assert.match(css,/payment-method-label\.payment-credit::before\{content:"Credit"\}/);assert.match(billing,/const removeItem=/);assert.match(billing,/className="bill-item-remove"/);assert.match(billing,/>Remove<\/button>/);assert.match(billing,/Paper option/);assert.doesNotMatch(billing,/Company:|Branch ID:|ELECTRONIC PURCHASE BILL/);assert.doesNotMatch(billing,/purchase\./);assert.doesNotMatch(billing,/weightMethod,setWeightMethod|How weight was determined|重量取得方式/);assert.match(billing,/weightMethod:'on_site'/)})
