import {formatDateDisplay} from '../shared/datePresentation.js'
export async function accountStatementBuffer(bills,{from,to,paymentMethod}){
 const ExcelJS=(await import('exceljs/dist/exceljs.min.js')).default,book=new ExcelJS.Workbook(),groups=new Map(),used=new Set()
 for(const bill of bills.filter(b=>b.status==='issued'&&b.paymentMethod===paymentMethod&&b.serviceDate>=from&&b.serviceDate<=to).sort((a,b)=>a.serviceDate.localeCompare(b.serviceDate)||a.billNumber.localeCompare(b.billNumber,undefined,{numeric:true}))){const key=bill.customerName||'';if(!groups.has(key))groups.set(key,[]);groups.get(key).push(bill)}
 for(const rows of groups.values()){
  const first=rows[0],base=(first.customerName||'Statement').replace(/[\\/*?:\[\]]/g,' ').slice(0,25);let name=base,n=1;while(used.has(name.toLowerCase()))name=base+' '+(++n);used.add(name.toLowerCase())
  const s=book.addWorksheet(name,{pageSetup:{paperSize:9,orientation:'portrait',fitToPage:true,fitToWidth:1,fitToHeight:0},views:[{state:'frozen',ySplit:3}]})
  s.properties.defaultRowHeight=15
  const bold=new Set([1,2,3]),branches=new Map();let qty=0,cents=0
  s.mergeCells('A1:E1');s.getCell('A1').value=first.customerName||'Statement'
  s.mergeCells('A2:E2');s.getCell('A2').value=`${formatDateDisplay(from)} – ${formatDateDisplay(to)} · ${paymentMethod}`
  for(const b of rows){const key=b.branchName||b.customerName;if(!branches.has(key))branches.set(key,{bills:[],qty:0,cents:0});const group=branches.get(key);group.bills.push(b);for(const item of b.items){group.qty+=item.quantity;group.cents+=item.itemTotalCents;qty+=item.quantity;cents+=item.itemTotalCents}}
  s.addRow(['Outlet','Qty'])
  for(const [name,group]of branches){const r=s.addRow([name,group.qty]);r.getCell(2).numFmt='#,##0.00'}
  const summary=s.addRow(['Total',qty]);summary.getCell(2).numFmt='#,##0.00';bold.add(summary.number)
  s.autoFilter={from:'A3',to:`B${summary.number-1}`}
  for(const [name,group]of branches){
   s.addRow([]);const title=s.addRow([name]);s.mergeCells(title.number,1,title.number,5);bold.add(title.number)
   bold.add(s.addRow(['Date','Purchase No.','Qty','Per/Kg','Amount']).number)
   for(const b of group.bills)for(const item of b.items){const r=s.addRow([new Date(b.serviceDate+'T00:00:00Z'),b.billNumber,item.quantity,item.unitPrice,item.itemTotalCents/100]);r.getCell(1).numFmt='dd-mmm-yy';r.getCell(3).numFmt='#,##0.00';r.getCell(4).numFmt='0.000';r.getCell(5).numFmt='#,##0.00'}
   const subtotal=s.addRow(['Subtotal','',group.qty,null,group.cents/100]);bold.add(subtotal.number);subtotal.getCell(3).numFmt='#,##0.00';subtotal.getCell(5).numFmt='#,##0.00'
  }
  const total=s.addRow(['Grand Total','',qty,null,cents/100]);bold.add(total.number);total.getCell(3).numFmt='#,##0.00';total.getCell(5).numFmt='#,##0.00'
  s.eachRow({includeEmpty:true},(row,index)=>{row.height=15;row.eachCell({includeEmpty:true},(cell,col)=>{cell.font={name:'Arial',size:10,bold:bold.has(index)};cell.border={top:{style:'thin'},bottom:{style:bold.has(index)?'medium':'thin'},left:{style:'thin'},right:{style:'thin'}};cell.alignment={vertical:'middle',horizontal:cell.isMerged?'center':typeof cell.value==='number'?'right':'left'}})})
  s.columns.forEach((col,i)=>{let width=[15,22,14,14,17][i];col.eachCell(cell=>{if(!cell.isMerged)width=Math.max(width,Array.from(cell.value instanceof Date?'04-Oct-26':cell.text||'').reduce((n,c)=>n+(c.charCodeAt(0)>255?2:1),0)+3)});col.width=width})
  s.pageSetup.printTitlesRow='1:2';s.pageSetup.printArea=`A1:E${total.number}`
 }
 if(!groups.size)throw Error('EMPTY_STATEMENT')
 return book.xlsx.writeBuffer()
}
