import { db as defaultDb } from './database.mjs'
import { invalidateDispatchDay } from './dispatchService.mjs'
import { addTemporaryLocation, adoptTemporaryLocation } from './specialRequestService.mjs'
import { listBranchMaterials, listCustomerMaterialPricing, normalizeCollectionSettings, saveCustomerMaterialPricing } from './materialPriceService.mjs'
import {listCustomerProductPricing} from './materialProductService.mjs'
import {assertLocationFields} from '../shared/locationText.js'
import {formatBranchId,formatBuyerBranchId,formatBuyerId,formatCustomerId,parseTypedId} from '../shared/typedIds.js'
import {applyBranchLifecycle} from './branchLifecycleService.mjs'

const text = value => String(value ?? '').trim()
const nullable = value => text(value) || null
const submittedNullable = (payload, key, existing) => Object.prototype.hasOwnProperty.call(payload, key) && payload[key] !== undefined
  ? nullable(payload[key])
  : existing
const statusValue = value => {
  const status = text(value || 'active').toLowerCase()
  if (!['active','paused','closed'].includes(status)) throw new Error('Status must be Active, Paused or Closed')
  return status
}
const paymentValue = value => {
  const payment = text(value)
  if (payment && !['Cash','Credit'].includes(payment)) throw new Error('Payment Type must be Cash or Credit')
  return payment || null
}
const json = value => value == null ? null : JSON.stringify(value)

function nextMasterId(database,table,column,type){
  const rows=database.prepare(`SELECT ${column} value FROM ${table}`).all()
  const highest=rows.reduce((max,row)=>{try{return Math.max(max,Number(parseTypedId(row.value,type))||0)}catch{return max}},0)
  const raw=String(highest+1).padStart(5,'0')
  return type==='customer'?formatCustomerId(raw):formatBranchId(raw)
}

function history(database, entityType, entityId, changeType, before, after, payload = {}) {
  database.prepare(`INSERT INTO master_change_history(entity_type,entity_id,change_type,field_name,old_value,new_value,before_json,after_json,reason,changed_by)
    VALUES(?,?,?,?,?,?,?,?,?,?)`).run(entityType,String(entityId),changeType,payload.fieldName||null,payload.oldValue??null,payload.newValue??null,json(before),json(after),nullable(payload.reason),text(payload.changedBy)||'Supervisor')
}

function futureDates(database, branchIds) {
  const ids=[...new Set(branchIds.map(Number).filter(Boolean))]
  if(!ids.length)return []
  const marks=ids.map(()=>'?').join(',')
  return database.prepare(`SELECT DISTINCT dd.dispatch_date FROM dispatch_days dd JOIN dispatch_trips dt ON dt.dispatch_day_id=dd.id JOIN dispatch_stops ds ON ds.dispatch_trip_id=dt.id
    WHERE ds.branch_id IN (${marks}) AND dd.dispatch_date>=date('now','+8 hours')`).all(...ids).map(item=>item.dispatch_date)
}

function invalidateBranches(database, branchIds, changeType, entityType, entityId, before, after, changedBy) {
  for(const date of futureDates(database,branchIds))invalidateDispatchDay(database,date,changeType,entityType,entityId,before,after,changedBy)
}

const customerSelect = `SELECT c.jodoo_customer_id customerId,c.name customerName,c.legal_name legalName,c.registration_number registrationNumber,c.billing_address billingAddress,
  c.contact_person contactPerson,c.phone,c.whatsapp,c.email,COALESCE(c.default_payment_type,c.payment_type) defaultPaymentType,c.credit_terms creditTerms,c.status,c.notes,c.source_system sourceSystem,
  c.created_by createdBy,c.created_at createdAt,c.updated_at updatedAt,COUNT(b.id) branchCount FROM customers c LEFT JOIN branches b ON b.customer_id=c.id`

export function listCustomers(params={},database=defaultDb){
  const where=['1=1'],args=[];if(params.search){let search=text(params.search);if(/^c\d+$/i.test(search))search=parseTypedId(search,'customer');const q=`%${search}%`;where.push('(c.jodoo_customer_id LIKE ? OR c.name LIKE ? OR c.legal_name LIKE ? OR c.phone LIKE ? OR c.whatsapp LIKE ?)');args.push(q,q,q,q,q)}
  if(params.status){where.push('c.status=?');args.push(params.status)}
  const page=Math.max(1,Number(params.page)||1),pageSize=Math.min(500,Math.max(1,Number(params.pageSize)||25))
  const total=database.prepare(`SELECT COUNT(*) total FROM customers c WHERE ${where.join(' AND ')}`).get(...args).total
  const items=database.prepare(`${customerSelect} WHERE ${where.join(' AND ')} GROUP BY c.id ORDER BY c.name,c.jodoo_customer_id LIMIT ? OFFSET ?`).all(...args,pageSize,(page-1)*pageSize)
  return{items,pagination:{page,pageSize,total,pages:Math.ceil(total/pageSize)}}
}

export function getCustomer(customerId,database=defaultDb){
  const item=database.prepare(`${customerSelect} WHERE c.jodoo_customer_id=? GROUP BY c.id`).get(customerId);if(!item)return null
  item.branches=listBranches({customerId,pageSize:500},database).items
  item.materialPricing=listCustomerMaterialPricing(item.customerId,database)?.items||[]
  item.productPricing=listCustomerProductPricing(item.customerId,database).items
  item.audit=listMasterAudit({entityType:'customer',entityId:customerId},database)
  return item
}

export function createCustomer(payload,database=defaultDb){
  assertLocationFields(payload,['billingAddress'])
  const name=text(payload.customerName||payload.name);if(!name)throw new Error('Customer Name is required')
  const status=statusValue(payload.status),payment=paymentValue(payload.defaultPaymentType??payload.paymentType),actor=text(payload.changedBy||payload.createdBy)||'Supervisor'
  database.exec('SAVEPOINT create_customer');try{
    const customerId=text(payload.customerId)||nextMasterId(database,'customers','jodoo_customer_id','customer')
    database.prepare(`INSERT INTO customers(jodoo_customer_id,name,legal_name,registration_number,billing_address,contact_person,phone,whatsapp,email,default_payment_type,payment_type,credit_terms,status,notes,source_system,created_by,created_at,is_active)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'KCS',?,CURRENT_TIMESTAMP,?)`).run(customerId,name,nullable(payload.legalName),nullable(payload.registrationNumber),nullable(payload.billingAddress),nullable(payload.contactPerson),nullable(payload.phone),nullable(payload.whatsapp),nullable(payload.email),payment,payment,nullable(payload.creditTerms),status,nullable(payload.notes),actor,status==='active'?1:0)
    saveCustomerMaterialPricing(customerId,payload.materialPricing,{changedBy:actor,reason:payload.reason,confirmed:Boolean(payload.pricingConfirmed),removedMaterialIds:payload.removedMaterialIds},database)
    const item=getCustomer(customerId,database);history(database,'customer',customerId,'created',null,item,{changedBy:actor,reason:payload.reason});database.exec('RELEASE create_customer');return item
  }catch(error){database.exec('ROLLBACK TO create_customer; RELEASE create_customer');throw error}
}

