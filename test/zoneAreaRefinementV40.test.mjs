import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {DatabaseSync} from 'node:sqlite'
import {schemaSql,SCHEMA_VERSION} from '../server/schema.mjs'
import {applyV39Migration} from '../server/migrationV39.mjs'
import {applyV40Migration} from '../server/migrationV40.mjs'
import {analyzeZoneAreas,confirmAreaRefinement,getAreaRefinement,updateAreaRefinement} from '../server/areaRefinementService.mjs'
import {messages} from '../src/translations.js'

function fixture(){
  const db=new DatabaseSync(':memory:')
  db.exec(`PRAGMA foreign_keys=ON;${schemaSql}`)
  db.exec(`
    INSERT INTO zone_groups(id,code,name,sort_order) VALUES(91,'K-A','Kuching A',91),(92,'K-B','Kuching B',92);
    INSERT INTO areas(id,jodoo_area_id,name,zone_group_id,confirmed_zone_group_id,zone_assignment_status) VALUES
      (10,'A10','AEON MALL',91,91,'confirmed'),(11,'A11','OLD EAST',91,91,'confirmed'),(12,'A12','OLD WEST',91,91,'confirmed'),(13,'A13','REMOTE',91,91,'confirmed'),(20,'A20','OTHER ZONE',92,92,'confirmed');
    INSERT INTO customers(id,jodoo_customer_id,name) VALUES(1,'10001','Alpha');
    INSERT INTO branches(id,jodoo_branch_id,customer_id,area_id,branch_name,address,latitude,longitude) VALUES
      (101,'10101',1,10,'AEON ONE','Mall entrance A',1.5000,110.3000),(102,'10102',1,10,'AEON TWO','Mall entrance B',1.5001,110.3001),
      (103,'10103',1,11,'CENTRAL EAST','East',1.5100,110.3100),(104,'10104',1,12,'CENTRAL WEST','West',1.5102,110.3102),
      (105,'10105',1,12,'NO GPS','Missing',NULL,NULL),(106,'10106',1,13,'REMOTE SHOP','Remote',1.6000,110.4000),
      (201,'10201',1,20,'OUTSIDE','Other Zone',1.5101,110.3101);
  `)
  return db
}
const geocoder=async latitude=>latitude<1.50005?{address:'Entrance A',street:'Jalan A',sublocality:'Mall North',locality:'Kuching'}:latitude<1.501?{address:'Entrance B',street:'Lorong B',sublocality:'Mall South',locality:'Kuching'}:latitude<1.52?{address:'Central',street:'Lorong Central 1',sublocality:'Central Park',locality:'Kuching'}:{address:'Remote',street:'Remote Road',locality:'Kuching'}

test('v39 to v40 is explicit, additive, idempotent and preserves legacy Analysis ID and Suggestions',()=>{
  const db=new DatabaseSync(':memory:')
  db.exec("PRAGMA foreign_keys=ON;CREATE TABLE schema_meta(version INTEGER PRIMARY KEY);INSERT INTO schema_meta VALUES(38);CREATE TABLE zone_groups(id INTEGER PRIMARY KEY);CREATE TABLE areas(id INTEGER PRIMARY KEY);CREATE TABLE branches(id INTEGER PRIMARY KEY);CREATE TABLE dispatches(id INTEGER PRIMARY KEY);CREATE TABLE dispatch_stops(id INTEGER PRIMARY KEY);INSERT INTO zone_groups VALUES(1);INSERT INTO areas VALUES(1);INSERT INTO branches VALUES(1);INSERT INTO dispatches VALUES(1);INSERT INTO dispatch_stops VALUES(1)")
  applyV39Migration(db)
  db.prepare("INSERT INTO area_refinement_analyses(id,parent_area_id,created_by) VALUES(1,1,'Legacy')").run()
  db.prepare("INSERT INTO area_refinement_suggestions(analysis_id,branch_id,current_area_id,action,confidence,reason) VALUES(1,1,1,'need_gps','needs_review','Legacy')").run()
  const first=applyV40Migration(db),second=applyV40Migration(db)
  assert.equal(first.schemaVersion,40);assert.equal(second.noOp,true);assert.deepEqual(first.before,first.after)
  assert.deepEqual({...db.prepare('SELECT id,scope_type,zone_group_id FROM area_refinement_analyses').get()},{id:1,scope_type:'area',zone_group_id:null})
  assert.equal(db.prepare('SELECT COUNT(*) n FROM area_refinement_suggestions').get().n,1);assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok')
})

test('Zone Preview crosses old Area boundaries but never the Zone and preserves formal data',async()=>{
  const db=fixture(),before={areas:db.prepare('SELECT COUNT(*) n FROM areas').get().n,assignments:db.prepare('SELECT GROUP_CONCAT(area_id) ids FROM branches ORDER BY id').get().ids,zones:db.prepare('SELECT GROUP_CONCAT(confirmed_zone_group_id) ids FROM areas ORDER BY id').get().ids}
  const preview=await analyzeZoneAreas(91,{createdBy:'Supervisor',geocoder},db)
  assert.equal(preview.scopeType,'zone');assert.equal(preview.zoneGroupId,91);assert.equal(preview.counts.total,6);assert.equal(preview.counts.officialGps,5);assert.equal(preview.counts.needGps,1);assert.ok(preview.items.every(item=>item.branchInternalId!==201))
  const central=preview.items.filter(item=>[103,104].includes(item.branchInternalId));assert.equal(new Set(central.map(item=>item.proposedAreaName)).size,1);assert.ok(central.some(item=>item.currentAreaName==='OLD EAST')&&central.some(item=>item.currentAreaName==='OLD WEST'))
  assert.deepEqual({areas:db.prepare('SELECT COUNT(*) n FROM areas').get().n,assignments:db.prepare('SELECT GROUP_CONCAT(area_id) ids FROM branches ORDER BY id').get().ids,zones:db.prepare('SELECT GROUP_CONCAT(confirmed_zone_group_id) ids FROM areas ORDER BY id').get().ids},before)
})

