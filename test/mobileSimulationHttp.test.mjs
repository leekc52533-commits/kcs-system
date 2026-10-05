import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {spawn} from 'node:child_process'
import {DatabaseSync} from 'node:sqlite'
import {createHash} from 'node:crypto'
import net from 'node:net'

test('simulation bootstrap is manager-only and read-only; attempts create no business records',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'kcs-preview-http-')),probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
 // Stub LAN-address logging only: restricted test runners may not enumerate interfaces.
 const child=spawn(process.execPath,['--input-type=module','-e',"import os from 'node:os';os.networkInterfaces=()=>({});await import('./server/index.mjs')"],{cwd:new URL('..',import.meta.url),env:{...process.env,KCS_DATA_DIR:dir,KCS_DB_PATH:join(dir,'test.db'),KCS_API_PORT:String(port),KCS_API_HOST:'127.0.0.1'},stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);let db;
 try{
  let ready=false;for(let i=0;i<80;i++){try{if((await fetch(`http://127.0.0.1:${port}/api/health`)).ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,50))}assert(ready,output);
  db=new DatabaseSync(join(dir,'test.db'));
  for(const [id,role,job]of [[80001,'supervisor','Supervisor'],[80002,'driver','Driver'],[80003,'driver','Driver']]){
   db.prepare("INSERT INTO employees(id,employee_code,name,job_role,employment_status,is_active) VALUES(?,?,?,?, 'active',1)").run(id,'P'+id,'Preview Test '+id,job);
   db.prepare('INSERT INTO auth_accounts(id,employee_id,username,password_hash,role,system_role,must_change_password,preferred_language) VALUES(?,?,?,?,?,?,0,?)').run(id,id,'preview'+id,'unused',role,role,'ms');
   db.prepare("INSERT INTO auth_sessions(account_id,token_hash,expires_at,last_seen_at) VALUES(?,?,datetime('now','+1 day'),'2026-01-01')").run(id,createHash('sha256').update('preview-token-'+id).digest('hex'));
  }
  const call=(path,id=80001,method='GET')=>fetch(`http://127.0.0.1:${port}${path}`,{method,headers:{Cookie:'kcs_session=preview-token-'+id,'Content-Type':'application/json'},...(method==='GET'?{}:{body:'{}'})});
  const tables=['dispatch_stops','dispatch_trips','purchase_bills','dispatch_change_logs','employee_guide_reads']
  const snapshot=()=>Object.fromEntries(tables.map(table=>[table,db.prepare('SELECT * FROM '+table).all()]))
  const before=snapshot(),endpoint='/api/acting-collector/simulation-access'
  const result=await call(endpoint);assert.equal(result.status,200);const data=await result.json();assert.equal(data.allowed,true);assert.match(data.date,/^\d{4}-\d{2}-\d{2}$/)
  assert.equal((await call(endpoint,80002)).status,403)
  for(const method of ['POST','PUT','PATCH','DELETE'])assert.equal((await call(endpoint,80001,method)).status,403)
  assert.deepEqual(snapshot(),before)
  db.exec('UPDATE employees SET is_active=0 WHERE id=80001');assert.equal((await call(endpoint)).status,403)
 }finally{db?.close();child.kill();await new Promise(r=>child.exitCode!==null?r():child.once('exit',r));rmSync(dir,{recursive:true,force:true})}
})
