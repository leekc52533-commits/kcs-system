import fs from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { db as defaultDb, uploadsDir } from './database.mjs'

const text=value=>String(value??'').trim()
const numberOrNull=value=>value===''||value==null?null:Number(value)
const dateOrNull=value=>text(value)||null
const actor=value=>text(value)||'Supervisor'
const camelRow=row=>row?Object.fromEntries(Object.entries(row).map(([key,value])=>[key.replace(/_([a-z])/g,(_,letter)=>letter.toUpperCase()),value])):null

function vehicle(database,id){
  return database.prepare(`SELECT v.*,base.name default_base FROM vehicles v LEFT JOIN operational_locations base ON base.id=v.default_base_location_id WHERE v.id=?`).get(id)
}

function reminderLevel(date){
  if(!date)return null
  const today=new Date();today.setHours(0,0,0,0)
  const due=new Date(`${date}T00:00:00`)
  const days=Math.ceil((due-today)/86400000)
  if(days<0)return{level:'overdue',days,message:`已过期 ${Math.abs(days)} 天`}
  if(days<=7)return{level:'red',days,message:`剩余 ${days} 天`}
  if(days<=14)return{level:'orange',days,message:`剩余 ${days} 天`}
  if(days<=30)return{level:'yellow',days,message:`剩余 ${days} 天`}
  return{level:'normal',days,message:`剩余 ${days} 天`}
}

function saveAttachment(vehicleId,file){
  if(!file?.dataUrl)return{storageKey:null,originalName:null,contentType:null,sizeBytes:null}
  const match=String(file.dataUrl).match(/^data:([\w/+.-]+);base64,([A-Za-z0-9+/=]+)$/)
  if(!match)throw new Error('Attachment format is invalid')
  const allowed=new Set(['image/jpeg','image/png','image/webp','application/pdf'])
  if(!allowed.has(match[1]))throw new Error('Only JPG, PNG, WEBP or PDF attachments are allowed')
  const buffer=Buffer.from(match[2],'base64')
  if(buffer.length>8*1024*1024)throw new Error('Each attachment must be 8 MB or smaller')
  const ext=match[1]==='application/pdf'?'.pdf':match[1]==='image/png'?'.png':match[1]==='image/webp'?'.webp':'.jpg'
  const folder=path.join(uploadsDir,'vehicles',String(vehicleId));fs.mkdirSync(folder,{recursive:true})
  const fileName=`${Date.now()}-${randomUUID()}${ext}`;fs.writeFileSync(path.join(folder,fileName),buffer,{flag:'wx'})
  return{storageKey:path.posix.join('vehicles',String(vehicleId),fileName),originalName:path.basename(text(file.name)||`attachment${ext}`),contentType:match[1],sizeBytes:buffer.length}
}

const recordRows=(database,table,vehicleId,order)=>database.prepare(`SELECT * FROM ${table} WHERE vehicle_id=? ORDER BY ${order}`).all(vehicleId).map(camelRow)

export function getVehicleDetail(id,database=defaultDb,options={}){
  const row=vehicle(database,id);if(!row)throw new Error('Vehicle not found')
  const preferredZones=database.prepare(`SELECT z.id,z.code,z.name FROM vehicle_preferred_zones vpz JOIN zone_groups z ON z.id=vpz.zone_group_id WHERE vpz.vehicle_id=? ORDER BY z.sort_order,z.id`).all(id)
  const preferredAreas=database.prepare(`SELECT a.id,a.name FROM vehicle_preferred_areas vpa JOIN areas a ON a.id=vpa.area_id WHERE vpa.vehicle_id=? ORDER BY a.name`).all(id)
  const currentDriver=database.prepare(`SELECT e.id,e.employee_code employeeCode,e.name,d.dispatch_date dispatchDate FROM dispatches d JOIN employees e ON e.id=d.driver_id WHERE d.vehicle_id=? ORDER BY d.dispatch_date DESC,d.updated_at DESC LIMIT 1`).get(id)||null
  const compliance=row.operational_status==='sold'?null:camelRow(database.prepare('SELECT * FROM vehicle_compliance_reminders WHERE vehicle_id=?').get(id)||{})
  if(compliance)for(const key of ['puspakomDueDate','roadTaxDueDate','insuranceDueDate','loanPaymentDueDate','nextServiceDate'])compliance[`${key}Alert`]=reminderLevel(compliance[key])
  return{...camelRow(row),status:row.operational_status,capacityKg:row.capacity_kg,operationalCapacityKg:row.capacity_kg,preferredZones,preferredAreas,currentDriver,compliance,
    maintenanceRecords:recordRows(database,'vehicle_maintenance_records',id,'maintenance_date DESC,id DESC'),fuelRecords:recordRows(database,'vehicle_fuel_records',id,'fuel_at DESC,id DESC'),
    tyreRecords:recordRows(database,'vehicle_tyre_records',id,'install_date DESC,id DESC'),documents:options.includeDocuments===false?[]:recordRows(database,'vehicle_documents',id,'document_type,is_current DESC,version_number DESC,id DESC'),
    statusHistory:recordRows(database,'vehicle_status_history',id,'changed_at DESC,id DESC'),usageHistory:recordRows(database,'vehicle_usage_history',id,'dispatch_date DESC,id DESC')}
}

