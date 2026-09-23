import {db as defaultDb} from './database.mjs'
import {validSalesDate} from '../shared/sales.js'
const fail=(code,statusCode)=>Object.assign(Error(code),{code,statusCode})
function actor(ctx,db){const id=Number(ctx.employeeId);if(!Number.isSafeInteger(id)||!db.prepare("SELECT id FROM employees WHERE id=? AND is_active=1 AND employment_status='active'").get(id))throw fail('PERMISSION_DENIED',403);return id}
export function myBills(query={},ctx={},db=defaultDb){
 const id=actor(ctx,db),where=['pb.driver_employee_id=?'],args=[id]
 if((query.from&&!validSalesDate(query.from))||(query.to&&!validSalesDate(query.to))||(query.from&&query.to&&query.from>query.to))throw fail('INVALID_DATE',400)
 for(const [key,op] of [['from','>='],['to','<=']])if(query[key]){where.push('pb.service_date'+op+'?');args.push(query[key])}
 const search=String(query.search||'').trim().toLowerCase();if(search){where.push("(instr(lower(pb.bill_number),?)>0 OR instr(lower(pb.customer_name_snapshot),?)>0 OR instr(lower(pb.branch_name_snapshot),?)>0)");args.push(search,search,search)}
 const page=Math.max(0,Math.floor(Number(query.page)||0));if(!Number.isSafeInteger(page)||page>1000000)throw fail('INVALID_DATE',400)
 const total=db.prepare('SELECT COUNT(*) n FROM purchase_bills pb WHERE '+where.join(' AND ')).get(...args).n
 const rows=db.prepare(`SELECT pb.id,pb.bill_number billNumber,pb.service_date serviceDate,pb.customer_name_snapshot customerName,pb.branch_name_snapshot branchName,pb.driver_name_snapshot issuedBy,pb.vehicle_code_snapshot vehicleCode,pb.registration_number_snapshot registrationNumber,pb.total_cents totalCents,pb.payment_method paymentMethod,pb.status,pb.issued_at issuedAt,EXISTS(SELECT 1 FROM purchase_payment_proofs p WHERE p.purchase_bill_id=pb.id) hasProof FROM purchase_bills pb WHERE ${where.join(' AND ')} ORDER BY pb.service_date DESC,pb.id DESC LIMIT 50 OFFSET ?`).all(...args,page*50)
 const items=db.prepare('SELECT product_name_snapshot item,short_form_snapshot shortForm,unit_snapshot unit,quantity,unit_price_cents unitPriceCents,unit_price_mills unitPriceMills,COALESCE(unit_price_mills,unit_price_cents*10)/1000.0 unitPrice,line_total_cents itemTotalCents FROM purchase_bill_items WHERE purchase_bill_id=? ORDER BY id')
 return {total,page,items:rows.map(row=>({...row,items:items.all(row.id)})),hasMore:(page+1)*50<total}
}
export function myBillProof(billId,ctx={},db=defaultDb){
 const id=actor(ctx,db)
 return db.prepare('SELECT p.storage_key storageKey,p.content_type contentType FROM purchase_payment_proofs p JOIN purchase_bills b ON b.id=p.purchase_bill_id WHERE b.id=? AND b.driver_employee_id=? ORDER BY p.id DESC LIMIT 1').get(Number(billId),id)||null
}
