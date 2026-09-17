import test,{after} from 'node:test'
import assert from 'node:assert/strict'
import React,{act} from 'react'
import {createServer} from 'vite'
import {JSDOM} from 'jsdom'
const dom=new JSDOM('<html><body><div id="root"></div></body></html>',{url:'https://localhost/'})
for(const k of ['window','document','Node','NodeFilter','HTMLElement','MutationObserver','Event','MouseEvent','localStorage','sessionStorage'])globalThis[k]=dom.window[k]
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true
const{createRoot}=await import('react-dom/client'),vite=await createServer({logLevel:'silent',server:{middlewareMode:true},appType:'custom'});after(()=>vite.close())
const{I18nProvider}=await vite.ssrLoadModule('/src/i18n.jsx'),{default:Activity}=await vite.ssrLoadModule('/src/DashboardActivityRecords.jsx'),{TemporaryCustomerReviews:Pending}=await vite.ssrLoadModule('/src/TemporaryCustomerIntakes.jsx')
test('empty cards hide; history has accurate title, read-only rows and a close action that preserves pending queue',async()=>{
 for(const language of ['en','ms','zh']){
  const root=createRoot(document.getElementById('root'));let pending=[],calls=[]
  globalThis.fetch=async url=>{calls.push(url);return{ok:true,json:async()=>({items:url.includes('recent-activity')?[]:url.includes('history=true')?[{id:1,name:'Reviewed customer',items:[],status:'one_time',reviewed_by:'KC',review_reason:'Done'}]:pending})}}
  const render=key=>root.render(React.createElement(I18nProvider,{language},React.createElement(React.Fragment,null,React.createElement(Pending,{key}),React.createElement(Activity))))
  try{
   await act(async()=>render('empty'));assert.equal(document.querySelector('.intake-review'),null);assert.equal(document.querySelector('.dashboard-data-tasks'),null)
   await act(async()=>document.querySelector('.dashboard-activity-records button').click());const history=document.querySelector('.intake-review');assert.match(history.textContent,/Reviewed customer/);assert.equal(history.querySelector('form'),null);assert.match(history.querySelector('h2').textContent,language==='zh'?/已审核记录/:language==='en'?/Reviewed/:/disemak/i)
   await act(async()=>document.querySelector('.dashboard-activity-records button').click());assert.equal(document.querySelector('.intake-review'),null)
   pending=[{id:2,name:'New request',items:[],status:'pending',billId:2}];await act(async()=>render('new'));assert.match(document.querySelector('.intake-review').textContent,/New request/);assert.ok(document.querySelector('.intake-review form'));assert.ok(calls.some(u=>u.includes('history=true')))
  }finally{await act(async()=>root.unmount())}
 }
})
