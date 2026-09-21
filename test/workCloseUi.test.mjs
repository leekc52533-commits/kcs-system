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
const{WorkCloseRequest,WorkCloseApprovals}=await vite.ssrLoadModule('/src/WorkClose.jsx'),{I18nProvider}=await vite.ssrLoadModule('/src/i18n.jsx')
const change=async(n,value)=>act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set.call(n,value);n.dispatchEvent(new Event('input',{bubbles:true}))})
const reply=data=>({ok:true,json:async()=>data})
test('employee submits one snapshot, keeps failed draft, and shows protected customer separately in all languages',async()=>{
 for(const language of ['zh','en','ms']){
 let sent=null,fail=true;const data={tripId:1,tripStatus:'in_progress',version:'v1',request:null,stops:[{id:1,branchCode:'B1',name:'First area',canArrange:true},{id:2,branchCode:'B2',name:'Cash customer',issue:'proof',canArrange:false}]}
 globalThis.fetch=async(url,options={})=>{if(options.method==='POST'){sent=JSON.parse(options.body);return fail?{ok:false,status:409,headers:{get:()=>''},json:async()=>({code:'WORK_CLOSE_STALE'})}:reply({status:'pending'})}return reply(data)}
 const root=createRoot(document.getElementById('root'))
 try{
 await act(async()=>root.render(React.createElement(I18nProvider,{language},React.createElement(WorkCloseRequest,{tripId:1}))));
 const details=document.querySelector('details');await act(async()=>{details.open=true;details.dispatchEvent(new Event('toggle'))})
 assert.match(document.body.textContent,/First area/);assert.match(document.body.textContent,/Cash customer/)
 const input=document.querySelector('textarea');await change(input,'Staff shortage')
 await act(async()=>document.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})))
 assert.deepEqual(sent,{reason:'Staff shortage',version:'v1'});assert.equal(input.value,'Staff shortage');assert.ok(document.querySelector('[role="alert"]'))
 fail=false;data.request={status:'pending'}
 await act(async()=>document.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})))
 assert.equal(document.querySelector('form'),null);assert.ok(document.querySelector('[role="status"]'))
 }finally{await act(async()=>root.unmount())}
 }
})
test('supervisor cannot approve protected records; reschedule and transfer choices are available for untouched customers',async()=>{
 const data={items:[{id:1,tripId:1,date:'2026-09-21',driverName:'Driver',plate:'CAR1',reason:'Short staffed',version:'v1',stops:[{id:1,branchCode:'B1',name:'Protected',issue:'proof',canArrange:false},{id:2,branchCode:'B2',name:'Untouched',routeNumber:1,canArrange:true}]}],targets:[{tripId:2,plate:'CAR2',driverName:'Other'}]}
 globalThis.fetch=async url=>reply(url.includes('/options')?{routes:[{routeNumber:1,name:'Route A'}]}:data)
 const root=createRoot(document.getElementById('root'))
 try{
 await act(async()=>root.render(React.createElement(I18nProvider,{language:'zh'},React.createElement(WorkCloseApprovals))))
 await change(document.querySelector('textarea'),'Arranged')
 const buttons=[...document.querySelectorAll('button')];assert.equal(buttons.find(b=>b.textContent==='安排客户并批准结束').disabled,true)
 assert.ok([...document.querySelectorAll('option')].some(n=>n.textContent==='转给其他车辆'))
 assert.match(document.body.textContent,/缺现金付款凭证/)
 }finally{await act(async()=>root.unmount())}
})

test('failed initial read stops loading; preview retry reads records without a submission form',async()=>{
 const {setPreviewEmployee}=await vite.ssrLoadModule('/src/apiClient.js');setPreviewEmployee(2)
 const {PreviewGuard}=await vite.ssrLoadModule('/src/EmployeePreview.jsx')
 let failed=true,reads=0
 globalThis.fetch=async url=>{reads++;assert.match(url,/acting-collector\/preview\/2\/read/);return failed?{ok:false,status:403,headers:{get:()=>''},json:async()=>({code:'PREVIEW_READ_ONLY'})}:reply({tripId:1,tripStatus:'in_progress',version:'v1',request:null,stops:[{id:1,branchCode:'B1',name:'Pending customer',canArrange:true}]})}
 const root=createRoot(document.getElementById('root'))
 try{
 await act(async()=>root.render(React.createElement(I18nProvider,{language:'zh'},React.createElement(PreviewGuard,null,React.createElement(WorkCloseRequest,{tripId:1})))));
 const panel=document.querySelector('details');await act(async()=>{panel.open=true;panel.dispatchEvent(new Event('toggle'))})
 assert.ok(document.querySelector('[role="alert"]'));assert.doesNotMatch(document.body.textContent,/正在读取/)
 failed=false;await act(async()=>document.querySelector('button').click())
 assert.equal(reads,2);assert.match(document.body.textContent,/Pending customer/);assert.equal(document.querySelector('form'),null);assert.equal(document.querySelector('[role="alert"]'),null)
 }finally{await act(async()=>root.unmount());setPreviewEmployee(null)}
})
