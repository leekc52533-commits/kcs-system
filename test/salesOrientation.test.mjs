import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import{execFile}from 'node:child_process'
import{promisify}from 'node:util'
import{recognizeSales}from '../server/salesOcr.mjs'
import{mergeSalesRecognition}from '../shared/sales.js'
const run=promisify(execFile)
test('sideways and upside-down settlements are automatically oriented before OCR',async t=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'kcs-orientation-test-'));t.after(()=>fs.rm(folder,{recursive:true,force:true}))
 const file=path.join(folder,'upright.png'),text='TRIPLE-C RECYCLE SDN BHD\nQTY5028\nNo: CP-2026091027\nDate: 10/09/2026\n\n1 OLD CORRUGATED BOX 09/09 TN-153296 KG 960.00 0.420 403.200\n\nFinal Total 403.20'
 await run('convert',['-size','1600x650','xc:white','-font','DejaVu-Sans','-pointsize','28','-fill','black','-annotate','+35+60',text,file])
 for(const angle of [90,180,270]){
  const turned=path.join(folder,'turned.png');await run('convert',[file,'-rotate',String(angle),turned])
  const result=await recognizeSales({dataUrl:'data:image/png;base64,'+(await fs.readFile(turned)).toString('base64')},{buyers:[{id:1,name:'TRIPLE-C RECYCLE SDN BHD'}],vehicles:[{id:1,plate:'QTY5028'}]})
  assert.equal(result.rotation,(360-angle)%360);assert.equal(result.fields.billNumber,'CP-2026091027');assert.equal(result.fields.buyerId,'1');assert.equal(result.fields.lines[0].weightKg,'960.00');assert.ok(result.previewDataUrl.startsWith('data:image/jpeg;base64,'))
 }
})
test('reread replaces OCR values but retains manual fields and edited lines',()=>{
 const previous={billNumber:'CP-wrong',vehicleId:'1',total:'99',lines:[{slipNumber:'TN-old'}]}
 const form={...previous,total:'100',buyerId:'',settlementDate:'',reviewed:true}
 const fields={billNumber:'CP-correct',vehicleId:'2',buyerId:'3',total:'90',lines:[{slipNumber:'TN-new'}]}
 const next=mergeSalesRecognition(form,fields,previous)
 assert.equal(next.billNumber,'CP-correct');assert.equal(next.total,'100');assert.equal(next.buyerId,'3');assert.deepEqual(next.lines,fields.lines);assert.equal(next.reviewed,false)
 assert.deepEqual(mergeSalesRecognition({...form,lines:[{slipNumber:'TN-manual'}]},fields,previous).lines,[{slipNumber:'TN-manual'}])
})
