import crypto from 'node:crypto'
import {withImmediateTransaction} from './branchServiceDateGuard.mjs'
import {allocateDocumentNumber} from './documentNumbers.mjs'
import {kuchingDate} from '../shared/kuchingTime.js'
import {validWeight,validUnitPrice} from '../shared/measurePrecision.js'

export const canBackfillPurchase = session => ['owner_admin','operations_admin','admin'].includes(session?.role)
function reject(code,status=400){throw Object.assign(new Error(code),{code,statusCode:status})}
function authorize(ctx,db){
 if(!canBackfillPurchase(ctx))reject('BACKFILL_ACCESS',403)
 const a=db.prepare('SELECT a.*,e.name,e.is_active employee_active,e.employment_status FROM auth_accounts a JOIN employees e ON e.id=a.employee_id WHERE a.id=?').get(ctx.id)
 const role=a?.username?.toLowerCase()==='kcadmin'?'owner_admin':a?.system_role||a?.role
 if(!a?.is_active||!a.employee_active||a.employment_status!=='active'||!canBackfillPurchase({role}))reject('BACKFILL_ACCESS',403)
 return a
}
function validDate(value){return /^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value}
const stopsSql=`SELECT s.id,s.status,s.invoice_number invoiceNumber,s.branch_id branchId,t.id tripId,t.dispatch_day_id dayId,
 COALESCE(s.service_date,dd.dispatch_date) serviceDate,b.customer_id customerId,b.jodoo_branch_id branchCode,b.branch_name branchName,c.name customerName,
 COALESCE(b.payment_type,c.default_payment_type,c.payment_type) paymentMethod,d.driver_id driverId,e.name driverName,d.vehicle_id vehicleId,v.vehicle_code vehicleCode,v.registration_number registrationNumber
 FROM dispatch_stops s JOIN dispatch_trips t ON t.id=s.dispatch_trip_id JOIN dispatch_days dd ON dd.id=t.dispatch_day_id
 JOIN dispatches d ON d.id=t.dispatch_id JOIN branches b ON b.id=s.branch_id JOIN customers c ON c.id=b.customer_id
 JOIN employees e ON e.id=d.driver_id JOIN vehicles v ON v.id=d.vehicle_id`
