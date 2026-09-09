import test,{after} from 'node:test'
import assert from 'node:assert/strict'
import React,{act,useState} from 'react'
import {createServer} from 'vite'
import {JSDOM} from 'jsdom'
const dom=new JSDOM('<html><body><div id="root"></div></body></html>',{url:'https://localhost/'})
for(const k of ['window','document','Node','NodeFilter','HTMLElement','MutationObserver','Event','MouseEvent','localStorage','sessionStorage','FileReader'])globalThis[k]=dom.window[k]
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true
const{createRoot}=await import('react-dom/client'),vite=await createServer({logLevel:'silent',server:{middlewareMode:true},appType:'custom'})
after(()=>vite.close())

const{default:Page}=await vite.ssrLoadModule('/src/BillVoidPage.jsx'),{I18nProvider}=await vite.ssrLoadModule('/src/i18n.jsx')
const click=async n=>act(async()=>n.dispatchEvent(new MouseEvent('click',{bubbles:true})))
const original={id:12,bill_number:'P20260909-000012',service_date:'2026-09-09',customer_name_snapshot:'Customer',branch_name_snapshot:'Branch',branch_code_snapshot:'10001',driver_name_snapshot:'Driver',driver_employee_id:1,total_cents:2000,status:'issued',payment_method:'Cash',proofId:4,items:[],requests:[],canRequest:true}
let calls=[],current
fetch=async(url,options={})=>{calls.push({url,options});if(options.method==='POST'){current={...current,canRequest:false,requests:[{id:3,status:'pending',reason:'Wrong quantity',requested_name:'Driver',requested_by:1}]};return{ok:true,json:async()=>({id:3})}}return{ok:true,json:async()=>({items:[current],canReview:true})}}
test('mobile own bills request reason, pending state and proof link work in three languages without approval controls',async()=>{
 for(const language of ['en','ms','zh']){
  current={...original};calls=[]
  const root=createRoot(document.getElementById('root'))
  await act(async()=>root.render(React.createElement(I18nProvider,{language},React.createElement(Page,{mobile:true}))))
  assert.equal(calls[0].url,'/api/bill-voids?scope=own')
  assert.ok(document.querySelector('a').href.endsWith('/api/purchase-payment-proofs/4/photo'))
  const textarea=document.querySelector('textarea')
  await act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set.call(textarea,'Wrong quantity');textarea.dispatchEvent(new Event('input',{bubbles:true}))})
  await act(async()=>document.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})))
  const call=calls.find(c=>c.options.method==='POST');assert.equal(call.url,'/api/bill-voids/12/request');assert.deepEqual(JSON.parse(call.options.body),{reason:'Wrong quantity'})
  assert.equal(document.querySelector('textarea'),null)
  assert.ok(!document.body.textContent.includes('void.'))
  await act(async()=>root.unmount())
 }
})
test('desktop review confirms the bill and amount before posting approval',async()=>{
 current={...original,canRequest:false,requests:[{id:3,status:'pending',reason:'Wrong quantity',requested_name:'Driver',requested_by:1}]};calls=[]
 let prompt='';window.confirm=text=>{prompt=text;return true}
 const root=createRoot(document.getElementById('root'))
 await act(async()=>root.render(React.createElement(I18nProvider,{language:'en'},React.createElement(Page))))
 const approve=[...document.querySelectorAll('button')].find(b=>b.textContent==='Approve void')
 assert.ok(approve)
 await click(approve)
 assert.match(prompt,/P20260909-000012/);assert.match(prompt,/RM 20.00/)
 assert.equal(calls.find(c=>c.options.method==='POST').url,'/api/bill-voids/3/approve')
 await act(async()=>root.unmount())
})
