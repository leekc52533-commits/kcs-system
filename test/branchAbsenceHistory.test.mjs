import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {absenceReason,branchAbsenceHistory} from '../server/branchAbsenceHistory.mjs'
import {evidenceProblem,dateEvidenceMode} from '../shared/dateRequestEvidence.js'
import {dateRequestReasons} from '../src/dateRequestReasons.js'
import {createMobileSimulation} from '../src/mobileSimulationState.js'

function fixture(){
 const db=new DatabaseSync(':memory:')
 db.exec(`CREATE TABLE dispatch_stops(id INTEGER PRIMARY KEY,branch_id INTEGER,arrived_at TEXT,completion_outcome TEXT);
 CREATE TABLE purchase_bills(id INTEGER PRIMARY KEY,branch_id INTEGER,dispatch_stop_id INTEGER,service_date TEXT,bill_number TEXT,status TEXT);
 CREATE TABLE driver_date_requests(id INTEGER PRIMARY KEY,dispatch_stop_id INTEGER,employee_id INTEGER,source_date TEXT,target_date TEXT,reason TEXT,review_reason TEXT,reviewed_by TEXT,reviewed_at TEXT,status TEXT);
 CREATE TABLE driver_date_reviews(request_id INTEGER PRIMARY KEY,approved_date TEXT);
 CREATE TABLE employees(id INTEGER PRIMARY KEY,name TEXT);
 CREATE TABLE driver_date_evidence(request_id INTEGER PRIMARY KEY,reason_code TEXT,details_json TEXT);
 CREATE TABLE no_goods_notices(dispatch_stop_id INTEGER,restored_at TEXT);
 INSERT INTO employees VALUES(1,'TEST DRIVER');`)
 let id=0
 const add=({reason='Tak sempat',code=null,date='2026-10-02',target='2026-10-03',status='approved',branch=1,arrived=null,outcome=null,details={}}={})=>{
  const n=++id
  db.prepare('INSERT INTO dispatch_stops VALUES(?,?,?,?)').run(n,branch,arrived,outcome)
  db.prepare('INSERT INTO driver_date_requests VALUES(?,?,1,?,?,?,NULL,?, ?,?)').run(n,n,date,target,reason,'SUPERVISOR','2026-10-06 01:00:00',status)
  if(code)db.prepare('INSERT INTO driver_date_evidence VALUES(?,?,?)').run(n,code,JSON.stringify(details))
  return n
 }
 return{db,add}
}

test('only explicit time/no-contact reasons count; structured reasons override legacy text and arrival wins',()=>{
 for(const reason of ['Tak sempat','  TAK SEMPAT.  ','时间不足，来不及收货','来不及','Not enough time'])assert.equal(absenceReason({reason}),'time')
 for(const reason of ['Later','No goods','Customer asked to come later','Tak sempat, customer said no goods','Could not contact customer','No response',''])assert.equal(absenceReason({reason}),null)
 for(const code of ['customer','little','call','closed','business_closed','bill','full','bay','collected','staff','stopped','other'])assert.equal(absenceReason({reason:'Tak sempat',reasonCode:code}),null)
 for(const evidence of [{arrivedAt:'now'},{hasBill:1},{hasNoGoods:1},{outcome:'no_goods'},{outcome:'no_goods_notice'},{evidenceJson:'{"contactMethod":"onsite"}'},{evidenceJson:'{"position":{}}'},{evidenceJson:'broken'}])assert.equal(absenceReason({reasonCode:'time',...evidence}),null)
 assert.equal(absenceReason({reasonCode:'uncontacted'}),'uncontacted')
 assert.equal(dateEvidenceMode('uncontacted'),'operations');assert.equal(evidenceProblem('uncontacted',{}),null)
 assert.ok(dateRequestReasons.find(r=>r.id==='uncontacted'&&r.zh&&r.ms&&r.en))
})

