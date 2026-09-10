import ExcelJS from 'exceljs'
import {expenseServiceDate} from '../shared/cashCalendar.js'
import {dailyEmployeeSpending,employeeSpending} from './cashFloatOverview.mjs'
export async function cashDailyWorkbook(db,query){
 const from=expenseServiceDate(query.from),to=expenseServiceDate(query.to)
 if(!query.from||!query.to||from>to)throw Object.assign(Error('CASH_DATE_INVALID'),{code:'CASH_DATE_INVALID',statusCode:400})
 const workbook=new ExcelJS.Workbook(),daily=workbook.addWorksheet('Daily Cash Spending'),items=workbook.addWorksheet('Employee Expense Items')
 daily.columns=[{header:'Date',key:'date',width:16},{header:'Cash purchases (RM)',key:'purchase',width:25},{header:'Employee expenses (RM)',key:'expense',width:27},{header:'Voided cash purchases (RM)',key:'void',width:30},{header:'Cash spending (RM)',key:'total',width:25}]
 let month=from.slice(0,7)
 while(month<=to.slice(0,7)){
  for(const row of dailyEmployeeSpending(db,month).items.reverse().filter(row=>row.date>=from&&row.date<=to))daily.addRow({date:row.date,purchase:row.purchaseCents/100,expense:row.expenseCents/100,void:row.voidCents/100,total:row.totalCents/100})
  const [year,m]=month.split('-').map(Number);month=m===12?`${year+1}-01`:`${year}-${String(m+1).padStart(2,'0')}`
 }
 const total=employeeSpending(db,from,to);daily.addRow({date:'TOTAL',purchase:total.purchaseCents/100,expense:total.expenseCents/100,void:total.voidCents/100,total:total.totalCents/100})
 items.columns=[{header:'Category',key:'category',width:22},{header:'Description',key:'description',width:45},{header:'Amount (RM)',key:'amount',width:22}]
 for(const row of total.expenseItems)items.addRow({category:row.category,description:row.description,amount:row.amountCents/100})
 items.addRow({category:'TOTAL',amount:total.expenseCents/100})
 for(const sheet of [daily,items]){sheet.views=[{state:'frozen',ySplit:1}];sheet.autoFilter={from:'A1',to:{row:Math.max(1,sheet.rowCount-1),column:sheet.columnCount}};sheet.getRow(1).eachCell(cell=>{cell.font={bold:true,color:{argb:'FFFFFFFF'}};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF176B5B'}}});sheet.getRow(sheet.rowCount).font={bold:true};for(let r=2;r<=sheet.rowCount;r++)for(let c=sheet===daily?2:3;c<=sheet.columnCount;c++)sheet.getCell(r,c).numFmt='#,##0.00'}
 return Buffer.from(await workbook.xlsx.writeBuffer())
}
