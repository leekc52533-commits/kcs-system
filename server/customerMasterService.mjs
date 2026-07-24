import { db as defaultDb } from './database.mjs'
import { invalidateDispatchDay } from './dispatchService.mjs'
import { addTemporaryLocation, adoptTemporaryLocation } from './specialRequestService.mjs'

const text = value => String(value ?? '').trim()
const nullable = value => text(value) || null
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
  const where=['1=1'],args=[];if(params.search){const q=`%${params.search}%`;where.push('(c.jodoo_customer_id LIKE ? OR c.name LIKE ? OR c.legal_name LIKE ? OR c.phone LIKE ? OR c.whatsapp LIKE ?)');args.push(q,q,q,q,q)}
  if(params.status){where.push('c.status=?');args.push(params.status)}
  const page=Math.max(1,Number(params.page)||1),pageSize=Math.min(200,Math.max(1,Number(params.pageSize)||25))
  const total=database.prepare(`SELECT COUNT(*) total FROM customers c WHERE ${where.join(' AND ')}`).get(...args).total
  const items=database.prepare(`${customerSelect} WHERE ${where.join(' AND ')} GROUP BY c.id ORDER BY c.name,c.jodoo_customer_id LIMIT ? OFFSET ?`).all(...args,pageSize,(page-1)*pageSize)
  return{items,pagination:{page,pageSize,total,pages:Math.ceil(total/pageSize)}}
}

export function getCustomer(customerId,database=defaultDb){
  const item=database.prepare(`${customerSelect} WHERE c.jodoo_customer_id=? GROUP BY c.id`).get(customerId);if(!item)return null
  item.branches=listBranches({customerId,pageSize:500},database).items
  item.audit=listMasterAudit({entityType:'customer',entityId:customerId},database)
  return item
}

export function createCustomer(payload,database=defaultDb){
  const customerId=text(payload.customerId),name=text(payload.customerName||payload.name);if(!customerId||!name)throw new Error('Customer ID and Customer Name are required')
  const status=statusValue(payload.status),payment=paymentValue(payload.defaultPaymentType??payload.paymentType),actor=text(payload.changedBy||payload.createdBy)||'Supervisor'
  database.prepare(`INSERT INTO customers(jodoo_customer_id,name,legal_name,registration_number,billing_address,contact_person,phone,whatsapp,email,default_payment_type,payment_type,credit_terms,status,notes,source_system,created_by,created_at,is_active)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'KCS',?,CURRENT_TIMESTAMP,?)`).run(customerId,name,nullable(payload.legalName),nullable(payload.registrationNumber),nullable(payload.billingAddress),nullable(payload.contactPerson),nullable(payload.phone),nullable(payload.whatsapp),nullable(payload.email),payment,payment,nullable(payload.creditTerms),status,nullable(payload.notes),actor,status==='active'?1:0)
  const item=getCustomer(customerId,database);history(database,'customer',customerId,'created',null,item,{changedBy:actor,reason:payload.reason});return item
}

