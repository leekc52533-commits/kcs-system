import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {DatabaseSync} from 'node:sqlite'
import {schemaSql,SCHEMA_VERSION} from '../server/schema.mjs'
import {applyV39Migration} from '../server/migrationV39.mjs'
import {applyV40Migration} from '../server/migrationV40.mjs'
import {analyzeZoneAreas,confirmAreaRefinement,extractBatuSegments,getAreaRefinement,isMajorRoadCorridor,normalizeBatuContext,updateAreaRefinement} from '../server/areaRefinementService.mjs'
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
  assert.equal(remote.action,'keep');assert.equal(remote.proposedAreaName,'REMOTE')
  const updated=updateAreaRefinement(preview.id,{changedBy:'Supervisor',items:[{branchId:remote.branchInternalId,action:'move',proposedAreaName:'Remote Shop',reason:'Valid one-Branch operational Area'},{branchId:central[0].branchInternalId,action:'move',proposedAreaName:'Central North',reason:'Manual split'},{branchId:central[1].branchInternalId,action:'move',proposedAreaName:'Central Combined',reason:'Manual rename/merge'}]},db)
  assert.equal(updated.items.find(item=>item.branchInternalId===106).proposedAreaName,'Remote Shop');assert.equal(updated.items.find(item=>item.branchInternalId===103).proposedAreaName,'Central North');assert.equal(updated.items.find(item=>item.branchInternalId===104).proposedAreaName,'Central Combined')
})

test('Confirm is transactional, enforces Zone boundary and incremental analysis preserves confirmed assignments',async()=>{
  const db=fixture(),preview=await analyzeZoneAreas(91,{createdBy:'Supervisor',geocoder},db),remote=preview.items.find(item=>item.branchInternalId===106)
  const central=preview.items.filter(item=>[103,104].includes(item.branchInternalId));updateAreaRefinement(preview.id,{changedBy:'Supervisor',items:[{branchId:remote.branchInternalId,action:'keep',proposedAreaName:'REMOTE',reason:'Keep current'},...central.map(item=>({branchId:item.branchInternalId,action:'move',proposedAreaName:'Central Park',reason:'Supervisor confirmed same commercial centre'}))]},db)
  db.prepare('UPDATE branches SET area_id=20 WHERE id=104').run();assert.throws(()=>confirmAreaRefinement(preview.id,{changedBy:'Supervisor',reason:'Reviewed Zone Preview'},db),/outside the analyzed Zone/);assert.equal(getAreaRefinement(preview.id,db).status,'preview');assert.equal(db.prepare('SELECT area_id FROM branches WHERE id=103').get().area_id,11)
  db.prepare('UPDATE branches SET area_id=12 WHERE id=104').run();const confirmed=confirmAreaRefinement(preview.id,{changedBy:'Supervisor',reason:'Reviewed Zone Preview'},db);assert.equal(confirmed.status,'confirmed');assert.equal(db.prepare("SELECT COUNT(*) n FROM master_change_history WHERE change_type='area_refinement_confirmed'").get().n,3)
  db.prepare("INSERT INTO branches(id,jodoo_branch_id,customer_id,area_id,branch_name,latitude,longitude) VALUES(107,'10107',1,11,'NEW GPS',1.5103,110.3103)").run()
  const incremental=await analyzeZoneAreas(91,{createdBy:'Supervisor',geocoder},db);assert.deepEqual(incremental.items.map(item=>item.branchInternalId).sort((a,b)=>a-b),[105,107]);const full=await analyzeZoneAreas(91,{includeExisting:true,createdBy:'Supervisor',geocoder},db);assert.equal(full.items.length,7)
})

test('BATU context is normalized but never replaces a more specific operational location',()=>{
  assert.equal(normalizeBatuContext('ALPRO bt3'),'ALPRO BATU 3');assert.equal(normalizeBatuContext('CCK BT 3'),'CCK BATU 3');assert.equal(normalizeBatuContext('SHELL batu4'),'SHELL BATU 4');assert.equal(normalizeBatuContext('5th Mile, Jalan Penrissen'),'BATU 5, Jalan Penrissen');assert.equal(normalizeBatuContext('Mile 17'),'BATU 17');assert.deepEqual(extractBatuSegments('BT02','38th Mile','Mile 10'),['BATU 2','BATU 38','BATU 10']);assert.equal(isMajorRoadCorridor('Jalan Penrissen'),true)
})

