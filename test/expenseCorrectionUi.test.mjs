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

const{default:Page}=await vite.ssrLoadModule('/src/ExpenseCorrection.jsx'),{I18nProvider}=await vite.ssrLoadModule('/src/i18n.jsx')
const click=async n=>act(async()=>n.dispatchEvent(new MouseEvent('click',{bubbles:true})))
const change=async(n,value)=>act(async()=>{Object.getOwnPropertyDescriptor(n.tagName==='TEXTAREA'?window.HTMLTextAreaElement.prototype:window.HTMLInputElement.prototype,'value').set.call(n,value);n.dispatchEvent(new Event('input',{bubbles:true}))})
const{default:Center}=await vite.ssrLoadModule('/src/ExpenseCorrectionCenter.jsx')
test('correction requires a reason, previews refund and sends original version only after confirmation',async()=>{
 let posts=0,saved=0,body;const current={amountCents:150000,revision:0,employee:true,history:[]}
 globalThis.fetch=async(url,options={})=>{if(options.method==='POST'){posts++;body=JSON.parse(options.body);return{ok:true,json:async()=>({...current,amountCents:150000,revision:0,history:[],status:'pending'})}}return{ok:true,json:async()=>current}}
 const root=createRoot(document.getElementById('root'))
 try{
 await act(async()=>root.render(React.createElement(I18nProvider,{language:'zh'},React.createElement(Page,{item:{recordKey:'employee-1',serviceDate:'2026-09-14',employeeName:'Driver',description:'Fuel'},onClose(){},onSaved(){saved++}}))))
 assert.equal(posts,0);assert.equal(document.querySelector('button[type="submit"]').disabled,true)
 await change(document.querySelector('input'),'150');assert.equal(document.querySelector('button[type="submit"]').disabled,true)
 await change(document.querySelector('textarea'),'多输入一个零');assert.match(document.body.textContent,/RM 1350.00/)
 await act(async()=>document.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})))
 assert.equal(posts,1);assert.equal(saved,1);assert.equal(body.expectedAmountCents,150000);assert.equal(body.revision,0);assert.equal(body.amount,'150');assert.equal(document.querySelector('button[type="submit"]').disabled,true);assert.match(document.body.textContent,/等待主管批准/)
 }finally{await act(async()=>root.unmount())}
})

test('central lookup uses full number and office sees pending requests without approval controls',async()=>{
 for(const canApprove of [false,true]){
 const calls=[];globalThis.fetch=async(url,options={})=>{calls.push(String(url));return {ok:true,json:async()=>({items:String(url).includes('EXP-E-000001')?[{recordKey:'employee-1',serviceDate:'2026-09-14',employeeName:'Driver',description:'Fuel',amountCents:150000}]:[],canApprove,requests:[{id:1,record_key:'employee-1',old_amount_cents:150000,new_amount_cents:15000,requester_name:'Office',reason:'Extra zero',status:'pending',created_at:'2026-09-14T00:00:00Z'}]})}}
 const root=createRoot(document.getElementById('root'))
 try{
 await act(async()=>root.render(React.createElement(I18nProvider,{language:'zh'},React.createElement(Center,{onClose(){},onSaved(){}}))))
 assert.equal([...document.querySelectorAll('button')].some(b=>b.textContent==='批准'),canApprove)
 await change(document.querySelector('input'),'EXP-E-000001')
 await act(async()=>document.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})))
 assert(calls.some(c=>c.endsWith('q=EXP-E-000001')));assert.match(document.body.textContent,/Driver/)
 if(canApprove)assert.equal([...document.querySelectorAll('button')].find(b=>b.textContent==='批准').disabled,true)
 }finally{await act(async()=>root.unmount())}
 }
})
