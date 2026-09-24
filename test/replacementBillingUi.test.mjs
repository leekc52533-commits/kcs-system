import test,{after} from 'node:test'
import assert from 'node:assert/strict'
import React,{act} from 'react'
import {createServer} from 'vite'
import {JSDOM} from 'jsdom'
const dom=new JSDOM('<html><body><div id="root"></div></body></html>',{url:'https://localhost/'})
for(const k of ['window','document','Node','NodeFilter','HTMLElement','MutationObserver','Event','MouseEvent','localStorage','sessionStorage'])globalThis[k]=dom.window[k]
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true
const{createRoot}=await import('react-dom/client'),vite=await createServer({logLevel:'silent',server:{middlewareMode:true},appType:'custom'})
after(()=>vite.close())

const{ReplacementForm}=await vite.ssrLoadModule('/src/BillVoidPage.jsx'),{I18nProvider}=await vite.ssrLoadModule('/src/i18n.jsx')
test('temporary reissue separates product, editable price and weight in submitted payload',async()=>{
 const root=createRoot(document.getElementById('root'));let sent
 globalThis.fetch=async(url,options={})=>({ok:true,json:async()=>{
  if(options.method==='POST'){sent=JSON.parse(options.body);return {billNumber:'P-new',serviceDate:'2026-09-24',paymentMethod:'Credit',items:[],totalCents:14526}}
  return {temporary:true,stop:{paymentMethod:'Credit'},products:[{productId:1,fullName:'OCC',unit:'kg',currentPrice:145.26},{productId:2,fullName:'Paper',unit:'kg',currentPrice:null}]}
 }})
 const change=async(el,value)=>act(async()=>{Object.getOwnPropertyDescriptor(el.tagName==='SELECT'?window.HTMLSelectElement.prototype:window.HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}))})
 try{
  await act(async()=>root.render(React.createElement(I18nProvider,{language:'ms'},React.createElement(ReplacementForm,{billId:1,onDone:async()=>{}}))))
  const product=document.querySelectorAll('select')[2]
  assert.equal(product.options.length,3);assert.doesNotMatch(product.textContent,/145.260/)
  await change(product,'1')
  const [weight,price]=document.querySelectorAll('input[type="number"]')
  assert.equal(price.value,'');assert.equal(price.step,'0.001');assert.equal(weight.step,'0.01')
  await change(weight,'726.30');await change(price,'0.200')
  assert.match(document.querySelector('form').textContent,/RM 145.26/)
  await act(async()=>document.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})))
  assert.deepEqual(sent.items,[{productId:'1',quantity:'726.30',unitPrice:'0.200'}])
 }finally{await act(async()=>root.unmount())}
})
