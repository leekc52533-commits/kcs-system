import test from 'node:test'
import assert from 'node:assert/strict'
import {processPaymentProof} from '../src/paymentProofImage.js'

test('Sales retains eligible JPEG bytes after decoding and closes the bitmap',async()=>{
 const file=new File([new Uint8Array([255,216,255,10,20])],'bill.jpeg',{type:'image/jpeg'})
 let closed=false
 const result=await processPaymentProof(file,{preserveJpeg:true,createBitmap:async()=>({width:1280,height:960,close(){closed=true}}),createCanvas(){throw Error('must not re-encode')}})
 assert.equal(result.blob,file);assert.equal(result.name,'bill.jpg');assert.equal(closed,true)
})
test('oversized Sales images and default proof uploads still use compression',async()=>{
 for(const [preserveJpeg,width,size,type] of [[true,3000,20,'image/jpeg'],[true,1280,4*1024*1024,'image/jpeg'],[false,1280,20,'image/jpeg'],[true,1280,20,'image/png']]){
  const output=new Blob(['compressed'],{type:'image/jpeg'}),file=new File([new Uint8Array(size)],'bill',{type})
  const result=await processPaymentProof(file,{preserveJpeg,createBitmap:async()=>({width,height:960,close(){}}),createCanvas:()=>({getContext:()=>({fillRect(){},drawImage(){}}),toBlob(callback){callback(output)}})})
  assert.equal(result.blob,output);assert.ok(result.width<=2200)
 }
})
