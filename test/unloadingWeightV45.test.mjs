import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import {schemaSql} from '../server/schema.mjs'
import {applyV45Migration} from '../server/migrationV45.mjs'
import {confirmUnloadingWeight,mobileWeightContext,parseWeightOcr,recognizeUnloadingWeight} from '../server/unloadingWeightService.mjs'

const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
const today='2026-09-03',context={employeeId:1,role:'driver',today}

function fixture(){
  const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON;'+schemaSql)
  db.prepare("INSERT INTO weekly_dispatch_plans(week_start,status) VALUES(?,'approved')").run(today)
  db.prepare("INSERT INTO dispatch_days(weekly_plan_id,dispatch_date,status) VALUES(1,?,'in_progress')").run(today)
  db.prepare("INSERT INTO vehicles(vehicle_code,registration_number,status,operational_status) VALUES('Lorry 2','QAA4293N','available','active')").run()
  db.prepare("INSERT INTO employees(employee_code,name,job_role,employment_status,is_active) VALUES('D1','Driver One','Driver','active',1)").run()
  db.prepare("INSERT INTO dispatches(dispatch_date,vehicle_id,driver_id,end_location_name,end_address,status) VALUES(?,1,1,'Main Factory','Factory Road','in_progress')").run(today)
  db.prepare("INSERT INTO dispatch_trips(dispatch_day_id,dispatch_id,trip_number,execution_status,started_at) VALUES(1,1,1,'in_progress',?)").run(`${today}T08:00:00+08:00`)
  return db
}

test('v45 migration is additive and creates unloading weight storage',()=>{const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON;'+schemaSql);db.exec('DROP TABLE unloading_weight_records;DELETE FROM schema_meta;INSERT INTO schema_meta(version) VALUES(44)');const first=applyV45Migration(db),second=applyV45Migration(db);assert.equal(first.schemaVersion,45);assert.equal(second.noOp,true);assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='unloading_weight_records'").get());assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok')})

test('OCR parser prefers net and can calculate gross minus tare',()=>{assert.equal(parseWeightOcr('GROSS 12,340 KG\nTARE 4,100 KG\nNET 8,240 KG').recognizedWeightKg,8240);const calculated=parseWeightOcr('GROSS WEIGHT 9000 kg\nTARE WEIGHT 2500 kg');assert.equal(calculated.recognizedWeightKg,6500);assert.equal(calculated.grossWeightKg,9000);assert.equal(calculated.tareWeightKg,2500)})

test('driver takes one photo, may correct OCR, and confirms an immutable record',async()=>{const db=fixture(),root=fs.mkdtempSync(path.join(os.tmpdir(),'kcs-weight-'));try{const initial=mobileWeightContext(context,db);assert.equal(initial.available,true);assert.equal(initial.trip.registrationNumber,'QAA4293N');const recognized=await recognizeUnloadingWeight({tripId:1,photo:{name:'ticket.png',dataUrl:png},latitude:1.55,longitude:110.35,accuracyM:12},context,db,{uploadsRoot:root});assert.equal(recognized.id,1);const confirmed=confirmUnloadingWeight(1,{weightKg:8240},context,db);assert.equal(confirmed.confirmedWeightKg,8240);assert.equal(confirmUnloadingWeight(1,{weightKg:9999},context,db).idempotent,true);const row=db.prepare('SELECT confirmed_weight_kg,status,latitude,photo_storage_key FROM unloading_weight_records WHERE id=1').get();assert.equal(row.confirmed_weight_kg,8240);assert.equal(row.status,'confirmed');assert.equal(row.latitude,1.55);assert.ok(fs.existsSync(path.join(root,row.photo_storage_key)))}finally{fs.rmSync(root,{recursive:true,force:true});db.close()}})

test('mobile UI has one Weight tab, one camera action, confirmation, and clear equal spacing',()=>{const source=fs.readFileSync(new URL('../src/AuthPages.jsx',import.meta.url),'utf8'),css=fs.readFileSync(new URL('../src/App.css',import.meta.url),'utf8');assert.match(source,/\['weight','mobile\.weight'\]/);assert.match(source,/function WeightView/);assert.match(source,/capture="environment"/);assert.match(source,/weightConfirm/);assert.match(css,/grid-auto-columns:1fr/);assert.match(css,/border-left:1px solid/)})