export function updateCustomer(customerId,payload,database=defaultDb){
  assertLocationFields(payload,['billingAddress'])
  const before=database.prepare('SELECT * FROM customers WHERE jodoo_customer_id=?').get(customerId);if(!before)throw new Error('Customer not found')
  if(payload.customerId&&text(payload.customerId)!==customerId)throw new Error('Customer ID cannot be changed after creation')
  const status=statusValue(payload.status??before.status),payment=paymentValue(payload.defaultPaymentType??payload.paymentType??before.default_payment_type??before.payment_type),actor=text(payload.changedBy)||'Supervisor'
  database.exec('SAVEPOINT update_customer');try{
    database.prepare(`UPDATE customers SET name=?,legal_name=?,registration_number=?,billing_address=?,contact_person=?,phone=?,whatsapp=?,email=?,default_payment_type=?,payment_type=?,credit_terms=?,status=?,notes=?,is_active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(
      text(payload.customerName??payload.name??before.name),payload.legalName===undefined?before.legal_name:nullable(payload.legalName),payload.registrationNumber===undefined?before.registration_number:nullable(payload.registrationNumber),payload.billingAddress===undefined?before.billing_address:nullable(payload.billingAddress),payload.contactPerson===undefined?before.contact_person:nullable(payload.contactPerson),payload.phone===undefined?before.phone:nullable(payload.phone),payload.whatsapp===undefined?before.whatsapp:nullable(payload.whatsapp),payload.email===undefined?before.email:nullable(payload.email),payment,payment,payload.creditTerms===undefined?before.credit_terms:nullable(payload.creditTerms),status,payload.notes===undefined?before.notes:nullable(payload.notes),status==='active'?1:0,before.id)
    const pricingResult=saveCustomerMaterialPricing(before.id,payload.materialPricing,{changedBy:actor,reason:payload.reason,confirmed:Boolean(payload.pricingConfirmed),removedMaterialIds:payload.removedMaterialIds},database)
    const after=database.prepare('SELECT * FROM customers WHERE id=?').get(before.id),branchIds=database.prepare('SELECT id FROM branches WHERE customer_id=?').all(before.id).map(x=>x.id)
    history(database,'customer',customerId,'updated',before,after,{changedBy:actor,reason:payload.reason})
    const critical=['name','default_payment_type','payment_type','status','is_active'],changed=critical.some(key=>before[key]!==after[key])
    if(changed||pricingResult.changed)invalidateBranches(database,branchIds,'customer_master_changed','customer',customerId,before,{...after,materialPricing:pricingResult.items},actor)
    database.exec('RELEASE update_customer');return getCustomer(customerId,database)
  }catch(error){database.exec('ROLLBACK TO update_customer; RELEASE update_customer');throw error}
}

const branchSelect=`SELECT b.id internalId,b.jodoo_branch_id branchId,c.jodoo_customer_id customerId,c.name customerName,b.branch_name branchName,b.address,
  COALESCE(a.confirmed_zone_group_id,a.zone_group_id) zoneGroupId,z.name zoneGroup,a.id areaInternalId,a.jodoo_area_id areaId,a.name area,b.latitude officialLatitude,b.longitude officialLongitude,
  b.gps_status gpsVerificationStatus,b.gps_verified_at gpsVerifiedAt,b.contact_person contactPerson,b.phone,b.collection_frequency collectionFrequency,
  b.assigned_weekdays assignedWeekdays,b.time_restriction collectionTimeConstraint,COALESCE(b.occ_price,c.occ_price) legacyOccPrice,
  COALESCE(b.payment_type,c.default_payment_type,c.payment_type) paymentType,b.proof_requirements proofRequirements,b.vehicle_restriction vehicleRestriction,b.status,b.lifecycle_status lifecycleStatus,b.status_reason statusReason,b.status_changed_at statusChangedAt,b.status_changed_by statusChangedBy,b.replaced_by_branch_id replacedByBranchInternalId,rb.jodoo_branch_id replacedByBranchId,rb.branch_name replacedByBranchName,b.notes,b.source_system sourceSystem,
  (SELECT tl.latitude FROM temporary_locations tl WHERE tl.branch_id=b.id ORDER BY tl.id DESC LIMIT 1) temporaryLatitude,
  (SELECT tl.longitude FROM temporary_locations tl WHERE tl.branch_id=b.id ORDER BY tl.id DESC LIMIT 1) temporaryLongitude,
  (SELECT tl.verification_status FROM temporary_locations tl WHERE tl.branch_id=b.id ORDER BY tl.id DESC LIMIT 1) temporaryGpsStatus,
  COUNT(DISTINCT s.id) scheduleCount,(SELECT COUNT(*) FROM customer_material_pricing cmp WHERE cmp.customer_id=b.customer_id AND cmp.status='active') materialCount,b.created_by createdBy,b.created_at createdAt,b.updated_at updatedAt
  FROM branches b LEFT JOIN customers c ON c.id=b.customer_id LEFT JOIN areas a ON a.id=b.area_id LEFT JOIN zone_groups z ON z.id=COALESCE(a.confirmed_zone_group_id,a.zone_group_id) LEFT JOIN branches rb ON rb.id=b.replaced_by_branch_id LEFT JOIN branch_schedules s ON s.branch_id=b.id`

export function listBranches(params={},database=defaultDb){
  const where=['1=1'],args=[];if(params.search){let search=text(params.search);if(/^b\d+$/i.test(search))search=parseTypedId(search,'branch');else if(/^c\d+$/i.test(search))search=parseTypedId(search,'customer');const q=`%${search}%`;where.push('(b.jodoo_branch_id LIKE ? OR b.branch_name LIKE ? OR c.name LIKE ? OR c.jodoo_customer_id LIKE ? OR b.phone LIKE ? OR b.address LIKE ?)');args.push(q,q,q,q,q,q)}
  if(params.customerId){const raw=text(params.customerId),customerId=database.prepare('SELECT 1 FROM customers WHERE jodoo_customer_id=?').get(raw)?raw:parseTypedId(raw,'customer');where.push('c.jodoo_customer_id=?');args.push(customerId)}if(params.lifecycleStatus){where.push('b.lifecycle_status=?');args.push(params.lifecycleStatus)}else if(params.status){where.push('b.status=?');args.push(params.status)}if(params.areaId){where.push('a.jodoo_area_id=?');args.push(params.areaId)}if(params.zoneGroupId){where.push('COALESCE(a.confirmed_zone_group_id,a.zone_group_id)=?');args.push(Number(params.zoneGroupId))}
  const page=Math.max(1,Number(params.page)||1),pageSize=Math.min(500,Math.max(1,Number(params.pageSize)||25)),total=database.prepare(`SELECT COUNT(*) total FROM branches b LEFT JOIN customers c ON c.id=b.customer_id LEFT JOIN areas a ON a.id=b.area_id WHERE ${where.join(' AND ')}`).get(...args).total
  const items=database.prepare(`${branchSelect} WHERE ${where.join(' AND ')} GROUP BY b.id ORDER BY c.name,b.branch_name LIMIT ? OFFSET ?`).all(...args,pageSize,(page-1)*pageSize)
  return{items,pagination:{page,pageSize,total,pages:Math.ceil(total/pageSize)}}
}

export function getBranch(branchId,database=defaultDb){
  const item=database.prepare(`${branchSelect} WHERE b.jodoo_branch_id=? GROUP BY b.id`).get(branchId);if(!item)return null
  item.materials=listBranchMaterials(item.internalId,database)
  const storedFrequency=item.collectionFrequency
  const settings=normalizeCollectionSettings(storedFrequency,item.assignedWeekdays,{strict:false})
  item.collectionFrequency=settings.collectionFrequency
  item.assignedWeekdays=settings.assignedWeekdays
  item.frequencyWarning=settings.frequencyWarning
  item.frequencyNormalizationWarning=storedFrequency&&!settings.collectionFrequency
    ? `Stored Collection Frequency "${storedFrequency}" is not recognized. It will remain unchanged until a valid value is selected.`
    : null
  item.schedules=database.prepare('SELECT jodoo_schedule_id scheduleId,frequency,days_of_week assignedWeekdays,take_date takeDate,next_take_date nextTakeDate,recurrence_type recurrenceType,interval_weeks intervalWeeks,anchor_date anchorDate,effective_date effectiveDate,monthly_occurrence monthlyOccurrence,fixed_weekday fixedWeekday,next_collection_date nextCollectionDate,is_active isActive FROM branch_schedules WHERE branch_id=? ORDER BY id').all(item.internalId)
  item.audit=listMasterAudit({entityType:'branch',entityId:branchId},database);return item
}

export function createBranch(payload,database=defaultDb){
  if(['materials','occPriceGroupId','occPrice'].some(key=>Object.hasOwn(payload,key)))throw new Error('Branch pricing is inherited from Customer and cannot be edited.')
  assertLocationFields(payload,['address'])
  const customerId=text(payload.customerId),name=text(payload.branchName);if(!customerId)throw new Error('Parent Customer is required');if(!name)throw new Error('Branch Name is required')
  const customer=database.prepare('SELECT id FROM customers WHERE jodoo_customer_id=?').get(customerId);if(!customer)throw new Error('Customer ID was not found')
  const area=payload.areaId?database.prepare('SELECT id FROM areas WHERE jodoo_area_id=? OR id=?').get(text(payload.areaId),Number(payload.areaId)||-1):null;if(payload.areaId&&!area)throw new Error('Area ID was not found')
  const status=statusValue(payload.status),payment=paymentValue(payload.paymentType),actor=text(payload.changedBy||payload.createdBy)||'Supervisor',settings=normalizeCollectionSettings(payload.collectionFrequency,payload.assignedWeekdays);if(status!=='active')throw new Error('Create the Branch as Active, then use Change Status with a reason')
  database.exec('SAVEPOINT create_branch');try{
    const branchId=text(payload.branchId)||nextMasterId(database,'branches','jodoo_branch_id','branch')
    database.prepare(`INSERT INTO branches(jodoo_branch_id,customer_id,area_id,source_customer_id,source_area_id,branch_name,address,latitude,longitude,gps_status,gps_verified_at,contact_person,phone,collection_frequency,assigned_weekdays,time_restriction,occ_price,payment_type,proof_requirements,vehicle_restriction,status,notes,source_system,created_by,created_at,is_active)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'KCS',?,CURRENT_TIMESTAMP,?)`).run(branchId,customer.id,area?.id||null,customerId,payload.areaId?text(payload.areaId):null,name,nullable(payload.address),payload.officialLatitude??null,payload.officialLongitude??null,nullable(payload.gpsVerificationStatus),payload.gpsVerifiedAt||null,nullable(payload.contactPerson),nullable(payload.phone),settings.collectionFrequency,settings.assignedWeekdaysStorage,nullable(payload.collectionTimeConstraint),null,payment,nullable(payload.proofRequirements),nullable(payload.vehicleRestriction),status,nullable(payload.notes),actor,status==='active'?1:0)
    const item=getBranch(branchId,database);history(database,'branch',branchId,'created',null,item,{changedBy:actor,reason:payload.reason});database.exec('RELEASE create_branch');return item
  }catch(error){database.exec('ROLLBACK TO create_branch; RELEASE create_branch');throw error}
}

export function listUnlinkedBranches(params={},database=defaultDb){
  const search=text(params.search),q=`%${search.replace(/^B/i,'')}%`,where=["b.customer_id IS NULL"],args=[]
  if(search){where.push('(b.jodoo_branch_id LIKE ? OR b.branch_name LIKE ? OR a.name LIKE ? OR b.address LIKE ?)');args.push(q,`%${search}%`,`%${search}%`,`%${search}%`)}
  const items=database.prepare(`${branchSelect} WHERE ${where.join(' AND ')} GROUP BY b.id ORDER BY b.branch_name,b.jodoo_branch_id`).all(...args)
  return{items,summary:{totalBranches:Number(database.prepare('SELECT COUNT(*) n FROM branches').get().n),linkedBranches:Number(database.prepare('SELECT COUNT(*) n FROM branches WHERE customer_id IS NOT NULL').get().n),unlinkedBranches:items.length}}
}

export function linkBranchToCustomer(branchId,payload,database=defaultDb){
  const customerId=text(payload.customerId),actor=text(payload.changedBy)||'Supervisor',reason=text(payload.reason)
  if(!customerId)throw new Error('Parent Customer is required')
  if(!reason)throw new Error('Link reason is required')
  const before=database.prepare('SELECT * FROM branches WHERE jodoo_branch_id=?').get(branchId);if(!before)throw new Error('Branch not found')
  if(before.customer_id!=null)throw new Error('Branch is already linked to a Customer')
  const customer=database.prepare('SELECT id,jodoo_customer_id,name FROM customers WHERE jodoo_customer_id=?').get(customerId);if(!customer)throw new Error('Customer ID was not found')
  database.exec('SAVEPOINT link_branch_customer');try{
    database.prepare('UPDATE branches SET customer_id=?,source_customer_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND customer_id IS NULL').run(customer.id,customer.jodoo_customer_id,before.id)
    const after=database.prepare('SELECT * FROM branches WHERE id=?').get(before.id)
    history(database,'branch',branchId,'parent_customer_linked',before,after,{changedBy:actor,reason,fieldName:'customer_id',oldValue:null,newValue:customer.jodoo_customer_id})
    database.exec('RELEASE link_branch_customer');return getBranch(branchId,database)
  }catch(error){database.exec('ROLLBACK TO link_branch_customer; RELEASE link_branch_customer');throw error}
}

export function updateBranch(branchId,payload,database=defaultDb){
  if(['materials','occPriceGroupId','occPrice'].some(key=>Object.hasOwn(payload,key)))throw new Error('Branch pricing is inherited from Customer and cannot be edited.')
  assertLocationFields(payload,['address'])
  const before=database.prepare('SELECT * FROM branches WHERE jodoo_branch_id=?').get(branchId);if(!before)throw new Error('Branch not found')
  if(payload.branchId&&text(payload.branchId)!==branchId)throw new Error('Branch ID cannot be changed after creation')
  for(const key of ['lifecycleStatus','lifecycle_status','statusReason','statusChangedAt','statusChangedBy','replacedByBranchId','replaced_by_branch_id'])if(Object.hasOwn(payload,key))throw new Error('Use Change Status to update Branch lifecycle')
  if(payload.status!==undefined&&statusValue(payload.status)!==before.status)throw new Error('Use Change Status to update Branch lifecycle')
  const customer=payload.customerId?database.prepare('SELECT id FROM customers WHERE jodoo_customer_id=?').get(text(payload.customerId)):null;if(payload.customerId&&!customer)throw new Error('Customer ID was not found')
  const area=payload.areaId?database.prepare('SELECT id,jodoo_area_id FROM areas WHERE jodoo_area_id=? OR id=?').get(text(payload.areaId),Number(payload.areaId)||-1):null;if(payload.areaId&&!area)throw new Error('Area ID was not found')
  const status=before.status,payment=paymentValue(payload.paymentType??before.payment_type),actor=text(payload.changedBy)||'Supervisor'
  const settings=payload.collectionFrequency!==undefined||payload.assignedWeekdays!==undefined?normalizeCollectionSettings(payload.collectionFrequency??before.collection_frequency,payload.assignedWeekdays??before.assigned_weekdays):null
  database.exec('SAVEPOINT update_branch');try{
    database.prepare(`UPDATE branches SET customer_id=?,area_id=?,source_customer_id=?,source_area_id=?,branch_name=?,address=?,latitude=?,longitude=?,gps_status=?,gps_verified_at=?,contact_person=?,phone=?,collection_frequency=?,assigned_weekdays=?,time_restriction=?,occ_price=?,payment_type=?,proof_requirements=?,vehicle_restriction=?,status=?,notes=?,is_active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(
      customer?.id??before.customer_id,area?.id??before.area_id,payload.customerId??before.source_customer_id,area?.jodoo_area_id??before.source_area_id,text(payload.branchName??before.branch_name),submittedNullable(payload,'address',before.address),payload.officialLatitude===undefined?before.latitude:payload.officialLatitude,payload.officialLongitude===undefined?before.longitude:payload.officialLongitude,submittedNullable(payload,'gpsVerificationStatus',before.gps_status),payload.gpsVerifiedAt===undefined?before.gps_verified_at:payload.gpsVerifiedAt||null,submittedNullable(payload,'contactPerson',before.contact_person),submittedNullable(payload,'phone',before.phone),settings?settings.collectionFrequency:before.collection_frequency,settings?settings.assignedWeekdaysStorage:before.assigned_weekdays,submittedNullable(payload,'collectionTimeConstraint',before.time_restriction),before.occ_price,payment,submittedNullable(payload,'proofRequirements',before.proof_requirements),submittedNullable(payload,'vehicleRestriction',before.vehicle_restriction),status,submittedNullable(payload,'notes',before.notes),status==='active'?1:0,before.id)
    const after=database.prepare('SELECT * FROM branches WHERE id=?').get(before.id);history(database,'branch',branchId,'updated',before,after,{changedBy:actor,reason:payload.reason})
    const critical=['customer_id','area_id','branch_name','address','latitude','longitude','collection_frequency','assigned_weekdays','time_restriction','occ_price','payment_type','status','is_active'],changed=critical.some(key=>before[key]!==after[key])
    if(changed)invalidateBranches(database,[before.id],'branch_master_changed','branch',branchId,before,after,actor)
    database.exec('RELEASE update_branch');return getBranch(branchId,database)
  }catch(error){database.exec('ROLLBACK TO update_branch; RELEASE update_branch');throw error}
}

