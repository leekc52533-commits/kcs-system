import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {Worker} from 'node:worker_threads'
import {documentNumberSchema,applyV69Migration} from '../server/migrationV69.mjs'
import {allocateDocumentNumber,documentNumber} from '../server/documentNumbers.mjs'
test('daily numbers share expense sequence, follow Kuching issue time, stay permanent and roll back atomically',()=>{
 const db=new DatabaseSync(':memory:');db.exec(documentNumberSchema)
 const now='2026-09-13T16:00:00Z'
 assert.equal(allocateDocumentNumber(db,'E','employee-1',now),'E260914-001')
 assert.equal(allocateDocumentNumber(db,'E','admin-1',now),'E260914-002')
 for(const [p,key] of [['P','purchase-1'],['S','sales-1'],['V','void-1']])assert.equal(allocateDocumentNumber(db,p,key,now),p+'260914-001')
 assert.equal(allocateDocumentNumber(db,'E','employee-1','2026-09-15T00:00:00Z'),'E260914-001')
 assert.equal(allocateDocumentNumber(db,'E','employee-2','2026-09-14T16:00:00Z'),'E260915-001')
 db.exec('BEGIN IMMEDIATE');assert.equal(allocateDocumentNumber(db,'E','employee-3',now),'E260914-003');db.exec('ROLLBACK');assert.equal(documentNumber(db,'employee-3'),null)
 assert.equal(allocateDocumentNumber(db,'E','employee-4',now),'E260914-003')
 db.prepare("UPDATE document_number_sequences SET last_sequence=999 WHERE prefix='P'").run();assert.equal(allocateDocumentNumber(db,'P','purchase-2',now),'P260914-1000')
 assert.throws(()=>db.exec("UPDATE document_numbers SET document_number='changed'"));assert.throws(()=>db.exec('DELETE FROM document_numbers'))
 db.close()
})
test('migration leaves old numbers untouched and repeated migration does not reset counters',()=>{
 const db=new DatabaseSync(':memory:');db.exec("CREATE TABLE schema_meta(version INTEGER);INSERT INTO schema_meta VALUES(68);CREATE TABLE purchase_bills(id INTEGER,bill_number TEXT);INSERT INTO purchase_bills VALUES(1,'P20260914-000250')")
 applyV69Migration(db);allocateDocumentNumber(db,'P','purchase-2','2026-09-14T00:00Z');applyV69Migration(db)
 assert.equal(db.prepare('SELECT bill_number FROM purchase_bills').get().bill_number,'P20260914-000250');assert.equal(documentNumber(db,'purchase-1'),null);assert.equal(allocateDocumentNumber(db,'P','purchase-3','2026-09-14T00:00Z'),'P260914-002');db.close()
})
test('concurrent database connections allocate unique company-wide expense numbers',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'kcs-numbers-')),file=join(dir,'numbers.db'),db=new DatabaseSync(file);db.exec('PRAGMA journal_mode=WAL;'+documentNumberSchema)
 const module=new URL('../server/documentNumbers.mjs',import.meta.url).href
 try{
 await Promise.all([0,1,2].map(worker=>new Promise((resolve,reject)=>{const w=new Worker(`const{workerData,parentPort}=require('node:worker_threads');const{DatabaseSync}=require('node:sqlite');(async()=>{const{allocateDocumentNumber}=await import(workerData.module);const db=new DatabaseSync(workerData.file);db.exec('PRAGMA busy_timeout=10000');for(let i=1;i<=20;i++)allocateDocumentNumber(db,'E','employee-'+(workerData.worker*100+i),'2026-09-14T00:00:00Z');db.close();parentPort.postMessage('ok')})().catch(e=>{throw e})`,{eval:true,workerData:{worker,file,module}});w.on('error',reject);w.on('exit',code=>code===0?resolve():reject(Error('worker '+code)))})))
 const rows=db.prepare('SELECT document_number FROM document_numbers').all();assert.equal(rows.length,60);assert.equal(new Set(rows.map(r=>r.document_number)).size,60);assert.equal(db.prepare("SELECT last_sequence FROM document_number_sequences WHERE prefix='E'").get().last_sequence,60)
 }finally{db.close();rmSync(dir,{recursive:true,force:true})}
})
