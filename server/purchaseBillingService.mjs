import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import {db as defaultDb} from './database.mjs'
import {withImmediateTransaction} from './branchServiceDateGuard.mjs'
import {listBranchProducts,requireBranchProductPrice} from './materialProductService.mjs'
import {kuchingDate} from '../shared/kuchingTime.js'
import {recordCashPurchase} from './cashFloatService.mjs'

const fail=(message,code='INVALID_BILL',statusCode=409)=>{const error=new Error(message);error.code=code;error.statusCode=statusCode;return error}
const nowKuching=(input=new Date())=>{const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kuching',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(input)).map(part=>[part.type,part.value]));return`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}+08:00`}
const money=value=>Math.round(Number(value)*100)

function activeDriver(database,employeeId,role){
  if(String(role).toLowerCase()!=='driver')throw fail('Only an active driver can create a Purchase Bill.','PERMISSION_DENIED',403)
  const employee=database.prepare(`SELECT id,name FROM employees WHERE id=? AND is_active=1 AND employment_status='active' AND (lower(job_role)='driver' OR EXISTS(SELECT 1 FROM employee_job_roles r WHERE r.employee_id=employees.id AND r.role='Driver' AND r.is_active=1))`).get(Number(employeeId))
  if(!employee)throw fail('Only an active driver can create a Purchase Bill.','PERMISSION_DENIED',403)
  return employee
}

function stopForDriver(database,stopId,{employeeId,role,today=kuchingDate()}={},requireArrived=true){
  activeDriver(database,employeeId,role)
  const stop=database.prepare(`SELECT ds.id,ds.status,ds.arrived_at arrivedAt,ds.branch_id branchId,ds.dispatch_trip_id tripId,
      dt.dispatch_day_id dayId,dd.dispatch_date serviceDate,d.vehicle_id vehicleId,d.driver_id driverId,
      b.jodoo_branch_id branchCode,b.branch_name branchName,b.customer_id customerId,
      c.name customerName,COALESCE(b.payment_type,c.default_payment_type,c.payment_type) paymentMethod,
      e.name driverName,v.vehicle_code vehicleCode,v.registration_number registrationNumber
    FROM dispatch_stops ds JOIN dispatch_trips dt ON dt.id=ds.dispatch_trip_id JOIN dispatch_days dd ON dd.id=dt.dispatch_day_id
    JOIN dispatches d ON d.id=dt.dispatch_id JOIN branches b ON b.id=ds.branch_id LEFT JOIN customers c ON c.id=b.customer_id
    JOIN employees e ON e.id=d.driver_id JOIN vehicles v ON v.id=d.vehicle_id WHERE ds.id=?`).get(Number(stopId))
  if(!stop)throw fail('Stop not found.','NOT_FOUND',404)
  if(Number(stop.driverId)!==Number(employeeId)||stop.serviceDate!==kuchingDate(`${today}T00:00:00+08:00`))throw fail('This Stop is not assigned to the active driver today.','PERMISSION_DENIED',403)
  if(requireArrived&&(!stop.arrivedAt||stop.status!=='active'))throw fail('Arrive at the current Stop before creating a Purchase Bill.','ARRIVAL_REQUIRED',409)
  const payment=String(stop.paymentMethod||'').trim().toLowerCase()
  if(!['cash','credit'].includes(payment))throw fail('Customer Payment Method must be set to Cash or Credit before billing.','PAYMENT_METHOD_REQUIRED',409)
  return{...stop,paymentMethod:payment==='cash'?'Cash':'Credit'}
}

function bill(database,stopId){
  const header=database.prepare(`SELECT pb.*,EXISTS(SELECT 1 FROM purchase_payment_proofs pp WHERE pp.purchase_bill_id=pb.id) paymentProofUploaded
    FROM purchase_bills pb WHERE pb.dispatch_stop_id=?`).get(Number(stopId))
  if(!header)return null
  const items=database.prepare(`SELECT id,product_id productId,material_id materialId,product_code_snapshot productCode,product_name_snapshot productName,
    short_form_snapshot shortForm,unit_snapshot unit,quantity,unit_price_cents unitPriceCents,line_total_cents lineTotalCents,
    price_type_snapshot priceType,price_group_id_snapshot priceGroupId FROM purchase_bill_items WHERE purchase_bill_id=? ORDER BY id`).all(header.id)
  return{id:Number(header.id),billNumber:header.bill_number,stopId:Number(header.dispatch_stop_id),serviceDate:header.service_date,
    customerName:header.customer_name_snapshot,branchId:header.branch_code_snapshot,branchName:header.branch_name_snapshot,
    driverName:header.driver_name_snapshot,vehicleCode:header.vehicle_code_snapshot,registrationNumber:header.registration_number_snapshot,
    paymentMethod:header.payment_method,weightMethod:header.weight_method,printChoice:header.print_choice,
    subtotalCents:Number(header.subtotal_cents),totalCents:Number(header.total_cents),status:header.status,issuedAt:header.issued_at,
    paymentProofUploaded:Boolean(header.paymentProofUploaded),items}
}

export function getPurchaseBilling(stopId,context={},database=defaultDb){
  const stop=stopForDriver(database,stopId,context,false),existing=bill(database,stopId)
  const products=existing?[]:listBranchProducts(stop.branchId,database).filter(item=>item.isSelectable&&item.currentPrice!=null).map(item=>({...item,currentPrice:Number(item.currentPrice)}))
  return{stop:{id:Number(stop.id),branchId:stop.branchCode,branchName:stop.branchName,customerName:stop.customerName,paymentMethod:stop.paymentMethod,arrived:Boolean(stop.arrivedAt)},bill:existing,products}
}

export function createPurchaseBill(stopId,payload={},context={},database=defaultDb){
  const{employeeId,role,today=kuchingDate(),now=new Date()}=context
  return withImmediateTransaction(database,()=>{
    const stop=stopForDriver(database,stopId,{employeeId,role,today},true),existing=bill(database,stopId)
    if(existing)return{...existing,idempotent:true}
    const weightMethod=String(payload.weightMethod||'').trim(),printChoice=String(payload.printChoice||'').trim()
    if(!['on_site','factory','estimated'].includes(weightMethod))throw fail('Select how the weight was determined.','WEIGHT_METHOD_REQUIRED',400)
    if(!['print','no_print'].includes(printChoice))throw fail('Select Print or No Print.','PRINT_CHOICE_REQUIRED',400)
    if(!Array.isArray(payload.items)||!payload.items.length||payload.items.length>20)throw fail('Add between 1 and 20 Bill items.','ITEMS_REQUIRED',400)
    const ids=payload.items.map(item=>Number(item.productId))
    if(ids.some(id=>!Number.isInteger(id)||id<=0)||new Set(ids).size!==ids.length)throw fail('Each Product can appear only once.','DUPLICATE_PRODUCT',400)
    const items=payload.items.map(item=>{
      const product=requireBranchProductPrice(stop.branchId,item.productId,database),quantity=Number(item.quantity)
      if(!Number.isFinite(quantity)||quantity<=0||quantity>1000000)throw fail(`Enter a valid quantity for ${product.fullName}.`,'INVALID_QUANTITY',400)
      const unitPriceCents=money(product.currentPrice),lineTotalCents=Math.round(quantity*unitPriceCents)
      return{...product,quantity,unitPriceCents,lineTotalCents}
    })
    const totalCents=items.reduce((sum,item)=>sum+item.lineTotalCents,0),issuedAt=nowKuching(now),temporary=`PENDING-${crypto.randomUUID()}`
    const result=database.prepare(`INSERT INTO purchase_bills(bill_number,dispatch_stop_id,dispatch_trip_id,dispatch_day_id,branch_id,customer_id,driver_employee_id,vehicle_id,service_date,
      customer_name_snapshot,branch_code_snapshot,branch_name_snapshot,driver_name_snapshot,vehicle_code_snapshot,registration_number_snapshot,payment_method,weight_method,print_choice,subtotal_cents,total_cents,issued_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(temporary,stop.id,stop.tripId,stop.dayId,stop.branchId,stop.customerId,employeeId,stop.vehicleId,stop.serviceDate,
        stop.customerName||'Unknown Customer',stop.branchCode,stop.branchName||stop.branchCode,stop.driverName,stop.vehicleCode,stop.registrationNumber,stop.paymentMethod,weightMethod,printChoice,totalCents,totalCents,issuedAt)
    const purchaseBillId=Number(result.lastInsertRowid),billNumber=`P${stop.serviceDate.replaceAll('-','')}-${String(purchaseBillId).padStart(6,'0')}`
    database.prepare('UPDATE purchase_bills SET bill_number=? WHERE id=?').run(billNumber,purchaseBillId)
    const insert=database.prepare(`INSERT INTO purchase_bill_items(purchase_bill_id,product_id,material_id,product_code_snapshot,product_name_snapshot,short_form_snapshot,unit_snapshot,quantity,unit_price_cents,line_total_cents,price_type_snapshot,price_group_id_snapshot) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
    for(const item of items)insert.run(purchaseBillId,item.productId,item.materialId,item.productCode,item.fullName,item.shortForm,item.unit,item.quantity,item.unitPriceCents,item.lineTotalCents,item.priceType,item.priceGroupId)
    const totalWeight=items.filter(item=>/kg|kilogram/i.test(String(item.unit||'kg'))).reduce((sum,item)=>sum+item.quantity,0)
    database.prepare('UPDATE dispatch_stops SET invoice_number=?,payment_status=?,collected_weight_kg=CASE WHEN ?>0 THEN ? ELSE collected_weight_kg END WHERE id=?').run(billNumber,stop.paymentMethod==='Cash'?'pending_proof':'credit',totalWeight,totalWeight,stop.id)
    database.prepare(`INSERT OR REPLACE INTO stop_step_records(dispatch_stop_id,step_key,completed_by,completed_at,payload_json) VALUES(?,'invoice_driver_confirmed',NULL,?,?)`).run(stop.id,issuedAt,JSON.stringify({method:'electronic_purchase_bill',billId:purchaseBillId,billNumber,paymentMethod:stop.paymentMethod,driverEmployeeId:Number(employeeId)}))
    recordCashPurchase({id:purchaseBillId,billNumber,paymentMethod:stop.paymentMethod,totalCents,serviceDate:stop.serviceDate,driverEmployeeId:Number(employeeId),driverName:stop.driverName},database,{now})
    return{...bill(database,stop.id),idempotent:false}
  })
}

const image=photo=>{const match=/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(photo?.dataUrl||''));if(!match)throw fail('A valid JPEG, PNG or WebP payment proof is required.','INVALID_PHOTO',400);const bytes=Buffer.from(match[2],'base64'),max=8*1024*1024;if(!bytes.length||bytes.length>max)throw fail('Payment proof must be no larger than 8 MB.','INVALID_PHOTO',400);const type=match[1],valid=type==='image/jpeg'&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff||type==='image/png'&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||type==='image/webp'&&bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP';if(!valid)throw fail('Payment proof content does not match its file type.','INVALID_PHOTO',400);return{bytes,type,extension:type.split('/')[1].replace('jpeg','jpg')}}

export function uploadPurchasePaymentProof(stopId,payload={},context={},database=defaultDb,{uploadsRoot}={}){
  const{employeeId,role,today=kuchingDate(),now=new Date()}=context,stop=stopForDriver(database,stopId,{employeeId,role,today},true),existingBill=bill(database,stopId)
  if(!existingBill)throw fail('Create the electronic Purchase Bill before uploading payment proof.','BILL_REQUIRED',409)
  if(existingBill.paymentMethod!=='Cash')throw fail('Payment proof is only required for Cash customers.','PAYMENT_PROOF_NOT_REQUIRED',409)
  const existing=database.prepare('SELECT id,created_at FROM purchase_payment_proofs WHERE purchase_bill_id=?').get(existingBill.id)
  if(existing)return{billId:existingBill.id,proofId:Number(existing.id),uploadedAt:existing.created_at,idempotent:true}
  if(!uploadsRoot)throw fail('Secure upload storage is unavailable.','UPLOAD_UNAVAILABLE',500)
  const file=image(payload.photo),folder=path.resolve(uploadsRoot,'payment-proofs'),name=`${crypto.randomUUID()}.${file.extension}`,absolute=path.resolve(folder,name)
  if(!absolute.startsWith(folder+path.sep))throw fail('Invalid upload path.','INVALID_PHOTO',400)
  fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(absolute,file.bytes,{flag:'wx'})
  try{return withImmediateTransaction(database,()=>{const createdAt=nowKuching(now),result=database.prepare('INSERT INTO purchase_payment_proofs(purchase_bill_id,uploaded_by_employee_id,storage_key,original_name,content_type,size_bytes,created_at) VALUES(?,?,?,?,?,?,?)').run(existingBill.id,employeeId,`payment-proofs/${name}`,String(payload.photo?.name||`payment-proof.${file.extension}`),file.type,file.bytes.length,createdAt);database.prepare("UPDATE dispatch_stops SET payment_status='proof_uploaded' WHERE id=?").run(stop.id);return{billId:existingBill.id,proofId:Number(result.lastInsertRowid),uploadedAt:createdAt,idempotent:false}})}catch(error){if(fs.existsSync(absolute))fs.unlinkSync(absolute);throw error}
}

export function purchasePaymentProofFile(proofId,database=defaultDb){return database.prepare(`SELECT pp.storage_key,pp.content_type,pb.driver_employee_id FROM purchase_payment_proofs pp JOIN purchase_bills pb ON pb.id=pp.purchase_bill_id WHERE pp.id=?`).get(Number(proofId))||null}