export function updateBranchWithLifecycle(branchId,payload={},actor={},database=defaultDb){
  const branchPayload={...payload},lifecycle=branchPayload.lifecycle
  delete branchPayload.lifecycle
  branchPayload.changedBy=text(actor.changedBy||actor.employeeName)||'Authenticated User'
  const write=()=>{
    updateBranch(branchId,branchPayload,database)
    let lifecycleResult=null
    if(lifecycle)lifecycleResult=applyBranchLifecycle(branchId,lifecycle,actor,database)
    return{...getBranch(branchId,database),lifecycleWarnings:lifecycleResult?.warnings||[]}
  }
  if(database.isTransaction)return write()
  database.exec('BEGIN IMMEDIATE')
  try{const result=write();database.exec('COMMIT');return result}catch(error){database.exec('ROLLBACK');throw error}
}

export function listMasterAudit(params={},database=defaultDb){const where=['1=1'],args=[];if(params.entityType){where.push('entity_type=?');args.push(params.entityType)}if(params.entityId){where.push('entity_id=?');args.push(String(params.entityId))}return database.prepare(`SELECT id,entity_type entityType,entity_id entityId,change_type changeType,field_name fieldName,old_value oldValue,new_value newValue,reason,changed_by changedBy,changed_at changedAt,before_json beforeJson,after_json afterJson FROM master_change_history WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT 300`).all(...args)}

