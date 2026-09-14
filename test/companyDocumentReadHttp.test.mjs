import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {spawn} from 'node:child_process'
import {DatabaseSync} from 'node:sqlite'
import {createHash} from 'node:crypto'
import net from 'node:net'

test('company document archives admit office and all management roles but reject drivers and crew',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'kcs-preview-http-')),probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
 // Stub LAN-address logging only: restricted test runners may not enumerate interfaces.
 const child=spawn(process.execPath,['--input-type=module','-e',"import os from 'node:os';os.networkInterfaces=()=>({});await import('./server/index.mjs')"],{cwd:new URL('..',import.meta.url),env:{...process.env,KCS_DATA_DIR:dir,KCS_DB_PATH:join(dir,'test.db'),KCS_API_PORT:String(port),KCS_API_HOST:'127.0.0.1'},stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);let db;
 try{
  let ready=false;for(let i=0;i<80;i++){try{if((await fetch(`http://127.0.0.1:${port}/api/health`)).ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,50))}assert(ready,output);
  db=new DatabaseSync(join(dir,'test.db'));
  for(const [id,role,job]of [[80001,'supervisor','Supervisor'],[80002,'driver','Driver'],[80003,'crew','Crew'],[80004,'office','Office'],[80005,'operations_admin','Admin'],[80006,'owner_admin','Admin']]){
   db.prepare("INSERT INTO employees(id,employee_code,name,job_role,employment_status,is_active) VALUES(?,?,?,?, 'active',1)").run(id,'P'+id,'Preview Test '+id,job);
   db.prepare('INSERT INTO auth_accounts(id,employee_id,username,password_hash,role,system_role,must_change_password,preferred_language) VALUES(?,?,?,?,?,?,0,?)').run(id,id,'preview'+id,'unused',role.endsWith('_admin')?'admin':role,role,'ms');
   db.prepare("INSERT INTO auth_sessions(account_id,token_hash,expires_at,last_seen_at) VALUES(?,?,datetime('now','+1 day'),'2026-01-01')").run(id,createHash('sha256').update('preview-token-'+id).digest('hex'));
  }
  const call=(path,id=80001,method='GET')=>fetch(`http://127.0.0.1:${port}${path}`,{method,headers:{Cookie:'kcs_session=preview-token-'+id,'Content-Type':'application/json'},...(method==='GET'?{}:{body:'{}'})});
  for(const id of [80001,80004,80005,80006]){
   for(const path of ['/api/purchase-bills','/api/expenses','/api/bill-voids','/api/sales?from=2026-01-01&to=2026-12-31']){
    const response=await call(path,id);assert.equal(response.status,200,path+' role '+id+' '+await response.text());
   }
  }
  for(const id of [80002,80003]){
   for(const path of ['/api/purchase-bills','/api/expenses','/api/sales?from=2026-01-01&to=2026-12-31'])assert.equal((await call(path,id)).status,403,path);
  }
 }finally{db?.close();child.kill();await new Promise(r=>child.exitCode!==null?r():child.once('exit',r));rmSync(dir,{recursive:true,force:true})}
})
