import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {DatabaseSync} from 'node:sqlite'
import {schemaSql} from '../server/schema.mjs'
import {changeBranchArea,customerWorkspace,saveCustomerWorkspace,confirmCustomerSchedule} from '../server/customerWorkspaceService.mjs'
import {kuchingDate} from '../shared/kuchingTime.js'
const owner={id:1,role:'owner_admin',employeeName:'KC'},office={id:2,role:'office',employeeName:'Office'}
function fixture(){const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON;'+schemaSql);return db}
const payload=()=>({requestId:randomUUID(),reason:'New customer setup',customer:{customerName:'New customer',defaultPaymentType:'Cash'},branch:{branchName:'New branch',address:'Road 1'},schedule:{frequency:'On Call',weekdays:[],routeNumber:'',effectiveDate:kuchingDate()},gps:{latitude:1.5,longitude:110.3,locationSource:'map_selection'}})
test('one save atomically creates customer, branch, official first GPS and schedule; replay creates nothing',()=>{const db=fixture(),p=payload(),r=saveCustomerWorkspace(p,owner,db);assert.equal(r.branch.officialLatitude,1.5);assert.equal(r.pending.length,0);assert.equal(r.schedule.frequency,'On Call');assert.equal(db.prepare('SELECT COUNT(*) n FROM customers').get().n,1);assert.equal(JSON.stringify(saveCustomerWorkspace(p,owner,db)),JSON.stringify(r));assert.equal(db.prepare('SELECT COUNT(*) n FROM branches').get().n,1);assert.throws(()=>saveCustomerWorkspace({...p,reason:'changed'},owner,db),/already used/);db.close()})
test('invalid schedule rolls back every master write; office cannot bypass pricing and driver cannot enter',()=>{const db=fixture();assert.throws(()=>saveCustomerWorkspace({...payload(),schedule:{frequency:'Once a week',weekdays:[],effectiveDate:kuchingDate()}},owner,db),/exactly/);assert.equal(db.prepare('SELECT COUNT(*) n FROM customers').get().n,0);assert.throws(()=>saveCustomerWorkspace({...payload(),customer:{customerName:'X',materialPricing:[]}},office,db),/Pricing permission/);assert.throws(()=>saveCustomerWorkspace(payload(),{id:3,role:'driver'},db),/permission/);assert.equal(db.prepare('SELECT COUNT(*) n FROM customers').get().n,0);db.close()})
test('existing records require a revision and owner GPS edits apply directly',()=>{const db=fixture(),r=saveCustomerWorkspace(payload(),owner,db);const p={...payload(),branchId:r.branch.branchId,customerId:r.customer.customerId,revision:r.revision,gps:null,customer:{customerName:'Renamed'}};const next=saveCustomerWorkspace(p,owner,db);assert.equal(next.customer.customerName,'Renamed');assert.equal(next.branch.branchId,r.branch.branchId);assert.throws(()=>saveCustomerWorkspace({...p,requestId:randomUUID()},owner,db),/Reload/);db.prepare('UPDATE branches SET latitude=1.4,longitude=110.2 WHERE id=?').run(r.branch.internalId);const fresh=customerWorkspace({branchId:r.branch.branchId},owner,db);const pending=saveCustomerWorkspace({...p,requestId:randomUUID(),revision:fresh.revision,gps:{latitude:1,longitude:110}},owner,db);assert.equal(pending.pending.length,0);assert.equal(db.prepare('SELECT latitude FROM branches').get().latitude,1);assert.throws(()=>confirmCustomerSchedule({branchId:r.branch.branchId,date:kuchingDate(),reason:'confirm'},office,db),/Supervisor/);db.close()})
test('weekly customer is added to the current planning window without duplicate stops',()=>{const db=fixture();const seed=saveCustomerWorkspace(payload(),owner,db);db.exec("INSERT INTO weekly_route_plans(name,source_name,created_by) VALUES('Current','Test','KC');INSERT INTO weekly_route_definitions(plan_id,route_number,display_name) VALUES(1,1,'Route A');INSERT INTO weekly_route_plan_stops(plan_id,weekday,branch_id,vehicle_registration_number,trip_number,stop_sequence,route_number) VALUES(1,1,1,'ABC123',1,1,1)");const p=payload(),today=kuchingDate(),weekday=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Kuching',weekday:'long'}).format(new Date());p.schedule={frequency:'Once a week',weekdays:[weekday],routeNumber:1,effectiveDate:today,anchorDate:today};const r=saveCustomerWorkspace(p,owner,db);assert.ok(db.prepare("SELECT COUNT(*) n FROM dispatch_stops WHERE branch_id=? AND service_date=? AND status<>'cancelled'").get(r.branch.internalId,today).n===1);saveCustomerWorkspace(p,owner,db);assert.equal(db.prepare("SELECT COUNT(*) n FROM dispatch_stops WHERE branch_id=? AND service_date=? AND status<>'cancelled'").get(r.branch.internalId,today).n,1);db.close()})
test('management save directly adds a new branch to an approved day and leaves other branches untouched',()=>{
 const db=fixture();saveCustomerWorkspace(payload(),owner,db);db.exec("INSERT INTO weekly_route_plans(name,source_name,created_by) VALUES('Current','Test','KC');INSERT INTO weekly_route_definitions(plan_id,route_number,display_name) VALUES(1,1,'Route A');INSERT INTO weekly_route_plan_stops(plan_id,weekday,branch_id,vehicle_registration_number,trip_number,stop_sequence,route_number) VALUES(1,1,1,'ABC123',1,1,1)")
 const today=kuchingDate(),weekday=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Kuching',weekday:'long'}).format(new Date()),schedule={frequency:'Once a week',weekdays:[weekday],routeNumber:1,effectiveDate:today,anchorDate:today}
 const first=saveCustomerWorkspace({...payload(),schedule},owner,db)
 db.prepare("UPDATE dispatch_days SET status='approved' WHERE dispatch_date=?").run(today)
 const before=JSON.stringify(db.prepare('SELECT * FROM dispatch_stops WHERE branch_id=?').all(first.branch.internalId))
 const second=saveCustomerWorkspace({...payload(),schedule},owner,db),missing=second.review.find(r=>r.kind==='missing'&&r.date===today)
 assert.equal(missing,undefined)
 assert.equal(db.prepare('SELECT COUNT(*) n FROM dispatch_stops WHERE branch_id=? AND service_date=?').get(second.branch.internalId,today).n,1)
 assert.equal(JSON.stringify(db.prepare('SELECT * FROM dispatch_stops WHERE branch_id=?').all(first.branch.internalId)),before)
 db.close()
})

test('pausing or closing a customer does not require or rewrite its existing collection schedule',()=>{
 for(const status of ['paused','closed']){const db=fixture(),r=saveCustomerWorkspace(payload(),owner,db);db.exec("UPDATE branch_schedules SET effective_date=NULL");const before=JSON.stringify(db.prepare('SELECT * FROM branch_schedules').all()),fresh=customerWorkspace({branchId:r.branch.branchId},owner,db);
 const result=saveCustomerWorkspace({requestId:randomUUID(),reason:'Duplicate customer',branchId:r.branch.branchId,revision:fresh.revision,customer:{status},branch:{branchName:r.branch.branchName},schedule:{frequency:'Once a week',weekdays:[],effectiveDate:''}},owner,db);
 assert.equal(result.customer.status,status);assert.equal(JSON.stringify(db.prepare('SELECT * FROM branch_schedules').all()),before);assert.deepEqual(result.review,[]);db.close()}
})

test('branch area edit is scoped, audited and rejects stale data or inactive areas',()=>{
 const db=fixture(),seed=saveCustomerWorkspace(payload(),owner,db)
 db.exec("INSERT INTO areas(jodoo_area_id,name,is_active) VALUES('A1','Area One',1),('A2','Inactive',0)")
 const before=customerWorkspace({branchId:seed.branch.branchId},office,db),schedules=JSON.stringify(db.prepare('SELECT * FROM branch_schedules').all())
 const p={branchId:before.branch.branchId,revision:before.revision,areaId:'A1',zoneId:before.areas.find(a=>a.areaId==='A1').zoneId,reason:'Correct area'}
 assert.throws(()=>changeBranchArea(p,{role:'driver'},db),/permission/)
 assert.throws(()=>changeBranchArea({...p,areaId:'A2'},office,db),/Area/)
 const result=changeBranchArea(p,office,db)
 assert.equal(result.branch.areaId,'A1');assert.equal(result.branch.branchName,before.branch.branchName)
 assert.equal(result.branch.officialLatitude,before.branch.officialLatitude)
 assert.equal(JSON.stringify(db.prepare('SELECT * FROM branch_schedules').all()),schedules)
 assert.ok(db.prepare("SELECT 1 FROM master_change_history WHERE reason='Correct area' AND changed_by='Office'").get())
 assert.throws(()=>changeBranchArea(p,office,db),/Reload/)
 db.close()
})

test('branch pause/closure is independent, audited, preserves schedules and can be restored',()=>{
 for(const lifecycleStatus of ['TEMPORARILY_PAUSED','CLOSED']){
  const db=fixture(),seed=saveCustomerWorkspace(payload(),owner,db)
  const sibling=saveCustomerWorkspace({...payload(),customerId:seed.customer.customerId,revision:customerWorkspace({customerId:seed.customer.customerId},owner,db).revision,gps:null},owner,db)
  const fresh=customerWorkspace({branchId:seed.branch.branchId},owner,db),schedules=JSON.stringify(db.prepare('SELECT * FROM branch_schedules').all())
  const p={requestId:randomUUID(),branchId:seed.branch.branchId,revision:fresh.revision,reason:'Branch only',customer:{status:'active'},branch:{lifecycleStatus},schedule:{frequency:'Once a week',weekdays:[],effectiveDate:''}}
  const saved=saveCustomerWorkspace(p,office,db)
  assert.equal(saved.branch.lifecycleStatus,lifecycleStatus);assert.equal(saved.customer.status,'active')
  assert.equal(saved.schedule.frequency,'On Call')
  assert.equal(customerWorkspace({branchId:sibling.branch.branchId},owner,db).branch.lifecycleStatus,'ACTIVE')
  assert.equal(JSON.stringify(db.prepare('SELECT * FROM branch_schedules').all()),schedules)
  assert.equal(db.prepare('SELECT is_active FROM branches WHERE id=?').get(seed.branch.internalId).is_active,0)
  assert.ok(db.prepare("SELECT 1 FROM master_change_history WHERE entity_id=? AND change_type='lifecycle_status_changed' AND reason='Branch only'").get(seed.branch.branchId))
  const restored=saveCustomerWorkspace({...p,requestId:randomUUID(),revision:saved.revision,branch:{lifecycleStatus:'ACTIVE'},schedule:null},office,db)
  assert.equal(restored.branch.lifecycleStatus,'ACTIVE');assert.equal(restored.schedule.frequency,'On Call')
  assert.equal(JSON.stringify(db.prepare('SELECT * FROM branch_schedules').all()),schedules)
  assert.throws(()=>saveCustomerWorkspace({...p,requestId:randomUUID(),revision:restored.revision,branch:{lifecycleStatus:'DUPLICATE_REPLACED'}},office,db),/Invalid Branch/)
  db.close()
 }
})

test('direct GPS role boundary ignores payload privileges, preserves audit and retires stale suggestions',async()=>{
 const {captureBranchGps}=await import('../server/customerMasterService.mjs')
 for(const role of ['supervisor','operations_admin','owner_admin','office','driver','crew']){
  const db=fixture();try{
   const r=saveCustomerWorkspace(payload(),owner,db),id=r.branch.branchId
   const changed=captureBranchGps(id,{latitude:1.6,longitude:110.4,remark:'Correct location',capturedBy:'Tester',direct:true,role:'owner_admin'},db,{role})
   const direct=['supervisor','operations_admin','owner_admin'].includes(role)
   assert.equal(db.prepare('SELECT latitude FROM branches').get().latitude,direct?1.6:1.5)
   assert.equal(changed.verification_status,direct?'adopted':'pending_supervisor')
   if(!direct){captureBranchGps(id,{latitude:1.7,longitude:110.5,remark:'Supervisor correction',capturedBy:'KC'},db,owner);assert.equal(db.prepare("SELECT COUNT(*) n FROM temporary_locations WHERE verification_status='pending_supervisor'").get().n,0)}
   const audit=db.prepare("SELECT before_json,after_json FROM master_change_history WHERE change_type='official_gps_direct_changed' ORDER BY id DESC LIMIT 1").get();assert.equal(JSON.parse(audit.before_json).latitude,1.5);assert.ok(JSON.parse(audit.after_json).latitude>1.5)
  }finally{db.close()}
 }
})

test('GPS-only saves preserve approved dispatch and schedules even when the old UI submits the unchanged schedule',()=>{
 for(const role of ['supervisor','operations_admin','owner_admin']){
 const db=fixture(),actor={...owner,role};saveCustomerWorkspace(payload(),actor,db)
 db.exec("INSERT INTO weekly_route_plans(name,source_name,created_by) VALUES('Current','Test','KC');INSERT INTO weekly_route_definitions(plan_id,route_number,display_name) VALUES(1,1,'Route A');INSERT INTO weekly_route_plan_stops(plan_id,weekday,branch_id,vehicle_registration_number,trip_number,stop_sequence,route_number) VALUES(1,1,1,'ABC123',1,1,1)")
 const today=kuchingDate(),weekday=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Kuching',weekday:'long'}).format(new Date())
 const r=saveCustomerWorkspace({...payload(),schedule:{frequency:'Once a week',weekdays:[weekday],routeNumber:1,effectiveDate:today,anchorDate:today}},actor,db)
 db.exec("UPDATE dispatch_days SET status='approved'")
 const snapshot=()=>JSON.stringify(['dispatch_days','dispatch_stops','branch_schedules','weekly_route_plan_stops'].map(table=>db.prepare('SELECT * FROM '+table).all()))
 const before=snapshot(),fresh=customerWorkspace({branchId:r.branch.branchId},actor,db)
 const request={requestId:randomUUID(),branchId:r.branch.branchId,revision:fresh.revision,reason:'Correct shop GPS',customer:{customerName:fresh.customer.customerName},branch:{branchName:fresh.branch.branchName},schedule:{...fresh.schedule,routeNumber:fresh.schedule.homeRouteNumber||''},gps:{latitude:1.7,longitude:110.5}}
 const result=saveCustomerWorkspace(request,actor,db)
 assert.equal(result.gpsOnly,true);assert.deepEqual(result.review,[]);assert.deepEqual(result.pending,[])
 assert.equal(result.branch.officialLatitude,1.7);assert.equal(snapshot(),before)
 assert.ok(db.prepare("SELECT 1 FROM branch_gps_history WHERE reason='Correct shop GPS'").get())
 assert.equal(JSON.stringify(saveCustomerWorkspace(request,actor,db)),JSON.stringify(result))
 db.close()
 }
})
