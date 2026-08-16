import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {DatabaseSync} from 'node:sqlite'

const root=path.resolve(import.meta.dirname,'..')
const makeFixture=(version=41)=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kcs-v41-deploy-')),dbPath=path.join(dir,'fixture.sqlite'),snapshot=path.join(dir,'snapshots','before.json')
  const db=new DatabaseSync(dbPath)
  db.exec(`
    CREATE TABLE schema_meta(version INTEGER PRIMARY KEY); INSERT INTO schema_meta VALUES(${version});
    CREATE TABLE customers(id INTEGER PRIMARY KEY); INSERT INTO customers VALUES(1),(2);
    CREATE TABLE branches(id INTEGER PRIMARY KEY,latitude REAL,longitude REAL); INSERT INTO branches VALUES(1,1,110),(2,NULL,NULL);
    CREATE TABLE employees(id INTEGER PRIMARY KEY,employee_code TEXT,name TEXT,employment_status TEXT,is_active INTEGER);
    INSERT INTO employees VALUES(1,'EMP-0001','Owner','active',1),(3,'EMP-0003','SUNDARAMUTI BIN MOHAMMAD','active',1);
    CREATE TABLE auth_accounts(id INTEGER PRIMARY KEY,employee_id INTEGER,username TEXT,role TEXT,is_active INTEGER,password_hash TEXT);
    INSERT INTO auth_accounts VALUES(1,1,'kcadmin','admin',1,'hash-one'),(2,3,'employee3','driver',1,'hash-two');
    CREATE TABLE vehicles(id INTEGER PRIMARY KEY); INSERT INTO vehicles VALUES(1);
    CREATE TABLE zone_groups(id INTEGER PRIMARY KEY); INSERT INTO zone_groups VALUES(1);
  `)
  db.close()
  return {dir,dbPath,snapshot}
}
const run=({dbPath,snapshot,mode='before',env=true})=>spawnSync(process.execPath,['scripts/cloud-preflight.mjs','--mode',mode,'--snapshot',snapshot],{cwd:root,env:{...process.env,...(env?{KCS_DB_PATH:dbPath}:{KCS_DB_PATH:''})},encoding:'utf8'})
const mutate=(dbPath,sql)=>{const db=new DatabaseSync(dbPath);db.exec(sql);db.close()}

test('v41 code-only before/after preserves schema, counts and sentinels without writing the database',()=>{
  const fixture=makeFixture(),beforeBytes=fs.readFileSync(fixture.dbPath)
  assert.equal(run(fixture).status,0)
  assert.deepEqual(fs.readFileSync(fixture.dbPath),beforeBytes)
  assert.equal(run({...fixture,mode:'after'}).status,0)
  assert.deepEqual(fs.readFileSync(fixture.dbPath),beforeBytes)
  const snapshot=JSON.parse(fs.readFileSync(fixture.snapshot))
  assert.equal(snapshot.schemaVersion,41)
  assert.equal(snapshot.integrity,'ok')
  assert.equal(snapshot.accountSentinels[0].passwordHash,undefined)
  assert.match(snapshot.accountSentinels[0].passwordFingerprint,/^[a-f0-9]{64}$/)
})

test('preflight rejects schema mismatch, missing KCS_DB_PATH and missing snapshot',()=>{
  const wrong=makeFixture(40),wrongBytes=fs.readFileSync(wrong.dbPath)
  assert.match(run(wrong).stderr,/requires v41, found v40/)
  assert.deepEqual(fs.readFileSync(wrong.dbPath),wrongBytes)
  const fixture=makeFixture()
  const fixtureBytes=fs.readFileSync(fixture.dbPath)
  assert.match(run({...fixture,env:false}).stderr,/KCS_DB_PATH is required/)
  assert.match(run({...fixture,mode:'after'}).stderr,/Before snapshot not found/)
  assert.deepEqual(fs.readFileSync(fixture.dbPath),fixtureBytes)
})

test('postflight rejects a critical count decrease',()=>{
  const fixture=makeFixture();assert.equal(run(fixture).status,0)
  mutate(fixture.dbPath,'DELETE FROM customers WHERE id=2')
  const before=fs.readFileSync(fixture.dbPath)
  assert.match(run({...fixture,mode:'after'}).stderr,/customers count decreased/)
  assert.deepEqual(fs.readFileSync(fixture.dbPath),before)
})

for(const [name,sql,pattern] of [
  ['employee identity',"UPDATE employees SET name='Changed' WHERE id=3",/employee 3 identity\/status changed/],
  ['account identity',"UPDATE auth_accounts SET username='changed' WHERE id=2",/account 2 identity\/status\/password fingerprint changed/],
  ['password fingerprint',"UPDATE auth_accounts SET password_hash='replacement' WHERE id=2",/account 2 identity\/status\/password fingerprint changed/]
])test(`postflight rejects changed ${name}`,()=>{const fixture=makeFixture();assert.equal(run(fixture).status,0);mutate(fixture.dbPath,sql);const before=fs.readFileSync(fixture.dbPath);assert.match(run({...fixture,mode:'after'}).stderr,pattern);assert.deepEqual(fs.readFileSync(fixture.dbPath),before)})

