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
const{default:Records}=await vite.ssrLoadModule('/src/ExpenseRecordsPage.jsx')
const{default:Order,expenseColumnWords}=await vite.ssrLoadModule('/src/ExpenseColumnOrder.jsx')
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

test('saved column order keeps headers and data aligned and correction marker opens read-only history',async()=>{
 localStorage.setItem('kcs.expense-column-order.v1',JSON.stringify(['amountLabel','correctionStatus','expenseNumber']))
 globalThis.fetch=async(url)=>({ok:true,json:async()=>String(url).includes('/corrections')?{amountCents:15000,revision:1,history:[{id:1,oldAmountCents:150000,newAmountCents:15000,reason:'Extra zero',actorName:'Supervisor',createdAt:'2026-09-14T00:00:00Z'}]}:{items:[{recordKey:'employee-1',sourceId:1,expenseType:'employee',amountCents:15000,correctionCount:1,serviceDate:'2026-09-14',employeeName:'Driver',description:'Fuel'}],canCorrect:true}})
 const root=createRoot(document.getElementById('root'))
 try{
 await act(async()=>root.render(React.createElement(I18nProvider,{language:'zh'},React.createElement(Records,{onBack(){}}))))
 const cells=document.querySelectorAll('tbody tr:first-child td');assert.equal(cells[0].textContent,'RM 150.00');assert.equal(cells[1].textContent,'已更正 (1)');assert.equal(cells[2].textContent,'EXP-E-000001')
 await click(cells[1].querySelector('button'));const dialog=document.querySelector('[role="dialog"]');assert.match(dialog.textContent,/1500.00/);assert.equal(dialog.querySelector('input'),null);assert.equal(dialog.querySelector('button[type="submit"]'),null)
 await click(dialog.querySelector('button'))
 await click(document.querySelector('button[aria-label="调整栏目"]'));const chooser=document.querySelector('[role="dialog"]');await click(chooser.querySelector('button[aria-label^="下移"]'));await act(async()=>chooser.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})))
 assert.equal(JSON.parse(localStorage.getItem('kcs.expense-column-order.v1'))[0],'correctionStatus');assert.equal(document.querySelector('tbody td').textContent,'已更正 (1)')
 }finally{await act(async()=>root.unmount());localStorage.removeItem('kcs.expense-column-order.v1')}
})

test('pointer drag reorders immediately, scrolls at edge and cancellation restores draft',async()=>{
 const oldRaf=globalThis.requestAnimationFrame,oldCancel=globalThis.cancelAnimationFrame;let nextFrame,seq=0,saved
 globalThis.requestAnimationFrame=fn=>{nextFrame=fn;return ++seq};globalThis.cancelAnimationFrame=()=>{nextFrame=null}
 const root=createRoot(document.getElementById('root'))
 const pointer=async(node,type,y)=>act(async()=>{const e=new MouseEvent(type,{bubbles:true,cancelable:true,clientY:y,button:0});Object.defineProperty(e,'pointerId',{value:7});node.dispatchEvent(e)})
 const tick=async()=>act(async()=>{const fn=nextFrame;nextFrame=null;fn?.()})
 try{
 await act(async()=>root.render(React.createElement(Order,{order:['a','b','c'],columns:[['a','A'],['b','B'],['c','C']],w:expenseColumnWords.en,onSave:v=>saved=v,onClose(){}})))
 const list=document.querySelector('.expense-column-list');list.getBoundingClientRect=()=>({top:0,bottom:120,height:120});list.setPointerCapture=()=>{};list.hasPointerCapture=()=>false
 for(const row of list.children)row.getBoundingClientRect=()=>{const i=[...list.children].indexOf(row);return{top:i*40-list.scrollTop,height:40}}
 await pointer(list.children[0].querySelector('.expense-column-grip'),'pointerdown',20)
 await pointer(list,'pointermove',115);await tick();assert.equal(list.lastElementChild.dataset.columnKey,'a');assert(list.scrollTop>0)
 await pointer(list,'pointercancel',115);assert.equal(list.firstElementChild.dataset.columnKey,'a')
 list.scrollTop=0;await pointer(list.children[0].querySelector('.expense-column-grip'),'pointerdown',20);await pointer(list,'pointermove',115);await tick();await pointer(list,'pointerup',115)
 await act(async()=>document.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})))
 assert.deepEqual(saved,['b','c','a'])
 }finally{await act(async()=>root.unmount());globalThis.requestAnimationFrame=oldRaf;globalThis.cancelAnimationFrame=oldCancel;localStorage.removeItem('kcs.expense-column-order.v1')}
})
