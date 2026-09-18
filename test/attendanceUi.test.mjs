import test,{after} from 'node:test'
import assert from 'node:assert/strict'
import React,{act} from 'react'
import {createServer} from 'vite'
import {JSDOM} from 'jsdom'
const dom=new JSDOM('<html><body><div id="root"></div></body></html>',{url:'https://localhost/'})
for(const k of ['window','document','Node','NodeFilter','HTMLElement','MutationObserver','Event','MouseEvent','localStorage','sessionStorage'])globalThis[k]=dom.window[k]
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true
const{createRoot}=await import('react-dom/client'),vite=await createServer({logLevel:'silent',server:{middlewareMode:true},appType:'custom'});after(()=>vite.close())
const{I18nProvider}=await vite.ssrLoadModule('/src/i18n.jsx'),{AttendanceGate,attendanceWords}=await vite.ssrLoadModule('/src/Attendance.jsx')
const client=await vite.ssrLoadModule('/src/apiClient.js')
test('first entry waits for explicit GPS click; outside/error stays gated; server success enters; next day gates again in all languages',async()=>{
 for(const language of ['zh','en','ms']){
  const root=createRoot(document.getElementById('root'));let geo=0,posts=0,outside=true,record=null,date='2026-09-18'
  navigator.geolocation={getCurrentPosition:ok=>{geo++;ok({coords:{latitude:1.5,longitude:110.3,accuracy:10},timestamp:Date.now()})}}
  globalThis.fetch=async(url,options={})=>{assert.equal(url,'/api/mobile/attendance');if(options.method==='POST'){posts++;const p=JSON.parse(options.body);assert.equal(p.accuracyM,10);assert.equal(p.employeeId,undefined);if(outside)return{ok:false,json:async()=>({code:'ATTENDANCE_OUTSIDE'}),headers:{get:()=>''}};record={id:1}}return{ok:true,json:async()=>({configured:true,mode:'company',record,date})}}
  try{
   await act(async()=>root.render(React.createElement(I18nProvider,{language},React.createElement(AttendanceGate,{account:{employeeId:2,role:'driver'}},React.createElement('div',{id:'homepage'},'Home')))))
   assert.equal(geo,0);assert.equal(document.querySelector('#homepage'),null)
   await act(async()=>document.querySelector('.attendance-clock').click())
   assert.equal(geo,1);assert.equal(posts,1);assert.equal(document.querySelector('#homepage'),null);assert.equal(document.querySelector('[role=alert]').textContent,attendanceWords[language].ATTENDANCE_OUTSIDE)
   outside=false;await act(async()=>document.querySelector('.attendance-clock').click());assert.ok(document.querySelector('#homepage'))
   await act(async()=>window.dispatchEvent(new Event('focus')));assert.equal(geo,2);assert.ok(document.querySelector('#homepage'))
   date='2026-09-19';record=null;await act(async()=>window.dispatchEvent(new Event('focus')));assert.equal(document.querySelector('#homepage'),null);assert.equal(geo,2)
  }finally{await act(async()=>root.unmount())}
 }
})
test('read-only preview never requests or performs attendance',async()=>{
 const root=createRoot(document.getElementById('root'));client.setPreviewEmployee(2);globalThis.fetch=async()=>{throw Error('Must not fetch')};try{
 await act(async()=>root.render(React.createElement(I18nProvider,{language:'zh'},React.createElement(AttendanceGate,{account:{employeeId:2,role:'crew'}},React.createElement('div',{id:'homepage'},'Preview')))))
 assert.ok(document.querySelector('#homepage'));assert.equal(document.querySelector('.attendance-clock'),null)
 }finally{client.setPreviewEmployee(null);await act(async()=>root.unmount())}
})
test('employee setup saves explicit company site/radius then home without changing historical records',async()=>{
 const{AttendanceSettings}=await vite.ssrLoadModule('/src/Attendance.jsx'),root=createRoot(document.getElementById('root'));let saved=null
 globalThis.fetch=async(url,options={})=>{assert.equal(url,'/api/attendance/employees/2');if(options.method==='PATCH')saved=JSON.parse(options.body);return{ok:true,json:async()=>({employeeId:2,mode:saved?.mode||'company',locationId:saved?.locationId||null,radiusM:saved?.radiusM||200,revision:saved?1:0,locations:[{id:1,name:'Company A'}],records:[]})}}
 try{
 await act(async()=>root.render(React.createElement(I18nProvider,{language:'zh'},React.createElement(AttendanceSettings,{employeeId:2}))))
 const change=async(el,value)=>act(async()=>{el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}))})
 await change(document.querySelector('select'),'company')
 assert.equal(document.querySelector('input[type=number]').value,'200')
 assert.equal(document.querySelectorAll('select').length,1);assert.ok(document.body.textContent.includes('Company A'))
 await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='保存打卡设置').click())
 assert.deepEqual(saved,{mode:'company',locationId:1,radiusM:200,revision:0})
 await change(document.querySelector('select'),'home');assert.equal(document.querySelectorAll('select').length,1)
 await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='保存打卡设置').click())
 assert.equal(saved.mode,'home');assert.equal(saved.revision,1)
 }finally{await act(async()=>root.unmount())}
})