export function updateCustomer(customerId,payload,database=defaultDb){
  const before=database.prepare('SELECT * FROM customers WHERE jodoo_customer_id=?').get(customerId);if(!before)throw new Error('Customer not found')
  if(payload.customerId&&text(payload.customerId)!==customerId)throw new Error('Customer ID cannot be changed after creation')
  const status=statusValue(payload.status??before.status),payment=paymentValue(payload.defaultPaymentType??payload.paymentType??before.default_payment_type??before.payment_type),actor=text(payload.changedBy)||'Supervisor'
  database.exec('SAVEPOINT update_customer');try{
    database.prepare(`UPDATE customers SET name=?,legal_name=?,registration_number=?,billing_address=?,contact_person=?,phone=?,whatsapp=?,email=?,default_payment_type=?,payment_type=?,credit_terms=?,status=?,notes=?,is_active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(
      text(payload.customerName??payload.name??before.name),payload.legalName===undefined?before.legal_name:nullable(payload.legalName),payload.registrationNumber===undefined?before.registration_number:nullable(payload.registrationNumber),payload.billingAddress===undefined?before.billing_address:nullable(payload.billingAddress),payload.contactPerson===undefined?before.contact_person:nullable(payload.contactPerson),payload.phone===undefined?before.phone:nullable(payload.phone),payload.whatsapp===undefined?before.whatsapp:nullable(payload.whatsapp),payload.email===undefined?before.email:nullable(payload.email),payment,payment,payload.creditTerms===undefined?before.credit_terms:nullable(payload.creditTerms),status,payload.notes===undefined?before.notes:nullable(payload.notes),status==='active'?1:0,before.id)
    const after=database.prepare('SELECT * FROM customers WHERE id=?').get(before.id),branchIds=database.prepare('SELECT id FROM branches WHERE customer_id=?').all(before.id).map(x=>x.id)
    history(database,'customer',customerId,'updated',before,after,{changedBy:actor,reason:payload.reason})
    const critical=['name','default_payment_type','payment_type','status','is_active'],changed=critical.some(key=>before[key]!==after[key])
    if(changed)invalidateBranches(database,branchIds,'customer_master_changed','customer',customerId,before,after,actor)
    database.exec('RELEASE update_customer');return getCustomer(customerId,database)
  }catch(error){database.exec('ROLLBACK TO update_customer; RELEASE update_customer');throw error}
}

const branchSelect=`SELECT b.id internalId,b.jodoo_branch_id branchId,c.jodoo_customer_id customerId,c.name customerName,b.branch_name branchName,b.address,
  COALESCE(a.confirmed_zone_group_id,a.zone_group_id) zoneGroupId,z.name zoneGroup,a.id areaInternalId,a.jodoo_area_id areaId,a.name area,b.latitude officialLatitude,b.longitude officialLongitude,
  b.gps_status gpsVerificationStatus,b.gps_verified_at gpsVerifiedAt,b.contact_person contactPerson,b.phone,COALESCE(b.collection_frequency,GROUP_CONCAT(DISTINCT s.frequency)) collectionFrequency,
  COALESCE(b.assigned_weekdays,GROUP_CONCAT(DISTINCT s.days_of_week)) assignedWeekdays,b.time_restriction collectionTimeConstraint,COALESCE(b.occ_price,c.occ_price) occPrice,
  COALESCE(b.payment_type,c.default_payment_type,c.payment_type) paymentType,b.proof_requirements proofRequirements,b.vehicle_restriction vehicleRestriction,b.status,b.notes,b.source_system sourceSystem,
  (SELECT tl.latitude FROM temporary_locations tl WHERE tl.branch_id=b.id ORDER BY tl.id DESC LIMIT 1) temporaryLatitude,
  (SELECT tl.longitude FROM temporary_locations tl WHERE tl.branch_id=b.id ORDER BY tl.id DESC LIMIT 1) temporaryLongitude,
  (SELECT tl.verification_status FROM temporary_locations tl WHERE tl.branch_id=b.id ORDER BY tl.id DESC LIMIT 1) temporaryGpsStatus,
  COUNT(DISTINCT s.id) scheduleCount,b.created_by createdBy,b.created_at createdAt,b.updated_at updatedAt
  FROM branches b LEFT JOIN customers c ON c.id=b.customer_id LEFT JOIN areas a ON a.id=b.area_id LEFT JOIN zone_groups z ON z.id=COALESCE(a.confirmed_zone_group_id,a.zone_group_id) LEFT JOIN branch_schedules s ON s.branch_id=b.id`

export function listBranches(params={},database=defaultDb){
  const where=['1=1'],args=[];if(params.search){const q=`%${params.search}%`;where.push('(b.jodoo_branch_id LIKE ? OR b.branch_name LIKE ? OR c.name LIKE ? OR c.jodoo_customer_id LIKE ? OR b.phone LIKE ? OR b.address LIKE ?)');args.push(q,q,q,q,q,q)}
  if(params.customerId){where.push('c.jodoo_customer_id=?');args.push(params.customerId)}if(params.status){where.push('b.status=?');args.push(params.status)}if(params.areaId){where.push('a.jodoo_area_id=?');args.push(params.areaId)}if(params.zoneGroupId){where.push('COALESCE(a.confirmed_zone_group_id,a.zone_group_id)=?');args.push(Number(params.zoneGroupId))}
  const page=Math.max(1,Number(params.page)||1),pageSize=Math.min(500,Math.max(1,Number(params.pageSize)||25)),total=database.prepare(`SELECT COUNT(*) total FROM branches b LEFT JOIN customers c ON c.id=b.customer_id LEFT JOIN areas a ON a.id=b.area_id WHERE ${where.join(' AND ')}`).get(...args).total
  const items=database.prepare(`${branchSelect} WHERE ${where.join(' AND ')} GROUP BY b.id ORDER BY c.name,b.branch_name LIMIT ? OFFSET ?`).all(...args,pageSize,(page-1)*pageSize)
  return{items,pagination:{page,pageSize,total,pages:Math.ceil(total/pageSize)}}
}

export function getBranch(branchId,database=defaultDb){const item=database.prepare(`${branchSelect} WHERE b.jodoo_branch_id=? GROUP BY b.id`).get(branchId);if(!item)return null;item.schedules=database.prepare('SELECT jodoo_schedule_id scheduleId,frequency,days_of_week assignedWeekdays,take_date takeDate,next_take_date nextTakeDate,is_active isActive FROM branch_schedules WHERE branch_id=? ORDER BY id').all(item.internalId);item.audit=listMasterAudit({entityType:'branch',entityId:branchId},database);return item}

export function createBranch(payload,database=defaultDb){
  const branchId=text(payload.branchId),customerId=text(payload.customerId),name=text(payload.branchName);if(!branchId||!customerId||!name)throw new Error('Branch ID, Customer ID and Branch Name are required')
  const customer=database.prepare('SELECT id FROM customers WHERE jodoo_customer_id=?').get(customerId);if(!customer)throw new Error('Customer ID was not found')
  const area=payload.areaId?database.prepare('SELECT id FROM areas WHERE jodoo_area_id=? OR id=?').get(text(payload.areaId),Number(payload.areaId)||-1):null;if(payload.areaId&&!area)throw new Error('Area ID was not found')
  const status=statusValue(payload.status),payment=paymentValue(payload.paymentType),actor=text(payload.changedBy||payload.createdBy)||'Supervisor'
  database.prepare(`INSERT INTO branches(jodoo_branch_id,customer_id,area_id,source_customer_id,source_area_id,branch_name,address,latitude,longitude,gps_status,gps_verified_at,contact_person,phone,collection_frequency,assigned_weekdays,time_restriction,occ_price,payment_type,proof_requirements,vehicle_restriction,status,notes,source_system,created_by,created_at,is_active)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'KCS',?,CURRENT_TIMESTAMP,?)`).run(branchId,customer.id,area?.id||null,customerId,payload.areaId?text(payload.areaId):null,name,nullable(payload.address),payload.officialLatitude??null,payload.officialLongitude??null,nullable(payload.gpsVerificationStatus),payload.gpsVerifiedAt||null,nullable(payload.contactPerson),nullable(payload.phone),nullable(payload.collectionFrequency),nullable(payload.assignedWeekdays),nullable(payload.collectionTimeConstraint),payload.occPrice??null,payment,nullable(payload.proofRequirements),nullable(payload.vehicleRestriction),status,nullable(payload.notes),actor,status==='active'?1:0)
  const item=getBranch(branchId,database);history(database,'branch',branchId,'created',null,item,{changedBy:actor,reason:payload.reason});return item
}

export function updateBranch(branchId,payload,database=defaultDb){
  const before=database.prepare('SELECT * FROM branches WHERE jodoo_branch_id=?').get(branchId);if(!before)throw new Error('Branch not found')
  if(payload.branchId&&text(payload.branchId)!==branchId)throw new Error('Branch ID cannot be changed after creation')
  const customer=payload.customerId?database.prepare('SELECT id FROM customers WHERE jodoo_customer_id=?').get(text(payload.customerId)):null;if(payload.customerId&&!customer)throw new Error('Customer ID was not found')
  const area=payload.areaId?database.prepare('SELECT id,jodoo_area_id FROM areas WHERE jodoo_area_id=? OR id=?').get(text(payload.areaId),Number(payload.areaId)||-1):null;if(payload.areaId&&!area)throw new Error('Area ID was not found')
  const status=statusValue(payload.status??before.status),payment=paymentValue(payload.paymentType??before.payment_type),actor=text(payload.changedBy)||'Supervisor'
  database.exec('SAVEPOINT update_branch');try{
    database.prepare(`UPDATE branches SET customer_id=?,area_id=?,source_customer_id=?,source_area_id=?,branch_name=?,address=?,latitude=?,longitude=?,gps_status=?,gps_verified_at=?,contact_person=?,phone=?,collection_frequency=?,assigned_weekdays=?,time_restriction=?,occ_price=?,payment_type=?,proof_requirements=?,vehicle_restriction=?,status=?,notes=?,is_active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(
      customer?.id??before.customer_id,area?.id??before.area_id,payload.customerId??before.source_customer_id,area?.jodoo_area_id??before.source_area_id,text(payload.branchName??before.branch_name),payload.address===undefined?before.address:nullable(payload.address),payload.officialLatitude===undefined?before.latitude:payload.officialLatitude,payload.officialLongitude===undefined?before.longitude:payload.officialLongitude,payload.gpsVerificationStatus===undefined?before.gps_status:nullable(payload.gpsVerificationStatus),payload.gpsVerifiedAt===undefined?before.gps_verified_at:payload.gpsVerifiedAt||null,payload.contactPerson===undefined?before.contact_person:nullable(payload.contactPerson),payload.phone===undefined?before.phone:nullable(payload.phone),payload.collectionFrequency===undefined?before.collection_frequency:nullable(payload.collectionFrequency),payload.assignedWeekdays===undefined?before.assigned_weekdays:nullable(payload.assignedWeekdays),payload.collectionTimeConstraint===undefined?before.time_restriction:nullable(payload.collectionTimeConstraint),payload.occPrice===undefined?before.occ_price:payload.occPrice,payment,payload.proofRequirements===undefined?before.proof_requirements:nullable(payload.proofRequirements),payload.vehicleRestriction===undefined?before.vehicle_restriction:nullable(payload.vehicleRestriction),status,payload.notes===undefined?before.notes:nullable(payload.notes),status==='active'?1:0,before.id)
    const after=database.prepare('SELECT * FROM branches WHERE id=?').get(before.id);history(database,'branch',branchId,'updated',before,after,{changedBy:actor,reason:payload.reason})
    const critical=['customer_id','area_id','branch_name','address','latitude','longitude','collection_frequency','assigned_weekdays','time_restriction','occ_price','payment_type','status','is_active'],changed=critical.some(key=>before[key]!==after[key])
    if(changed)invalidateBranches(database,[before.id],'branch_master_changed','branch',branchId,before,after,actor)
    database.exec('RELEASE update_branch');return getBranch(branchId,database)
  }catch(error){database.exec('ROLLBACK TO update_branch; RELEASE update_branch');throw error}
}

