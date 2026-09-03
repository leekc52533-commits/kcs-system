import fs from 'node:fs'
import path from 'node:path'
import ExcelJS from 'exceljs'
import {db as defaultDb} from './database.mjs'

const monthPattern=/^\d{4}-(0[1-9]|1[0-2])$/
const safeMonth=value=>monthPattern.test(String(value||''))?String(value):new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kuching',year:'numeric',month:'2-digit'}).format(new Date())
const datePattern=/^\d{4}-\d{2}-\d{2}$/
const nextDate=value=>{const date=new Date(`${value}T00:00:00Z`);date.setUTCDate(date.getUTCDate()+1);return date.toISOString().slice(0,10)}
const dateRange=filters=>{if(datePattern.test(String(filters.from||''))&&datePattern.test(String(filters.to||''))&&filters.from<=filters.to)return{label:`${filters.from}_to_${filters.to}`,from:String(filters.from),to:nextDate(String(filters.to))};const month=safeMonth(filters.month),[year,number]=month.split('-').map(Number),next=number===12?`${year+1}-01`:`${year}-${String(number+1).padStart(2,'0')}`;return{label:month,from:`${month}-01`,to:`${next}-01`}}
const safeFile=value=>String(value||'').replace(/[^A-Za-z0-9._-]+/g,'_').replace(/^\.+/,'')||'file'

function where(filters={}){
  const range=dateRange(filters),clauses=['pb.service_date>=?','pb.service_date<?'],params=[range.from,range.to]
  const search=String(filters.search||'').trim();if(search){const q=`%${search}%`;clauses.push('(pb.bill_number LIKE ? OR pb.customer_name_snapshot LIKE ? OR pb.branch_name_snapshot LIKE ? OR pb.branch_code_snapshot LIKE ?)');params.push(q,q,q,q)}
  const paymentMethod=String(filters.paymentMethod||'');if(['Cash','Credit'].includes(paymentMethod)){clauses.push('pb.payment_method=?');params.push(paymentMethod)}
  const employeeId=Number(filters.employeeId);if(Number.isInteger(employeeId)&&employeeId>0){clauses.push('pb.driver_employee_id=?');params.push(employeeId)}
  return{...range,sql:clauses.join(' AND '),params}
}

export function listPurchaseBillArchive(filters={},database=defaultDb){
  const query=where(filters),headers=database.prepare(`SELECT pb.id,pb.bill_number billNumber,pb.service_date serviceDate,pb.total_cents totalCents,pb.payment_method paymentMethod,
    pb.customer_name_snapshot customerName,pb.branch_name_snapshot branchName,pb.driver_name_snapshot issuedBy,pb.vehicle_code_snapshot vehicleCode,pb.registration_number_snapshot registrationNumber,
    pb.status,pb.issued_at issuedAt,pp.id proofId,pp.original_name proofName,pp.created_at proofUploadedAt
    FROM purchase_bills pb LEFT JOIN purchase_payment_proofs pp ON pp.purchase_bill_id=pb.id WHERE ${query.sql} ORDER BY pb.service_date DESC,pb.id DESC`).all(...query.params)
  const itemStatement=database.prepare(`SELECT product_name_snapshot item,short_form_snapshot shortForm,unit_snapshot unit,quantity,unit_price_cents unitPriceCents,line_total_cents itemTotalCents FROM purchase_bill_items WHERE purchase_bill_id=? ORDER BY id`)
  const items=headers.map(row=>({...row,totalCents:Number(row.totalCents),proofId:row.proofId?Number(row.proofId):null,items:itemStatement.all(row.id).map(item=>({...item,quantity:Number(item.quantity),unitPriceCents:Number(item.unitPriceCents),itemTotalCents:Number(item.itemTotalCents)}))}))
  const employees=database.prepare(`SELECT DISTINCT pb.driver_employee_id id,pb.driver_name_snapshot name FROM purchase_bills pb WHERE pb.service_date>=? AND pb.service_date<? ORDER BY name`).all(query.from,query.to)
  return{rangeLabel:query.label,from:query.from,to:query.to,items,employees}
}

