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
test('due tab supports all languages, evidence expansion and independent support selection without writes',async()=>{
 for(const language of ['zh','ms','en']){
  localStorage.clear();const root=createRoot(document.getElementById('root')),calls=[];let selected=[],stops=[]
  const branch={id:1,branchCode:'B1',branchName:'BRANCH A',routeNumbers:[1],originalDate:'2026-10-01',newDate:'2026-10-08',overdueMinutes:6000,overdueStatus:'overdue',lastCollectionDate:'2026-09-28',driverName:'DRIVER',history:[{id:1,sourceDate:'2026-10-01',targetDate:'2026-10-08',reason:'No time',approvedBy:'Manager'}],visits:[{id:1,date:'2026-09-28',status:'collected'}]}
  const blocked={...branch,id:2,branchName:'BRANCH B',stopId:20,overdueMinutes:100}
  globalThis.fetch=async(url,options={})=>{calls.push(options.method||'GET');return {ok:true,headers:new Headers(),json:async()=>({priority:[],items:[{id:1}],routes:[{routeNumber:1,name:'Route A'}],due:[branch,blocked],asOf:'2026-10-05T03:00:00Z'})}}
  const selection={routes:[{routeNumber:1,name:'Route A',stops:[{id:20,status:'active',arrivedAt:'2026-10-05'}]}],stops:[],otherCustomers:[],setStops:fn=>{stops=fn(stops)},setOtherCustomers:fn=>{selected=fn(selected)}}
  await act(async()=>root.render(React.createElement(I18nProvider,{language},React.createElement(Page,{date:'2026-10-08',selection}))))
  await act(async()=>document.querySelectorAll('.customer-priority-tabs button')[1].click())
  assert.ok(document.querySelector('.due-customers'))
  assert.equal(document.querySelector('.due-summary-row td span').textContent,'BRANCH A')
  assert.ok(document.querySelector('.due-customers').textContent.includes('01-Oct-26'))
  assert.ok(document.querySelector('.due-customers').textContent.includes('Route A'))
  const checkboxes=document.querySelectorAll('.due-summary-row input')
  assert.equal(checkboxes[1].disabled,true)
  await act(async()=>checkboxes[0].click());assert.deepEqual(selected,[{id:1}]);assert.deepEqual(stops,[])
  assert.equal(document.querySelector('.reschedule-detail-row'),null)
  await act(async()=>document.querySelector('.due-summary-row').click())
  assert.ok(document.querySelector('.reschedule-detail-row').textContent.includes('No time'))
  assert.ok(document.querySelector('.reschedule-detail-row').textContent.includes('28-Sep-26'))
  await act(async()=>document.querySelector('.due-summary-row').click());assert.equal(document.querySelector('.reschedule-detail-row'),null)
  await act(async()=>document.querySelectorAll('.customer-priority-tabs button')[0].click());assert.equal(document.querySelector('.due-customers'),null)
  assert.deepEqual(calls,['GET'])
  await act(async()=>root.unmount())
 }
})
