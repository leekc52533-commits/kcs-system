import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {mkdtempSync,readFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {schemaSql} from '../server/schema.mjs'
import {applyV28Migration} from '../server/migrationV28.mjs'
import {approveDay,driverTomorrow,generateWeek,saveDraftAdjustments} from '../server/dispatchService.mjs'
import {arriveAtStop,completeDriverStop,completeDriverTrip,deferDriverStop,recordNoGoods,startDriverTrip} from '../server/driverExecutionService.mjs'
import {createPurchaseBill,getPurchaseBilling,uploadPurchasePaymentProof} from '../server/purchaseBillingService.mjs'

const tomorrow='2026-07-20'
const serverNow=new Date('2026-07-19T15:59:59.000Z') // 23:59:59 Sunday in Asia/Kuching
function fixture(){
  const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON;'+schemaSql);applyV28Migration(db)
  db.prepare("INSERT INTO areas(jodoo_area_id,name) VALUES('A1','North')").run()
  db.prepare("INSERT INTO customers(jodoo_customer_id,name) VALUES('C1','Alpha')").run()
  db.prepare("INSERT INTO branches(jodoo_branch_id,customer_id,area_id,branch_name,address,latitude,longitude,time_restriction) VALUES('B1',1,1,'Alpha One','One Road',3.1,101.6,'Before noon')").run()
  db.prepare("INSERT INTO branch_schedules(jodoo_schedule_id,branch_id,source_branch_id,frequency,days_of_week) VALUES('S1',1,'B1','Weekly','Monday')").run()
  db.prepare("INSERT INTO vehicles(vehicle_code,vehicle_name,registration_number,status,operational_status) VALUES('V1','Main Lorry','ABC1','available','active'),('V2','Other Lorry','ABC2','available','active')").run()
  db.prepare("INSERT INTO employees(employee_code,name,job_role,employment_status,is_active) VALUES('D1','Driver One','Driver','active',1),('D2','Driver Two','Driver','active',1),('C1','Crew One','Crew','active',1)").run()
  generateWeek({startDate:tomorrow},db)
  const stop=db.prepare('SELECT id FROM dispatch_stops WHERE service_date=?').get(tomorrow)
  saveDraftAdjustments({adjustments:[{stopId:stop.id,vehicleId:1,tripNumber:1}],reason:'Assign tomorrow',changedBy:'Planner'},db)
  db.prepare('UPDATE dispatches SET driver_id=1 WHERE vehicle_id=1').run()
  db.prepare('INSERT INTO dispatch_vehicle_assistants(dispatch_day_id,vehicle_id,employee_id) SELECT id,1,3 FROM dispatch_days WHERE dispatch_date=?').run(tomorrow)
  return db
}
const context={employeeId:1,role:'driver',today:'2026-07-19',now:new Date('2026-07-19T15:58:00.000Z')}
const ids=db=>({tripId:db.prepare('SELECT dt.id FROM dispatch_trips dt JOIN dispatch_days dd ON dd.id=dt.dispatch_day_id WHERE dd.dispatch_date=? AND EXISTS(SELECT 1 FROM dispatch_stops ds WHERE ds.dispatch_trip_id=dt.id)').get(tomorrow).id,stopId:db.prepare('SELECT id FROM dispatch_stops WHERE service_date=?').get(tomorrow).id})

test('server-derived Asia/Kuching tomorrow exposes only approved assigned routes to driver and crew',()=>{const db=fixture();approveDay(tomorrow,{approvedBy:'Supervisor',reason:'Ready'},db);for(const [employeeId,role] of [[1,'driver'],[3,'crew']]){const route=driverTomorrow({employeeId,role,now:serverNow,date:'2099-01-01'},db);assert.equal(route.date,tomorrow);assert.equal(route.preview,true);assert.equal(route.totalStops,1);assert.equal(route.trips[0].vehicleCode,'V1');assert.equal(route.trips[0].stops[0].timeRestriction,'Before noon')}})
test('tomorrow draft and unassigned routes return safe empty states',()=>{const db=fixture();assert.equal(driverTomorrow({employeeId:1,role:'driver',now:serverNow},db).reason,'NO_APPROVED_ROUTE');approveDay(tomorrow,{approvedBy:'Supervisor',reason:'Ready'},db);assert.equal(driverTomorrow({employeeId:2,role:'driver',now:serverNow},db).reason,'NO_VEHICLE_ASSIGNED')})
test('tomorrow route isolates other vehicles and ignores arbitrary client date fields',()=>{const db=fixture();approveDay(tomorrow,{approvedBy:'Supervisor',reason:'Ready'},db);db.prepare('UPDATE dispatches SET driver_id=2 WHERE vehicle_id=2').run();const route=driverTomorrow({employeeId:1,role:'driver',now:serverNow,date:'2026-07-22',today:'2026-07-22'},db);assert.deepEqual(route.vehicles.map(vehicle=>vehicle.vehicleCode),['V1']);assert.equal(route.date,tomorrow)})
test('Asia/Kuching midnight changes the server-derived tomorrow date',()=>{const db=fixture();approveDay(tomorrow,{approvedBy:'Supervisor',reason:'Ready'},db);assert.equal(driverTomorrow({employeeId:1,role:'driver',now:new Date('2026-07-19T15:59:59Z')},db).date,'2026-07-20');assert.equal(driverTomorrow({employeeId:1,role:'driver',now:new Date('2026-07-19T16:00:00Z')},db).date,'2026-07-21')})
test('all driver execution and billing mutations reject tomorrow resources',()=>{const db=fixture();approveDay(tomorrow,{approvedBy:'Supervisor',reason:'Ready'},db);const{tripId,stopId}=ids(db),gps={latitude:3.1,longitude:101.6,accuracy:10,captured_at:serverNow.toISOString()},photo={name:'proof.png',dataUrl:'data:image/png;base64,iVBORw0KGgo='},uploadsRoot=mkdtempSync(join(tmpdir(),'kcs-tomorrow-'));const denied=[()=>startDriverTrip(tripId,context,db),()=>arriveAtStop(stopId,gps,context,db),()=>deferDriverStop(stopId,{reason:'other',expectedReturnTime:'23:59'},context,db),()=>getPurchaseBilling(stopId,context,db),()=>createPurchaseBill(stopId,{weightMethod:'estimated',printChoice:'no_print',items:[{productId:1,quantity:1}]},context,db),()=>uploadPurchasePaymentProof(stopId,{photo},context,db,{uploadsRoot}),()=>completeDriverStop(stopId,context,db),()=>recordNoGoods(stopId,{reason:'none',photo},context,db,{uploadsRoot}),()=>completeDriverTrip(tripId,context,db)];for(const action of denied)assert.throws(action,error=>error.code==='PERMISSION_DENIED')})

test('mobile UI defaults to today, has localized day choices, and makes tomorrow a separate read-only preview',()=>{const ui=readFileSync(new URL('../src/AuthPages.jsx',import.meta.url),'utf8'),translations=readFileSync(new URL('../src/translations.js',import.meta.url),'utf8'),server=readFileSync(new URL('../server/index.mjs',import.meta.url),'utf8');assert.match(ui,/routeDay,setRouteDay\]=useState\('today'\)/);assert.match(ui,/api\('\/api\/mobile\/tomorrow'\)/);assert.match(ui,/key=\{routeDay\}/);assert.match(ui,/preview=\{routeDay==='tomorrow'\}/);assert.match(ui,/!preview&&trip\.canStart/);assert.match(ui,/!preview&&stop\.canArrive/);assert.match(ui,/!preview&&stop\.canFinish&&<PurchaseBillPanel/);assert.match(ui,/!preview&&stop\.canFinish&&<div className="driver-no-goods"/);assert.match(ui,/setInterval\(\(\)=>refresh\(\)\.catch\(\(\)=>\{\}\),10000\)/);assert.match(ui,/expectedReturnTime/);for(const text of ['Today','Hari Ini','今天','Tomorrow','Esok','明天'])assert.ok(translations.includes(`'${text}'`));assert.match(server,/url\.pathname === '\/api\/mobile\/tomorrow'/);assert.doesNotMatch(server,/mobile\/tomorrow.*searchParams/)})