export function listMasterAudit(params={},database=defaultDb){const where=['1=1'],args=[];if(params.entityType){where.push('entity_type=?');args.push(params.entityType)}if(params.entityId){where.push('entity_id=?');args.push(String(params.entityId))}return database.prepare(`SELECT id,entity_type entityType,entity_id entityId,change_type changeType,field_name fieldName,old_value oldValue,new_value newValue,reason,changed_by changedBy,changed_at changedAt,before_json beforeJson,after_json afterJson FROM master_change_history WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT 300`).all(...args)}

export function captureBranchGps(branchId,payload,database=defaultDb){const branch=database.prepare('SELECT id,jodoo_branch_id FROM branches WHERE jodoo_branch_id=?').get(branchId);if(!branch)throw new Error('Please select a valid Customer Branch first');const latitude=Number(payload.latitude),longitude=Number(payload.longitude);if(!Number.isFinite(latitude)||latitude < -90||latitude>90||!Number.isFinite(longitude)||longitude < -180||longitude>180)throw new Error('Invalid GPS latitude or longitude');const item=addTemporaryLocation({branchId:branch.id,latitude,longitude,locationSource:payload.locationSource||'Driver Captured',locationLink:payload.locationLink,capturedBy:payload.capturedBy||payload.changedBy||'Employee',employeeId:payload.employeeId,accuracyM:payload.accuracyM,deviceCapturedAt:payload.deviceCapturedAt,dispatchId:payload.dispatchId,dispatchStopId:payload.dispatchStopId,photo:payload.photo,remark:payload.remark},database);history(database,'branch',branchId,'temporary_gps_captured',null,item,{changedBy:payload.capturedBy||payload.changedBy,reason:payload.reason});return item}