export function purchaseBillRows(filters={},database=defaultDb){
  const archive=listPurchaseBillArchive(filters,database)
  return{...archive,rows:archive.items.flatMap(bill=>bill.items.map(item=>({Date:bill.serviceDate,'PO No.':bill.billNumber,Total:bill.totalCents/100,PaymentMethod:bill.paymentMethod,'Customer Name':bill.customerName,Branch:bill.branchName,Item:item.shortForm||item.item,Quantity:item.quantity,Price:item.unitPriceCents/100,'Item Total':item.itemTotalCents/100,'Issued By':[bill.issuedBy,bill.registrationNumber||bill.vehicleCode].filter(Boolean).join(' '),'Payment Gambar':bill.proofId?`${bill.billNumber}_${safeFile(bill.proofName)}`:'','Void No.':bill.status==='voided'?bill.billNumber:''})))}
}

export async function purchaseBillsWorkbook(filters={},database=defaultDb,{uploadsRoot}={}){
  const data=purchaseBillRows(filters,database),workbook=new ExcelJS.Workbook();workbook.creator='KCS Dispatch System';workbook.created=new Date()
  const sheet=workbook.addWorksheet('Purchase Bills',{views:[{state:'frozen',ySplit:1}]})
  const columns=['Date','PO No.','Total','PaymentMethod','Customer Name','Branch','Item','Quantity','Price','Item Total','Issued By','Payment Gambar','Void No.']
  sheet.columns=columns.map(key=>({header:key,key,width:{Date:13,'PO No.':22,Total:12,PaymentMethod:16,'Customer Name':24,Branch:28,Item:22,Quantity:14,Price:12,'Item Total':14,'Issued By':22,'Payment Gambar':34,'Void No.':18}[key]||16}))
  data.rows.forEach(row=>sheet.addRow(row));sheet.autoFilter={from:'A1',to:`M${Math.max(1,sheet.rowCount)}`}
  const header=sheet.getRow(1);header.height=24;header.eachCell(cell=>{cell.font={bold:true,color:{argb:'FFFFFFFF'}};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF176B5B'}};cell.alignment={vertical:'middle'}})
  for(let row=2;row<=sheet.rowCount;row++){sheet.getCell(row,1).numFmt='yyyy/mm/dd';for(const column of [3,9,10])sheet.getCell(row,column).numFmt='0.00';sheet.getCell(row,8).numFmt='0.00####'}
  const proofSheet=workbook.addWorksheet('Payment Proofs',{views:[{state:'frozen',ySplit:1}]});proofSheet.columns=[{header:'PO No.',key:'bill',width:24},{header:'Payment Proof',key:'proof',width:55},{header:'Uploaded At',key:'uploaded',width:24}];proofSheet.getRow(1).eachCell(cell=>{cell.font={bold:true,color:{argb:'FFFFFFFF'}};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF176B5B'}}})
  const root=path.resolve(uploadsRoot||''),proofByBill=new Map();for(const bill of data.items){if(!bill.proofId)continue;const proof=database.prepare('SELECT storage_key storageKey,original_name originalName,content_type contentType,created_at createdAt FROM purchase_payment_proofs WHERE id=?').get(bill.proofId);if(!proof)continue;const absolute=path.resolve(root,proof.storageKey);if(!absolute.startsWith(root+path.sep)||!fs.existsSync(absolute))continue;const row=proofSheet.addRow({bill:bill.billNumber,proof:'Embedded image',uploaded:proof.createdAt}),extension=proof.contentType==='image/png'?'png':proof.contentType==='image/jpeg'?'jpeg':null;proofByBill.set(bill.billNumber,row.number);row.height=230;if(extension){const imageId=workbook.addImage({buffer:fs.readFileSync(absolute),extension});proofSheet.addImage(imageId,{tl:{col:1,row:row.number-1},ext:{width:420,height:300}})}else row.getCell(2).value='WebP proof: view in KCS system'}
  for(let row=2;row<=sheet.rowCount;row++){const billNumber=String(sheet.getCell(row,2).value||''),proofRow=proofByBill.get(billNumber);if(proofRow)sheet.getCell(row,12).value={text:'View Payment Proof',hyperlink:`#'Payment Proofs'!A${proofRow}`}}
  return{rangeLabel:data.rangeLabel,buffer:Buffer.from(await workbook.xlsx.writeBuffer()),rowCount:data.rows.length,proofCount:proofByBill.size}
}
