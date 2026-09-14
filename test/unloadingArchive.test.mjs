import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import ExcelJS from 'exceljs'
import {listUnloadingArchive,unloadingArchiveWorkbook} from '../server/unloadingArchiveService.mjs'
import {normalizeMenuLayout,validMenuLayout,defaultMenuLayout} from '../shared/menuLayout.js'
test('archive includes pending weights, Malaysia date boundaries, filters and identical export order',async()=>{
 const db=new DatabaseSync(':memory:')
 db.exec(`CREATE TABLE unloading_weight_records(id INTEGER,service_date TEXT,trip_number INTEGER,registration_number_snapshot TEXT,vehicle_code_snapshot TEXT,driver_name_snapshot TEXT,crew_names_snapshot TEXT,unloading_location_name_snapshot TEXT,confirmed_weight_kg REAL,status TEXT,weighed_at TEXT);
 INSERT INTO unloading_weight_records VALUES(1,'2026-09-13',1,'CAR2','V2','Driver A',NULL,'Factory',NULL,'pending_confirmation','2026-09-13T17:00:00Z'),(2,'2026-09-14',2,'CAR10','V10','Driver B','Crew','Factory',2000,'confirmed','2026-09-14T02:00:00Z'),(3,'2026-09-13',1,'CAR1','V1','Driver C',NULL,'Other',900,'confirmed','2026-09-13T15:00:00Z');`)
 try{
  assert.deepEqual(listUnloadingArchive({},db).items.map(r=>r.id),[2,1,3])
  const query={from:'2026-09-14',to:'2026-09-14',sortKey:'vehicle',sortDirection:'asc'}
  const rows=listUnloadingArchive(query,db).items
  assert.deepEqual(rows.map(r=>r.id),[1,2]);assert.equal(rows[0].time,'01:00:00');assert.equal(rows[0].confirmedWeightKg,null)
  assert.equal(rows[0].photoUrl,'/api/unloading-weights/1/photo')
  assert.equal(listUnloadingArchive({...query,columns:JSON.stringify({status:[]})},db).items.length,0)
  assert.deepEqual(listUnloadingArchive({...query,columns:{crew:['']}},db).items.map(r=>r.id),[1])
  assert.deepEqual(listUnloadingArchive({sortKey:'confirmedWeightKg',sortDirection:'desc',columns:{status:['confirmed']}},db).items.map(r=>r.id),[2,3])
  assert.throws(()=>listUnloadingArchive({from:'2026-02-30'},db),{statusCode:400})
  const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(await unloadingArchiveWorkbook({...query,language:'zh'},db))
  const sheet=workbook.worksheets[0];assert.equal(sheet.rowCount,3);assert.equal(sheet.getCell('A1').value,'卸货日期');assert.equal(sheet.getCell('D2').value,'CAR2');assert.equal(sheet.getCell('I2').value,null);assert.equal(sheet.getCell('J2').value,'待确认');assert.equal(sheet.getCell('I3').value,2000)
 }finally{db.close()}
})
test('existing custom menu keeps ordering and adds unloading page once under Documents',()=>{
 const old=defaultMenuLayout();old.documents=old.documents.filter(id=>id!=='unloading-records');old.top.reverse()
 const next=normalizeMenuLayout(old);assert.deepEqual(next.top,old.top);assert.equal(next.documents.at(-1),'unloading-records');assert(validMenuLayout(next));assert.deepEqual(normalizeMenuLayout(next),next)
})
