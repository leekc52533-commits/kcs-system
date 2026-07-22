import test from 'node:test'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import { buildWorkbookBuffer, readSpreadsheet } from '../src/spreadsheetFiles.js'

test('XLSX 模板与资料导出可由 Excel 重新读取',async()=>{const buffer=await buildWorkbookBuffer({columns:['Customer ID','Customer Name','Status'],rows:[{'Customer ID':'C1','Customer Name':'Alpha','Status':'active'}],label:'Customer'}),workbook=new ExcelJS.Workbook();await workbook.xlsx.load(buffer);const sheet=workbook.worksheets[0];assert.equal(sheet.getCell('A1').value,'Customer ID');assert.equal(sheet.getCell('B2').value,'Alpha');assert.equal(sheet.views[0].ySplit,1);assert.ok(sheet.autoFilter);assert.equal(sheet.getCell('A1').fill.fgColor.argb,'FF176B5B')})

test('应用可读取刚生成的 XLSX 并恢复行资料',async()=>{const buffer=await buildWorkbookBuffer({columns:['Buyer ID','Buyer Name'],rows:[{'Buyer ID':'BUY-1','Buyer Name':'Paper Mill'}],label:'Buyer'}),file=new File([buffer],'buyer.xlsx',{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),parsed=await readSpreadsheet(file);assert.equal(parsed.format,'xlsx');assert.deepEqual(parsed.rows,[{'Buyer ID':'BUY-1','Buyer Name':'Paper Mill'}])})
