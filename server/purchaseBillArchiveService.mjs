import fs from 'node:fs'
import path from 'node:path'
import ExcelJS from 'exceljs'
import {db as defaultDb} from './database.mjs'

const monthPattern=/^\d{4}-(0[1-9]|1[0-2])$/
const safeMonth=value=>monthPattern.test(String(value||''))?String(value):new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kuching',year:'numeric',month:'2-digit'}).format(new Date())
const monthRange=value=>{const month=safeMonth(value),[year,number]=month.split('-').map(Number),next=number===12?`${year+1}-01`:`${year}-${String(number+1).padStart(2,'0')}`;return{month,from:`${month}-01`,to:`${next}-01`}}
const safeFile=value=>String(value||'').replace(/[^A-Za-z0-9._-]+/g,'_').replace(/^\.+/,'')||'file'

function where(filters={}){
  const range=monthRange(filters.month),clauses=['pb.service_date>=?','pb.service_date<?'],params=[range.from,range.to]
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
  return{month:query.month,items,employees,summary:{billCount:items.length,totalCents:items.reduce((sum,item)=>sum+item.totalCents,0),cashCount:items.filter(item=>item.paymentMethod==='Cash').length,creditCount:items.filter(item=>item.paymentMethod==='Credit').length}}
}

export function purchaseBillRows(filters={},database=defaultDb){
  const archive=listPurchaseBillArchive(filters,database)
  return{...archive,rows:archive.items.flatMap(bill=>bill.items.map(item=>({Date:bill.serviceDate,'PO No.':bill.billNumber,Total:bill.totalCents/100,PaymentMethod:bill.paymentMethod,'Customer Name':bill.customerName,Branch:bill.branchName,Item:item.shortForm||item.item,Quantity:item.quantity,Price:item.unitPriceCents/100,'Item Total':item.itemTotalCents/100,'Issued By':[bill.issuedBy,bill.registrationNumber||bill.vehicleCode].filter(Boolean).join(' '),'Payment Gambar':bill.proofId?`${bill.billNumber}_${safeFile(bill.proofName)}`:'','Void No.':bill.status==='voided'?bill.billNumber:''})))}
}

export async function purchaseBillsWorkbook(filters={},database=defaultDb){
  const data=purchaseBillRows(filters,database),workbook=new ExcelJS.Workbook();workbook.creator='KCS Dispatch System';workbook.created=new Date()
  const sheet=workbook.addWorksheet('Purchase Bills',{views:[{state:'frozen',ySplit:1}]})
  const columns=['Date','PO No.','Total','PaymentMethod','Customer Name','Branch','Item','Quantity','Price','Item Total','Issued By','Payment Gambar','Void No.']
  sheet.columns=columns.map(key=>({header:key,key,width:{Date:13,'PO No.':22,Total:12,PaymentMethod:16,'Customer Name':24,Branch:28,Item:22,Quantity:14,Price:12,'Item Total':14,'Issued By':22,'Payment Gambar':34,'Void No.':18}[key]||16}))
  data.rows.forEach(row=>sheet.addRow(row));sheet.autoFilter={from:'A1',to:`M${Math.max(1,sheet.rowCount)}`}
  const header=sheet.getRow(1);header.height=24;header.eachCell(cell=>{cell.font={bold:true,color:{argb:'FFFFFFFF'}};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF176B5B'}};cell.alignment={vertical:'middle'}})
  for(let row=2;row<=sheet.rowCount;row++){sheet.getCell(row,1).numFmt='yyyy/mm/dd';for(const column of [3,9,10])sheet.getCell(row,column).numFmt='0.00';sheet.getCell(row,8).numFmt='0.00####'}
  return{month:data.month,buffer:Buffer.from(await workbook.xlsx.writeBuffer()),rowCount:data.rows.length}
}

const crcTable=(()=>{const table=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;table[n]=c>>>0}return table})()
const crc32=buffer=>{let crc=0xffffffff;for(const byte of buffer)crc=crcTable[(crc^byte)&255]^(crc>>>8);return(crc^0xffffffff)>>>0}
const dosDateTime=input=>{const date=new Date(input||Date.now()),year=Math.max(1980,date.getFullYear());return{date:((year-1980)<<9)|((date.getMonth()+1)<<5)|date.getDate(),time:(date.getHours()<<11)|(date.getMinutes()<<5)|(date.getSeconds()>>1)}}
function zipStore(files){const local=[],central=[];let offset=0;for(const file of files){const name=Buffer.from(file.name),data=file.data,crc=crc32(data),stamp=dosDateTime(file.mtime),header=Buffer.alloc(30);header.writeUInt32LE(0x04034b50);header.writeUInt16LE(20,4);header.writeUInt16LE(stamp.time,10);header.writeUInt16LE(stamp.date,12);header.writeUInt32LE(crc,14);header.writeUInt32LE(data.length,18);header.writeUInt32LE(data.length,22);header.writeUInt16LE(name.length,26);local.push(header,name,data);const entry=Buffer.alloc(46);entry.writeUInt32LE(0x02014b50);entry.writeUInt16LE(20,4);entry.writeUInt16LE(20,6);entry.writeUInt16LE(stamp.time,12);entry.writeUInt16LE(stamp.date,14);entry.writeUInt32LE(crc,16);entry.writeUInt32LE(data.length,20);entry.writeUInt32LE(data.length,24);entry.writeUInt16LE(name.length,28);entry.writeUInt32LE(offset,42);central.push(entry,name);offset+=header.length+name.length+data.length}const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...local,directory,end])}

export function purchaseProofsZip(filters={},database=defaultDb,{uploadsRoot}={}){
  const query=where(filters),proofs=database.prepare(`SELECT pb.bill_number billNumber,pp.storage_key storageKey,pp.original_name originalName,pp.created_at createdAt FROM purchase_bills pb JOIN purchase_payment_proofs pp ON pp.purchase_bill_id=pb.id WHERE ${query.sql} ORDER BY pb.service_date,pb.id`).all(...query.params),root=path.resolve(uploadsRoot||'')
  const files=proofs.map((proof,index)=>{const absolute=path.resolve(root,proof.storageKey);if(!absolute.startsWith(root+path.sep)||!fs.existsSync(absolute))return null;const extension=path.extname(proof.originalName)||path.extname(proof.storageKey)||'.jpg';return{name:`${proof.billNumber}_${String(index+1).padStart(3,'0')}${extension}`,data:fs.readFileSync(absolute),mtime:proof.createdAt}}).filter(Boolean)
  return{month:query.month,buffer:zipStore(files),fileCount:files.length}
}
