import {db as defaultDb} from './database.mjs'
import {withImmediateTransaction} from './branchServiceDateGuard.mjs'
import {image} from './driverExecutionService.mjs'
import {billKey,validSalesDate,salesLineCents,filterSales,salesColumns} from '../shared/sales.js'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import ExcelJS from 'exceljs'
const fail=code=>Object.assign(new Error(code),{code,statusCode:400})
export function assertSalesAccess(context){if(!['owner','owner_admin','operations_admin','supervisor','office','dispatcher'].includes(context.role))throw Object.assign(fail('SALES_ACCESS'),{statusCode:403})}
export function salesMasters(db=defaultDb){return{buyers:db.prepare("SELECT id,buyer_name name FROM buyers WHERE status='active' ORDER BY buyer_name").all(),vehicles:db.prepare("SELECT id,registration_number plate,vehicle_code code FROM vehicles WHERE status IN ('active','available','assigned') ORDER BY vehicle_code").all()}}
const decode=r=>({...r,buyerId:r.buyer_id,buyerName:r.buyer_name,vehicleId:r.vehicle_id,vehiclePlate:r.vehicle_plate,billNumber:r.bill_number,settlementDate:r.settlement_date,lines:JSON.parse(r.lines_json),total:(r.total_cents/100).toFixed(2),rounding:(r.rounding_cents/100).toFixed(2),createdBy:r.created_by,createdAt:r.created_at})
export function salesRecord(id,context,db=defaultDb){assertSalesAccess(context);const r=db.prepare('SELECT * FROM sales_settlements WHERE id=?').get(Number(id));if(!r)throw fail('SALES_NOT_FOUND');const decoded=decode(r);delete decoded.storage_key;return decoded}
export function listSales(query,context,db=defaultDb){assertSalesAccess(context);if(!validSalesDate(query.from)||!validSalesDate(query.to)||query.from>query.to)throw fail('SALES_DATE');const records=db.prepare('SELECT * FROM sales_settlements WHERE settlement_date BETWEEN ? AND ? ORDER BY settlement_date DESC,id DESC').all(query.from,query.to).map(decode);const rows=records.flatMap(r=>r.lines.map((l,i)=>({id:r.id,rowKey:r.id+'-'+i,settlementDate:r.settlementDate,billNumber:r.billNumber,buyerName:r.buyerName,vehiclePlate:r.vehiclePlate,...l,total:r.total,remarks:r.remarks,createdBy:r.createdBy})));return{...filterSales(rows,query),...salesMasters(db)}}
function validate(payload,db,old){
 if(payload.reviewed!==true)throw fail('SALES_REVIEW')
 const buyer=db.prepare('SELECT * FROM buyers WHERE id=?').get(Number(payload.buyerId)),vehicle=db.prepare('SELECT * FROM vehicles WHERE id=?').get(Number(payload.vehicleId))
 if(!buyer||buyer.status!=='active'&&buyer.id!==old?.buyer_id||!vehicle||!['active','available','assigned'].includes(vehicle.status)&&vehicle.id!==old?.vehicle_id)throw fail('SALES_MASTER')
 const number=String(payload.billNumber||'').trim();if(!number||number.length>100)throw fail('SALES_NUMBER')
 if(!validSalesDate(payload.settlementDate))throw fail('SALES_DATE')
 if(!Array.isArray(payload.lines)||!payload.lines.length||payload.lines.length>100)throw fail('SALES_LINES')
 const slips=new Set(),lines=payload.lines.map(l=>{
  const slipNumber=String(l.slipNumber||'').trim(),description=String(l.description||'').trim(),weightKg=String(l.weightKg??'').trim(),unitPrice=String(l.unitPrice??'').trim(),amount=String(l.amount??'').trim()
  if(!validSalesDate(l.deliveryDate)||l.deliveryDate>payload.settlementDate)throw fail('SALES_DATE')
  if(!slipNumber||slipNumber.length>100||!description||description.length>300||slips.has(billKey(slipNumber)))throw fail('SALES_LINES');slips.add(billKey(slipNumber))
  if(!/^\d{1,7}(\.\d{1,3})?$/.test(weightKg)||Number(weightKg)<=0||!/^\d{1,5}(\.\d{1,6})?$/.test(unitPrice)||Number(unitPrice)<=0||!/^\d{1,10}(\.\d{1,2})?$/.test(amount))throw fail('SALES_LINES')
  if(salesLineCents(weightKg,unitPrice)!==Math.round(Number(amount)*100))throw fail('SALES_MATH')
  return{deliveryDate:l.deliveryDate,slipNumber,description,weightKg,unitPrice,amount:Number(amount).toFixed(2)}
 })
 if(!/^-?\d{1,6}(\.\d{1,2})?$/.test(String(payload.rounding||'0'))||!/^\d{1,10}(\.\d{1,2})?$/.test(String(payload.total)))throw fail('SALES_MATH')
 const rounding=Math.round(Number(payload.rounding||0)*100),total=Math.round(Number(payload.total)*100)
 if(total<=0||total!==lines.reduce((sum,l)=>sum+Math.round(Number(l.amount)*100),0)+rounding)throw fail('SALES_MATH')
 return{buyer,vehicle,number,lines,rounding,total}
}
export function saveSales(payload,context,db=defaultDb,{uploadsRoot}={}){
 assertSalesAccess(context);let written
 try{return withImmediateTransaction(db,()=>{
  const old=payload.id?db.prepare('SELECT * FROM sales_settlements WHERE id=?').get(Number(payload.id)):null
  if(payload.id&&!old)throw fail('SALES_NOT_FOUND');if(old&&Number(payload.revision)!==old.revision)throw fail('SALES_STALE')
  const v=validate(payload,db,old),duplicate=db.prepare('SELECT id FROM sales_settlements WHERE buyer_id=? AND bill_key=? AND id<>?').get(v.buyer.id,billKey(v.number),old?.id||0)
  if(duplicate)throw fail('SALES_DUPLICATE')
  let key=old?.storage_key,type=old?.content_type
  if(!old){if(!uploadsRoot)throw fail('SALES_STORAGE');const photo=image(payload.proof);key=`sales/${crypto.randomUUID()}.${photo.extension}`;type=photo.type;written=path.resolve(uploadsRoot,key);fs.mkdirSync(path.dirname(written),{recursive:true});fs.writeFileSync(written,photo.bytes,{flag:'wx'})}
  const actor=String(context.employeeName||context.role),values=[v.buyer.id,v.buyer.buyer_name,v.vehicle.id,v.vehicle.registration_number||v.vehicle.vehicle_code,v.number,billKey(v.number),payload.settlementDate,JSON.stringify(v.lines),v.total,v.rounding,key,type,String(payload.remarks||'').slice(0,1000)]
  let id=old?.id
  if(old)db.prepare('UPDATE sales_settlements SET buyer_id=?,buyer_name=?,vehicle_id=?,vehicle_plate=?,bill_number=?,bill_key=?,settlement_date=?,lines_json=?,total_cents=?,rounding_cents=?,storage_key=?,content_type=?,remarks=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(...values,id)
  else id=Number(db.prepare('INSERT INTO sales_settlements(buyer_id,buyer_name,vehicle_id,vehicle_plate,bill_number,bill_key,settlement_date,lines_json,total_cents,rounding_cents,storage_key,content_type,remarks,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(...values,actor).lastInsertRowid)
  db.prepare('INSERT INTO sales_settlement_audit(settlement_id,actor,before_json,after_json) VALUES(?,?,?,?)').run(id,actor,old?JSON.stringify(old):null,JSON.stringify(db.prepare('SELECT * FROM sales_settlements WHERE id=?').get(id)))
  return salesRecord(id,context,db)
 })}catch(e){if(written&&fs.existsSync(written))fs.unlinkSync(written);throw e}
}
export function salesPhoto(id,context,db=defaultDb){assertSalesAccess(context);const p=db.prepare('SELECT storage_key,content_type FROM sales_settlements WHERE id=?').get(Number(id));if(!p)throw fail('SALES_NOT_FOUND');return p}
export async function exportSales(query,context,db=defaultDb,{uploadsRoot}={}){
 const{items}=listSales(query,context,db),book=new ExcelJS.Workbook(),sheet=book.addWorksheet('Sales')
 sheet.addRow(salesColumns);items.forEach(r=>sheet.addRow(salesColumns.map(k=>['amount','total','weightKg','unitPrice'].includes(k)?Number(r[k]):String(r[k]??''))))
 sheet.columns.forEach(c=>c.width=24);sheet.getRow(1).font={bold:true};sheet.views=[{state:'frozen',ySplit:1}]
 const proofs=book.addWorksheet('Bill Photos');proofs.getColumn(1).width=100
 let row=1
 for(const id of new Set(items.map(r=>r.id))){const record=salesRecord(id,context,db),p=salesPhoto(id,context,db),file=path.resolve(uploadsRoot,p.storage_key);proofs.getCell(row,1).value=record.billNumber+' — '+record.buyerName;row++
  if(file.startsWith(path.resolve(uploadsRoot)+path.sep)&&fs.existsSync(file)&&['image/jpeg','image/png'].includes(p.content_type)){const imageId=book.addImage({buffer:fs.readFileSync(file),extension:p.content_type==='image/jpeg'?'jpeg':'png'});proofs.addImage(imageId,{tl:{col:0,row:row-1},ext:{width:720,height:540}});row+=29}else{proofs.getCell(row++,1).value='View original: /api/sales/'+id+'/photo'}
 }
 return Buffer.from(await book.xlsx.writeBuffer())
}