test('BATU segment outranks a micro road or major corridor but not a specific operational locality',async()=>{
  const db=fixture();db.exec("INSERT INTO areas(id,jodoo_area_id,name,zone_group_id,confirmed_zone_group_id,zone_assignment_status) VALUES(14,'A14','BATU 5',91,91,'confirmed'),(15,'A15','BATU 3',91,91,'confirmed'); INSERT INTO branches(id,jodoo_branch_id,customer_id,area_id,branch_name,address,latitude,longitude) VALUES(107,'10277',1,14,'SK FOOD COURT','5th Mile, Jalan Penrissen, Kuching',1.49134,110.33008),(108,'10278',1,14,'SK HARDWARE','5th Mile, Jalan Penrissen, Kuching',1.49135,110.33009),(109,'10901',1,15,'SHOP BT3','BT3 Jalan Penrissen',1.5201,110.3351),(110,'11001',1,14,'SHOP BT5','BT5 Jalan Penrissen',1.4901,110.3301),(111,'11101',1,15,'ALPRO BT3','BT3 Jalan Penrissen',1.5211,110.3391)")
  const lookup=async latitude=>latitude===1.5211?{sublocality:'Central Park Commercial Centre',road:'Jalan Penrissen',locality:'Kuching'}:{sublocality:latitude<1.50?'Lorong STC 2':'',road:'Jalan Penrissen',locality:'Kuching'},preview=await analyzeZoneAreas(91,{createdBy:'Supervisor',geocoder:lookup},db),byId=id=>preview.items.find(item=>item.branchId===id)
  for(const id of ['10277','10278','11001']){assert.equal(byId(id).proposedAreaName,'BATU 5');assert.equal(byId(id).confidence,'medium')}
  assert.equal(byId('10901').proposedAreaName,'BATU 3');assert.equal(byId('11101').proposedAreaName,'Central Park Commercial Centre');assert.notEqual(byId('10901').proposedAreaName,byId('11001').proposedAreaName);assert.ok(preview.items.every(item=>item.proposedAreaName!=='Jalan Penrissen'&&item.proposedAreaName!=='Lorong STC 2'))
})

test('conflicting reliable BATU evidence remains Needs Review and cannot be hidden by a shared road',async()=>{
  const db=fixture();db.exec("INSERT INTO areas(id,jodoo_area_id,name,zone_group_id,confirmed_zone_group_id,zone_assignment_status) VALUES(14,'A14','BATU 3',91,91,'confirmed'); INSERT INTO branches(id,jodoo_branch_id,customer_id,area_id,branch_name,address,latitude,longitude) VALUES(107,'10701',1,14,'SHOP BT3','5th Mile, Jalan Penrissen',1.49,110.33)");const preview=await analyzeZoneAreas(91,{createdBy:'Supervisor',geocoder:async()=>({road:'Jalan Penrissen',locality:'Kuching'})},db),item=preview.items.find(row=>row.branchId==='10701');assert.equal(item.action,'needs_review');assert.match(item.reason,/Conflicting BATU/)
})

test('operational locality outranks company and BATU shorthand; single-Branch Areas are allowed',async()=>{
  const db=fixture();db.exec("INSERT INTO areas(id,jodoo_area_id,name,zone_group_id,confirmed_zone_group_id,zone_assignment_status) VALUES(14,'A14','BATU 3',91,91,'confirmed'),(15,'A15','BATU 4',91,91,'confirmed'); INSERT INTO branches(id,jodoo_branch_id,customer_id,area_id,branch_name,address,latitude,longitude) VALUES(108,'10462',1,14,'ALPRO BT3','Rock Road',1.521,110.339),(109,'10032',1,14,'CCK LOCAL BT3','Jalan Batu Kawa',1.520,110.334),(110,'10168',1,14,'HNL BT3','Jalan Rock',1.5204,110.335),(111,'10459',1,15,'SHELL BT4','Mile 4',1.506,110.335)")
  const locations=new Map([[1.521,'Central Park Commercial Centre'],[1.520,'Everbright Park'],[1.5204,'Iris Garden'],[1.506,'']]),lookup=async latitude=>({sublocality:locations.get(latitude),road:latitude===1.506?'Jalan Tun Hussien Onn 4':'Rock Road',locality:'Kuching'}),preview=await analyzeZoneAreas(91,{createdBy:'Supervisor',geocoder:lookup},db),byId=id=>preview.items.find(item=>item.branchId===id)
  assert.equal(byId('10462').proposedAreaName,'Central Park Commercial Centre');assert.equal(byId('10032').proposedAreaName,'Everbright Park');assert.equal(byId('10168').proposedAreaName,'Iris Garden');assert.equal(byId('10459').proposedAreaName,'Jalan Tun Hussien Onn 4');for(const id of ['10462','10032','10168','10459'])assert.equal(byId(id).action,'move');assert.ok(preview.items.every(item=>!/^ALPRO|^CCK LOCAL|^HNL|^SHELL/i.test(item.proposedAreaName||'')))
})

