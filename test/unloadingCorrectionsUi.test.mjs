import test,{after} from 'node:test'
import assert from 'node:assert/strict'
import React,{act,useState} from 'react'
import {createServer} from 'vite'
import {JSDOM} from 'jsdom'
const dom=new JSDOM('<html><body><div id="root"></div></body></html>',{url:'https://localhost/'})
for(const k of ['window','document','Node','NodeFilter','HTMLElement','MutationObserver','Event','MouseEvent','localStorage','sessionStorage','FileReader'])globalThis[k]=dom.window[k]
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true
const{createRoot}=await import('react-dom/client'),vite=await createServer({logLevel:'silent',server:{middlewareMode:true},appType:'custom'})
after(()=>vite.close())

const{default:Center}=await vite.ssrLoadModule('/src/UnloadingCorrections.jsx'),{I18nProvider}=await vite.ssrLoadModule('/src/i18n.jsx')
const{unloadingCorrectionWords}=await vite.ssrLoadModule('/shared/unloadingCorrectionWords.js')
const click=async n=>act(async()=>n.dispatchEvent(new MouseEvent('click',{bubbles:true})))
const change=async(n,value)=>act(async()=>{Object.getOwnPropertyDescriptor(n.tagName==='TEXTAREA'?window.HTMLTextAreaElement.prototype:window.HTMLInputElement.prototype,'value').set.call(n,value);n.dispatchEvent(new Event('input',{bubbles:true}))})
test('three-language central correction sends reason and revision, never exposes approval to office',async()=>{
 for(const language of ['en','ms','zh']){
 const w=unloadingCorrectionWords[language],posts=[],values={weighedAt:'2026-09-03T10:00:00+08:00',tripNumber:1,vehicleCode:'V1',registrationNumber:'QAA4293N',driverName:'Driver One',crew:null,locationName:'Factory',address:null,estimatedWeightKg:null,grossWeightKg:null,tareWeightKg:null,confirmedWeightKg:1500}
 const data={item:{id:1,code:'UL-20260903-000001',values,revision:'snapshot-token',history:[]},vehicles:[{vehicleCode:'V1',registrationNumber:'QAA4293N'}],employees:[{name:'Driver One',isDriver:true}],locations:[{name:'Factory'}],requests:[],canApprove:false}
 globalThis.fetch=async(url,opts={})=>{if(opts.method==='POST')posts.push(JSON.parse(opts.body));return{ok:true,json:async()=>data}}
 const root=createRoot(document.getElementById('root'))
 try{
 await act(async()=>root.render(React.createElement(I18nProvider,{language},React.createElement(Center,{initialCode:data.item.code,onClose(){},onSaved(){}}))))
 await click([...document.querySelectorAll('button')].find(b=>b.textContent===w.edit))
 const weight=[...document.querySelectorAll('label')].find(l=>l.textContent.includes(w.confirmedWeightKg)).querySelector('input')
 await change(weight,'150');await change(document.querySelector('textarea'),'Wrong weight entered')
 assert.equal(posts.length,0);assert.ok(![...document.querySelectorAll('button')].some(b=>b.textContent===w.approve))
 await act(async()=>document.querySelector('.unloading-correction-body form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})))
 assert.equal(posts.length,1);assert.equal(posts[0].revision,'snapshot-token');assert.equal(posts[0].reason,'Wrong weight entered');assert.equal(posts[0].values.confirmedWeightKg,'150')
 }finally{await act(async()=>root.unmount())}
 }
})
