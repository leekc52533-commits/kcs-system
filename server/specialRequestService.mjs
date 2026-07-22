import { db as defaultDb } from './database.mjs'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { uploadsDir } from './database.mjs'
import { recalculateRecommendations } from './gpsRecommendationService.mjs'
import { createStop, invalidateDispatchDay, requestDedupeKey } from './dispatchService.mjs'

const clean = (value) => String(value ?? '').trim()
const rowView = (row) => row ? ({
  id:row.id,requestType:row.request_type,existingBranchId:row.existing_branch_id,temporaryCustomerName:row.temporary_customer_name,
  contactPerson:row.contact_person,phone:row.phone,whatsapp:row.whatsapp,address:row.address,locationLink:row.location_link,
  temporaryLatitude:row.temporary_latitude,temporaryLongitude:row.temporary_longitude,locationSource:row.location_source,
  verificationStatus:row.verification_status,requestedCollectionDate:row.requested_collection_date,estimatedWeightKg:row.estimated_weight_kg,
  specialRequirement:row.special_requirement,createdBy:row.created_by,promisedToCustomer:Boolean(row.promised_to_customer),remark:row.remark,
  status:row.status,accountStatus:row.account_status,customerId:row.linked_customer_id,branchId:row.linked_branch_id,
  occPrice:row.occ_price,paymentType:row.payment_type,scheduledDate:row.scheduled_date,vehicleId:row.vehicle_id,tripNumber:row.trip_number,
  completionStatus:row.completion_status,approvedBy:row.approved_by,approvedAt:row.approved_at,createdAt:row.created_at,updatedAt:row.updated_at,
  customerName:row.customer_name,branchName:row.branch_name,area:row.area,officialLatitude:row.official_latitude,officialLongitude:row.official_longitude,
  schedules:row.schedules ? JSON.parse(row.schedules) : []
}) : null

const SELECT = `SELECT r.*,c.name customer_name,b.branch_name,a.name area,b.latitude official_latitude,b.longitude official_longitude,
  COALESCE((SELECT json_group_array(json_object('scheduleId',s.jodoo_schedule_id,'frequency',s.frequency,'dayOfWeek',s.days_of_week)) FROM branch_schedules s WHERE s.branch_id=b.id),'[]') schedules
  FROM special_collection_requests r LEFT JOIN branches b ON b.id=r.existing_branch_id LEFT JOIN customers c ON c.id=b.customer_id LEFT JOIN areas a ON a.id=b.area_id`

export function searchCustomerBranches(params={},database=defaultDb){
  const search=clean(params.search),like=`%${search}%`
  const nearby=Number.isFinite(Number(params.latitude))&&Number.isFinite(Number(params.longitude)),limit=nearby?2000:30
  const rows=database.prepare(`SELECT b.id internalId,b.jodoo_branch_id branchId,b.branch_name branchName,b.address,b.latitude,b.longitude,
    c.jodoo_customer_id customerId,c.name customerName,c.payment_type paymentType,c.occ_price occPrice,c.phone,c.whatsapp,a.name area,
    COALESCE((SELECT json_group_array(json_object('scheduleId',s.jodoo_schedule_id,'frequency',s.frequency,'dayOfWeek',s.days_of_week)) FROM branch_schedules s WHERE s.branch_id=b.id),'[]') schedules
    FROM branches b LEFT JOIN customers c ON c.id=b.customer_id LEFT JOIN areas a ON a.id=b.area_id
    WHERE ?='' OR c.name LIKE ? OR b.branch_name LIKE ? OR c.jodoo_customer_id LIKE ? OR b.jodoo_branch_id LIKE ? OR c.phone LIKE ? OR c.whatsapp LIKE ? OR b.address LIKE ? LIMIT ?`).all(search,like,like,like,like,like,like,like,limit)
  return rows.map(row=>({...row,schedules:JSON.parse(row.schedules),distanceMeters:nearby&&row.latitude!=null&&row.longitude!=null?distanceMeters(Number(params.latitude),Number(params.longitude),row.latitude,row.longitude):null})).filter(row=>!nearby||row.distanceMeters<=Number(params.radiusMeters||3000)).sort((a,b)=>(a.distanceMeters??Infinity)-(b.distanceMeters??Infinity)).slice(0,30)
}

