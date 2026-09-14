import ExcelJS from 'exceljs'
import {db as defaultDb} from './database.mjs'
import {unloadingCode} from './routeUnloadingService.mjs'
import {validSalesDate} from '../shared/sales.js'
import {filterUnloading,unloadingColumns,unloadingLabels,unloadingStatus} from '../shared/unloadingArchive.js'
const parts=value=>Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kuching',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value)).map(p=>[p.type,p.value]))
export function listUnloadingArchive(query={},db=defaultDb){
 if((query.from&&!validSalesDate(query.from))||(query.to&&!validSalesDate(query.to))||(query.from&&query.to&&query.from>query.to))throw Object.assign(new Error('Invalid date range'),{statusCode:400})
 const rows=db.prepare(`SELECT id,service_date serviceDate,trip_number tripNumber,registration_number_snapshot registrationNumber,vehicle_code_snapshot vehicleCode,driver_name_snapshot driverName,crew_names_snapshot crew,unloading_location_name_snapshot locationName,confirmed_weight_kg confirmedWeightKg,status,weighed_at weighedAt FROM unloading_weight_records ORDER BY weighed_at DESC,id DESC`).all().map(r=>{
  const p=parts(r.weighedAt)
  return {...r,code:unloadingCode(r),date:`${p.year}-${p.month}-${p.day}`,time:`${p.hour}:${p.minute}:${p.second}`,vehicle:r.registrationNumber||r.vehicleCode,photoUrl:`/api/unloading-weights/${r.id}/photo`}
 }).filter(r=>(!query.from||r.date>=query.from)&&(!query.to||r.date<=query.to)).sort((a,b)=>b.date.localeCompare(a.date)||b.time.localeCompare(a.time)||b.id-a.id)
 return filterUnloading(rows,query)
}
export async function unloadingArchiveWorkbook(query={},db=defaultDb){
 const lang=unloadingLabels[query.language]?query.language:'en',book=new ExcelJS.Workbook(),sheet=book.addWorksheet('Unloading')
 sheet.columns=unloadingColumns.map((key,i)=>({key,header:unloadingLabels[lang][i],width:key==='code'||key==='driverName'||key==='locationName'?30:20}))
 for(const item of listUnloadingArchive(query,db).items)sheet.addRow({...item,status:unloadingStatus[lang][item.status]})
 sheet.views=[{state:'frozen',ySplit:1}];sheet.autoFilter={from:{row:1,column:1},to:{row:1,column:unloadingColumns.length}}
 sheet.getRow(1).eachCell(c=>{c.font={bold:true,color:{argb:'FF536675'}};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFEAF0F4'}}})
 return book.xlsx.writeBuffer()
}
