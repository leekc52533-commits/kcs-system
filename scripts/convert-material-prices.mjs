import fs from 'node:fs'
import {DatabaseSync} from 'node:sqlite'
import ExcelJS from 'exceljs'
import {runMaterialConversion} from '../server/materialConversionService.mjs'
import {materialIssueReport} from '../server/materialProductService.mjs'

const args=process.argv.slice(2),value=name=>{const index=args.indexOf(name);return index>=0?args[index+1]:null}
const dbPath=value('--db'),occPlanPath=value('--occ-plan'),itemMasterPath=value('--item-master'),customerItemsPath=value('--customer-items'),apply=args.includes('--apply')
if(!dbPath)throw new Error('--db is required')
if(!occPlanPath||!itemMasterPath||!customerItemsPath)throw new Error('--occ-plan, --item-master and --customer-items are required')

async function rows(path){
  const workbook=new ExcelJS.Workbook();await workbook.xlsx.readFile(path);const sheet=workbook.worksheets[0]
  const headers=sheet.getRow(1).values.slice(1)
  return sheet.getRows(2,Math.max(0,sheet.rowCount-1)).map(row=>Object.fromEntries(headers.map((header,index)=>[header,row.getCell(index+1).value])))
}
const itemRows=await rows(itemMasterPath),assignmentRows=await rows(customerItemsPath)
const itemById=new Map(itemRows.map(row=>[String(row.ItemID),row]))
const nonOccAssignments=assignmentRows.map(row=>{
  const item=itemById.get(String(row.ItemID))
  if(!item||/^OCC(?:\s|$)/i.test(String(item.ItemType||'')))return null
  return{customerId:String(row.CompanyID||''),customerName:row['Company Name'],legacyItemId:String(row.ItemID||''),legacyName:row.Item,price:Number(item.Price)}
}).filter(Boolean)
const occPlan=JSON.parse(fs.readFileSync(occPlanPath,'utf8')).results
const database=new DatabaseSync(dbPath);database.exec('PRAGMA foreign_keys=ON;PRAGMA busy_timeout=5000')
const result=runMaterialConversion(database,{occPlan,nonOccAssignments,apply})
const report=materialIssueReport(database)
console.log(JSON.stringify({...result,materialIssues:report.summary,coverage:report.coverage},null,2))
database.close()
