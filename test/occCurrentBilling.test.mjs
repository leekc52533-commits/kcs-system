import {ensureV24Tables} from '../server/migrationV24.mjs'
import {ensureOccCurrentPrices,currentOccGroups,changeCurrentOccPrice} from '../server/occCurrentPrices.mjs'
import {kuchingDate} from '../shared/kuchingTime.js'
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
import {approveDay,generateWeek,saveDraftAdjustments,handoverRoute,getDispatchDay,driverToday} from '../server/dispatchService.mjs'
import {mobileWeightContext} from '../server/unloadingWeightService.mjs'
import {arriveAtStop,completeDriverStop,startDriverTrip} from '../server/driverExecutionService.mjs'
import {createPurchaseBill,getPurchaseBilling,uploadPurchasePaymentProof} from '../server/purchaseBillingService.mjs'
import {configureCashFloat,mobileCashFloat} from '../server/cashFloatService.mjs'

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

test('OCC group change affects a new purchase bill but preserves the issued bill snapshot',()=>{
 const{db,stops,productId}=fixture()
 try{
 ensureV24Tables(db);ensureOccCurrentPrices(db)
 arrive(db,stops[0])
 const first=createPurchaseBill(stops[0],{weightMethod:'on_site',printChoice:'no_print',items:[{productId,quantity:10}]},context,db)
 const snapshot=JSON.stringify(db.prepare('SELECT * FROM purchase_bill_items WHERE purchase_bill_id=?').all(first.id))
 const today=kuchingDate(),group=currentOccGroups(db,today).groups.find(g=>g.members.length)
 changeCurrentOccPrice(db,group.id,{price:.25,effectiveDate:today,reason:'New group price',version:group.version,changedBy:'KC'},today)
 db.prepare("UPDATE dispatch_stops SET status='completed',completion_outcome='completed' WHERE id=?").run(stops[0])
 arrive(db,stops[1])
 const second=createPurchaseBill(stops[1],{weightMethod:'on_site',printChoice:'no_print',items:[{productId,quantity:10}]},context,db)
 assert.equal(first.items[0].unitPrice,.20);assert.equal(second.items[0].unitPrice,.25)
 assert.equal(JSON.stringify(db.prepare('SELECT * FROM purchase_bill_items WHERE purchase_bill_id=?').all(first.id)),snapshot)
 }finally{db.close()}
})
