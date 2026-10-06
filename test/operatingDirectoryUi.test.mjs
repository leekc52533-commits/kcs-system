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
const{I18nProvider}=await vite.ssrLoadModule('/src/i18n.jsx'),{default:Review}=await vite.ssrLoadModule('/src/BranchLifecycleReviewPage.jsx'),{CustomerManager}=await vite.ssrLoadModule('/src/MasterDataPage.jsx')
test('normal customer list requests active scope; review keeps inactive customer detail and return inside the review',async()=>{
 const calls=[],customer={customerId:'10002',customerName:'PAUSED TEST CUSTOMER',status:'paused',branches:[],materialPricing:[]}
 globalThis.fetch=async(url,options={})=>{
  calls.push({url:String(url),method:options.method||'GET'})
  const payload=String(url)==='/api/customers/10002'?customer:String(url).startsWith('/api/customers?')?{items:[customer]}:{items:[],counts:{}}
  return{ok:true,headers:new Headers(),json:async()=>payload}
 }
 const actor={canManageMaster:true},noop=()=>{},root=createRoot(document.getElementById('root'))
 await act(async()=>root.render(React.createElement(I18nProvider,{language:'en'},React.createElement(CustomerManager,{actor,notify:noop,fail:noop}))))
 await act(async()=>new Promise(r=>setTimeout(r,230)))
 assert.ok(calls.some(c=>c.url.includes('/api/customers?operating=active')))
 await act(async()=>root.render(React.createElement(I18nProvider,{language:'en'},React.createElement(Review,{currentUser:{systemRole:'supervisor',name:'MANAGER'}}))))
 await act(async()=>new Promise(r=>setTimeout(r,230)))
 assert.ok(calls.some(c=>c.url.includes('/api/customers?operating=inactive')))
 assert.ok(document.body.textContent.includes('Non-operating customers'))
 await act(async()=>document.querySelector('.customer-master-table .entity-name-link').click())
 assert.ok(document.querySelector('.customer-detail'))
 assert.equal(window.location.search,'')
 assert.ok(calls.some(c=>c.url.startsWith('/api/master/branches?customerId=10002')))
 await act(async()=>document.querySelector('.customer-detail>button').click())
 assert.ok(document.querySelector('.customer-master-table'));assert.equal(calls.some(c=>c.method!=='GET'),false)
 window.scrollTo=()=>{};await act(async()=>root.unmount())
})
