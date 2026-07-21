import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
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

export function getVehicleDetail(id,database=defaultDb){
  const row=vehicle(database,id);if(!row)throw new Error('Vehicle not found')
  const preferredZones=database.prepare(`SELECT z.id,z.code,z.name FROM vehicle_preferred_zones vpz JOIN zone_groups z ON z.id=vpz.zone_group_id WHERE vpz.vehicle_id=? ORDER BY z.sort_order,z.id`).all(id)
  const preferredAreas=database.prepare(`SELECT a.id,a.name FROM vehicle_preferred_areas vpa JOIN areas a ON a.id=vpa.area_id WHERE vpa.vehicle_id=? ORDER BY a.name`).all(id)
  const currentDriver=database.prepare(`SELECT e.id,e.employee_code employeeCode,e.name,d.dispatch_date dispatchDate FROM dispatches d JOIN employees e ON e.id=d.driver_id WHERE d.vehicle_id=? ORDER BY d.dispatch_date DESC,d.updated_at DESC LIMIT 1`).get(id)||null
  const compliance=row.operational_status==='sold'?null:camelRow(database.prepare('SELECT * FROM vehicle_compliance_reminders WHERE vehicle_id=?').get(id)||{})
  if(compliance)for(const key of ['puspakomDueDate','roadTaxDueDate','insuranceDueDate','loanPaymentDueDate','nextServiceDate'])compliance[`${key}Alert`]=reminderLevel(compliance[key])
  return{...camelRow(row),status:row.operational_status,capacityKg:row.capacity_kg,operationalCapacityKg:row.capacity_kg,preferredZones,preferredAreas,currentDriver,compliance,
    maintenanceRecords:recordRows(database,'vehicle_maintenance_records',id,'maintenance_date DESC,id DESC'),fuelRecords:recordRows(database,'vehicle_fuel_records',id,'fuel_at DESC,id DESC'),
    tyreRecords:recordRows(database,'vehicle_tyre_records',id,'install_date DESC,id DESC'),documents:row.operational_status==='sold'?recordRows(database,'vehicle_documents',id,'uploaded_at DESC,id DESC'):recordRows(database,'vehicle_documents',id,'document_type,id DESC'),
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

export function addVehicleDocument(id,payload,database=defaultDb){
  if(!vehicle(database,id))throw new Error('Vehicle not found');if(!text(payload.documentType))throw new Error('Document type is required')
  const file=saveAttachment(id,payload.file);if(!file.storageKey)throw new Error('Document file is required')
  const result=database.prepare(`INSERT INTO vehicle_documents(vehicle_id,document_type,title,storage_key,original_name,content_type,size_bytes,document_date,expiry_date,uploaded_by) VALUES(?,?,?,?,?,?,?,?,?,?)`).run(id,text(payload.documentType),text(payload.title)||null,file.storageKey,file.originalName,file.contentType,file.sizeBytes,dateOrNull(payload.documentDate),dateOrNull(payload.expiryDate),actor(payload.uploadedBy))
  return camelRow(database.prepare('SELECT * FROM vehicle_documents WHERE id=?').get(result.lastInsertRowid))
}

export function addUsageRecord(id,payload,database=defaultDb){
  if(!vehicle(database,id))throw new Error('Vehicle not found');if(!payload.dispatchDate)throw new Error('Dispatch date is required')
  database.prepare(`INSERT INTO vehicle_usage_history(vehicle_id,driver_id,dispatch_date,trips_completed,collection_weight_kg,kilometres,fuel_cost,downtime_hours,incidents) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(vehicle_id,dispatch_date) DO UPDATE SET driver_id=excluded.driver_id,trips_completed=excluded.trips_completed,collection_weight_kg=excluded.collection_weight_kg,kilometres=excluded.kilometres,fuel_cost=excluded.fuel_cost,downtime_hours=excluded.downtime_hours,incidents=excluded.incidents`).run(id,numberOrNull(payload.driverId),payload.dispatchDate,Number(payload.tripsCompleted||0),numberOrNull(payload.collectionWeightKg),numberOrNull(payload.kilometres),numberOrNull(payload.fuelCost),numberOrNull(payload.downtimeHours),text(payload.incidents)||null)
  return camelRow(database.prepare('SELECT * FROM vehicle_usage_history WHERE vehicle_id=? AND dispatch_date=?').get(id,payload.dispatchDate))
}

export { reminderLevel }
