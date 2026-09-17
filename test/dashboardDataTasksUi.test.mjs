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
const{default:Tasks}=await vite.ssrLoadModule('/src/DashboardDataTasks.jsx'),{I18nProvider}=await vite.ssrLoadModule('/src/i18n.jsx')
test('all languages paginate every task, retain tasks on errors, and clear only after successful data refresh',async()=>{
 for(const language of ['en','ms','zh']){
  const root=createRoot(document.getElementById('root'));let fail=false,items=Array.from({length:16},(_,i)=>({key:`branch-${i}`,kind:'branch',branchId:String(10001+i),branchName:`Branch ${i}`,issues:['missingGps','pendingGps']}));const calls=[]
  globalThis.fetch=async(url,options={})=>{calls.push({url,method:options.method||'GET'});if(fail)throw Error('offline');return{ok:true,json:async()=>({items})}}
  try{
   await act(async()=>root.render(React.createElement(I18nProvider,{language},React.createElement(Tasks))))
   assert.equal(document.querySelectorAll('article').length,15)
   await act(async()=>document.querySelector('footer button:last-child').click())
   assert.match(document.querySelector('article').textContent,/Branch 15/)
   fail=true;await act(async()=>window.dispatchEvent(new Event('focus')))
   assert.ok(document.querySelector('[role="alert"]'));assert.equal(document.querySelectorAll('article').length,1)
   fail=false;items=[];await act(async()=>window.dispatchEvent(new Event('focus')))
   assert.equal(document.querySelectorAll('article').length,0);assert.equal(document.querySelector('[role="alert"]'),null)
   assert.ok(calls.every(c=>c.method==='GET'&&c.url==='/api/dashboard/data-tasks'))
  }finally{await act(async()=>root.unmount())}
 }
})


test('orphan schedule opens Customers through in-app navigation without changing records',async()=>{
 for(const language of ['en','ms','zh']){
  const calls=[];let opened=0;const item={key:'schedule-10334',kind:'schedule',scheduleId:'10334',sourceBranchId:'10345',frequency:'Weekly',weekdays:'Wednesday,Saturday,Monday',issues:['unmatchedSchedule']};
  globalThis.fetch=async(url,options={})=>{calls.push({url,method:options.method||'GET'});return{ok:true,json:async()=>({items:[item]})}};
  const root=createRoot(document.getElementById('root'));try{
   await act(async()=>root.render(React.createElement(I18nProvider,{language},React.createElement(Tasks,{onOpenCustomers:()=>{opened++}}))));
   await act(async()=>document.querySelector('article button').click());
   const dialog=document.querySelector('[role="dialog"]');assert.match(dialog.textContent,/10334/);assert.match(dialog.textContent,/10345/);assert.equal(dialog.querySelector('a'),null);
   await act(async()=>dialog.querySelector('button').click());assert.equal(opened,1);assert.ok(calls.every(c=>c.method==='GET'));assert.equal(document.querySelectorAll('article').length,1);
  }finally{await act(async()=>root.unmount())}
 }
})
