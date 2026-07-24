import test from 'node:test'
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import fs from 'node:fs'
import {DatabaseSync} from 'node:sqlite'
import os from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {applyV17Migration} from '../server/migrationV17.mjs'

const projectRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')

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
  const result=spawnSync(process.execPath,['scripts/migrate.mjs'],{
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
