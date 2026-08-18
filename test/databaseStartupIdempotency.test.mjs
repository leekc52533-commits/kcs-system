import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {spawnSync} from 'node:child_process'
import {DatabaseSync} from 'node:sqlite'

const root=path.resolve(import.meta.dirname,'..')
const start=dbPath=>spawnSync(process.execPath,['--input-type=module','-e',"const m=await import('./server/database.mjs');m.db.close()"],{cwd:root,env:{...process.env,KCS_DB_PATH:dbPath,KCS_DATA_DIR:path.dirname(dbPath)},encoding:'utf8'})
const rows=dbPath=>{const db=new DatabaseSync(dbPath),items=db.prepare('SELECT * FROM vehicles ORDER BY id').all();db.close();return items}

test('official vehicle startup normalization is idempotent and repairs only changed business data',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kcs-vehicle-startup-')),dbPath=path.join(dir,'startup.sqlite')
  try{
    let result=start(dbPath);assert.equal(result.status,0,result.stderr)
    const first=rows(dbPath);assert.equal(first.length,7);assert.equal(first.find(row=>row.registration_number==='QTW2704').operational_status,'sold')
    result=start(dbPath);assert.equal(result.status,0,result.stderr);assert.deepEqual(rows(dbPath),first)
    const db=new DatabaseSync(dbPath),repairId=first.find(row=>row.vehicle_code==='Lorry 4').id
    db.prepare("UPDATE vehicles SET status='inactive',temporary_date='2026-01-01',updated_at='2000-01-01 00:00:00' WHERE id=?").run(repairId);db.close()
    const beforeRepair=rows(dbPath);result=start(dbPath);assert.equal(result.status,0,result.stderr)
    const repaired=rows(dbPath),changed=repaired.filter((row,index)=>JSON.stringify(row)!==JSON.stringify(beforeRepair[index]))
    assert.equal(changed.length,1);assert.equal(changed[0].id,repairId);assert.equal(changed[0].status,'available');assert.equal(changed[0].temporary_date,null);assert.notEqual(changed[0].updated_at,'2000-01-01 00:00:00')
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
})

test('official vehicle startup still merges a legacy plate duplicate and retains the sold record',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kcs-vehicle-merge-')),dbPath=path.join(dir,'startup.sqlite')
  try{
    assert.equal(start(dbPath).status,0);const db=new DatabaseSync(dbPath),target=db.prepare("SELECT id FROM vehicles WHERE vehicle_code='Lorry 1'").get()
    const duplicate=Number(db.prepare("INSERT INTO vehicles(vehicle_code,registration_number,vehicle_name,capacity_kg) VALUES('Legacy QAV','QAV-3468','Legacy Name',1234)").run().lastInsertRowid);db.prepare("UPDATE vehicles SET registration_number='WRONG' WHERE id=?").run(target.id);db.close()
    const result=start(dbPath);assert.equal(result.status,0,result.stderr);const after=new DatabaseSync(dbPath)
    assert.equal(after.prepare('SELECT COUNT(*) n FROM vehicles WHERE id=?').get(duplicate).n,0)
    assert.deepEqual({...after.prepare('SELECT registration_number,vehicle_name,capacity_kg FROM vehicles WHERE id=?').get(target.id)},{registration_number:'QAV3468',vehicle_name:'Legacy Name',capacity_kg:1234})
    assert.equal(after.prepare("SELECT operational_status FROM vehicles WHERE registration_number='QTW2704'").get().operational_status,'sold');after.close()
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
})