test('documentation and package entry points separate v41 code-only deploy from historical v17 migration',()=>{
  const runbook=fs.readFileSync(path.join(root,'docs/DEPLOY_V41_CODE_ONLY.md'),'utf8')
  const historical=fs.readFileSync(path.join(root,'docs/PRELAUNCH_V17.md'),'utf8')
  const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json')))
  assert.match(runbook,/不要运行 `migrate:kcs`/)
  assert.match(runbook,/checkout --detach/)
  assert.match(historical,/Historical \/ 历史资料/)
  assert.equal(pkg.scripts['deploy:v41:check'],'node scripts/cloud-preflight.mjs')
  assert.match(pkg.scripts['migrate:v16-to-v17'],/--from 16 --to 17/)
  assert.doesNotMatch(pkg.scripts['deploy:v41:check'],/migrat/)
})

test('runbook fixes health port, privilege boundaries and target-checkout ordering',()=>{
  const runbook=fs.readFileSync(path.join(root,'docs/DEPLOY_V41_CODE_ONLY.md'),'utf8')
  assert.match(runbook,/http:\/\/127\.0\.0\.1:8787\/api\/health/)
  assert.doesNotMatch(runbook,/127\.0\.0\.1:3000/)
  for(const line of runbook.split('\n').filter(line=>line.includes('"$APP"')&&/\b(?:git|npm)\b/.test(line)))assert.match(line,/sudo -u "\$KCS_USER" -H/)
  for(const command of ['systemctl show','systemctl stop','systemctl start','install -d'])assert.match(runbook,new RegExp(`sudo ${command.replace(' ','\\s+')}`))
  assert.match(runbook,/WorkingDirectory --value/)
  assert.match(runbook,/test "\$WORKING_DIRECTORY" = "\$APP"/)
  assert.ok(runbook.indexOf('checkout --detach "$TARGET_COMMIT"')<runbook.indexOf('run deploy:v41:check -- --mode before'))
  assert.ok(runbook.indexOf('run predeploy:kcs')<runbook.indexOf('checkout --detach "$TARGET_COMMIT"'))
})

test('historical v17 document retains the baseline operational material',()=>{
  const historical=fs.readFileSync(path.join(root,'docs/PRELAUNCH_V17.md'),'utf8')
  assert.ok(historical.split('\n').length>200)
  for(const heading of ['## 目的与代码变更','## 重要环境区别','## 权限与安全影响','## 数据库变更与兼容','## Ubuntu 完整回滚','## 常见错误'])assert.match(historical,new RegExp(heading))
  assert.match(historical,/Historical command block — only for the original v16→v17 migration/)
})

test('postflight rejects malformed or foreign snapshots without writing either database',()=>{
  const cases=[
    ['formatVersion',snapshot=>{snapshot.formatVersion=999},/Unsupported snapshot formatVersion/],
    ['databasePath', (snapshot,other)=>{snapshot.databasePath=other.dbPath},/databasePath mismatch/],
    ['counts',snapshot=>{delete snapshot.counts.customers},/counts\.customers/],
    ['employee sentinels',snapshot=>{delete snapshot.employeeSentinels},/employeeSentinels/],
    ['account sentinels',snapshot=>{snapshot.accountSentinels=[]},/accountSentinels/]
  ]
  for(const [name,tamper,pattern] of cases){
    const fixture=makeFixture(),other=makeFixture();assert.equal(run(fixture).status,0)
    const snapshot=JSON.parse(fs.readFileSync(fixture.snapshot));tamper(snapshot,other);fs.writeFileSync(fixture.snapshot,JSON.stringify(snapshot))
    const before=fs.readFileSync(fixture.dbPath),otherBefore=fs.readFileSync(other.dbPath),result=run({...fixture,mode:'after'})
    assert.match(result.stderr,pattern,name);assert.deepEqual(fs.readFileSync(fixture.dbPath),before,name);assert.deepEqual(fs.readFileSync(other.dbPath),otherBefore,name)
  }
})

test('before rejects an unsafe existing snapshot directory without chmod or database writes',()=>{
  const fixture=makeFixture(),unsafe=path.join(fixture.dir,'shared'),snapshot=path.join(unsafe,'before.json')
  fs.mkdirSync(unsafe,{mode:0o755});fs.chmodSync(unsafe,0o755)
  const dbBefore=fs.readFileSync(fixture.dbPath),modeBefore=fs.statSync(unsafe).mode&0o777
  const result=run({...fixture,snapshot})
  assert.match(result.stderr,/private directory/)
  assert.equal(fs.statSync(unsafe).mode&0o777,modeBefore)
  assert.deepEqual(fs.readFileSync(fixture.dbPath),dbBefore)
  assert.equal(fs.existsSync(snapshot),false)
})