export function purchaseBackfillOptions(date,ctx,db){
 authorize(ctx,db)
 if(!validDate(date)||date>kuchingDate())reject('BACKFILL_DATE')
 const stops=db.prepare(stopsSql+` WHERE COALESCE(s.service_date,dd.dispatch_date)=? AND lower(trim(COALESCE(b.payment_type,c.default_payment_type,c.payment_type)))='credit'
 AND NOT EXISTS(SELECT 1 FROM purchase_bills pb WHERE pb.dispatch_stop_id=s.id OR (pb.branch_id=s.branch_id AND pb.service_date=? AND pb.status='issued'))
 AND COALESCE(s.invoice_number,'')='' ORDER BY c.name,b.branch_name,s.id`).all(date,date)
 const products=db.prepare("SELECT id,product_code code,full_name name,short_form shortForm,unit FROM material_products WHERE status='active' ORDER BY full_name").all()
 return {stops,products}
}
export function createBackfillPurchase(payload,ctx,db){
 return withImmediateTransaction(db,()=>{
 const actor=authorize(ctx,db)
 if(!payload||typeof payload!=='object')reject('BACKFILL_INVALID')
 const reason=String(payload.reason||'').trim(),date=String(payload.serviceDate||''),token=String(payload.requestKey||'')
 if(!validDate(date)||date>kuchingDate())reject('BACKFILL_DATE')
 if(!reason||reason.length>1000||payload.confirmCollected!==true)reject('BACKFILL_REASON')
 if(!/^[a-zA-Z0-9-]{16,80}$/.test(token))reject('BACKFILL_INVALID')
 const fingerprint=crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex')
 const previous=db.prepare('SELECT a.*,b.bill_number billNumber FROM purchase_backfill_audit a JOIN purchase_bills b ON b.id=a.purchase_bill_id WHERE request_key=?').get(token)
 if(previous){if(previous.account_id!==actor.id||previous.payload_hash!==fingerprint)reject('BACKFILL_DUPLICATE',409);return {id:previous.purchase_bill_id,billNumber:previous.billNumber,idempotent:true}}
 const s=db.prepare(stopsSql+' WHERE s.id=?').get(Number(payload.stopId))
 if(!s||s.serviceDate!==date||String(s.paymentMethod).trim().toLowerCase()!=='credit')reject('BACKFILL_TASK',409)
 if(s.invoiceNumber||db.prepare("SELECT id FROM purchase_bills WHERE dispatch_stop_id=? OR (branch_id=? AND service_date=? AND status='issued')").get(s.id,s.branchId,date))reject('BACKFILL_DUPLICATE',409)
 if(!['factory','on_site','estimated'].includes(payload.weightMethod)||!Array.isArray(payload.items)||!payload.items.length||payload.items.length>20)reject('BACKFILL_INVALID')
 const ids=new Set()
 const items=payload.items.map(x=>{
 const p=db.prepare("SELECT * FROM material_products WHERE id=? AND status='active'").get(Number(x.productId))
 if(!p||ids.has(p.id)||!validWeight(x.quantity)||Number(x.quantity)>1000000||!validUnitPrice(x.unitPrice))reject('BACKFILL_INVALID')
 ids.add(p.id);const mills=Math.round(Number(x.unitPrice)*1000),cents=Math.round(Math.round(Number(x.quantity)*100)*mills/1000)
 return {p,quantity:Number(x.quantity),mills,cents}
 })
 const total=items.reduce((n,x)=>n+x.cents,0),now=new Date(),issuedAt=new Date(now.getTime()+8*3600000).toISOString().slice(0,19)+'+08:00'
 const result=db.prepare(`INSERT INTO purchase_bills(bill_number,dispatch_stop_id,dispatch_trip_id,dispatch_day_id,branch_id,customer_id,driver_employee_id,vehicle_id,service_date,customer_name_snapshot,branch_code_snapshot,branch_name_snapshot,driver_name_snapshot,vehicle_code_snapshot,registration_number_snapshot,payment_method,weight_method,print_choice,subtotal_cents,total_cents,issued_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'Credit',?,'no_print',?,?,?)`).run('PENDING-'+crypto.randomUUID(),s.id,s.tripId,s.dayId,s.branchId,s.customerId,s.driverId,s.vehicleId,date,s.customerName,s.branchCode,s.branchName,s.driverName,s.vehicleCode,s.registrationNumber,payload.weightMethod,total,total,issuedAt)
 const id=Number(result.lastInsertRowid),billNumber=allocateDocumentNumber(db,'P','purchase-'+id,now)
 db.prepare('UPDATE purchase_bills SET bill_number=? WHERE id=?').run(billNumber,id)
 const insert=db.prepare(`INSERT INTO purchase_bill_items(purchase_bill_id,product_id,material_id,product_code_snapshot,product_name_snapshot,short_form_snapshot,unit_snapshot,quantity,unit_price_cents,unit_price_mills,line_total_cents,price_type_snapshot) VALUES(?,?,?,?,?,?,?,?,?,?,?,'admin_backfill')`)
 for(const {p,quantity,mills,cents} of items)insert.run(id,p.id,p.material_id,p.product_code,p.full_name,p.short_form,p.unit,quantity,Math.max(1,Math.round(mills/10)),mills,cents)
 db.prepare('INSERT INTO purchase_backfill_audit(purchase_bill_id,account_id,operator_name,reason,request_key,payload_hash,original_stop_json,created_at) VALUES(?,?,?,?,?,?,?,?)').run(id,actor.id,actor.name,reason,token,fingerprint,JSON.stringify(s),issuedAt)
 // A historical accounting correction must not fabricate GPS, arrival, task completion or Cash Float movements.
 return {id,billNumber,totalCents:total,idempotent:false}
 })
}