test('absence history excludes approved no goods/customer postponements, rejected, pending, visited and ambiguous records',()=>{
 const{db,add}=fixture()
 const time=add(),uncontacted=add({code:'uncontacted',reason:'Not visited and customer not contacted'})
 for(const code of ['customer','little','call','staff','other'])add({code})
 add({reason:'Later'});add({status:'pending'});add({status:'rejected'});add({arrived:'now'});add({outcome:'no_goods_notice'})
 add({target:'2026-10-02'});add({branch:2})
 const noGoods=add();db.prepare('INSERT INTO no_goods_notices VALUES(?,NULL)').run(noGoods)
 const history=branchAbsenceHistory(db,1)
 assert.equal(history.count,2);assert.deepEqual(history.history.map(r=>r.id),[uncontacted,time])
 assert.equal(history.lastCollectionDate,null)
 assert.equal(history.history[0].employeeName,'TEST DRIVER');assert.equal(history.history[0].approvedBy,'SUPERVISOR')
 db.close()
})

test('successful purchase date resets only current count; late approvals, standalone bills, voids and branches are handled',()=>{
 const{db,add}=fixture()
 add({date:'2026-09-29'});add({date:'2026-10-01'});const recent=add({date:'2026-10-02'})
 db.exec("INSERT INTO purchase_bills VALUES(1,1,NULL,'2026-10-01','P261001-002','issued'),(2,2,NULL,'2026-10-06','P261006-001','issued'),(3,1,NULL,'2026-10-05','P261005-002','voided')")
 const h=branchAbsenceHistory(db,1)
 assert.equal(h.count,1);assert.equal(h.history[0].id,recent);assert.equal(h.lastCollectionDate,'2026-10-01');assert.equal(h.lastBillNumber,'P261001-002')
 db.exec("INSERT INTO purchase_bills VALUES(4,1,NULL,'2026-10-06','P261006-004','issued')")
 assert.equal(branchAbsenceHistory(db,1).count,0)
 assert.equal(db.prepare('SELECT COUNT(*) n FROM driver_date_requests').get().n,3)
 db.exec("UPDATE purchase_bills SET status='voided' WHERE id=4")
 assert.equal(branchAbsenceHistory(db,1).count,1);db.close()
})

test('corrected target date and duplicate approval records cannot count one visit twice',()=>{
 const{db,add}=fixture(),id=add()
 db.prepare('INSERT INTO driver_date_requests SELECT 99,dispatch_stop_id,employee_id,source_date,target_date,reason,review_reason,reviewed_by,reviewed_at,status FROM driver_date_requests WHERE id=?').run(id)
 assert.equal(branchAbsenceHistory(db,1).count,1)
 db.exec("INSERT INTO driver_date_reviews VALUES(1,'2026-10-02'),(99,'2026-10-02')")
 assert.equal(branchAbsenceHistory(db,1).count,0);db.close()
})

test('new no-contact reason uses existing isolated training submission and explicit mock approval',async()=>{
 const originalFetch=globalThis.fetch;let calls=0
 globalThis.fetch=()=>{calls++;throw Error('Training must not use network')}
 try{
  const m=createMobileSimulation({date:'2026-10-06'}),post=(path,body={})=>m.request(path,{method:'POST',body:JSON.stringify(body)})
  await post('/api/mobile/trips/1/tomorrow-plan/check',{expectedSignature:m.view().trips[0].driverPlan.signature});m.approve()
  await post('/api/mobile/trips/1/start')
  await post('/api/mobile/stops/1/request-date',{targetDate:'2026-10-08',reasonCode:'uncontacted',reason:'Not visited and customer not contacted',evidence:{}})
  const pending=m.view().pending[0];assert.equal(pending.reasonCode,'uncontacted');assert.equal(pending.status,'pending')
  m.review(pending.id,'approved');assert.equal(m.view().pending.length,0);assert.equal(calls,0)
 }finally{globalThis.fetch=originalFetch}
})
