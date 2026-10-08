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
   assert.equal(geo,1);assert.equal(posts,1);assert.equal(document.querySelector('#homepage'),null);assert.equal(document.querySelector('[role=alertdialog] .kcs-notice-body').textContent,attendanceWords[language].ATTENDANCE_OUTSIDE)
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

test('exempt employee enters without GPS and returns to clock-in after exemption is removed',async()=>{
 const root=createRoot(document.getElementById('root'));let exempt=true,geo=0
 navigator.geolocation={getCurrentPosition:()=>{geo++}}
 globalThis.fetch=async()=>({ok:true,json:async()=>({configured:true,exempt,mode:exempt?'none':'company',record:null,date:'2026-10-08'})})
 try{
 await act(async()=>root.render(React.createElement(I18nProvider,{language:'zh'},React.createElement(AttendanceGate,{account:{employeeId:2,role:'driver'}},React.createElement('div',{id:'homepage'},'Home')))))
 assert.ok(document.querySelector('#homepage'));assert.equal(document.querySelector('.attendance-clock'),null);assert.equal(geo,0)
 exempt=false;await act(async()=>window.dispatchEvent(new Event('focus')))
 assert.equal(document.querySelector('#homepage'),null);assert.ok(document.querySelector('.attendance-clock'));assert.equal(geo,0)
 }finally{await act(async()=>root.unmount())}
})
test('only owner capability offers exemption; other managers cannot cancel existing exemption',async()=>{
 const{AttendanceSettings}=await vite.ssrLoadModule('/src/Attendance.jsx')
 for(const [canSetExemption,mode] of [[true,'company'],[false,'company'],[false,'none']]){
 const root=createRoot(document.getElementById('root'))
 globalThis.fetch=async()=>({ok:true,json:async()=>({mode,canSetExemption,locationId:1,radiusM:200,revision:0,locations:[{id:1,name:'Company'}],records:[]})})
 try{
 await act(async()=>root.render(React.createElement(I18nProvider,{language:'zh'},React.createElement(AttendanceSettings,{employeeId:2}))))
 assert.equal(Boolean(document.querySelector('option[value=none]')),canSetExemption||mode==='none')
 assert.equal(document.querySelector('fieldset').disabled,mode==='none'&&!canSetExemption)
 }finally{await act(async()=>root.unmount())}
 }
})

test('attendance columns hide, reorder, persist and render automatic status',async()=>{
 const{AttendanceDaily}=await vite.ssrLoadModule('/src/Attendance.jsx'),{kuchingDate}=await vite.ssrLoadModule('/shared/kuchingTime.js')
 localStorage.removeItem('kcs.attendance-columns.v1')
 globalThis.fetch=async()=>({ok:true,json:async()=>({date:kuchingDate(),items:[{employeeId:2,name:'Driver A',work_date:kuchingDate(),mode:'company',clocked_at:null,attendanceStatus:'leave'}]})})
 let root=createRoot(document.getElementById('root'))
 const render=()=>act(async()=>root.render(React.createElement(I18nProvider,{language:'zh'},React.createElement(AttendanceDaily))))
 try{
 await render();assert.ok(document.querySelector('tbody').textContent.includes('请假'))
 await act(async()=>document.querySelector('.attendance-edit-columns').click())
 const rows=[...document.querySelectorAll('.expense-column-row')]
 await act(async()=>rows.find(r=>r.textContent.includes('GPS')).querySelector('input').click())
 await act(async()=>document.querySelector('[aria-label="上移: 考勤状态"]').click())
 await act(async()=>document.querySelector('.expense-column-modal form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})))
 let labels=[...document.querySelectorAll('thead th')].map(n=>n.textContent)
 assert.equal(labels.some(v=>v.includes('GPS')),false)
 assert.ok(labels.findIndex(v=>v.includes('考勤状态'))<labels.findIndex(v=>v.includes('打卡时间')))
 await act(async()=>root.unmount());root=createRoot(document.getElementById('root'));await render()
 labels=[...document.querySelectorAll('thead th')].map(n=>n.textContent)
 assert.equal(labels.some(v=>v.includes('GPS')),false)
 assert.ok(document.querySelector('tbody').textContent.includes('请假'))
 }finally{await act(async()=>root.unmount());localStorage.removeItem('kcs.attendance-columns.v1')}
})
