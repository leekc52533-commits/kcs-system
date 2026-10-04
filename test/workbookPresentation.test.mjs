import test from 'node:test'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import {formatWorkbook} from '../shared/workbookPresentation.js'
test('workbook uses unfilled readable headers, filters, real dates and content widths while preserving numbers',async()=>{
 const book=new ExcelJS.Workbook(),s=book.addWorksheet('Data');s.addRow(['settlementDate','customerName','unitPrice']);s.addRow(['2026-10-04','A long customer name for automatic width',0.22]);s.getCell('C2').numFmt='0.000';s.getCell('A1').fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF176B5B'}}
 formatWorkbook(book);assert.equal(s.getCell('A1').value,'Settlement Date');assert.equal(s.getCell('A1').fill.pattern,'none');assert.equal(s.getCell('A2').numFmt,'dd-mmm-yy');assert.equal(s.getCell('A2').value.toISOString().slice(0,10),'2026-10-04');assert.equal(s.getCell('C2').value,0.22);assert.equal(s.getCell('C2').numFmt,'0.000');assert.ok(s.getColumn(2).width>40);assert.ok(s.autoFilter)
 const reread=new ExcelJS.Workbook();await reread.xlsx.load(await book.xlsx.writeBuffer());assert.equal(reread.worksheets[0].getCell('A2').numFmt,'dd-mmm-yy')
})
