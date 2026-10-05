import test,{after} from 'node:test'
import assert from 'node:assert/strict'
import React,{act} from 'react'
import {createServer} from 'vite'
import {JSDOM} from 'jsdom'
const dom=new JSDOM('<html><body><div id="root"></div></body></html>',{url:'https://localhost/'})
for(const k of ['window','document','Node','NodeFilter','HTMLElement','MutationObserver','Event','MouseEvent','localStorage','sessionStorage'])globalThis[k]=dom.window[k]
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true})
globalThis.IS_REACT_ACT_ENVIRONMENT=true
const{createRoot}=await import('react-dom/client'),vite=await createServer({logLevel:'silent',server:{middlewareMode:true},appType:'custom'})
after(()=>vite.close())
const{I18nProvider}=await vite.ssrLoadModule('/src/i18n.jsx'),{default:Page}=await vite.ssrLoadModule('/src/RescheduledCustomers.jsx')
test('reschedule whole row opens correct details in each language and closes without writes or changing selections',async()=>{
 for(const language of ['zh','ms','en'])for(const withSelection of [false,true]){
  const root=createRoot(document.getElementById('root')),calls=[];let selected=[]
  const selection=withSelection?{routes:[],stops:[],otherCustomers:[],setStops:()=>{},setOtherCustomers:fn=>{selected=fn(selected)}}:undefined
  const history=[{id:1,sourceDate:'2026-10-03',targetDate:'2026-10-05',reason:'Customer requested',employeeName:'DRIVER A',approvedBy:'MANAGER B',approvedAt:'2026-10-04T02:30:00+00:00',reviewReason:'Confirmed'}]
  globalThis.fetch=async(url,options={})=>{calls.push(options.method||'GET');return {ok:true,headers:new Headers(),json:async()=>({items:[{id:1}],routes:[],priority:[{id:1,branchName:'BRANCH A',routeNumbers:[],count:1,history}]})}}
  await act(async()=>root.render(React.createElement(I18nProvider,{language},React.createElement(Page,{date:'2026-10-05',selection}))))
  assert.equal(document.querySelector('.reschedule-detail-row'),null)
  if(withSelection){await act(async()=>document.querySelector('.support-option input').click());assert.equal(selected.length,1);assert.equal(document.querySelector('.reschedule-detail-row'),null)}
  await act(async()=>document.querySelector('.reschedule-summary-row td span').click())
  const text=document.querySelector('.reschedule-detail-row').textContent
  for(const value of ['03-Oct-26','05-Oct-26','04-Oct-26 10:30','DRIVER A','MANAGER B','Customer requested','Confirmed'])assert.ok(text.includes(value),value)
  assert.equal(document.querySelector('.reschedule-summary-row').getAttribute('aria-expanded'),'true')
  await act(async()=>document.querySelector('.reschedule-summary-row td:nth-child(2)').click())
  assert.equal(document.querySelector('.reschedule-detail-row'),null)
  await act(async()=>document.querySelector('.reschedule-summary-row td:nth-child(3)').click())
  assert.ok(document.querySelector('.reschedule-detail-row'))
  await act(async()=>document.querySelector('.reschedule-summary-row').click())
  assert.equal(document.querySelector('.reschedule-detail-row'),null)
  assert.deepEqual(calls,['GET'])
  await act(async()=>root.unmount())
 }
})