const gpsConflict=message=>Object.assign(new Error(message),{statusCode:409})
export function captureBranchGps(branchId,payload,database=defaultDb){const branch=database.prepare('SELECT id,jodoo_branch_id,latitude,longitude,status,is_active,lifecycle_status FROM branches WHERE jodoo_branch_id=?').get(branchId);if(!branch)throw new Error('Please select a valid Customer Branch first');if(branch.lifecycle_status!=='ACTIVE')throw gpsConflict('Only an Active Customer Branch can collect GPS.');if(branch.latitude!=null&&branch.longitude!=null)throw gpsConflict('Official GPS already exists for this Branch.');if(database.prepare("SELECT 1 FROM temporary_locations WHERE branch_id=? AND verification_status='pending_supervisor' LIMIT 1").get(branch.id))throw gpsConflict('A Temporary GPS is already pending approval for this Branch.');const latitude=Number(payload.latitude),longitude=Number(payload.longitude);if(!Number.isFinite(latitude)||latitude < -90||latitude>90||!Number.isFinite(longitude)||longitude < -180||longitude>180)throw new Error('Invalid GPS latitude or longitude');database.exec('BEGIN IMMEDIATE');try{if(database.prepare("SELECT 1 FROM branches WHERE id=? AND lifecycle_status<>'ACTIVE'").get(branch.id))throw gpsConflict('Only an Active Customer Branch can collect GPS.');if(database.prepare('SELECT 1 FROM branches WHERE id=? AND latitude IS NOT NULL AND longitude IS NOT NULL').get(branch.id))throw gpsConflict('Official GPS already exists for this Branch.');if(database.prepare("SELECT 1 FROM temporary_locations WHERE branch_id=? AND verification_status='pending_supervisor' LIMIT 1").get(branch.id))throw gpsConflict('A Temporary GPS is already pending approval for this Branch.');const actor=payload.capturedBy||payload.changedBy||'Employee',item=addTemporaryLocation({...payload,branchId:branch.id,latitude,longitude,locationSource:payload.locationSource||'Driver Captured',capturedBy:actor,adjustedBy:payload.manuallyAdjusted?actor:null,employeeId:payload.employeeId,remark:payload.gpsRemark??payload.remark},database);history(database,'branch',branchId,'temporary_gps_captured',null,item,{changedBy:actor,reason:payload.reason});database.exec('COMMIT');return item}catch(error){database.exec('ROLLBACK');throw error}}

