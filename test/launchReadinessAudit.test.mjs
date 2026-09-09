import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,readFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {spawnSync} from 'node:child_process'
import {createHash} from 'node:crypto'
test('launch audit detects missing due customer, excludes On Call, and leaves source database unchanged',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'kcs-audit-test-')),file=path.join(dir,'db.sqlite'),env={...process.env,KCS_DB_PATH:file,KCS_DATA_DIR:dir}
 try{
 const setup=spawnSync(process.execPath,['--input-type=module','-e',`const {db}=await import('./server/database.mjs');db.exec("INSERT INTO customers(id,jodoo_customer_id,name) VALUES(9991,'AUDIT-C','Audit');INSERT INTO branches(id,jodoo_branch_id,customer_id,branch_name,lifecycle_status,status,is_active) VALUES(9991,'AUDIT1',9991,'Due customer','ACTIVE','active',1),(9992,'AUDIT2',9991,'Call customer','ACTIVE','active',1);INSERT INTO branch_schedules(jodoo_schedule_id,branch_id,source_branch_id,frequency,days_of_week) VALUES('AUDIT-S1',9991,'AUDIT1','Once a week','Thursday'),('AUDIT-S2',9992,'AUDIT2','On Call',NULL)");db.close()`],{env,encoding:'utf8'});assert.equal(setup.status,0,setup.stderr)
 const hash=()=>createHash('sha256').update(readFileSync(file)).digest('hex'),before=hash()
 const run=spawnSync(process.execPath,['scripts/audit-launch-readiness.mjs','2026-09-10'],{env,encoding:'utf8',maxBuffer:10*1024*1024});assert.equal(run.status,0,run.stderr);const report=JSON.parse(run.stdout);assert.equal(report.readOnly,true);assert.equal(report.days.length,7);assert.ok(report.days[0].missingDueCustomers.some(b=>b.name==='Due customer'));assert.ok(!report.days[0].missingDueCustomers.some(b=>b.name==='Call customer'));assert.equal(hash(),before)
 }finally{rmSync(dir,{recursive:true,force:true})}
})
