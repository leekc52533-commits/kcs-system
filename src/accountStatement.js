import {formatDateDisplay} from '../shared/datePresentation.js'
export async function accountStatementBuffer(bills,{from,to,paymentMethod}){
 const ExcelJS=(await import('exceljs/dist/exceljs.min.js')).default,book=new ExcelJS.Workbook(),groups=new Map(),used=new Set()
 for(const bill of bills.filter(b=>b.status==='issued'&&b.paymentMethod===paymentMethod&&b.serviceDate>=from&&b.serviceDate<=to).sort((a,b)=>a.serviceDate.localeCompare(b.serviceDate)||a.billNumber.localeCompare(b.billNumber,undefined,{numeric:true}))){const key=JSON.stringify([bill.customerName,bill.branchName]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(bill)}
 for(const rows of groups.values()){
  const first=rows[0],base=(first.branchName||first.customerName||'Statement').replace(/[\\/*?:\[\]]/g,' ').slice(0,25);let name=base,n=1;while(used.has(name.toLowerCase()))name=base+' '+(++n);used.add(name.toLowerCase())
  const s=book.addWorksheet(name,{pageSetup:{paperSize:9,orientation:'portrait',fitToPage:true,fitToWidth:1,fitToHeight:0},views:[{state:'frozen',ySplit:3}]})
  s.mergeCells('A1:E1');s.getCell('A1').value=`${formatDateDisplay(from)} – ${formatDateDisplay(to)} · ${paymentMethod}`
  s.mergeCells('A2:E2');s.getCell('A2').value=[first.customerName,first.branchName].filter((v,i,a)=>v&&a.indexOf(v)===i).join(' / ')
  s.addRow(['Date','Purchase No.','Qty','Per/Kg','Amount']);let qty=0,cents=0
  for(const b of rows)for(const item of b.items){s.addRow([new Date(b.serviceDate+'T00:00:00Z'),b.billNumber,item.quantity,item.unitPrice,item.itemTotalCents/100]);qty+=item.quantity;cents+=item.itemTotalCents}
  const total=s.addRow(['Total','',qty,null,cents/100]);total.font={bold:true};s.autoFilter={from:'A3',to:`E${total.number-1}`}
  s.eachRow((row,index)=>{row.height=index<=2?28:22;row.eachCell({includeEmpty:true},(cell,col)=>{cell.font={name:'Arial',size:11,bold:index<=3||index===total.number};cell.border={top:{style:index<=3?'medium':'thin'},bottom:{style:index===total.number?'medium':'thin'},left:{style:col===1?'medium':'thin'},right:{style:col===5?'medium':'thin'}};cell.alignment={vertical:'middle',horizontal:index<=2?'center':col>=3?'right':'left'};if(index>3){if(col===1&&cell.value instanceof Date)cell.numFmt='dd-mmm-yy';if(col===3||col===5)cell.numFmt='#,##0.00';if(col===4)cell.numFmt='0.000'}})})
  s.columns.forEach((col,i)=>{let width=[15,22,14,14,17][i];col.eachCell((cell,row)=>{if(row>2)width=Math.max(width,String(cell.value instanceof Date?'04-Oct-26':cell.text).length+3)});col.width=Math.min(width,45)})
  s.pageSetup.printTitlesRow='1:3';s.pageSetup.printArea=`A1:E${total.number}`
 }
 if(!groups.size)throw Error('EMPTY_STATEMENT')
 return book.xlsx.writeBuffer()
}
