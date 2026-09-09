import test,{after} from 'node:test'
import assert from 'node:assert/strict'
import React,{act} from 'react'
import {createServer} from 'vite'
import {JSDOM} from 'jsdom'
const dom=new JSDOM('<html><body><div id="root"></div></body></html>',{url:'https://localhost/?page=operations&tab=weekly'})
for(const k of ['window','document','Node','NodeFilter','HTMLElement','MutationObserver','Event','MouseEvent','localStorage','sessionStorage'])globalThis[k]=dom.window[k]
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true})
globalThis.IS_REACT_ACT_ENVIRONMENT=true
let restored,calls=[]
window.scrollTo=(x,y)=>{restored=[x,y]}
Object.defineProperty(window,'scrollY',{value:650})
globalThis.fetch=async(url,options={})=>{calls.push([url,options.method||'GET']);return{ok:true,json:async()=>String(url).includes('/api/master/branches/')?{branchId:'10103',customerId:'10040',branchName:'DOREMART MJC',lifecycleStatus:'ACTIVE',assignedWeekdays:[],materials:[] }:{items:[]}}}
const {createRoot}=await import('react-dom/client')
const vite=await createServer({logLevel:'silent',server:{middlewareMode:true},appType:'custom'})
after(()=>vite.close())
const {default:List}=await vite.ssrLoadModule('/src/RouteCustomerList.jsx'),{I18nProvider}=await vite.ssrLoadModule('/src/i18n.jsx')
for(const action of ['Cancel','Back'])test(`dispatch master ${action} retains the original expanded card and URL`,async()=>{
 calls=[];const root=createRoot(document.getElementById('root'))
 await act(async()=>root.render(React.createElement(I18nProvider,null,React.createElement(List,{day:{id:1,dispatch_date:'2026-09-10',status:'draft'},route:{routeNumber:2,stops:[{id:6,branchId:'10103',branchName:'DOREMART MJC'}]},days:[],canEdit:false}))))
 const click=async node=>{assert.ok(node);await act(async()=>node.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true})))}
 await click(document.querySelector('.route-customer-name'))
 const card=document.querySelector('.route-customer-detail'),link=card.querySelector('a[href^="?page=customers"]')
 link.focus();await click(link)
 assert.ok(document.querySelector('.branch-editor-form'));assert.equal(document.body.style.overflow,'hidden')
 const close=action==='Back'?document.querySelector('.branch-editor-form .back-button'):[...document.querySelectorAll('.branch-editor-form button')].find(b=>/cancel/i.test(b.textContent))
 await click(close)
 assert.equal(document.querySelector('.master-modal'),null)
 assert.equal(document.querySelector('.route-customer-detail'),card)
 assert.equal(window.location.search,'?page=operations&tab=weekly')
 assert.deepEqual(restored,[0,650]);assert.equal(document.activeElement,link)
 assert.equal(calls.some(([,method])=>method!=='GET'),false)
 await act(async()=>root.unmount())
})
