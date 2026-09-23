import test from 'node:test'
import assert from 'node:assert/strict'
import {receiptImage,shareReceiptFile} from '../src/receiptImage.js'
test('only receipt snapshots are rendered on white PNG, long names wrap',async()=>{
 const drawn=[],ctx={measureText:s=>({width:s.length*15}),fillRect(){assert.equal(this.fillStyle,'#fff')},fillText(s,x,y){drawn.push(s);assert(x>=0&&y>=0)}}
 const canvas={getContext:()=>ctx,toBlob:fn=>fn(new Blob(['png'],{type:'image/png'}))}
 const previous=globalThis.document;globalThis.document={createElement:()=>canvas,fonts:{ready:Promise.resolve()}}
 try{
  const bill={billNumber:'P1',serviceDate:'2026-09-14',branchName:'A'.repeat(120),vehicleCode:'QAA4293N',totalCents:665,paymentMethod:'Cash',items:[{quantity:35,unit:'kg',productName:'Paper',unitPriceCents:19,lineTotalCents:665}],proof:'SECRET',menu:'More'}
  const result=await receiptImage(bill);assert.equal(result.type,'image/png');assert.equal(canvas.width,640);assert(canvas.height>300)
  assert(drawn.includes('Total: RM 6.65'));assert(drawn.includes('35.00 kg · Paper'));assert(!drawn.join('').includes('SECRET'));assert(!drawn.includes('More'));assert(drawn.every(s=>s.length<=39))
 }finally{globalThis.document=previous}
})
test('sharing is explicit, passes image only, cancellation is harmless and unsupported browsers can save',async()=>{
 const file=new File(['png'],'P1.png',{type:'image/png'});let calls=0
 const nav={canShare:()=>true,share:async payload=>{calls++;assert.deepEqual(payload,{files:[file]})}}
 assert.equal(calls,0);assert.equal(await shareReceiptFile(file,nav),'shared');assert.equal(calls,1)
 assert.equal(await shareReceiptFile(file,{canShare:()=>true,share:async()=>{throw Object.assign(Error(),{name:'AbortError'})}}),'cancelled')
 assert.equal(await shareReceiptFile(file,{}),'unsupported')
 assert.equal(await shareReceiptFile(file,{share:()=>assert.fail(),canShare:()=>false}),'unsupported')
 await assert.rejects(()=>shareReceiptFile(file,{canShare:()=>true,share:async()=>{throw Error('failed')}}))
})