export function listSpecialRequests(params={},database=defaultDb){
  const where=[],args=[]
  if(params.status){where.push('r.status=?');args.push(params.status)}
  if(params.promised==='true'){where.push('r.promised_to_customer=1')}
  if(params.date){where.push('(r.requested_collection_date=? OR r.scheduled_date=?)');args.push(params.date,params.date)}
  return database.prepare(`${SELECT}${where.length?' WHERE '+where.join(' AND '):''} ORDER BY r.promised_to_customer DESC,r.created_at DESC`).all(...args).map(rowView)
}

function accountStatus(payload,type){
  if(type==='existing')return 'ready_for_dispatch'
  if(!clean(payload.customerId))return 'awaiting_customer_creation'
  if(!clean(payload.branchId))return 'awaiting_branch_creation'
  if(payload.occPrice==null||payload.occPrice==='')return 'awaiting_price'
  if(!clean(payload.paymentType))return 'awaiting_payment_type'
  return 'ready_for_dispatch'
}

export function createSpecialRequest(payload,database=defaultDb){
  if(!payload.requestedCollectionDate)throw new Error('Requested Collection Date is required')
  const branch=payload.existingBranchId?database.prepare(`SELECT b.*,c.jodoo_customer_id customer_id,c.payment_type,c.occ_price FROM branches b LEFT JOIN customers c ON c.id=b.customer_id WHERE b.id=? OR b.jodoo_branch_id=?`).get(payload.existingBranchId,payload.existingBranchId):null
  const type=branch?'existing':'potential_new'
  if(type==='potential_new'&&!clean(payload.temporaryCustomerName))throw new Error('Temporary Customer Name is required')
  const normalized={...payload,existingBranchId:branch?.id||'',temporaryCustomerName:payload.temporaryCustomerName||branch?.branch_name||''}
  const key=requestDedupeKey(normalized)
  const duplicate=database.prepare(`${SELECT} WHERE r.dedupe_key=?`).get(key)
  if(duplicate)return{...rowView(duplicate),deduplicated:true}
  const status=type==='existing'?'awaiting_supervisor':'awaiting_customer_account'
  const result=database.prepare(`INSERT INTO special_collection_requests(request_type,existing_branch_id,temporary_customer_name,contact_person,phone,whatsapp,address,location_link,temporary_latitude,temporary_longitude,location_source,verification_status,requested_collection_date,estimated_weight_kg,special_requirement,created_by,promised_to_customer,remark,status,account_status,linked_customer_id,linked_branch_id,occ_price,payment_type,dedupe_key)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(type,branch?.id||null,normalized.temporaryCustomerName||null,payload.contactPerson||null,payload.phone||null,payload.whatsapp||null,payload.address||branch?.address||null,payload.locationLink||null,payload.temporaryLatitude??null,payload.temporaryLongitude??null,payload.locationSource||null,payload.verificationStatus||'unverified',payload.requestedCollectionDate,payload.estimatedWeightKg??null,payload.specialRequirement||null,payload.createdBy||'Office',payload.promisedToCustomer?1:0,payload.remark||null,status,accountStatus({...payload,customerId:branch?.customer_id,branchId:branch?.jodoo_branch_id,occPrice:branch?.occ_price,paymentType:branch?.payment_type},type),branch?.customer_id||payload.customerId||null,branch?.jodoo_branch_id||payload.branchId||null,branch?.occ_price??payload.occPrice??null,branch?.payment_type||payload.paymentType||null,key)
  if(payload.temporaryLatitude!=null&&payload.temporaryLongitude!=null){const periodId=payload.employeeId?database.prepare('SELECT id FROM employee_employment_history WHERE employee_id=? ORDER BY id DESC LIMIT 1').get(payload.employeeId)?.id||null:null;database.prepare(`INSERT INTO temporary_locations(special_request_id,latitude,longitude,location_source,location_link,verification_status,captured_by,employee_id,employment_period_id,accuracy_m,device_captured_at,server_received_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(result.lastInsertRowid,payload.temporaryLatitude,payload.temporaryLongitude,payload.locationSource||'Manual Entry',payload.locationLink||null,payload.verificationStatus||'pending_supervisor',payload.createdBy||'Office',payload.employeeId||null,periodId,payload.accuracyM??null,payload.deviceCapturedAt||null,new Date().toISOString())}
  invalidateDispatchDay(database,payload.requestedCollectionDate,'special_request_created','special_request',result.lastInsertRowid,null,payload,payload.createdBy)
  return rowView(database.prepare(`${SELECT} WHERE r.id=?`).get(result.lastInsertRowid))
}

export function updateSpecialRequest(id,payload,database=defaultDb){
  const before=database.prepare('SELECT * FROM special_collection_requests WHERE id=?').get(id);if(!before)throw new Error('Special request not found')
  const fields={temporary_customer_name:'temporaryCustomerName',contact_person:'contactPerson',phone:'phone',whatsapp:'whatsapp',address:'address',location_link:'locationLink',temporary_latitude:'temporaryLatitude',temporary_longitude:'temporaryLongitude',location_source:'locationSource',verification_status:'verificationStatus',requested_collection_date:'requestedCollectionDate',estimated_weight_kg:'estimatedWeightKg',special_requirement:'specialRequirement',promised_to_customer:'promisedToCustomer',remark:'remark',status:'status',occ_price:'occPrice',payment_type:'paymentType'}
  const sets=[],values=[]
  for(const [column,key] of Object.entries(fields))if(payload[key]!==undefined){sets.push(`${column}=?`);values.push(key==='promisedToCustomer'?Number(Boolean(payload[key])):payload[key])}
  if(payload.status==='approved'){sets.push('approved_by=?','approved_at=CURRENT_TIMESTAMP');values.push(payload.approvedBy||payload.changedBy||'Supervisor')}
  if(sets.length){sets.push('updated_at=CURRENT_TIMESTAMP');database.prepare(`UPDATE special_collection_requests SET ${sets.join(',')} WHERE id=?`).run(...values,id)}
  if(before.scheduled_date)invalidateDispatchDay(database,before.scheduled_date,'special_request_updated','special_request',id,before,payload,payload.changedBy)
  if(payload.requestedCollectionDate&&payload.requestedCollectionDate!==before.requested_collection_date)invalidateDispatchDay(database,payload.requestedCollectionDate,'special_request_date_changed','special_request',id,before,payload,payload.changedBy)
  return rowView(database.prepare(`${SELECT} WHERE r.id=?`).get(id))
}

export function scheduleSpecialRequest(id,payload,database=defaultDb){
  const request=database.prepare('SELECT * FROM special_collection_requests WHERE id=?').get(id);if(!request)throw new Error('Special request not found')
  const date=payload.date||request.requested_collection_date
  database.prepare(`UPDATE special_collection_requests SET scheduled_date=?,vehicle_id=?,trip_number=?,status='scheduled',updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(date,payload.vehicleId??null,payload.tripNumber||1,id)
  if(request.existing_branch_id){
    const branch=database.prepare('SELECT jodoo_branch_id FROM branches WHERE id=?').get(request.existing_branch_id)
    createStop({date,branchId:branch.jodoo_branch_id,tripId:payload.tripId,tripNumber:payload.tripNumber||1,specialRequestId:Number(id),estimatedWeightKg:request.estimated_weight_kg,changedBy:payload.scheduledBy},database)
  }else invalidateDispatchDay(database,date,'special_request_scheduled','special_request',id,null,payload,payload.scheduledBy)
  return rowView(database.prepare(`${SELECT} WHERE r.id=?`).get(id))
}

export function convertToExisting(id,payload,database=defaultDb){
  const branch=database.prepare(`SELECT b.*,c.jodoo_customer_id customer_id,c.payment_type,c.occ_price FROM branches b LEFT JOIN customers c ON c.id=b.customer_id WHERE b.id=? OR b.jodoo_branch_id=?`).get(payload.branchId,payload.branchId);if(!branch)throw new Error('Existing Branch not found')
  database.prepare(`UPDATE special_collection_requests SET request_type='existing',existing_branch_id=?,linked_customer_id=?,linked_branch_id=?,occ_price=?,payment_type=?,account_status='ready_for_dispatch',updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(branch.id,branch.customer_id,branch.jodoo_branch_id,branch.occ_price,branch.payment_type,id)
  database.prepare('UPDATE temporary_locations SET branch_id=? WHERE special_request_id=? AND branch_id IS NULL').run(branch.id,id)
  const request=database.prepare('SELECT * FROM special_collection_requests WHERE id=?').get(id)
  if(request.scheduled_date)createStop({date:request.scheduled_date,branchId:branch.jodoo_branch_id,tripNumber:request.trip_number||1,specialRequestId:Number(id),estimatedWeightKg:request.estimated_weight_kg,changedBy:payload.changedBy},database)
  return rowView(database.prepare(`${SELECT} WHERE r.id=?`).get(id))
}

export function linkNewAccount(id,payload,database=defaultDb){
  const branch=database.prepare(`SELECT b.*,c.jodoo_customer_id customer_id,c.payment_type,c.occ_price FROM branches b JOIN customers c ON c.id=b.customer_id WHERE b.jodoo_branch_id=? AND c.jodoo_customer_id=?`).get(payload.branchId,payload.customerId)
  if(!branch)throw new Error('请先从 Jodoo 导入正式 CustomerID 与 BranchID，再连接账号')
  return convertToExisting(id,{branchId:branch.id,changedBy:payload.changedBy},database)
}

const radians=(n)=>n*Math.PI/180
function distanceMeters(aLat,aLng,bLat,bLng){const earth=6371000,dLat=radians(bLat-aLat),dLng=radians(bLng-aLng),a=Math.sin(dLat/2)**2+Math.cos(radians(aLat))*Math.cos(radians(bLat))*Math.sin(dLng/2)**2;return 2*earth*Math.asin(Math.sqrt(a))}
function saveGpsPhoto(photo){if(!photo?.dataUrl)return{};const match=String(photo.dataUrl).match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);if(!match)throw new Error('现场照片只支持 JPG、PNG 或 WEBP');const data=Buffer.from(match[2],'base64');if(data.length>8_000_000)throw new Error('现场照片不可超过 8MB');const ext={"image/jpeg":'jpg',"image/png":'png',"image/webp":'webp'}[match[1]],folder=path.join(uploadsDir,'gps');fs.mkdirSync(folder,{recursive:true});const key=`gps/${Date.now()}-${crypto.randomBytes(8).toString('hex')}.${ext}`;fs.writeFileSync(path.join(uploadsDir,key),data,{flag:'wx'});return{photoStorageKey:key,photoOriginalName:clean(photo.name)||`site.${ext}`,photoContentType:match[1]}}
export function addTemporaryLocation(payload,database=defaultDb){const latitude=Number(payload.latitude),longitude=Number(payload.longitude);if(!Number.isFinite(latitude)||latitude < -90||latitude>90||!Number.isFinite(longitude)||longitude < -180||longitude>180)throw new Error('Invalid GPS latitude or longitude');const photo=saveGpsPhoto(payload.photo),periodId=payload.employeeId?database.prepare('SELECT id FROM employee_employment_history WHERE employee_id=? ORDER BY id DESC LIMIT 1').get(payload.employeeId)?.id||null:null;const result=database.prepare(`INSERT INTO temporary_locations(special_request_id,branch_id,latitude,longitude,location_source,location_link,verification_status,captured_by,accuracy_m,device_captured_at,server_received_at,employee_id,employment_period_id,dispatch_id,dispatch_stop_id,photo_storage_key,photo_original_name,photo_content_type,remark) VALUES(?,?,?,?,?,?,'pending_supervisor',?,?,?,?,?,?,?,?,?,?,?,?)`).run(payload.specialRequestId||null,payload.branchId||null,latitude,longitude,payload.locationSource||'Driver Captured',payload.locationLink||null,payload.capturedBy||'Driver',payload.accuracyM??null,payload.deviceCapturedAt||null,new Date().toISOString(),payload.employeeId||null,periodId,payload.dispatchId||null,payload.dispatchStopId||null,photo.photoStorageKey||null,photo.photoOriginalName||null,photo.photoContentType||null,clean(payload.remark)||null);return database.prepare('SELECT * FROM temporary_locations WHERE id=?').get(result.lastInsertRowid)}
export function listTemporaryLocations(params={},database=defaultDb){const conditions=['1=1'],args=[];if(params.status){conditions.push('tl.verification_status=?');args.push(params.status)}if(params.employeeId){conditions.push('tl.employee_id=?');args.push(Number(params.employeeId))}return database.prepare(`SELECT tl.*,b.jodoo_branch_id branchId,b.branch_name branchName,c.name customerName,b.address,b.latitude officialLatitude,b.longitude officialLongitude,r.temporary_customer_name temporaryCustomerName FROM temporary_locations tl LEFT JOIN branches b ON b.id=tl.branch_id LEFT JOIN customers c ON c.id=b.customer_id LEFT JOIN special_collection_requests r ON r.id=tl.special_request_id WHERE ${conditions.join(' AND ')} ORDER BY tl.captured_at DESC`).all(...args)}
export function adoptTemporaryLocation(id,{adoptedBy='Supervisor'}={},database=defaultDb){const location=database.prepare('SELECT * FROM temporary_locations WHERE id=?').get(id);if(!location)throw new Error('Temporary location not found');let branchId=location.branch_id;if(!branchId&&location.special_request_id)branchId=database.prepare('SELECT existing_branch_id id FROM special_collection_requests WHERE id=?').get(location.special_request_id)?.id;if(!branchId)throw new Error('临时位置尚未连接正式 Branch');const official=database.prepare('SELECT latitude,longitude FROM branches WHERE id=?').get(branchId);const distance=official?.latitude!=null&&official?.longitude!=null?distanceMeters(official.latitude,official.longitude,location.latitude,location.longitude):null;database.exec('BEGIN IMMEDIATE');try{database.prepare(`UPDATE branches SET latitude=?,longitude=?,gps_status='Supervisor Confirmed',gps_verified_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(location.latitude,location.longitude,branchId);database.prepare(`UPDATE temporary_locations SET verification_status='adopted',distance_from_official_m=?,adopted_by=?,adopted_at=CURRENT_TIMESTAMP WHERE id=?`).run(distance,adoptedBy,id);const dates=database.prepare(`SELECT DISTINCT dd.dispatch_date FROM dispatch_days dd JOIN dispatch_trips dt ON dt.dispatch_day_id=dd.id JOIN dispatch_stops ds ON ds.dispatch_trip_id=dt.id WHERE ds.branch_id=? AND dd.dispatch_date>=date('now','localtime')`).all(branchId);for(const day of dates)invalidateDispatchDay(database,day.dispatch_date,'official_gps_adopted','branch',branchId,official,{latitude:location.latitude,longitude:location.longitude},adoptedBy);database.exec('COMMIT')}catch(error){database.exec('ROLLBACK');throw error}recalculateRecommendations({branchIds:[branchId],changedBy:adoptedBy},database);return{...database.prepare('SELECT * FROM temporary_locations WHERE id=?').get(id),distanceWarning:distance!=null&&distance>500}}
export function reviewTemporaryLocation(id,payload,database=defaultDb){const decision=clean(payload.decision);if(decision==='adopt')return adoptTemporaryLocation(id,{adoptedBy:payload.reviewedBy||'Supervisor'},database);if(!['reject','recapture','keep_official','later'].includes(decision))throw new Error('Invalid GPS review decision');const status={reject:'rejected',recapture:'recapture_requested',keep_official:'kept_official',later:'pending_supervisor'}[decision];database.prepare(`UPDATE temporary_locations SET verification_status=?,review_decision=?,review_reason=?,reviewed_by_account_id=?,reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP WHERE id=?`).run(status,decision,clean(payload.reason)||null,payload.reviewedByAccountId||null,payload.reviewedBy||'Supervisor',id);return database.prepare('SELECT * FROM temporary_locations WHERE id=?').get(id)}
