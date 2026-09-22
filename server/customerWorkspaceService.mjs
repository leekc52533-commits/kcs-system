import {applyBranchLifecycle} from './branchLifecycleService.mjs'
import {activeLocationAreas,previewCustomerLocation,validateLocationCheck,saveLocationCheck,pendingLocationChecks,decideCustomerLocation} from './customerLocationCheck.mjs'
import {createHash} from 'node:crypto'
import {db as defaultDb} from './database.mjs'
import {createCustomer,updateCustomer,getCustomer,createBranch,updateBranchWithLifecycle,getBranch,captureBranchGps,listGpsCollector} from './customerMasterService.mjs'
import {getCollectionScheduleManagement,saveCollectionScheduleManagement} from './collectionScheduleManagementService.mjs'
import {reconcileScheduleWindow,generateWeek} from './dispatchService.mjs'
import {accountCan} from './authService.mjs'
import {kuchingDate} from '../shared/kuchingTime.js'
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex')
const fail=(message,statusCode=400)=>Object.assign(new Error(message),{statusCode})
const pick=(value,keys)=>Object.fromEntries(keys.filter(k=>Object.hasOwn(value||{},k)).map(k=>[k,value[k]]))
const customerFields=['customerName','legalName','registrationNumber','billingAddress','contactPerson','phone','whatsapp','email','defaultPaymentType','creditTerms','status','notes','materialPricing','removedMaterialIds','pricingConfirmed']
const branchFields=['branchName','address','areaId','contactPerson','phone','paymentType','collectionTimeConstraint','proofRequirements','vehicleRestriction','notes']
export function canUseCustomerWorkspace(actor){return ['owner_admin','operations_admin','supervisor','office'].includes(actor?.role)}
function assertActor(actor){if(!canUseCustomerWorkspace(actor))throw fail('Customer management permission required.',403)}
function findBranch(id,db){const raw=String(id||'');return getBranch(raw,db)||getBranch(raw.replace(/^B/i,''),db)||getBranch('B'+raw.replace(/^B/i,''),db)}
export function customerWorkspace({branchId,customerId}={},actor={},db=defaultDb){
 assertActor(actor)
 const branch=branchId?findBranch(branchId,db):null
 if(branchId&&!branch)throw fail('Branch not found.',404)
 const customer=(branch?.customerId||customerId)?getCustomer(branch?.customerId||customerId,db):null
 if(customerId&&!customer)throw fail('Customer not found.',404)
 const schedule=branch?getCollectionScheduleManagement(branch.branchId,db,{includeInactive:true}):null
 const pending=branch?listGpsCollector({branchId:branch.internalId},db):[]
 const routeOptions=db.prepare('SELECT d.route_number routeNumber,d.display_name name FROM weekly_route_definitions d JOIN weekly_route_plans p ON p.id=d.plan_id WHERE p.is_active=1 ORDER BY d.route_number').all()
 const areas=activeLocationAreas(db),locationReviews=branch?pendingLocationChecks(branch.internalId,db):[]
 return {customer,branch,schedule,pending,routeOptions,areas,locationReviews,canConfirmSchedule:['owner_admin','operations_admin','supervisor'].includes(actor.role),canManagePricing:accountCan(actor,'price_manage',db),canCaptureGps:accountCan(actor,'gps_capture',db),canReviewGps:accountCan(actor,'gps_review',db),revision:hash({customer,branch,schedule,pending,locationReviews})}
}
export function saveCustomerWorkspace(payload,actor={},db=defaultDb){
 assertActor(actor)
 if(!/^[a-zA-Z0-9-]{16,80}$/.test(payload.requestId||''))throw fail('A valid request ID is required.')
 const reason=String(payload.reason||'').trim();if(!reason)throw fail('Reason is required.')
 const signature=hash(payload),actorId=String(actor.id),key=actorId+':'+payload.requestId
 db.exec('BEGIN IMMEDIATE')
 try{
  const previous=db.prepare("SELECT after_json FROM audit_logs WHERE action='customer_workspace_saved' AND entity_id=? ORDER BY id DESC LIMIT 1").get(key)
  if(previous){const saved=JSON.parse(previous.after_json);if(saved.signature!==signature)throw fail('Request ID already used with different data.',409);db.exec('COMMIT');return saved.result}
  const before=customerWorkspace(payload,actor,db)
  if((payload.branchId||payload.customerId)&&before.revision!==payload.revision)throw fail('Customer data changed. Reload before saving.',409)
  const locationProof=validateLocationCheck(payload,before,actor)
  const changedBy=actor.employeeName||actor.username||`Account ${actor.id}`
  const c={...pick(payload.customer,customerFields),reason,changedBy}
  if((Object.hasOwn(c,'materialPricing')||Object.hasOwn(c,'removedMaterialIds'))&&!accountCan(actor,'price_manage',db))throw fail('Pricing permission required.',403)
  // Coordinates retain their review workflow; branch status is independently audited.
  const customer=before.customer?updateCustomer(before.customer.customerId,c,db):createCustomer(c,db)
  const bp={...pick(payload.branch,branchFields),customerId:customer.customerId,reason,changedBy}
  let branch=before.branch?updateBranchWithLifecycle(before.branch.branchId,bp,{changedBy,accountId:actor.id},db):createBranch(bp,db)
  const requestedStatus=payload.branch?.lifecycleStatus
  if(requestedStatus!==undefined&&requestedStatus!==(branch.lifecycleStatus||'ACTIVE')){
   if(!['ACTIVE','TEMPORARILY_PAUSED','CLOSED'].includes(requestedStatus)||!['ACTIVE','TEMPORARILY_PAUSED','CLOSED'].includes(branch.lifecycleStatus||'ACTIVE'))throw fail('Invalid Branch lifecycle status')
   applyBranchLifecycle(branch.branchId,{lifecycleStatus:requestedStatus,reason},{changedBy,accountId:actor.id},db)
   branch=getBranch(branch.branchId,db)
  }
  if(payload.schedule&&branch.lifecycleStatus==='ACTIVE'&&!['paused','closed'].includes(customer.status)){
   const current=getCollectionScheduleManagement(branch.branchId,db)
   if(!current)throw fail('Only active branches can change collection schedules.',409)
   saveCollectionScheduleManagement(branch.branchId,{...pick(payload.schedule,['frequency','weekdays','anchorDate','effectiveDate','monthlyOccurrence','routeNumber','sundayRouteNumber']),routeNumber:payload.schedule.routeNumber||undefined,reason,changedBy,sundayAuthorized:true,expectedUpdatedAt:current.updatedAt},db,{supervisorConfirmed:true})
  }
  if(payload.gps){
   if(!accountCan(actor,'gps_capture',db))throw fail('GPS capture permission required.',403)
   captureBranchGps(branch.branchId,{...pick(payload.gps,['latitude','longitude','accuracyM','capturedLatitude','capturedLongitude','capturedAccuracyM','deviceCapturedAt','manuallyAdjusted','adjustmentReason','address','state','street','city','streetNumber','postalCode','reverseGeocodeProvider','locationSource']),remark:reason,capturedBy:changedBy,changedBy,employeeId:actor.employeeId},db)
  }
  saveLocationCheck(payload,locationProof,getBranch(branch.branchId,db),actor,db)
  let review=[]
  if(payload.schedule&&branch.lifecycleStatus==='ACTIVE'&&!['paused','closed'].includes(customer.status)){
   if(db.prepare('SELECT 1 FROM weekly_route_plans WHERE is_active=1').get())generateWeek({startDate:kuchingDate(),count:7,onlyMissing:true,generatedBy:changedBy},db)
   review=reconcileScheduleWindow({branchIds:[branch.internalId],changedBy},db).map(r=>({...r,expectedRevision:db.prepare('SELECT revision FROM dispatch_days WHERE dispatch_date=?').get(r.date)?.revision}))
  }
  const result={...customerWorkspace({branchId:branch.branchId},actor,db),review}
  db.prepare("INSERT INTO audit_logs(action,entity_type,entity_id,before_json,after_json) VALUES('customer_workspace_saved','branch',?,?,?)").run(key,JSON.stringify({branchId:before.branch?.branchId,revision:before.revision}),JSON.stringify({signature,result}))
  db.exec('COMMIT');return result
 }catch(error){db.exec('ROLLBACK');throw error}
}

