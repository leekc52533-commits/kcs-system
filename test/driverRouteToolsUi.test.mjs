import test,{after} from 'node:test'
import assert from 'node:assert/strict'
import React,{act} from 'react'
import {createServer} from 'vite'
import {JSDOM} from 'jsdom'
import {translate} from '../src/translations.js'
const dom=new JSDOM('<html><body><div id="root"></div></body></html>',{url:'https://localhost/'})
for(const k of ['window','document','Node','NodeFilter','HTMLElement','MutationObserver','Event','MouseEvent','localStorage','sessionStorage'])globalThis[k]=dom.window[k]
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true})
globalThis.IS_REACT_ACT_ENVIRONMENT=true
const {createRoot}=await import('react-dom/client'),vite=await createServer({logLevel:'silent',server:{middlewareMode:true},appType:'custom'})
after(()=>vite.close())
const {default:Tools}=await vite.ssrLoadModule('/src/DriverRouteTools.jsx'),{I18nProvider}=await vite.ssrLoadModule('/src/i18n.jsx')
const stops=[{id:1,status:'locked'},{id:2,status:'locked'}]
for(const language of ['en','ms','zh'])test(`${language}: reorder sends expected order; expired trial hides arrows; request remains pending`,async()=>{
 let calls=[];globalThis.fetch=async(url,options)=>{calls.push([url,JSON.parse(options.body)]);return{ok:true,json:async()=>({ok:true})}}
 const root=createRoot(document.getElementById('root')),render=async(active,stop=stops[1])=>act(async()=>root.render(React.createElement(I18nProvider,{language},React.createElement(Tools,{stop,trip:{executionStatus:'in_progress',stops},route:{date:'2026-09-10',trialOrderEnabled:active},busy:false,run:async(_key,fn)=>fn()}))))
 await render(true)
 let buttons=[...document.querySelectorAll('button')],up=buttons.find(b=>b.textContent===translate(language,'routeTrial.up'))
 assert.ok(up);assert.equal(up.disabled,false)
 await act(async()=>up.dispatchEvent(new MouseEvent('click',{bubbles:true})))
 assert.deepEqual(calls[0],['/api/mobile/stops/2/trial-reorder',{direction:'up',reason:'',expectedOrder:[1,2]}])
 await render(false,{...stops[1],dateRequest:{status:'pending',targetDate:'2026-09-12'}})
 assert.equal(document.querySelectorAll('button').length,0)
 assert.match(document.body.textContent,/2026-09-12/)
 assert.ok(document.body.textContent.includes(translate(language,'routeTrial.pending')))
 for(const key of ['banner','requestDate','approvalHelp','dateReason','expired'])assert.notEqual(translate(language,'routeTrial.'+key),'routeTrial.'+key)
 assert.notEqual(translate(language,'apiError.route_trial_stale'),'apiError.route_trial_stale')
 await act(async()=>root.unmount())
})

for(const language of ['en','ms','zh'])test(`${language}: date reason selection, other required and draft retained on error`,async()=>{
 const calls=[],root=createRoot(document.getElementById('root'));let fail=true
 globalThis.fetch=async(url,options)=>{calls.push(JSON.parse(options.body));return {ok:!fail,status:fail?400:200,json:async()=>fail?{error:'Try again'}:{ok:true}}}
 const set=async(node,value)=>act(async()=>{const proto=node.tagName==='TEXTAREA'?window.HTMLTextAreaElement.prototype:node.tagName==='SELECT'?window.HTMLSelectElement.prototype:window.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(node,value);node.dispatchEvent(new Event(node.tagName==='SELECT'?'change':'input',{bubbles:true}))})
 try{
 await act(async()=>root.render(React.createElement(I18nProvider,{language},React.createElement(Tools,{stop:stops[1],trip:{stops},route:{date:'2026-09-22'},run:async(k,fn)=>{try{await fn()}catch{}}}))))
 await act(async()=>document.querySelector('button').click())
 const submit=()=>[...document.querySelectorAll('button')].find(b=>b.textContent===translate(language,'routeTrial.submit'))
 await set(document.querySelector('input'),'2026-09-23');assert.equal(submit().disabled,true)
 assert.equal(document.querySelectorAll('select option').length,13)
 await set(document.querySelector('select'),'closed');assert.equal(submit().disabled,false)
 await act(async()=>submit().click());assert.ok(document.querySelector('select'));assert.equal(document.querySelector('select').value,'closed')
 assert.equal(calls[0].reason,{ms:'Belum buka / tutup sementara',en:'Shop not open / temporarily closed',zh:'店铺未开／暂时关闭'}[language])
 await set(document.querySelector('select'),'other');assert.equal(submit().disabled,true)
 await set(document.querySelector('textarea'),'  ');assert.equal(submit().disabled,true)
 await set(document.querySelector('textarea'),'Custom explanation');fail=false
 await act(async()=>submit().click());assert.equal(calls[1].reason,'Custom explanation');assert.equal(document.querySelector('select'),null)
 }finally{await act(async()=>root.unmount())}
})