test('a more-specific named locality outranks a broader Existing Area even when the road repeats it',async()=>{
  const db=fixture();db.exec("INSERT INTO areas(id,jodoo_area_id,name,zone_group_id,confirmed_zone_group_id,zone_assignment_status) VALUES(14,'A14','DEMAK LAUT',91,91,'confirmed'),(15,'A15','JALAN RESAK',91,91,'confirmed'); INSERT INTO branches(id,jodoo_branch_id,customer_id,area_id,branch_name,address,latitude,longitude) VALUES(107,'10050',1,14,'DCH TECHNOLOGY','Demak',1.598,110.399),(108,'10267',1,15,'SEN SEN STOR','Resak',1.542,110.372)");const lookup=async latitude=>latitude===1.598?{sublocality:'Demak Laut Industrial Park',road:'Jalan Demak Laut 3',locality:'Kuching'}:{sublocality:'Taman Kali',road:'Lorong Resak 2a',locality:'Kuching'},preview=await analyzeZoneAreas(91,{createdBy:'Supervisor',geocoder:lookup},db);assert.equal(preview.items.find(item=>item.branchId==='10050').proposedAreaName,'Demak Laut Industrial Park');assert.equal(preview.items.find(item=>item.branchId==='10267').proposedAreaName,'Taman Kali')
})

test('same old Area may split PODIUM, AEON and a specific locality without trusting the old label',async()=>{
  const db=fixture();db.prepare("INSERT INTO branches(id,jodoo_branch_id,customer_id,area_id,branch_name,address,latitude,longitude) VALUES(107,'10353',1,10,'EMC BATU 2','Batu 2',1.535,110.337)").run();const lookup=async latitude=>latitude===1.535?{sublocality:'Hock Kui Commercial Centre',road:'Jalan Tun Ahmad Zaidi Adruce',locality:'Kuching'}:geocoder(latitude),preview=await analyzeZoneAreas(91,{createdBy:'Supervisor',geocoder:lookup},db)
  assert.equal(preview.items.find(item=>item.branchId==='10353').proposedAreaName,'Hock Kui Commercial Centre');assert.ok(preview.items.filter(item=>['10101','10102'].includes(item.branchId)).every(item=>item.proposedAreaName==='AEON MALL'))
  db.prepare("UPDATE branches SET branch_name='PODIUM' WHERE id=101").run();db.prepare("UPDATE branches SET branch_name='MIX STORE PODIUM' WHERE id=102").run();const split=await analyzeZoneAreas(91,{createdBy:'Supervisor',geocoder:lookup},db);assert.ok(split.items.filter(item=>['10101','10102'].includes(item.branchId)).every(item=>item.proposedAreaName==='PODIUM'))
})

test('different meaningful Existing Areas never merge from GPS distance or shared locality alone',async()=>{
  const db=fixture(),preview=await analyzeZoneAreas(91,{createdBy:'Supervisor',geocoder},db),central=preview.items.filter(item=>[103,104].includes(item.branchInternalId));assert.ok(central.every(item=>item.action==='needs_review'));assert.ok(central.every(item=>/cannot merge/.test(item.reason)))
})

test('same-complex GPS validates an explicit building seed without trusting the old Area alone',async()=>{
  const db=fixture();db.exec("INSERT INTO areas(id,jodoo_area_id,name,zone_group_id,confirmed_zone_group_id,zone_assignment_status) VALUES(14,'A14','BOULEVARD',91,91,'confirmed'); INSERT INTO branches(id,jodoo_branch_id,customer_id,area_id,branch_name,address,latitude,longitude) VALUES(107,'10701',1,14,'DIY BOULEVARD','Complex',1.5300,110.3300),(108,'10702',1,14,'ECO BOULEVARD','Complex',1.5301,110.3301),(109,'10703',1,14,'NATURAL HEALTH FARM','Complex',1.53005,110.33005)");const lookup=async()=>({sublocality:'Taman Nearby',road:'Jalan Main',locality:'Kuching'}),preview=await analyzeZoneAreas(91,{createdBy:'Supervisor',geocoder:lookup},db),complex=preview.items.filter(item=>['10701','10702','10703'].includes(item.branchId));assert.ok(complex.every(item=>item.proposedAreaName==='BOULEVARD'));assert.ok(complex.every(item=>item.action==='keep'));assert.ok(complex.every(item=>item.confidence==='high'))
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
