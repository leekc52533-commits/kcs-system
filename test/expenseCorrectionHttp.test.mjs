import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,rmSync,mkdirSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {spawn} from 'node:child_process'
import {DatabaseSync} from 'node:sqlite'
import {createHash} from 'node:crypto'
import net from 'node:net'

test('expense corrections require office submission and supervisor approval, remain atomic and audited',async()=>{
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
  const call=(path,id=80001,method='GET',payload={})=>fetch(`http://127.0.0.1:${port}${path}`,{method,headers:{Cookie:'kcs_session=preview-token-'+id,'Content-Type':'application/json'},...(method==='GET'?{}:{body:JSON.stringify(payload)})});
  db.prepare('INSERT INTO company_menu(id,owner_account_id) VALUES(1,80006) ON CONFLICT(id) DO UPDATE SET owner_account_id=80006').run();
  assert.equal(db.prepare('SELECT MAX(version) v FROM schema_meta').get().v,69);
  db.exec("INSERT INTO cash_float_accounts(employee_id,target_float_cents,low_balance_threshold_cents) VALUES(80002,200000,10000); INSERT INTO cash_float_members(employee_id,is_selected) VALUES(80002,1)");
  const insert=db.prepare("INSERT INTO cash_float_transactions(employee_id,transaction_type,amount_cents,service_date,description,created_by_name_snapshot,created_at,proof_storage_key) VALUES(80002,?,?,'2026-09-12','Fuel','Test','2026-09-12T10:00:00+08:00',?)");
  insert.run('opening_balance',200000,null);
  const expense=Number(insert.run('expense',-150000,'original.png').lastInsertRowid);
  const other=Number(insert.run('expense',-15000,'other.png').lastInsertRowid);
  db.prepare("INSERT INTO document_numbers(source_key,document_number,prefix,number_date,sequence,created_at) VALUES(?,?,'E','2026-09-14',1,'2026-09-14T00:00:00Z')").run('employee-'+expense,'E260914-001');
  const newLookup=await (await call('/api/expense-corrections?q=E260914-001',80004)).json();assert.equal(newLookup.items[0].recordKey,'employee-'+expense);assert.equal(newLookup.items[0].documentNumber,'E260914-001');
  const endpoint='/api/expenses/employee-'+expense+'/corrections';
  const payload={amount:'150.00',reason:'Extra zero entered',expectedAmountCents:150000,revision:0};
  for(const id of [80002,80003])assert.equal((await call(endpoint,id,'POST',payload)).status,403);
  assert.equal((await (await call('/api/expenses',80004)).json()).canCorrect,true);
  assert.equal((await (await call('/api/expenses',80006)).json()).canCorrect,true);
  for(const amount of ['0','-1','150.001','NaN','1000001'])assert.equal((await call(endpoint,80006,'POST',{...payload,amount})).status,400);
  assert.equal((await call(endpoint,80006,'POST',{...payload,reason:' '})).status,400);
  const response=await call(endpoint,80004,'POST',payload);assert.equal(response.status,200,await response.clone().text());
  const result=await response.json();assert.equal(result.amountCents,150000);assert.equal(result.status,'pending');
  assert.equal(db.prepare('SELECT amount_cents v FROM cash_float_transactions WHERE id=?').get(expense).v,-150000);
  const approve='/api/expense-corrections/'+result.requestId+'/approve';
  assert.equal((await call(approve,80004,'POST',{reason:'Checked'})).status,403);
  assert.equal((await call(approve,80001,'POST',{})).status,400);
  assert.equal((await call(endpoint,80005,'POST',payload)).status,409);
  db.exec("CREATE TRIGGER test_audit_failure BEFORE INSERT ON expense_amount_corrections BEGIN SELECT RAISE(ABORT,'Test failure'); END");
  assert.equal((await call(approve,80001,'POST',{reason:'Checked'})).status,500);
  assert.equal(db.prepare('SELECT amount_cents v FROM cash_float_transactions WHERE id=?').get(expense).v,-150000);
  assert.equal(db.prepare('SELECT status FROM expense_correction_requests WHERE id=?').get(result.requestId).status,'pending');
  db.exec('DROP TRIGGER test_audit_failure');
  assert.equal((await call(approve,80001,'POST',{reason:'Receipt checked'})).status,200);
  assert.equal((await call(approve,80006,'POST',{reason:'Again'})).status,409);
  const lookup=await (await call('/api/expense-corrections?q=EXP-E-'+String(expense).padStart(6,'0'),80004)).json();assert.equal(lookup.items[0].recordKey,'employee-'+expense);assert.equal(lookup.canApprove,false);assert.equal(lookup.requests[0].reviewer_name,'Preview Test 80001');
  assert.equal((await call(endpoint,80006,'POST',payload)).status,409);
  assert.equal(db.prepare('SELECT SUM(amount_cents) v FROM cash_float_transactions WHERE employee_id=80002').get().v,170000);
  assert.equal(db.prepare('SELECT amount_cents v FROM cash_float_transactions WHERE id=?').get(other).v,-15000);
  const row=db.prepare('SELECT * FROM cash_float_transactions WHERE id=?').get(expense);assert.equal(row.proof_storage_key,'original.png');assert.equal(row.service_date,'2026-09-12');
  assert.throws(()=>db.exec('DELETE FROM expense_amount_corrections'));
  const admin=Number(db.prepare("INSERT INTO admin_expense_records(service_date,category,description,amount_cents,payment_method,created_by_name_snapshot,created_at) VALUES('2026-09-12','Fuel','Fuel',150000,'Cash','Test','2026-09-12')").run().lastInsertRowid);
  const adminRequest=await (await call('/api/expenses/admin-'+admin+'/corrections',80005,'POST',payload)).json();
  assert.equal((await call('/api/expense-corrections/'+adminRequest.requestId+'/reject',80006,'POST',{reason:'Wrong invoice'})).status,200);
  assert.equal(db.prepare('SELECT amount_cents v FROM admin_expense_records WHERE id=?').get(admin).v,150000);
  const retry=await (await call('/api/expenses/admin-'+admin+'/corrections',80004,'POST',payload)).json();
  assert.equal((await call('/api/expense-corrections/'+retry.requestId+'/approve',80005,'POST',{reason:'Verified'})).status,200);
  assert.equal(db.prepare('SELECT SUM(amount_cents) v FROM cash_float_transactions WHERE employee_id=80002').get().v,170000);
  assert.equal(db.prepare('SELECT amount_cents v FROM admin_expense_records WHERE id=?').get(admin).v,15000);
  const rows=await (await call('/api/expenses?from=2026-09-12&to=2026-09-12',80006)).json();assert.equal(rows.items.find(r=>r.recordKey==='employee-'+expense).amountCents,15000);assert.equal(rows.items.find(r=>r.recordKey==='employee-'+expense).correctionCount,1);assert.equal(rows.items.find(r=>r.recordKey==='employee-'+expense).documentNumber,'E260914-001');assert.equal(rows.items.find(r=>r.recordKey==='employee-'+other).correctionCount,0);
 }finally{db?.close();child.kill();await new Promise(r=>child.exitCode!==null?r():child.once('exit',r));rmSync(dir,{recursive:true,force:true})}
})
