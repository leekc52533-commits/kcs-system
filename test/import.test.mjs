import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { schemaSql } from '../server/schema.mjs'
import { commitImport, previewImport } from '../server/importService.mjs'
import { dashboardSummary } from '../server/queryService.mjs'
import { identifyFile, isRouteReady, normalizeDayOfWeek } from '../shared/importRules.js'

const makeDb=()=>{const database=new DatabaseSync(':memory:');database.exec('PRAGMA foreign_keys=ON;'+schemaSql);return database}
const file=(sheetName,headers,rows,name='export_20990101.xlsx')=>({name,sheetName,headers,rows})
const customer=(name='Alpha')=>file('Customer List',['CustomerID','Customer Name'],[{CustomerID:'C1','Customer Name':name}])
const area=()=>file('AreaInfo',['AreaID','AreaName'],[{AreaID:'A1',AreaName:'North'}])
const branch=(name='Branch One',lat='3.1',lng='101.6')=>file('Customer Branch',['BranchID','CustomerID','Customer Name','New Branch','AreaID','Latitude','Longtitude'],[{BranchID:'B1',CustomerID:'C1','Customer Name':'Alpha','New Branch':name,AreaID:'A1',Latitude:lat,Longtitude:lng}])
const schedule=(id='S1',day='Monday')=>file('BranchSchedule',['ScheduleID','BranchID','Frequency','Day Of Week'],[{ScheduleID:id,BranchID:'B1',Frequency:'Weekly','Day Of Week':day}])
const importFiles=(database,files)=>{const preview=previewImport({files},database);assert.equal(preview.canCommit,true);return commitImport(preview.batchId,database)}

test('根据工作表与栏位识别文件类型，不依赖文件名',()=>{assert.equal(identifyFile(['CustomerID','Customer Name'],'Customer List').id,'customers');assert.equal(identifyFile(['ScheduleID','BranchID','Frequency'],'BranchSchedule').id,'schedules')})
test('Thurday 标准化为 Thursday',()=>assert.equal(normalizeDayOfWeek('Monday,Thurday'),'Monday,Thursday'))
test('CustomerID upsert 更新而不重复',()=>{const d=makeDb();importFiles(d,[customer()]);importFiles(d,[customer('Alpha Updated')]);const r=d.prepare('SELECT COUNT(*) count,MAX(name) name FROM customers').get();assert.equal(r.count,1);assert.equal(r.name,'Alpha Updated')})
test('BranchID upsert 更新而不重复',()=>{const d=makeDb();importFiles(d,[area(),customer(),branch()]);importFiles(d,[branch('Branch Updated')]);const r=d.prepare('SELECT COUNT(*) count,MAX(branch_name) name FROM branches').get();assert.equal(r.count,1);assert.equal(r.name,'Branch Updated')})
test('同一 BranchID 可有多个不同 ScheduleID',()=>{const d=makeDb();importFiles(d,[area(),customer(),branch(),schedule('S1'),schedule('S2','Friday')]);assert.equal(d.prepare('SELECT COUNT(*) count FROM branch_schedules WHERE source_branch_id=?').get('B1').count,2)})
test('Location Update 只更新已有 Branch GPS',()=>{const d=makeDb();importFiles(d,[area(),customer(),branch('Branch One','','')]);const location=file('Customer Location Update',['Branch ID','Latitude','Longtitude','GPS Remark'],[{'Branch ID':'B1',Latitude:'3.2',Longtitude:'101.7','GPS Remark':'verified'}]);importFiles(d,[location]);const r=d.prepare('SELECT latitude,longitude,gps_remark remark FROM branches WHERE jodoo_branch_id=?').get('B1');assert.equal(r.latitude,3.2);assert.equal(r.longitude,101.7);assert.equal(r.remark,'verified')})
test('相同资料重复导入不会重复新增',()=>{const d=makeDb();importFiles(d,[customer()]);const second=previewImport({files:[customer()]},d);assert.equal(second.summary.unchanged,1);commitImport(second.batchId,d);assert.equal(d.prepare('SELECT COUNT(*) count FROM customers').get().count,1)})
test('Route Ready 要求有效排程、GPS 和启用状态',()=>{assert.equal(isRouteReady({scheduleCount:1,latitude:3,longitude:101,status:'Active'}),true);assert.equal(isRouteReady({scheduleCount:1,latitude:null,longitude:null,status:'Active'}),false);const d=makeDb();importFiles(d,[area(),customer(),branch(),schedule()]);assert.equal(dashboardSummary(d).routeReadyCount,1)})
test('无法匹配 BranchID 的排程保留并进入 import_errors',()=>{const d=makeDb();const bad=file('BranchSchedule',['ScheduleID','BranchID','Frequency','Day Of Week'],[{ScheduleID:'SX',BranchID:'MISSING',Frequency:'Weekly','Day Of Week':'Monday'}]);const result=importFiles(d,[bad]);assert.equal(result.summary.unmatched,1);assert.equal(d.prepare("SELECT COUNT(*) count FROM import_errors WHERE error_code='BRANCH_NOT_FOUND'").get().count,1);assert.equal(d.prepare("SELECT COUNT(*) count FROM branch_schedules WHERE branch_id IS NULL").get().count,1)})
