import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {db as defaultDb} from './database.mjs'
import {kuchingDate} from '../shared/kuchingTime.js'

const runFile=promisify(execFile)
const fail=(message,code='INVALID_WEIGHT_RECORD',statusCode=400)=>{const error=new Error(message);error.code=code;error.statusCode=statusCode;return error}
const nowKuching=(input=new Date())=>{const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kuching',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(input)).map(part=>[part.type,part.value]));return`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}+08:00`}

function driver(database,employeeId,role){
  if(String(role).toLowerCase()!=='driver')throw fail('Only an active driver can submit an unloading weight.','PERMISSION_DENIED',403)
  const row=database.prepare(`SELECT id,name FROM employees WHERE id=? AND is_active=1 AND employment_status='active' AND (lower(job_role)='driver' OR EXISTS(SELECT 1 FROM employee_job_roles r WHERE r.employee_id=employees.id AND r.role='Driver' AND r.is_active=1))`).get(Number(employeeId))
  if(!row)throw fail('Only an active driver can submit an unloading weight.','PERMISSION_DENIED',403)
  return row
}

function assignedTrips(database,{employeeId,role,today=kuchingDate()}){
  const employee=driver(database,employeeId,role),serviceDate=kuchingDate(`${today}T00:00:00+08:00`)
  return database.prepare(`SELECT dt.id tripId,dt.trip_number tripNumber,dt.execution_status executionStatus,dt.started_at startedAt,dt.dispatch_day_id dayId,
      d.vehicle_id vehicleId,d.end_location_name locationName,d.end_address locationAddress,e.name driverName,v.vehicle_code vehicleCode,v.registration_number registrationNumber,
      (SELECT GROUP_CONCAT(ea.name,', ') FROM dispatch_vehicle_assistants dva JOIN employees ea ON ea.id=dva.employee_id WHERE dva.dispatch_day_id=dt.dispatch_day_id AND dva.vehicle_id=d.vehicle_id) crewNames
    FROM dispatch_trips dt JOIN dispatch_days dd ON dd.id=dt.dispatch_day_id JOIN dispatches d ON d.id=dt.dispatch_id JOIN employees e ON e.id=d.driver_id JOIN vehicles v ON v.id=d.vehicle_id
    WHERE dd.dispatch_date=? AND dd.status IN ('approved','in_progress','completed') AND d.driver_id=?
    ORDER BY CASE dt.execution_status WHEN 'in_progress' THEN 0 WHEN 'completed' THEN 1 ELSE 2 END,COALESCE(dt.started_at,dt.created_at) DESC,dt.trip_number DESC`).all(serviceDate,employee.id).map(row=>({...row,serviceDate,estimatedWeightKg:estimateSinceLastUnload(database,row.vehicleId,serviceDate)}))
}

function estimateSinceLastUnload(database,vehicleId,serviceDate){
  const last=database.prepare("SELECT weighed_at weighedAt FROM unloading_weight_records WHERE vehicle_id=? AND service_date=? AND status='confirmed' ORDER BY weighed_at DESC,id DESC LIMIT 1").get(vehicleId,serviceDate)
  const row=database.prepare(`SELECT COALESCE(SUM(i.quantity),0) weight FROM purchase_bill_items i JOIN purchase_bills b ON b.id=i.purchase_bill_id
    WHERE b.vehicle_id=? AND b.service_date=? AND b.status='issued' AND lower(COALESCE(i.unit_snapshot,'kg')) LIKE '%kg%' AND (? IS NULL OR b.issued_at>?)`).get(vehicleId,serviceDate,last?.weighedAt||null,last?.weighedAt||null)
  return Number(Number(row.weight||0).toFixed(2))
}

export function mobileWeightContext(context={},database=defaultDb){
  const trips=assignedTrips(database,context),serviceDate=kuchingDate(`${context.today||kuchingDate()}T00:00:00+08:00`),recent=database.prepare(`SELECT id,confirmed_weight_kg confirmedWeightKg,vehicle_code_snapshot vehicleCode,registration_number_snapshot registrationNumber,weighed_at weighedAt,status FROM unloading_weight_records WHERE driver_employee_id=? AND service_date=? ORDER BY weighed_at DESC,id DESC LIMIT 5`).all(Number(context.employeeId),serviceDate)
  return{available:Boolean(trips.length),trip:trips[0]||null,recent}
}

const image=photo=>{const match=/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(photo?.dataUrl||''));if(!match)throw fail('Take a valid JPEG, PNG or WebP weighbridge ticket photo.','INVALID_PHOTO');const bytes=Buffer.from(match[2],'base64'),max=8*1024*1024;if(!bytes.length||bytes.length>max)throw fail('Weight ticket photo must be no larger than 8 MB.','INVALID_PHOTO');const type=match[1],valid=type==='image/jpeg'&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff||type==='image/png'&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||type==='image/webp'&&bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP';if(!valid)throw fail('Weight ticket content does not match its file type.','INVALID_PHOTO');return{bytes,type,extension:type.split('/')[1].replace('jpeg','jpg')}}
const valueFrom=line=>{const values=[...String(line).matchAll(/(\d[\d ,]{0,10}(?:\.\d{1,3})?)\s*(?:kg|kgs|kilograms?)?/gi)].map(match=>Number(match[1].replace(/[ ,]/g,''))).filter(value=>Number.isFinite(value)&&value>0&&value<=200000);return values.at(-1)||null}

export function parseWeightOcr(text=''){
  const lines=String(text).split(/\r?\n/).map(line=>line.trim()).filter(Boolean),find=pattern=>{for(const line of lines)if(pattern.test(line)){const value=valueFrom(line);if(value)return value}return null}
  const gross=find(/\b(?:gross|g\.w\.?|berat kasar)\b/i),tare=find(/\b(?:tare|t\.w\.?|berat kosong)\b/i),net=find(/\b(?:net|nett|n\.w\.?|net weight|berat bersih)\b/i)
  const labelled=find(/\b(?:weight|weigh|berat|total)\b/i),kgValues=lines.filter(line=>/\bkg(?:s)?\b/i.test(line)).map(valueFrom).filter(Boolean)
  const calculated=gross&&tare&&gross>tare?Number((gross-tare).toFixed(2)):null,recognized=net||calculated||labelled||(kgValues.length===1?kgValues[0]:null)
  return{grossWeightKg:gross,tareWeightKg:tare,recognizedWeightKg:recognized,candidates:[...new Set([net,calculated,labelled,...kgValues].filter(Boolean))]}
}

async function ocr(file){
  try{const{stdout}=await runFile(process.env.KCS_TESSERACT_PATH||'tesseract',[file,'stdout','-l','eng','--psm','6'],{timeout:30000,maxBuffer:2_000_000});const parsed=parseWeightOcr(stdout);return{...parsed,text:stdout,status:parsed.recognizedWeightKg?'recognized':'needs_review'}}catch(error){return{text:'',grossWeightKg:null,tareWeightKg:null,recognizedWeightKg:null,candidates:[],status:error.code==='ENOENT'?'unavailable':'failed'}}
}

export async function recognizeUnloadingWeight(payload={},context={},database=defaultDb,{uploadsRoot}={}){
  if(!uploadsRoot)throw fail('Secure upload storage is unavailable.','UPLOAD_UNAVAILABLE',500)
  const trip=assignedTrips(database,context).find(item=>Number(item.tripId)===Number(payload.tripId))
  if(!trip)throw fail('No assigned Trip is available for this weight record.','TRIP_NOT_FOUND',404)
  const photo=image(payload.photo),folder=path.resolve(uploadsRoot,'unloading-weights'),name=`${crypto.randomUUID()}.${photo.extension}`,absolute=path.resolve(folder,name)
  if(!absolute.startsWith(folder+path.sep))throw fail('Invalid upload path.','INVALID_PHOTO')
  fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(absolute,photo.bytes,{flag:'wx'})
  try{const result=await ocr(absolute),weighedAt=nowKuching(),insert=database.prepare(`INSERT INTO unloading_weight_records(dispatch_trip_id,dispatch_day_id,vehicle_id,driver_employee_id,service_date,trip_number,vehicle_code_snapshot,registration_number_snapshot,driver_name_snapshot,crew_names_snapshot,unloading_location_name_snapshot,unloading_address_snapshot,estimated_weight_kg,gross_weight_kg,tare_weight_kg,recognized_weight_kg,ocr_text,ocr_candidates_json,ocr_status,photo_storage_key,photo_original_name,photo_content_type,photo_size_bytes,latitude,longitude,accuracy_m,device_captured_at,weighed_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(trip.tripId,trip.dayId,trip.vehicleId,context.employeeId,trip.serviceDate,trip.tripNumber,trip.vehicleCode,trip.registrationNumber,trip.driverName,trip.crewNames,trip.locationName,trip.locationAddress,trip.estimatedWeightKg,result.grossWeightKg,result.tareWeightKg,result.recognizedWeightKg,result.text,JSON.stringify(result.candidates),result.status,`unloading-weights/${name}`,String(payload.photo?.name||`weight-ticket.${photo.extension}`),photo.type,photo.bytes.length,payload.latitude||null,payload.longitude||null,payload.accuracyM||null,payload.deviceCapturedAt||null,weighedAt);return{id:Number(insert.lastInsertRowid),recognizedWeightKg:result.recognizedWeightKg,grossWeightKg:result.grossWeightKg,tareWeightKg:result.tareWeightKg,estimatedWeightKg:trip.estimatedWeightKg,ocrStatus:result.status,candidates:result.candidates,vehicleCode:trip.vehicleCode,registrationNumber:trip.registrationNumber,locationName:trip.locationName}}
  catch(error){if(fs.existsSync(absolute))fs.unlinkSync(absolute);throw error}
}

export function confirmUnloadingWeight(recordId,payload={},context={},database=defaultDb){
  driver(database,context.employeeId,context.role);const weight=Number(payload.weightKg)
  if(!Number.isFinite(weight)||weight<=0||weight>200000)throw fail('Enter a valid confirmed weight in kg.','INVALID_WEIGHT')
  const row=database.prepare("SELECT id,status FROM unloading_weight_records WHERE id=? AND driver_employee_id=?").get(Number(recordId),Number(context.employeeId));if(!row)throw fail('Weight record not found.','NOT_FOUND',404);if(row.status==='confirmed')return{id:Number(row.id),confirmed:true,idempotent:true}
  database.prepare("UPDATE unloading_weight_records SET confirmed_weight_kg=?,status='confirmed',confirmed_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(Number(weight.toFixed(2)),nowKuching(),row.id)
  return{id:Number(row.id),confirmed:true,confirmedWeightKg:Number(weight.toFixed(2)),idempotent:false}
}

export function listUnloadingWeights(filters={},database=defaultDb){const where=["w.status='confirmed'"],params=[];if(filters.from){where.push('w.service_date>=?');params.push(filters.from)}if(filters.to){where.push('w.service_date<=?');params.push(filters.to)}return{items:database.prepare(`SELECT w.id,w.service_date serviceDate,w.trip_number tripNumber,w.vehicle_code_snapshot vehicleCode,w.registration_number_snapshot registrationNumber,w.driver_name_snapshot driverName,w.crew_names_snapshot crew,w.unloading_location_name_snapshot locationName,w.estimated_weight_kg estimatedWeightKg,w.recognized_weight_kg recognizedWeightKg,w.confirmed_weight_kg confirmedWeightKg,w.latitude,w.longitude,w.accuracy_m accuracyM,w.weighed_at weighedAt FROM unloading_weight_records w WHERE ${where.join(' AND ')} ORDER BY w.weighed_at DESC,w.id DESC`).all(...params)}}
export function unloadingWeightPhoto(recordId,database=defaultDb){return database.prepare('SELECT photo_storage_key storageKey,photo_content_type contentType,driver_employee_id driverEmployeeId FROM unloading_weight_records WHERE id=?').get(Number(recordId))||null}