export function gpsCollectionDashboard(params={},database=defaultDb){const search=text(params.search),like=`%${search}%`,rows=database.prepare(`SELECT b.id internalId,b.jodoo_branch_id branchId,c.jodoo_customer_id customerId,c.name customerName,b.branch_name branchName,b.address,a.id areaId,a.name area,z.id zoneGroupId,z.name zoneGroup,z.sort_order zoneSortOrder,b.latitude officialLatitude,b.longitude officialLongitude,
  (SELECT tl.verification_status FROM temporary_locations tl WHERE tl.branch_id=b.id ORDER BY tl.id DESC LIMIT 1) latestTemporaryStatus,
  EXISTS(SELECT 1 FROM temporary_locations tl WHERE tl.branch_id=b.id AND tl.verification_status='pending_supervisor') hasPendingGps
  FROM branches b LEFT JOIN customers c ON c.id=b.customer_id LEFT JOIN areas a ON a.id=b.area_id LEFT JOIN zone_groups z ON z.id=COALESCE(a.confirmed_zone_group_id,a.zone_group_id)
  WHERE b.lifecycle_status='ACTIVE' AND (?='' OR b.jodoo_branch_id LIKE ? OR b.branch_name LIKE ? OR c.name LIKE ?) ORDER BY CASE WHEN a.id IS NULL AND z.id IS NULL THEN 1 ELSE 0 END,z.sort_order,a.name COLLATE NOCASE,b.branch_name COLLATE NOCASE,b.id`).all(search,like,like,like).map(row=>({...row,hasOfficialGps:row.officialLatitude!=null&&row.officialLongitude!=null,hasPendingGps:Boolean(row.hasPendingGps)}));const total=rows.length,official=rows.filter(row=>row.hasOfficialGps).length,pending=rows.filter(row=>!row.hasOfficialGps&&row.hasPendingGps).length,toCollect=rows.filter(row=>!row.hasOfficialGps&&!row.hasPendingGps);return{summary:{totalActiveBranches:total,officialGps:official,pendingApproval:pending,remainingToCollect:toCollect.length},items:toCollect}}

