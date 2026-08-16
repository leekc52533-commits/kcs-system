import test from 'node:test'
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import {DatabaseSync} from 'node:sqlite'
import os from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {applyV17Migration} from '../server/migrationV17.mjs'

const projectRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const runScript=(script,args,dbPath='')=>spawnSync(process.execPath,[script,...args],{cwd:projectRoot,env:{...process.env,KCS_DB_PATH:dbPath},encoding:'utf8'})

const legacyDatabase=()=>{
  const db=new DatabaseSync(':memory:')
  db.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE schema_meta(version INTEGER PRIMARY KEY);
    INSERT INTO schema_meta(version) VALUES(16);
    CREATE TABLE employees(id INTEGER PRIMARY KEY,employee_code TEXT UNIQUE,name TEXT,job_role TEXT);
    CREATE TABLE auth_accounts(
      id INTEGER PRIMARY KEY,employee_id INTEGER NOT NULL UNIQUE REFERENCES employees(id),
      username TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin','supervisor','office','driver','crew')),
      is_active INTEGER NOT NULL DEFAULT 1
    );
  `)
  return db
}

test('v17 migration preserves AWS-style EMP0003 and its active account',()=>{
  const db=legacyDatabase()
  db.exec(`
    INSERT INTO employees VALUES(1,'ADMIN-001','Kc Lee','Admin');
    INSERT INTO employees VALUES(2,'EMP-0001','Employee One','Driver');
    INSERT INTO employees VALUES(3,'EMP-0002','Employee Two','Driver');
    INSERT INTO employees VALUES(4,'EMP-0003','SUNDARAMUTI BIN MOHAMMAD','Driver');
    INSERT INTO auth_accounts VALUES(1,1,'kcadmin','hash-owner','admin',1);
    INSERT INTO auth_accounts VALUES(2,4,'emp0003','hash-emp0003','driver',1);
  `)
  const employeeBefore=db.prepare(`SELECT * FROM employees WHERE employee_code='EMP-0003'`).get()
  const accountBefore=db.prepare(`SELECT * FROM auth_accounts WHERE employee_id=?`).get(employeeBefore.id)
  assert.equal(applyV17Migration(db),true)
  const employeeAfter=db.prepare(`SELECT * FROM employees WHERE id=?`).get(employeeBefore.id)
  const accountAfter=db.prepare(`SELECT * FROM auth_accounts WHERE id=?`).get(accountBefore.id)
  assert.deepEqual(employeeAfter,employeeBefore)
  assert.equal(accountAfter.employee_id,accountBefore.employee_id)
  assert.equal(accountAfter.username,accountBefore.username)
  assert.equal(accountAfter.password_hash,accountBefore.password_hash)
  assert.equal(accountAfter.is_active,1)
  assert.equal(accountAfter.system_role,'driver')
  assert.equal(accountAfter.preferred_language,'ms')
  assert.equal(db.prepare(`SELECT system_role FROM auth_accounts WHERE username='kcadmin'`).get().system_role,'owner_admin')
  assert.equal(db.prepare('SELECT MAX(version) version FROM schema_meta').get().version,17)
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok')
})

test('v17 migration is idempotent and does not add or remove cloud records',()=>{
  const db=legacyDatabase()
  db.exec(`INSERT INTO employees VALUES(4,'EMP-0003','SUNDARAMUTI BIN MOHAMMAD','Driver');INSERT INTO auth_accounts VALUES(2,4,'emp0003','same-hash','driver',1);`)
  applyV17Migration(db)
  const before={employees:db.prepare('SELECT COUNT(*) count FROM employees').get().count,accounts:db.prepare('SELECT COUNT(*) count FROM auth_accounts').get().count}
  assert.equal(applyV17Migration(db),false)
  assert.deepEqual({employees:db.prepare('SELECT COUNT(*) count FROM employees').get().count,accounts:db.prepare('SELECT COUNT(*) count FROM auth_accounts').get().count},before)
})

test('production migration command requires an explicit v16 database and performs only v17 schema migration',()=>{
  const tempDir=fs.mkdtempSync(path.join(os.tmpdir(),'kcs-v17-migration-'))
  const databasePath=path.join(tempDir,'aws-backup.sqlite')
  const db=new DatabaseSync(databasePath)
  db.exec(`
    CREATE TABLE schema_meta(version INTEGER PRIMARY KEY);
    INSERT INTO schema_meta(version) VALUES(16);
    CREATE TABLE employees(id INTEGER PRIMARY KEY,employee_code TEXT UNIQUE,name TEXT,job_role TEXT);
    CREATE TABLE auth_accounts(
      id INTEGER PRIMARY KEY,employee_id INTEGER NOT NULL UNIQUE REFERENCES employees(id),
      username TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin','supervisor','office','driver','crew')),
      is_active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE sentinel(id INTEGER PRIMARY KEY,value TEXT);
    INSERT INTO employees VALUES(4,'EMP-0003','SUNDARAMUTI BIN MOHAMMAD','Driver');
    INSERT INTO auth_accounts VALUES(2,4,'emp0003','unchanged-hash','driver',1);
    INSERT INTO sentinel VALUES(1,'must remain untouched');
  `)
  db.close()
  const refused=spawnSync(process.execPath,['scripts/migrate.mjs'],{
    cwd:projectRoot,env:{...process.env,KCS_DB_PATH:databasePath},encoding:'utf8'
  })
  assert.notEqual(refused.status,0)
  assert.match(refused.stderr,/v16→v17 only/)
  const result=spawnSync(process.execPath,['scripts/migrate.mjs','--from','16','--to','17','--confirm-migration'],{
    cwd:projectRoot,
    env:{...process.env,KCS_DB_PATH:databasePath},
    encoding:'utf8'
  })
  assert.equal(result.status,0,result.stderr)
  const migrated=new DatabaseSync(databasePath,{readOnly:true})
  assert.equal(migrated.prepare('SELECT value FROM sentinel WHERE id=1').get().value,'must remain untouched')
  assert.equal(migrated.prepare('SELECT COUNT(*) count FROM employees').get().count,1)
  assert.equal(migrated.prepare('SELECT password_hash FROM auth_accounts WHERE id=2').get().password_hash,'unchanged-hash')
  assert.equal(migrated.prepare('SELECT MAX(version) version FROM schema_meta').get().version,17)
  assert.equal(migrated.prepare('PRAGMA integrity_check').get().integrity_check,'ok')
  migrated.close()
  fs.rmSync(tempDir,{recursive:true,force:true})
})

test('historical migration and rehearsal parsers reject ambiguous, duplicate and unknown arguments',()=>{
  const migrationCases=[
    ['16','--to','17','--confirm-migration'],['17','--from','16','--confirm-migration'],
    ['--from','16','--from','16','--to','17','--confirm-migration'],
    ['--from','16','--to','17','--confirm-migration','--confirm-migration'],
    ['--from','16','--to','17','--confirm-migration','--unknown'],
    ['--from','16','--to','17','--confirm-migration','extra']
  ]
  for(const args of migrationCases){const result=runScript('scripts/migrate.mjs',args);assert.notEqual(result.status,0,args.join(' '));assert.match(result.stderr,/refuses implicit execution/)}
  const validBase=['--from','16','--to','17','--backup','backup.sqlite','--snapshot','before.json']
  const rehearsalCases=[
    ['16','--to','17','--backup','backup.sqlite','--snapshot','before.json'],
    [...validBase,'--from','16'],[...validBase,'--unknown','x'],[...validBase,'extra']
  ]
  for(const args of rehearsalCases){const result=runScript('scripts/cloud-migration-rehearsal.mjs',args);assert.notEqual(result.status,0,args.join(' '));assert.match(result.stderr,/Historical v17 rehearsal only/)}
})

const historicalFixture=()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kcs-v17-rehearsal-')),databasePath=path.join(dir,'verified-v16.sqlite'),snapshotPath=path.join(dir,'before-v16.json')
  const db=new DatabaseSync(databasePath)
  db.exec(`
    CREATE TABLE schema_meta(version INTEGER PRIMARY KEY); INSERT INTO schema_meta VALUES(16);
    CREATE TABLE customers(id INTEGER PRIMARY KEY); INSERT INTO customers VALUES(1),(2);
    CREATE TABLE branches(id INTEGER PRIMARY KEY,latitude REAL,longitude REAL); INSERT INTO branches VALUES(1,1,110),(2,NULL,NULL);
    CREATE TABLE employees(id INTEGER PRIMARY KEY,employee_code TEXT UNIQUE,name TEXT,job_role TEXT,employment_status TEXT,is_active INTEGER);
    INSERT INTO employees VALUES(1,'ADMIN-001','Kc Lee','Admin','active',1),(4,'EMP-0003','SUNDARAMUTI BIN MOHAMMAD','Driver','active',1);
    CREATE TABLE auth_accounts(id INTEGER PRIMARY KEY,employee_id INTEGER NOT NULL UNIQUE,username TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,role TEXT NOT NULL,is_active INTEGER NOT NULL DEFAULT 1);
    INSERT INTO auth_accounts VALUES(1,1,'kcadmin','hash-owner','admin',1),(2,4,'emp0003','hash-emp0003','driver',1);
    CREATE TABLE vehicles(id INTEGER PRIMARY KEY); INSERT INTO vehicles VALUES(1);
    CREATE TABLE zone_groups(id INTEGER PRIMARY KEY); INSERT INTO zone_groups VALUES(1);
  `)
  const employees=db.prepare('SELECT id,employee_code employeeCode,name,employment_status employmentStatus,is_active isActive FROM employees ORDER BY id').all()
  db.close()
  return {dir,databasePath,snapshotPath,employees}
}

test('historical rehearsal migrates a copy, verifies v17 preservation, and leaves its source bytes unchanged',()=>{
  const fixture=historicalFixture(),sourceBefore=fs.readFileSync(fixture.databasePath)
  const snapshot={schemaVersion:16,integrity:'ok',counts:{customers:2,branches:2,employees:2,vehicles:1,zoneGroups:1,officialGps:1,authAccounts:2},employees:fixture.employees,authAccounts:[{id:1,employeeId:1,username:'kcadmin',role:'admin',isActive:1,passwordFingerprint:crypto.createHash('sha256').update('hash-owner').digest('hex')},{id:2,employeeId:4,username:'emp0003',role:'driver',isActive:1,passwordFingerprint:crypto.createHash('sha256').update('hash-emp0003').digest('hex')}]}
  fs.writeFileSync(fixture.snapshotPath,JSON.stringify(snapshot))
  const result=runScript('scripts/cloud-migration-rehearsal.mjs',['--from','16','--to','17','--backup',fixture.databasePath,'--snapshot',fixture.snapshotPath])
  assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/"verifiedAfterMigration": true/);assert.match(result.stdout,/historical-v16-to-v17-postflight/)
  assert.deepEqual(fs.readFileSync(fixture.databasePath),sourceBefore)
})

test('historical postflight rejects password or role changes without changing the source',()=>{
  const fixture=historicalFixture(),sourceBefore=fs.readFileSync(fixture.databasePath),damaged=path.join(fixture.dir,'damaged.sqlite')
  const snapshot={schemaVersion:16,integrity:'ok',counts:{customers:2,branches:2,employees:2,vehicles:1,zoneGroups:1,officialGps:1,authAccounts:2},employees:fixture.employees,authAccounts:[{id:1,employeeId:1,username:'kcadmin',role:'admin',isActive:1,passwordFingerprint:crypto.createHash('sha256').update('hash-owner').digest('hex')},{id:2,employeeId:4,username:'emp0003',role:'driver',isActive:1,passwordFingerprint:crypto.createHash('sha256').update('hash-emp0003').digest('hex')}]}
  fs.writeFileSync(fixture.snapshotPath,JSON.stringify(snapshot));fs.copyFileSync(fixture.databasePath,damaged)
  assert.equal(runScript('scripts/migrate.mjs',['--from','16','--to','17','--confirm-migration'],damaged).status,0)
  for(const sql of ["UPDATE auth_accounts SET password_hash='damaged' WHERE id=2","UPDATE auth_accounts SET role='crew' WHERE id=2"]){
    const db=new DatabaseSync(damaged);db.exec(sql);db.close()
    const result=runScript('scripts/verify-v17-postflight.mjs',['--snapshot',fixture.snapshotPath],damaged)
    assert.notEqual(result.status,0);assert.match(result.stderr,/account 2 identity\/role\/status\/password changed/)
  }
  assert.deepEqual(fs.readFileSync(fixture.databasePath),sourceBefore)
})

test('historical postflight rejects empty and malformed sentinels',()=>{
  const fixture=historicalFixture(),migrated=path.join(fixture.dir,'migrated.sqlite');fs.copyFileSync(fixture.databasePath,migrated)
  assert.equal(runScript('scripts/migrate.mjs',['--from','16','--to','17','--confirm-migration'],migrated).status,0)
  const valid={schemaVersion:16,integrity:'ok',counts:{customers:2,branches:2,employees:2,vehicles:1,zoneGroups:1,officialGps:1,authAccounts:2},employees:fixture.employees,authAccounts:[{id:1,employeeId:1,username:'kcadmin',role:'admin',isActive:1,passwordFingerprint:crypto.createHash('sha256').update('hash-owner').digest('hex')}]}
  for(const mutate of [snapshot=>{snapshot.employees=[]},snapshot=>{snapshot.authAccounts=[]},snapshot=>{snapshot.employees[0].isActive=2},snapshot=>{snapshot.authAccounts[0].passwordFingerprint='NOT-A-FINGERPRINT'},snapshot=>{delete snapshot.authAccounts[0].role}]){
    const snapshot=structuredClone(valid);mutate(snapshot);fs.writeFileSync(fixture.snapshotPath,JSON.stringify(snapshot))
    const result=runScript('scripts/verify-v17-postflight.mjs',['--snapshot',fixture.snapshotPath],migrated)
    assert.notEqual(result.status,0);assert.match(result.stderr,/Invalid historical snapshot/)
  }
})