export function confirmCustomerSchedule(payload,actor={},db=defaultDb){
 if(!['owner_admin','operations_admin','supervisor'].includes(actor.role))throw fail('Supervisor permission required.',403)
 const date=String(payload.date||''),today=kuchingDate(),end=new Date(today+'T00:00:00Z');end.setUTCDate(end.getUTCDate()+6)
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date<today||date>end.toISOString().slice(0,10)||!String(payload.reason||'').trim())throw fail('Valid date within seven days and reason required.')
 const b=findBranch(payload.branchId,db);if(!b)throw fail('Branch not found.',404)
 db.exec('BEGIN IMMEDIATE')
 try{const review=reconcileScheduleWindow({startDate:date,confirmedDate:date,expectedRevision:payload.expectedRevision,branchIds:[b.internalId],changedBy:actor.employeeName||actor.username},db);db.prepare("INSERT INTO audit_logs(action,entity_type,entity_id,after_json) VALUES('customer_schedule_confirmed','branch',?,?)").run(String(b.internalId),JSON.stringify({date,reason:payload.reason,accountId:actor.id,review}));db.exec('COMMIT');return{review}}catch(e){db.exec('ROLLBACK');throw e}
}

export async function checkCustomerLocation(payload,actor={},db=defaultDb,options={}){
 assertActor(actor)
 const before=customerWorkspace(payload,actor,db)
 if((payload.branchId||payload.customerId)&&before.revision!==payload.revision)throw fail('Customer data changed. Reload before checking.',409)
 return previewCustomerLocation(payload,before,actor,db,options)
}
export function reviewCustomerLocation(payload,actor={},db=defaultDb){
 assertActor(actor);db.exec('BEGIN IMMEDIATE')
 try{const before=customerWorkspace(payload,actor,db);if(!before.branch)throw fail('Branch not found.',404);decideCustomerLocation(payload,before.branch,actor,db);const result=customerWorkspace(payload,actor,db);db.exec('COMMIT');return result}catch(error){db.exec('ROLLBACK');throw error}
}

export function changeBranchArea(payload,actor={},db=defaultDb){
 assertActor(actor)
 const reason=String(payload.reason||'').trim();if(!reason)throw fail('Reason is required.')
 db.exec('BEGIN IMMEDIATE')
 try{
  const before=customerWorkspace({branchId:payload.branchId},actor,db)
  if(!before.branch)throw fail('Branch not found.',404)
  if(before.revision!==payload.revision)throw fail('Customer data changed. Reload before saving.',409)
  const area=activeLocationAreas(db).find(a=>String(a.areaId)===String(payload.areaId))
  if(!area||area.zoneId!==payload.zoneId)throw fail('Area or parent Zone changed. Check again.',409)
  const changedBy=actor.employeeName||actor.username||`Account ${actor.id}`
  if(String(before.branch.areaId)!==String(area.areaId))updateBranchWithLifecycle(before.branch.branchId,{areaId:area.areaId,reason},{changedBy,accountId:actor.id},db)
  const result=customerWorkspace({branchId:before.branch.branchId},actor,db)
  db.exec('COMMIT');return result
 }catch(error){db.exec('ROLLBACK');throw error}
}