export function withdrawBranchOfficialGps(branchId,payload,database=defaultDb){const reason=text(payload.reason);if(!reason)throw new Error('A reason is required to withdraw Official GPS.');const branch=database.prepare('SELECT * FROM branches WHERE jodoo_branch_id=?').get(branchId);if(!branch)throw new Error('Customer Branch was not found');if(branch.latitude==null||branch.longitude==null)throw gpsConflict('This Branch has no Official GPS to withdraw.');const actor=text(payload.changedBy)||'Supervisor',before={latitude:branch.latitude,longitude:branch.longitude,address:branch.gps_address,state:branch.gps_state,street:branch.gps_street,city:branch.gps_city,streetNumber:branch.gps_street_number,postalCode:branch.gps_postal_code,remark:branch.gps_remark,reverseGeocodeProvider:branch.gps_reverse_geocode_provider};database.exec('BEGIN IMMEDIATE');try{database.prepare(`INSERT INTO branch_gps_history(branch_id,action,latitude,longitude,address,state,street,city,street_number,postal_code,remark,reverse_geocode_provider,actor,reason) VALUES(?,'withdrawn',?,?,?,?,?,?,?,?,?,?,?,?)`).run(branch.id,branch.latitude,branch.longitude,branch.gps_address,branch.gps_state,branch.gps_street,branch.gps_city,branch.gps_street_number,branch.gps_postal_code,branch.gps_remark,branch.gps_reverse_geocode_provider,actor,reason);database.prepare(`UPDATE branches SET latitude=NULL,longitude=NULL,gps_status='Withdrawn',gps_verified_at=NULL,gps_address=NULL,gps_state=NULL,gps_street=NULL,gps_city=NULL,gps_street_number=NULL,gps_postal_code=NULL,gps_remark=NULL,gps_reverse_geocode_provider=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(branch.id);history(database,'branch',branch.jodoo_branch_id,'official_gps_withdrawn',before,{status:'withdrawn'},{changedBy:actor,reason});database.exec('COMMIT');return{branchId:branch.jodoo_branch_id,status:'withdrawn'}}catch(error){database.exec('ROLLBACK');throw error}}

export function adoptBranchGps(temporaryLocationId,payload,database=defaultDb){return adoptTemporaryLocation(temporaryLocationId,{adoptedBy:payload.adoptedBy||payload.changedBy||'Supervisor',adoptedByAccountId:payload.adoptedByAccountId??payload.reviewedByAccountId??null,reason:payload.reason},database)}

export function listGpsCollector(params={},database=defaultDb){const where=["tl.verification_status='pending_supervisor'"],args=[];if(params.employeeId){where.push('tl.employee_id=?');args.push(Number(params.employeeId))}return database.prepare(`SELECT tl.id,b.jodoo_branch_id branchId,c.name customerName,b.branch_name branchName,b.address branchAddress,tl.latitude temporaryLatitude,tl.longitude temporaryLongitude,tl.captured_latitude capturedLatitude,tl.captured_longitude capturedLongitude,tl.captured_accuracy_m capturedAccuracyM,tl.manually_adjusted manuallyAdjusted,tl.adjusted_by adjustedBy,tl.adjusted_at adjustedAt,tl.adjustment_reason adjustmentReason,tl.adjustment_distance_m adjustmentDistanceM,tl.location_source locationSource,tl.verification_status verificationStatus,tl.distance_from_official_m distanceFromOfficialM,tl.accuracy_m accuracyM,tl.device_captured_at deviceCapturedAt,tl.server_received_at serverReceivedAt,tl.photo_storage_key photoStorageKey,tl.remark gpsRemark,tl.address,tl.state,tl.street,tl.city,tl.street_number streetNumber,tl.postal_code postalCode,tl.reverse_geocode_provider reverseGeocodeProvider,tl.review_decision reviewDecision,tl.review_reason reviewReason,tl.reviewed_by reviewedBy,tl.reviewed_at reviewedAt,tl.captured_by capturedBy,tl.captured_at capturedAt,tl.adopted_by adoptedBy,tl.adopted_at adoptedAt,b.latitude officialLatitude,b.longitude officialLongitude FROM temporary_locations tl JOIN branches b ON b.id=tl.branch_id LEFT JOIN customers c ON c.id=b.customer_id WHERE ${where.join(' AND ')} ORDER BY tl.id DESC LIMIT 300`).all(...args)}

export function areaCloseout(database=defaultDb){const summary=database.prepare(`SELECT COUNT(*) totalAreas,SUM(CASE WHEN zone_assignment_status='confirmed' AND confirmed_zone_group_id IS NOT NULL THEN 1 ELSE 0 END) confirmedAreas,SUM(CASE WHEN zone_assignment_status<>'confirmed' OR confirmed_zone_group_id IS NULL THEN 1 ELSE 0 END) pendingAreas FROM areas`).get();summary.zones=database.prepare(`SELECT z.id,z.code,z.name,COUNT(a.id) areaCount FROM zone_groups z LEFT JOIN areas a ON a.confirmed_zone_group_id=z.id AND a.zone_assignment_status='confirmed' WHERE z.is_active=1 GROUP BY z.id ORDER BY z.sort_order,z.id`).all();return summary}

export function listBuyers(params={},database=defaultDb){const where=['1=1'],args=[];if(params.search){const search=text(params.search),q=`%${search}%`;if(/^(?:BY)?\d+$/i.test(search)){const number=Number(search.replace(/^BY/i,''));if(number<=10000)where.push('0=1');else{where.push('b.id=?');args.push(Number(parseTypedId(search,'buyer')))}}else if(/^(?:B|BB)\d+$/i.test(search))where.push('0=1');else{where.push('(b.buyer_code LIKE ? OR b.buyer_name LIKE ? OR b.location_name LIKE ? OR b.phone LIKE ?)');args.push(q,q,q,q)}}if(params.status){where.push('b.status=?');args.push(params.status)}return database.prepare(`SELECT b.id,b.buyer_code buyerId,b.buyer_name buyerName,b.location_name locationName,b.address,b.latitude officialLatitude,b.longitude officialLongitude,b.contact_person contactPerson,b.phone,b.material_accepted materialAccepted,b.operating_hours operatingHours,b.unloading_restrictions unloadingRestrictions,b.pricing_notes pricingNotes,b.status,b.notes,b.created_by createdBy,b.created_at createdAt,b.updated_at updatedAt,COUNT(l.id) branchCount FROM buyers b LEFT JOIN operational_locations l ON l.buyer_id=b.id WHERE ${where.join(' AND ')} GROUP BY b.id ORDER BY b.buyer_name`).all(...args)}

export function saveBuyer(payload,id=null,database=defaultDb){const before=id?database.prepare('SELECT * FROM buyers WHERE id=?').get(id):null,name=text(payload.buyerName??before?.buyer_name);if(id&&!before)throw new Error('Buyer was not found');if(before&&Object.hasOwn(payload,'buyerId'))throw new Error('Buyer ID is system generated and cannot be changed');if(!name)throw new Error('Buyer Name is required');const values=[name,payload.locationName===undefined?before?.location_name:nullable(payload.locationName),payload.address===undefined?before?.address:nullable(payload.address),payload.officialLatitude===undefined?before?.latitude:payload.officialLatitude,payload.officialLongitude===undefined?before?.longitude:payload.officialLongitude,payload.contactPerson===undefined?before?.contact_person:nullable(payload.contactPerson),payload.phone===undefined?before?.phone:nullable(payload.phone),payload.materialAccepted===undefined?before?.material_accepted:nullable(payload.materialAccepted),payload.operatingHours===undefined?before?.operating_hours:nullable(payload.operatingHours),payload.unloadingRestrictions===undefined?before?.unloading_restrictions:nullable(payload.unloadingRestrictions),payload.pricingNotes===undefined?before?.pricing_notes:nullable(payload.pricingNotes),statusValue(payload.status??before?.status),payload.notes===undefined?before?.notes:nullable(payload.notes)]
  const safeValues=values.map(item=>item===undefined?null:item),write=()=>{let internalId=id;if(before)database.prepare(`UPDATE buyers SET buyer_name=?,location_name=?,address=?,latitude=?,longitude=?,contact_person=?,phone=?,material_accepted=?,operating_hours=?,unloading_restrictions=?,pricing_notes=?,status=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(...safeValues,id);else{internalId=Number(database.prepare(`INSERT INTO buyers(buyer_code,buyer_name,location_name,address,latitude,longitude,contact_person,phone,material_accepted,operating_hours,unloading_restrictions,pricing_notes,status,notes,created_by) VALUES(lower(hex(randomblob(16))),?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(...safeValues,text(payload.changedBy||payload.createdBy)||'Supervisor').lastInsertRowid);database.prepare('UPDATE buyers SET buyer_code=? WHERE id=?').run(formatBuyerId(internalId),internalId)}const item=listBuyers({},database).find(x=>x.id===Number(internalId));history(database,'buyer',item.buyerId,before?'updated':'created',before,item,{changedBy:payload.changedBy||payload.createdBy,reason:payload.reason});return item}
  if(database.isTransaction)return write();database.exec('BEGIN IMMEDIATE');try{const result=write();database.exec('COMMIT');return result}catch(error){database.exec('ROLLBACK');throw error}}

const locationTypeMap={'Company Yard':'depot','Buyer':'factory','Employee Base':'employee_home','Workshop':'other','Fuel Station':'other','Other':'other'}
export function listOperationalLocations(params={},database=defaultDb){const where=['1=1'],args=[];if(params.search){const q=`%${params.search}%`;where.push('(l.location_code LIKE ? OR l.name LIKE ? OR l.address LIKE ? OR l.contact_person LIKE ?)');args.push(q,q,q,q)}if(params.status){where.push('l.status=?');args.push(params.status)}if(params.type){where.push('l.operational_type=?');args.push(params.type)}return database.prepare(`SELECT l.id,l.location_code locationId,l.name,l.operational_type locationType,l.address,l.latitude,l.longitude,CASE WHEN l.latitude IS NOT NULL AND l.longitude IS NOT NULL THEN 'Set' ELSE 'Not Set' END gpsStatus,l.operating_hours operatingHours,l.contact_person contactPerson,l.phone,l.status,l.notes,l.can_start canStart,l.can_end canEnd,l.buyer_id buyerInternalId,b.buyer_code buyerId,b.buyer_name buyerName,l.created_by createdBy,l.created_at createdAt,l.updated_at updatedAt FROM operational_locations l LEFT JOIN buyers b ON b.id=l.buyer_id WHERE ${where.join(' AND ')} ORDER BY l.name`).all(...args)}

export function saveOperationalLocation(payload,id=null,database=defaultDb){const before=id?database.prepare('SELECT * FROM operational_locations WHERE id=?').get(id):null;if(id&&!before)throw new Error('Operational Location was not found');const name=text(payload.name??before?.name),type=text(payload.locationType??before?.operational_type??'Other'),locationId=text(payload.locationId??before?.location_code)||null;if(!name)throw new Error('Location Name is required');if(!locationTypeMap[type])throw new Error('Invalid Operational Location type');if(type!=='Buyer'&&payload.buyerId)throw new Error('Only Buyer Locations can reference a Buyer');const rawLatitude=payload.latitude===undefined?before?.latitude:payload.latitude,rawLongitude=payload.longitude===undefined?before?.longitude:payload.longitude,latitude=rawLatitude===''||rawLatitude==null?null:Number(rawLatitude),longitude=rawLongitude===''||rawLongitude==null?null:Number(rawLongitude);if((latitude==null)!==(longitude==null))throw new Error('Latitude and Longitude must be set or cleared together');if(latitude!=null&&(!Number.isFinite(latitude)||latitude < -90||latitude > 90))throw new Error('Invalid Latitude');if(longitude!=null&&(!Number.isFinite(longitude)||longitude < -180||longitude > 180))throw new Error('Invalid Longitude');const buyerId=type==='Buyer'&&payload.buyerId?Number(parseTypedId(payload.buyerId,'buyer')):null,buyer=buyerId?database.prepare('SELECT id FROM buyers WHERE id=?').get(buyerId):null;if(type==='Buyer'&&payload.buyerId&&!buyer)throw new Error('Buyer ID was not found');const values=[locationId,name,locationTypeMap[type],type,payload.address===undefined?before?.address:nullable(payload.address),latitude,longitude,payload.operatingHours===undefined?before?.operating_hours:nullable(payload.operatingHours),payload.contactPerson===undefined?before?.contact_person:nullable(payload.contactPerson),payload.phone===undefined?before?.phone:nullable(payload.phone),statusValue(payload.status??before?.status),payload.notes===undefined?before?.notes:nullable(payload.notes),payload.canStart===undefined?(before?.can_start??0):Number(Boolean(payload.canStart)),payload.canEnd===undefined?(before?.can_end??1):Number(Boolean(payload.canEnd)),type==='Buyer'?(buyer?.id??before?.buyer_id??null):null]
  const write=()=>{const safeValues=values.map(item=>item===undefined?null:item);let internalId=id;if(before)database.prepare(`UPDATE operational_locations SET location_code=?,name=?,location_type=?,operational_type=?,address=?,latitude=?,longitude=?,operating_hours=?,contact_person=?,phone=?,status=?,notes=?,can_start=?,can_end=?,buyer_id=?,is_active=CASE WHEN ?='active' THEN 1 ELSE 0 END,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(...safeValues,safeValues[10],id);else internalId=Number(database.prepare(`INSERT INTO operational_locations(location_code,name,location_type,operational_type,address,latitude,longitude,operating_hours,contact_person,phone,status,notes,can_start,can_end,buyer_id,is_active,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(...safeValues,safeValues[10]==='active'?1:0,text(payload.changedBy||payload.createdBy)||'Supervisor').lastInsertRowid);const item=listOperationalLocations({},database).find(x=>x.id===Number(internalId));history(database,'operational_location',internalId,before?'updated':'created',before,item,{changedBy:payload.changedBy||payload.createdBy,reason:payload.reason});return item};if(database.isTransaction)return write();database.exec('BEGIN IMMEDIATE');try{const item=write();database.exec('COMMIT');return item}catch(error){database.exec('ROLLBACK');throw error}}

export function listBuyerBranches(params={},database=defaultDb){const where=['l.buyer_id IS NOT NULL'],args=[];if(params.buyerId){where.push('l.buyer_id=?');args.push(Number(params.buyerId))}if(params.search){const input=text(params.search),q=`%${input}%`;if(/^BB\d+$/i.test(input)){where.push('l.location_code=?');args.push(input.toUpperCase())}else if(/^B(?:Y)?\d+$/i.test(input))where.push('0=1');else{where.push('(l.location_code LIKE ? OR l.name LIKE ? OR b.buyer_name LIKE ? OR l.address LIKE ?)');args.push(q,q,q,q)}}if(params.status){where.push('l.status=?');args.push(params.status)}return database.prepare(`SELECT l.id,l.location_code buyerBranchId,l.name branchName,l.address,l.latitude,l.longitude,l.contact_person contactPerson,l.phone,l.operating_hours businessHours,l.accepted_materials acceptedMaterials,l.unloading_restrictions unloadingRestrictions,l.pricing_notes priceNotes,l.notes operationalNotes,l.can_end canEnd,l.status,l.is_active isActive,l.buyer_id buyerInternalId,b.buyer_code buyerId,b.buyer_name buyerName,l.created_by createdBy,l.created_at createdAt,l.updated_at updatedAt FROM operational_locations l JOIN buyers b ON b.id=l.buyer_id WHERE ${where.join(' AND ')} ORDER BY b.buyer_name,l.name`).all(...args)}

export function getBuyerDetail(id,database=defaultDb){const buyer=listBuyers({},database).find(item=>item.id===Number(id));if(!buyer)throw new Error('Buyer was not found');return{...buyer,branches:listBuyerBranches({buyerId:id},database),history:listMasterAudit({entityType:'buyer',entityId:buyer.buyerId},database)}}

export function saveBuyerBranch(payload,id=null,database=defaultDb){const before=id?database.prepare('SELECT * FROM operational_locations WHERE id=? AND buyer_id IS NOT NULL').get(id):null;if(id&&!before)throw new Error('Buyer Branch was not found');for(const key of ['id','buyerBranchId','locationId','buyerId'])if(before&&Object.hasOwn(payload,key))throw new Error('Buyer Branch ID and parent Buyer cannot be changed');const buyerInternalId=before?.buyer_id??Number(payload.buyerInternalId||payload.parentBuyerId),buyer=database.prepare('SELECT id,buyer_code FROM buyers WHERE id=?').get(buyerInternalId);if(!buyer)throw new Error('Parent Buyer is required');const name=text(payload.branchName??before?.name);if(!name)throw new Error('Branch Name is required');const status=statusValue(payload.status??before?.status),actor=text(payload.changedBy||payload.createdBy)||'Supervisor',write=()=>{let internalId=id,branchCode=before?.location_code;if(before)database.prepare(`UPDATE operational_locations SET name=?,address=?,latitude=?,longitude=?,contact_person=?,phone=?,operating_hours=?,accepted_materials=?,unloading_restrictions=?,pricing_notes=?,notes=?,can_end=?,status=?,is_active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(name,submittedNullable(payload,'address',before.address),payload.latitude===undefined?before.latitude:payload.latitude,payload.longitude===undefined?before.longitude:payload.longitude,submittedNullable(payload,'contactPerson',before.contact_person),submittedNullable(payload,'phone',before.phone),submittedNullable(payload,'businessHours',before.operating_hours),submittedNullable(payload,'acceptedMaterials',before.accepted_materials),submittedNullable(payload,'unloadingRestrictions',before.unloading_restrictions),submittedNullable(payload,'priceNotes',before.pricing_notes),submittedNullable(payload,'operationalNotes',before.notes),payload.canEnd===undefined?before.can_end:Number(Boolean(payload.canEnd)),status,status==='active'?1:0,id);else{const sequence=database.prepare("SELECT next_value FROM system_sequences WHERE name='buyer_branch'").get();if(!sequence)throw new Error('Buyer Branch sequence is not available; apply Schema v30 first');branchCode=formatBuyerBranchId(sequence.next_value);database.prepare("UPDATE system_sequences SET next_value=next_value+1 WHERE name='buyer_branch'").run();internalId=Number(database.prepare(`INSERT INTO operational_locations(location_code,name,location_type,operational_type,address,latitude,longitude,contact_person,phone,operating_hours,accepted_materials,unloading_restrictions,pricing_notes,notes,buyer_id,can_start,can_end,status,is_active,created_by) VALUES(?,?,'factory','Buyer',?,?,?,?,?,?,?,?,?,?,?,0,?,?,?,?)`).run(branchCode,name,nullable(payload.address),payload.latitude??null,payload.longitude??null,nullable(payload.contactPerson),nullable(payload.phone),nullable(payload.businessHours),nullable(payload.acceptedMaterials),nullable(payload.unloadingRestrictions),nullable(payload.priceNotes),nullable(payload.operationalNotes),buyer.id,Number(Boolean(payload.canEnd??true)),status,status==='active'?1:0,actor).lastInsertRowid)}const item=listBuyerBranches({},database).find(entry=>entry.id===Number(internalId));history(database,'buyer_branch',item.buyerBranchId,before?'updated':'created',before,item,{changedBy:actor,reason:payload.reason});return item};if(database.isTransaction)return write();database.exec('BEGIN IMMEDIATE');try{const item=write();database.exec('COMMIT');return item}catch(error){database.exec('ROLLBACK');throw error}}