export function updateVehicleCompliance(id,payload,database=defaultDb){
  const row=vehicle(database,id);if(!row)throw new Error('Vehicle not found');if(row.operational_status==='sold')throw new Error('Sold vehicles do not receive compliance reminders')
  database.prepare(`INSERT INTO vehicle_compliance_reminders(vehicle_id,puspakom_due_date,road_tax_due_date,insurance_due_date,loan_payment_due_date,next_service_date,next_service_mileage,updated_by)
    VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(vehicle_id) DO UPDATE SET puspakom_due_date=excluded.puspakom_due_date,road_tax_due_date=excluded.road_tax_due_date,insurance_due_date=excluded.insurance_due_date,loan_payment_due_date=excluded.loan_payment_due_date,next_service_date=excluded.next_service_date,next_service_mileage=excluded.next_service_mileage,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`).run(id,dateOrNull(payload.puspakomDueDate),dateOrNull(payload.roadTaxDueDate),dateOrNull(payload.insuranceDueDate),dateOrNull(payload.loanPaymentDueDate),dateOrNull(payload.nextServiceDate),numberOrNull(payload.nextServiceMileage),actor(payload.updatedBy))
  return getVehicleDetail(id,database).compliance
}

export function addMaintenanceRecord(id,payload,database=defaultDb){
  if(!vehicle(database,id))throw new Error('Vehicle not found');if(!payload.date)throw new Error('Maintenance date is required')
  const invoice=saveAttachment(id,payload.invoiceAttachment),before=saveAttachment(id,payload.beforePhoto),after=saveAttachment(id,payload.afterPhoto)
  const labour=Number(payload.labourCost||0),parts=Number(payload.partsCost||0),total=payload.totalCost==null?labour+parts:Number(payload.totalCost)
  const result=database.prepare(`INSERT INTO vehicle_maintenance_records(vehicle_id,maintenance_date,mileage,fault_description,repair_work,parts_replaced,workshop,labour_cost,parts_cost,total_cost,invoice_storage_key,invoice_original_name,before_photo_storage_key,before_photo_original_name,after_photo_storage_key,after_photo_original_name,downtime_start,downtime_end,approved_by,follow_up_date) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id,payload.date,numberOrNull(payload.mileage),text(payload.faultDescription)||null,text(payload.repairWork)||null,text(payload.partsReplaced)||null,text(payload.workshop)||null,labour,parts,total,invoice.storageKey,invoice.originalName,before.storageKey,before.originalName,after.storageKey,after.originalName,dateOrNull(payload.downtimeStart),dateOrNull(payload.downtimeEnd),text(payload.approvedBy)||null,dateOrNull(payload.followUpDate))
  return camelRow(database.prepare('SELECT * FROM vehicle_maintenance_records WHERE id=?').get(result.lastInsertRowid))
}

export function addFuelRecord(id,payload,database=defaultDb){
  if(!vehicle(database,id))throw new Error('Vehicle not found');if(!payload.dateTime)throw new Error('Fuel date/time is required')
  const receipt=saveAttachment(id,payload.receiptPhoto),litres=numberOrNull(payload.litres),price=numberOrNull(payload.pricePerLitre)
  const result=database.prepare(`INSERT INTO vehicle_fuel_records(vehicle_id,fuel_at,driver_id,mileage,fuel_station,litres,price_per_litre,total_amount,receipt_storage_key,receipt_original_name,full_tank,related_dispatch_date) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(id,payload.dateTime,numberOrNull(payload.driverId),numberOrNull(payload.mileage),text(payload.fuelStation)||null,litres,price,payload.totalAmount==null&&litres!=null&&price!=null?litres*price:numberOrNull(payload.totalAmount),receipt.storageKey,receipt.originalName,payload.fullTank?1:0,dateOrNull(payload.relatedDispatchDate))
  return camelRow(database.prepare('SELECT * FROM vehicle_fuel_records WHERE id=?').get(result.lastInsertRowid))
}

export function addTyreRecord(id,payload,database=defaultDb){
  if(!vehicle(database,id))throw new Error('Vehicle not found');if(!text(payload.tyrePosition))throw new Error('Tyre position is required')
  const photo=saveAttachment(id,payload.photo)
  const result=database.prepare(`INSERT INTO vehicle_tyre_records(vehicle_id,tyre_position,brand,install_date,install_mileage,cost,repair_rotation_history,replacement_date,photo_storage_key,photo_original_name) VALUES(?,?,?,?,?,?,?,?,?,?)`).run(id,text(payload.tyrePosition),text(payload.brand)||null,dateOrNull(payload.installDate),numberOrNull(payload.installMileage),numberOrNull(payload.cost),text(payload.repairRotationHistory)||null,dateOrNull(payload.replacementDate),photo.storageKey,photo.originalName)
  return camelRow(database.prepare('SELECT * FROM vehicle_tyre_records WHERE id=?').get(result.lastInsertRowid))
}

const documentTypes=new Set(['ownership_certificate','road_tax','insurance','puspakom','permit_license','other'])
const fileTypes={
  'image/jpeg':{extensions:new Set(['.jpg','.jpeg']),extension:'.jpg',magic:buffer=>buffer.length>=3&&buffer[0]===0xff&&buffer[1]===0xd8&&buffer[2]===0xff},
  'image/png':{extensions:new Set(['.png']),extension:'.png',magic:buffer=>buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))},
  'application/pdf':{extensions:new Set(['.pdf']),extension:'.pdf',magic:buffer=>buffer.subarray(0,5).toString()==='%PDF-'}
}
function safeDocumentFile(vehicleId,file,storageRoot=uploadsDir){
  if(!file?.dataUrl)throw new Error('Document file is required')
  const original=text(file.name);if(!original||path.basename(original)!==original||path.isAbsolute(original)||original.includes('..'))throw new Error('Document filename is unsafe')
  const match=String(file.dataUrl).match(/^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/),type=match&&fileTypes[match[1]]
  if(!type)throw new Error('Only JPG, JPEG, PNG or PDF documents are allowed')
  const extension=path.extname(original).toLowerCase();if(!type.extensions.has(extension))throw new Error('Document extension does not match its MIME type')
  const buffer=Buffer.from(match[2],'base64');if(buffer.length>8*1024*1024)throw new Error('Document must be 8 MB or smaller');if(!type.magic(buffer))throw new Error('Document content does not match its declared file type')
  const root=path.resolve(storageRoot,'vehicles'),folder=path.resolve(root,String(Number(vehicleId)));if(!folder.startsWith(`${root}${path.sep}`))throw new Error('Document storage path is unsafe')
  fs.mkdirSync(folder,{recursive:true});for(const candidate of [root,folder])if(fs.lstatSync(candidate).isSymbolicLink())throw new Error('Document storage may not use symbolic links')
  const name=`${randomUUID()}${type.extension}`,finalPath=path.join(folder,name),tempPath=path.join(folder,`.${name}.tmp`);fs.writeFileSync(tempPath,buffer,{flag:'wx'});fs.renameSync(tempPath,finalPath)
  return{storageKey:path.posix.join('vehicles',String(Number(vehicleId)),name),finalPath,originalName:original,contentType:match[1],sizeBytes:buffer.length,sha256:createHash('sha256').update(buffer).digest('hex')}
}
const documentActor=session=>({id:Number(session?.id)||null,name:text(session?.employeeName||session?.username)||'Office Admin'})
export function listVehicleDocuments(id,database=defaultDb){if(!vehicle(database,id))throw new Error('Vehicle not found');return recordRows(database,'vehicle_documents',id,'document_type,is_current DESC,version_number DESC,id DESC')}
export function addVehicleDocument(id,payload,session,database=defaultDb,storageRoot=uploadsDir){
  if(!vehicle(database,id))throw new Error('Vehicle not found');const documentType=text(payload.documentType);if(!documentTypes.has(documentType))throw new Error('Invalid document type')
  const file=safeDocumentFile(id,payload.file,storageRoot),who=documentActor(session);database.exec('BEGIN IMMEDIATE')
  try{if(database.prepare('SELECT 1 FROM vehicle_documents WHERE vehicle_id=? AND document_type=? AND is_current=1').get(id,documentType))throw new Error('A current document already exists; use Replace')
    const result=database.prepare(`INSERT INTO vehicle_documents(vehicle_id,document_type,title,storage_key,original_name,content_type,size_bytes,document_date,expiry_date,uploaded_by,sha256,remark,uploaded_by_account_id,version_number,is_current) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,1,1)`).run(id,documentType,text(payload.title)||null,file.storageKey,file.originalName,file.contentType,file.sizeBytes,dateOrNull(payload.documentDate),dateOrNull(payload.expiryDate),who.name,file.sha256,text(payload.remark)||null,who.id)
    database.prepare(`INSERT INTO vehicle_document_audit(vehicle_id,document_id,action,document_type,sha256,actor_account_id,actor_name,remark) VALUES(?,?,'upload',?,?,?,?,?)`).run(id,result.lastInsertRowid,documentType,file.sha256,who.id,who.name,text(payload.remark)||null);database.exec('COMMIT');return camelRow(database.prepare('SELECT * FROM vehicle_documents WHERE id=?').get(result.lastInsertRowid))
  }catch(error){database.exec('ROLLBACK');try{fs.unlinkSync(file.finalPath)}catch{}throw error}
}
export function replaceVehicleDocument(documentId,payload,session,database=defaultDb,storageRoot=uploadsDir){
  const previous=database.prepare('SELECT * FROM vehicle_documents WHERE id=? AND is_current=1').get(documentId);if(!previous)throw new Error('Current document not found')
  const file=safeDocumentFile(previous.vehicle_id,payload.file,storageRoot),who=documentActor(session);database.exec('BEGIN IMMEDIATE')
  try{const version=Number(previous.version_number)+1;database.prepare('UPDATE vehicle_documents SET is_current=0,superseded_at=CURRENT_TIMESTAMP WHERE id=? AND is_current=1').run(documentId)
    const result=database.prepare(`INSERT INTO vehicle_documents(vehicle_id,document_type,title,storage_key,original_name,content_type,size_bytes,document_date,expiry_date,uploaded_by,sha256,remark,uploaded_by_account_id,version_number,is_current,supersedes_document_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?)`).run(previous.vehicle_id,previous.document_type,text(payload.title)||previous.title,file.storageKey,file.originalName,file.contentType,file.sizeBytes,dateOrNull(payload.documentDate)||previous.document_date,dateOrNull(payload.expiryDate)||previous.expiry_date,who.name,file.sha256,text(payload.remark)||null,who.id,version,documentId)
    database.prepare(`INSERT INTO vehicle_document_audit(vehicle_id,document_id,previous_document_id,action,document_type,sha256,actor_account_id,actor_name,remark) VALUES(?,?,?,'replace',?,?,?,?,?)`).run(previous.vehicle_id,result.lastInsertRowid,documentId,previous.document_type,file.sha256,who.id,who.name,text(payload.remark)||null);database.exec('COMMIT');return camelRow(database.prepare('SELECT * FROM vehicle_documents WHERE id=?').get(result.lastInsertRowid))
  }catch(error){database.exec('ROLLBACK');try{fs.unlinkSync(file.finalPath)}catch{}throw error}
}
export function vehicleDocumentFile(documentId,database=defaultDb,storageRoot=uploadsDir){
  const row=database.prepare('SELECT * FROM vehicle_documents WHERE id=?').get(documentId);if(!row)throw new Error('Document not found')
  const root=path.resolve(storageRoot,'vehicles'),filePath=path.resolve(storageRoot,...String(row.storage_key).split('/'));if(!filePath.startsWith(`${root}${path.sep}`)||!fs.existsSync(filePath)||fs.lstatSync(filePath).isSymbolicLink())throw new Error('Document file is unavailable')
  const buffer=fs.readFileSync(filePath);if(row.sha256&&createHash('sha256').update(buffer).digest('hex')!==row.sha256)throw new Error('Document integrity check failed')
  return{buffer,contentType:row.content_type||'application/octet-stream',originalName:row.original_name}
}

export function addUsageRecord(id,payload,database=defaultDb){
  if(!vehicle(database,id))throw new Error('Vehicle not found');if(!payload.dispatchDate)throw new Error('Dispatch date is required')
  database.prepare(`INSERT INTO vehicle_usage_history(vehicle_id,driver_id,dispatch_date,trips_completed,collection_weight_kg,kilometres,fuel_cost,downtime_hours,incidents) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(vehicle_id,dispatch_date) DO UPDATE SET driver_id=excluded.driver_id,trips_completed=excluded.trips_completed,collection_weight_kg=excluded.collection_weight_kg,kilometres=excluded.kilometres,fuel_cost=excluded.fuel_cost,downtime_hours=excluded.downtime_hours,incidents=excluded.incidents`).run(id,numberOrNull(payload.driverId),payload.dispatchDate,Number(payload.tripsCompleted||0),numberOrNull(payload.collectionWeightKg),numberOrNull(payload.kilometres),numberOrNull(payload.fuelCost),numberOrNull(payload.downtimeHours),text(payload.incidents)||null)
  return camelRow(database.prepare('SELECT * FROM vehicle_usage_history WHERE vehicle_id=? AND dispatch_date=?').get(id,payload.dispatchDate))
}

export { reminderLevel }