export function adoptBranchGps(temporaryLocationId,payload,database=defaultDb){const location=database.prepare('SELECT tl.*,b.jodoo_branch_id branchId,b.latitude oldLatitude,b.longitude oldLongitude FROM temporary_locations tl JOIN branches b ON b.id=tl.branch_id WHERE tl.id=?').get(temporaryLocationId);if(!location)throw new Error('Temporary GPS was not found');const result=adoptTemporaryLocation(temporaryLocationId,{adoptedBy:payload.adoptedBy||payload.changedBy||'Supervisor'},database);history(database,'branch',location.branchId,'official_gps_adopted',{latitude:location.oldLatitude,longitude:location.oldLongitude},{latitude:location.latitude,longitude:location.longitude,distanceWarning:result.distanceWarning},{changedBy:payload.adoptedBy||payload.changedBy,reason:payload.reason});return result}

export function listGpsCollector(params={},database=defaultDb){const where=['1=1'],args=[];if(params.status){where.push('tl.verification_status=?');args.push(params.status)}if(params.employeeId){where.push('tl.employee_id=?');args.push(Number(params.employeeId))}return database.prepare(`SELECT tl.id,b.jodoo_branch_id branchId,c.name customerName,b.branch_name branchName,b.address,tl.latitude temporaryLatitude,tl.longitude temporaryLongitude,tl.location_source locationSource,tl.verification_status verificationStatus,tl.distance_from_official_m distanceFromOfficialM,tl.accuracy_m accuracyM,tl.device_captured_at deviceCapturedAt,tl.server_received_at serverReceivedAt,tl.photo_storage_key photoStorageKey,tl.remark,tl.review_decision reviewDecision,tl.review_reason reviewReason,tl.reviewed_by reviewedBy,tl.reviewed_at reviewedAt,tl.captured_by capturedBy,tl.captured_at capturedAt,tl.adopted_by adoptedBy,tl.adopted_at adoptedAt,b.latitude officialLatitude,b.longitude officialLongitude FROM temporary_locations tl JOIN branches b ON b.id=tl.branch_id LEFT JOIN customers c ON c.id=b.customer_id WHERE ${where.join(' AND ')} ORDER BY tl.id DESC LIMIT 300`).all(...args)}

