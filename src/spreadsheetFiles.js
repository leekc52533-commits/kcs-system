import {kuchingDate} from '../shared/kuchingTime.js'

const safeCell=value=>{
  if(value==null)return ''
  const text=String(value)
  return /^[=+@]/.test(text)||(/^-/u.test(text)&&!/^-[0-9.]+$/u.test(text))?`'${text}`:value
}

export async function readSpreadsheet(file){
  const extension=file.name.split('.').pop().toLowerCase()
  if(extension==='csv')return{format:'csv',sheetName:'CSV',rows:parseCsv(await file.text())}
  if(extension!=='xlsx')throw new Error('只支持 .xlsx 或 .csv 文件')
  const ExcelJS=(await import('exceljs/dist/exceljs.min.js')).default
  const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(await file.arrayBuffer());const sheet=workbook.worksheets[0];if(!sheet)throw new Error('Excel 没有工作表')
  const headers=sheet.getRow(1).values.slice(1).map(value=>String(value?.text??value??'').trim()),rows=[]
  sheet.eachRow((row,index)=>{if(index===1)return;const item={};let hasValue=false;headers.forEach((header,column)=>{const cell=row.getCell(column+1),raw=cell.value?.text??cell.value?.result??cell.value;if(raw!==null&&raw!==undefined&&raw!=='')hasValue=true;item[header]=raw instanceof Date?kuchingDate(raw):raw});if(hasValue)rows.push(item)})
  return{format:'xlsx',sheetName:sheet.name,rows}
}

function parseCsv(source){
  const rows=[];let row=[],cell='',quoted=false
  for(let index=0;index<source.length;index+=1){const char=source[index],next=source[index+1];if(char==='"'){if(quoted&&next==='"'){cell+='"';index+=1}else quoted=!quoted}else if(char===','&&!quoted){row.push(cell);cell=''}else if((char==='\n'||char==='\r')&&!quoted){if(char==='\r'&&next==='\n')index+=1;row.push(cell);if(row.some(value=>value!==''))rows.push(row);row=[];cell=''}else cell+=char}
  row.push(cell);if(row.some(value=>value!==''))rows.push(row);const headers=(rows.shift()||[]).map(value=>value.replace(/^\uFEFF/,''));return rows.map(values=>Object.fromEntries(headers.map((header,index)=>[header,values[index]??''])))
}

const csvCell=value=>`"${String(safeCell(value)??'').replace(/"/g,'""')}"`
export async function downloadSpreadsheet({columns,rows,fileName,label},format='xlsx'){
  if(format==='csv'){const csv='\uFEFF'+[columns.map(csvCell).join(','),...rows.map(row=>columns.map(column=>csvCell(row[column])).join(','))].join('\r\n');return download(new Blob([csv],{type:'text/csv;charset=utf-8'}),`${fileName}.csv`)}
  const buffer=await buildWorkbookBuffer({columns,rows,label});download(new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),`${fileName}.xlsx`)
}

export async function buildWorkbookBuffer({columns,rows,label}){const ExcelJS=(await import('exceljs/dist/exceljs.min.js')).default,workbook=new ExcelJS.Workbook();workbook.creator='KCS Dispatch System';workbook.created=new Date();const sheet=workbook.addWorksheet((label||'KCS Data').slice(0,31),{views:[{state:'frozen',ySplit:1,showGridLines:false}]});sheet.columns=columns.map(header=>({header,key:header,width:Math.min(42,Math.max(14,header.length+4))}));for(const source of rows)sheet.addRow(Object.fromEntries(columns.map(column=>[column,safeCell(source[column])])));const header=sheet.getRow(1);header.height=26;header.eachCell(cell=>{cell.font={bold:true,color:{argb:'FFFFFFFF'}};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF176B5B'}};cell.alignment={vertical:'middle'};cell.border={bottom:{style:'medium',color:{argb:'FF0F4F43'}}}});sheet.autoFilter={from:{row:1,column:1},to:{row:Math.max(1,sheet.rowCount),column:columns.length}};sheet.eachRow((row,index)=>{if(index>1){row.height=21;row.eachCell(cell=>{cell.alignment={vertical:'middle',wrapText:false};cell.border={bottom:{style:'hair',color:{argb:'FFE2E8E6'}}}})}});return workbook.xlsx.writeBuffer()}

function download(blob,fileName){const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=fileName;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}
