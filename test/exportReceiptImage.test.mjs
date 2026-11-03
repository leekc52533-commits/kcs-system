import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,readFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {exportReceiptImage} from '../server/exportReceiptImage.mjs'
const execute=promisify(execFile)
test('receipt export copy shrinks while preserving original and falls back on conversion failure',async t=>{
 try{await execute('convert',['-version'])}catch{return t.skip('ImageMagick unavailable')}
 const dir=await mkdtemp(path.join(tmpdir(),'kcs-export-image-')),file=path.join(dir,'receipt.png')
 try{
  await execute('convert',['-size','1800x2200','plasma:fractal',file])
  const original=await readFile(file);assert.ok(original.length>180000)
  const copy=await exportReceiptImage(file,'png')
  assert.equal(copy.extension,'jpeg');assert.ok(copy.buffer.length<original.length);assert.equal(copy.fallback,false)
  assert.deepEqual(await readFile(file),original)
  const fallback=await exportReceiptImage(file,'png',{convert:'/nonexistent-kcs-converter'})
  assert.equal(fallback.fallback,true);assert.deepEqual(fallback.buffer,original)
 }finally{await rm(dir,{recursive:true,force:true})}
})