export function areaCloseout(database=defaultDb){const summary=database.prepare(`SELECT COUNT(*) totalAreas,SUM(CASE WHEN zone_assignment_status='confirmed' AND confirmed_zone_group_id IS NOT NULL THEN 1 ELSE 0 END) confirmedAreas,SUM(CASE WHEN zone_assignment_status<>'confirmed' OR confirmed_zone_group_id IS NULL THEN 1 ELSE 0 END) pendingAreas FROM areas`).get();summary.zones=database.prepare(`SELECT z.id,z.code,z.name,COUNT(a.id) areaCount FROM zone_groups z LEFT JOIN areas a ON a.confirmed_zone_group_id=z.id AND a.zone_assignment_status='confirmed' WHERE z.is_active=1 GROUP BY z.id ORDER BY z.sort_order,z.id`).all();return summary}

export function listBuyers(params={},database=defaultDb){const where=['1=1'],args=[];if(params.search){const q=`%${params.search}%`;where.push('(buyer_code LIKE ? OR buyer_name LIKE ? OR location_name LIKE ? OR phone LIKE ?)');args.push(q,q,q,q)}if(params.status){where.push('status=?');args.push(params.status)}return database.prepare(`SELECT id,buyer_code buyerId,buyer_name buyerName,location_name locationName,address,latitude officialLatitude,longitude officialLongitude,contact_person contactPerson,phone,material_accepted materialAccepted,operating_hours operatingHours,unloading_restrictions unloadingRestrictions,pricing_notes pricingNotes,status,notes,created_by createdBy,created_at createdAt,updated_at updatedAt FROM buyers WHERE ${where.join(' AND ')} ORDER BY buyer_name`).all(...args)}