test('same-building protection keeps one operational Area despite different entrance roads',async()=>{
  const preview=await analyzeZoneAreas(91,{createdBy:'Supervisor',geocoder},fixture()),mall=preview.items.filter(item=>[101,102].includes(item.branchInternalId))
  assert.deepEqual(mall.map(item=>item.action),['keep','keep']);assert.deepEqual([...new Set(mall.map(item=>item.proposedAreaName))],['AEON MALL']);assert.ok(mall.every(item=>item.confidence==='high'))
})

test('Preview permits small Areas, needs review, manual split, rename, merge and branch moves',async()=>{
  const db=fixture(),preview=await analyzeZoneAreas(91,{createdBy:'Supervisor',geocoder},db),remote=preview.items.find(item=>item.branchInternalId===106),central=preview.items.filter(item=>[103,104].includes(item.branchInternalId)
  )
  assert.equal(remote.action,'needs_review')
  const updated=updateAreaRefinement(preview.id,{changedBy:'Supervisor',items:[{branchId:remote.branchInternalId,action:'move',proposedAreaName:'Remote Shop',reason:'Valid one-Branch operational Area'},{branchId:central[0].branchInternalId,action:'move',proposedAreaName:'Central North',reason:'Manual split'},{branchId:central[1].branchInternalId,action:'move',proposedAreaName:'Central Combined',reason:'Manual rename/merge'}]},db)
  assert.equal(updated.items.find(item=>item.branchInternalId===106).proposedAreaName,'Remote Shop');assert.equal(updated.items.find(item=>item.branchInternalId===103).proposedAreaName,'Central North');assert.equal(updated.items.find(item=>item.branchInternalId===104).proposedAreaName,'Central Combined')
})

test('Confirm is transactional, enforces Zone boundary and incremental analysis preserves confirmed assignments',async()=>{
  const db=fixture(),preview=await analyzeZoneAreas(91,{createdBy:'Supervisor',geocoder},db),remote=preview.items.find(item=>item.branchInternalId===106)
  updateAreaRefinement(preview.id,{changedBy:'Supervisor',items:[{branchId:remote.branchInternalId,action:'keep',proposedAreaName:'REMOTE',reason:'Keep current'}]},db)
  db.prepare('UPDATE branches SET area_id=20 WHERE id=104').run();assert.throws(()=>confirmAreaRefinement(preview.id,{changedBy:'Supervisor',reason:'Reviewed Zone Preview'},db),/outside the analyzed Zone/);assert.equal(getAreaRefinement(preview.id,db).status,'preview');assert.equal(db.prepare('SELECT area_id FROM branches WHERE id=103').get().area_id,11)
  db.prepare('UPDATE branches SET area_id=12 WHERE id=104').run();const confirmed=confirmAreaRefinement(preview.id,{changedBy:'Supervisor',reason:'Reviewed Zone Preview'},db);assert.equal(confirmed.status,'confirmed');assert.equal(db.prepare("SELECT COUNT(*) n FROM master_change_history WHERE change_type='area_refinement_confirmed'").get().n,3)
  db.prepare("INSERT INTO branches(id,jodoo_branch_id,customer_id,area_id,branch_name,latitude,longitude) VALUES(107,'10107',1,11,'NEW GPS',1.5103,110.3103)").run()
  const incremental=await analyzeZoneAreas(91,{createdBy:'Supervisor',geocoder},db);assert.deepEqual(incremental.items.map(item=>item.branchInternalId).sort((a,b)=>a-b),[105,107]);const full=await analyzeZoneAreas(91,{includeExisting:true,createdBy:'Supervisor',geocoder},db);assert.equal(full.items.length,7)
})

test('Zone API, map, manual controls, permissions and mobile UI are wired without Route Template changes',()=>{
  const server=fs.readFileSync(new URL('../server/index.mjs',import.meta.url),'utf8'),ui=fs.readFileSync(new URL('../src/ZoneGroupManager.jsx',import.meta.url),'utf8'),map=fs.readFileSync(new URL('../src/AreaRefinementMap.jsx',import.meta.url),'utf8'),css=fs.readFileSync(new URL('../src/ZoneGroupManager.css',import.meta.url),'utf8')
  assert.match(server,/area-refinement\\\/analyze[\s\S]{0,300}canManageSchedules\(session\)/);for(const token of ['areaRefinement.analyzeZone','AreaRefinementDialog','renameOrMerge','areaRefinement.splitHelp','includeExisting'])assert.match(ui,new RegExp(token));for(const token of ['currentAreaName','proposedAreaName','confidence','reason'])assert.match(map,new RegExp(token));assert.match(css,/@media\(max-width:720px\)/);assert.equal(SCHEMA_VERSION,40)
})

test('Zone refinement labels are complete in English, Malay and Chinese without Malay fallback',()=>{
  const keys=['zoneTitle','analyzeZone','analyzingZone','zonePreviewOnly','reanalyzeConfirmed','existingAreas','suggestedAreas','renameMerge','targetArea','applyRenameMerge','splitHelp','kind.keep','kind.move_existing','kind.new_area','kind.needs_review','kind.need_gps']
  for(const language of ['en','ms','zh'])for(const key of keys)assert.ok(messages[language][`areaRefinement.${key}`],`${language}:${key}`)
  assert.notEqual(messages.ms['areaRefinement.analyzeZone'],messages.en['areaRefinement.analyzeZone'])
})
