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
const{DriverPlanHeader,DriverPlanOrder,DriverCheckStatus,driverPlanWords}=await vite.ssrLoadModule('/src/DriverPlanControls.jsx'),{I18nProvider}=await vite.ssrLoadModule('/src/i18n.jsx'),{setPreviewEmployee}=await vite.ssrLoadModule('/src/apiClient.js')
for(const language of ['zh','ms','en'])test(`${language}: unchanged submission, reorder, checked time, crew and readonly preview`,async()=>{
 const calls=[];globalThis.fetch=async(url,options)=>{calls.push([url,JSON.parse(options.body)]);return{ok:true,json:async()=>({ok:true})}}
 const root=createRoot(document.getElementById('root')),p={tripId:5,tripNumber:1,driverName:'ALDY',signature:'current',checked:false},trip={id:5,canPlan:true,driverPlan:p,stops:[{id:11},{id:12}]},run=async(_key,fn)=>fn(),w=driverPlanWords(language)
 const render=async(t=trip)=>act(async()=>root.render(React.createElement(I18nProvider,{language},React.createElement(React.Fragment,null,React.createElement(DriverPlanHeader,{trip:t,busy:false,run}),React.createElement(DriverPlanOrder,{trip:t,stop:t.stops[1],busy:false,run})))))
 await render();const find=text=>[...document.querySelectorAll('button')].find(b=>b.textContent===text)
 await act(async()=>find(w.submit).click());assert.deepEqual(calls[0],['/api/mobile/trips/5/tomorrow-plan/check',{expectedSignature:'current'}])
 await act(async()=>find(w.up).click());assert.deepEqual(calls[1],['/api/mobile/trips/5/tomorrow-plan/order',{stopId:12,direction:'up',expectedSignature:'current'}]);assert.equal(find(w.down).disabled,true)
 await render({...trip,driverPlan:{...p,checked:true,checkedAt:'2026-10-07 02:05:00'}});assert.ok(document.body.textContent.includes('07-Oct-26 10:05'));assert.equal(find('✓ '+w.checked).disabled,true)
 await render({...trip,canPlan:false});assert.equal(document.querySelectorAll('button').length,0)
 setPreviewEmployee(1);await render();assert.equal(document.querySelectorAll('button').length,0);setPreviewEmployee(null)
 await act(async()=>root.render(React.createElement(I18nProvider,{language},React.createElement(DriverCheckStatus,{items:[{...p,checked:true,checkedAt:'2026-10-07 02:05:00'}]}))));assert.ok(document.body.textContent.includes(w.checked));assert.ok(document.body.textContent.includes('ALDY'))
 await act(async()=>root.unmount())
})