export function saveBuyer(payload,id=null,database=defaultDb){const before=id?database.prepare('SELECT * FROM buyers WHERE id=?').get(id):null,buyerId=text(payload.buyerId??before?.buyer_code),name=text(payload.buyerName??before?.buyer_name);if(!buyerId||!name)throw new Error('Buyer ID and Buyer Name are required');const values=[buyerId,name,payload.locationName===undefined?before?.location_name:nullable(payload.locationName),payload.address===undefined?before?.address:nullable(payload.address),payload.officialLatitude===undefined?before?.latitude:payload.officialLatitude,payload.officialLongitude===undefined?before?.longitude:payload.officialLongitude,payload.contactPerson===undefined?before?.contact_person:nullable(payload.contactPerson),payload.phone===undefined?before?.phone:nullable(payload.phone),payload.materialAccepted===undefined?before?.material_accepted:nullable(payload.materialAccepted),payload.operatingHours===undefined?before?.operating_hours:nullable(payload.operatingHours),payload.unloadingRestrictions===undefined?before?.unloading_restrictions:nullable(payload.unloadingRestrictions),payload.pricingNotes===undefined?before?.pricing_notes:nullable(payload.pricingNotes),statusValue(payload.status??before?.status),payload.notes===undefined?before?.notes:nullable(payload.notes)]
  const safeValues=values.map(item=>item===undefined?null:item);let internalId=id;if(before)database.prepare(`UPDATE buyers SET buyer_code=?,buyer_name=?,location_name=?,address=?,latitude=?,longitude=?,contact_person=?,phone=?,material_accepted=?,operating_hours=?,unloading_restrictions=?,pricing_notes=?,status=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(...safeValues,id);else internalId=Number(database.prepare(`INSERT INTO buyers(buyer_code,buyer_name,location_name,address,latitude,longitude,contact_person,phone,material_accepted,operating_hours,unloading_restrictions,pricing_notes,status,notes,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(...safeValues,text(payload.changedBy||payload.createdBy)||'Supervisor').lastInsertRowid);const item=listBuyers({},database).find(x=>x.id===Number(internalId));history(database,'buyer',buyerId,before?'updated':'created',before,item,{changedBy:payload.changedBy||payload.createdBy,reason:payload.reason});return item}

const locationTypeMap={'Company Yard':'depot','Buyer':'factory','Employee Base':'employee_home','Workshop':'other','Fuel Station':'other','Other':'other'}
export function listOperationalLocations(params={},database=defaultDb){const where=['1=1'],args=[];if(params.search){const q=`%${params.search}%`;where.push('(l.location_code LIKE ? OR l.name LIKE ? OR l.address LIKE ? OR l.contact_person LIKE ?)');args.push(q,q,q,q)}if(params.status){where.push('l.status=?');args.push(params.status)}if(params.type){where.push('l.operational_type=?');args.push(params.type)}return database.prepare(`SELECT l.id,l.location_code locationId,l.name,l.operational_type locationType,l.address,l.latitude,l.longitude,l.operating_hours operatingHours,l.contact_person contactPerson,l.phone,l.status,l.notes,l.can_start canStart,l.can_end canEnd,l.buyer_id buyerInternalId,b.buyer_code buyerId,b.buyer_name buyerName,l.created_by createdBy,l.created_at createdAt,l.updated_at updatedAt FROM operational_locations l LEFT JOIN buyers b ON b.id=l.buyer_id WHERE ${where.join(' AND ')} ORDER BY l.name`).all(...args)}

export function saveOperationalLocation(payload,id=null,database=defaultDb){const before=id?database.prepare('SELECT * FROM operational_locations WHERE id=?').get(id):null,name=text(payload.name??before?.name),type=text(payload.locationType??before?.operational_type??'Other'),locationId=text(payload.locationId??before?.location_code)||null;if(!name)throw new Error('Location Name is required');if(!locationTypeMap[type])throw new Error('Invalid Operational Location type');const buyer=payload.buyerId?database.prepare('SELECT id FROM buyers WHERE buyer_code=?').get(text(payload.buyerId)):null;if(payload.buyerId&&!buyer)throw new Error('Buyer ID was not found');const values=[locationId,name,locationTypeMap[type],type,payload.address===undefined?before?.address:nullable(payload.address),payload.latitude===undefined?before?.latitude:payload.latitude,payload.longitude===undefined?before?.longitude:payload.longitude,payload.operatingHours===undefined?before?.operating_hours:nullable(payload.operatingHours),payload.contactPerson===undefined?before?.contact_person:nullable(payload.contactPerson),payload.phone===undefined?before?.phone:nullable(payload.phone),statusValue(payload.status??before?.status),payload.notes===undefined?before?.notes:nullable(payload.notes),payload.canStart===undefined?(before?.can_start??0):Number(Boolean(payload.canStart)),payload.canEnd===undefined?(before?.can_end??1):Number(Boolean(payload.canEnd)),buyer?.id??before?.buyer_id??null]
  const safeValues=values.map(item=>item===undefined?null:item);let internalId=id;if(before)database.prepare(`UPDATE operational_locations SET location_code=?,name=?,location_type=?,operational_type=?,address=?,latitude=?,longitude=?,operating_hours=?,contact_person=?,phone=?,status=?,notes=?,can_start=?,can_end=?,buyer_id=?,is_active=CASE WHEN ?='active' THEN 1 ELSE 0 END,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(...safeValues,safeValues[10],id);else internalId=Number(database.prepare(`INSERT INTO operational_locations(location_code,name,location_type,operational_type,address,latitude,longitude,operating_hours,contact_person,phone,status,notes,can_start,can_end,buyer_id,is_active,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(...safeValues,safeValues[10]==='active'?1:0,text(payload.changedBy||payload.createdBy)||'Supervisor').lastInsertRowid);const item=listOperationalLocations({},database).find(x=>x.id===Number(internalId));history(database,'operational_location',internalId,before?'updated':'created',before,item,{changedBy:payload.changedBy||payload.createdBy,reason:payload.reason});return item}
