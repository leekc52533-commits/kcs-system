import test,{after} from 'node:test'
import assert from 'node:assert/strict'
import React,{act} from 'react'
import {createServer} from 'vite'
import {JSDOM} from 'jsdom'
const dom=new JSDOM('<html><body><div id="root"></div></body></html>',{url:'https://localhost/'})
for(const k of ['window','document','Node','NodeFilter','HTMLElement','MutationObserver','Event','MouseEvent','localStorage','sessionStorage'])globalThis[k]=dom.window[k]
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true
const{createRoot}=await import('react-dom/client'),vite=await createServer({logLevel:'silent',server:{middlewareMode:true},appType:'custom'});after(()=>vite.close())
const{I18nProvider}=await vite.ssrLoadModule('/src/i18n.jsx'),{default:Page,CargoUnloadFields,cargoWords:words}=await vite.ssrLoadModule('/src/CargoBatches.jsx')
const batch={id:1,code:'H260918-000001',vehicleId:1,plate:'AAA111',collectionDate:'2026-09-18',driverName:'Driver A',status:'active',members:[{employeeId:1,name:'Driver A',role:'driver'}],unloads:[]}
test('attendant checks the code before self-confirmation; saved membership visible in each language',async()=>{for(const language of ['zh','en','ms']){const root=createRoot(document.getElementById('root')),w=words[language],calls=[];let joined=false;globalThis.fetch=async(url,options={})=>{calls.push([url,options]);if(url.endsWith('/join'))joined=true;const b={...batch,members:joined?[...batch.members,{employeeId:2,name:'Crew B',role:'crew'}]:batch.members};return{ok:true,json:async()=>url.includes('/lookup')||url.endsWith('/join')?b:{items:joined?[b]:[],trips:[],notifications:[]}}};try{await act(async()=>root.render(React.createElement(I18nProvider,{language},React.createElement(Page,{account:{role:'crew',employeeId:2}}))));assert.equal([...document.querySelectorAll('button')].some(b=>b.textContent===w.join),false);const input=document.querySelector('input');await act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(input,batch.code);input.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))});assert.match(document.body.textContent,/AAA111/);await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent===w.join).click());assert.match(document.body.textContent,/Crew B/);assert.equal(JSON.parse(calls.find(([u])=>u.endsWith('/join'))[1].body).code,batch.code)}finally{await act(async()=>root.unmount())}}})
test('unloading selector excludes prepared and other-vehicle batches; closed selection becomes supplement',async()=>{const root=createRoot(document.getElementById('root'));let value={batchId:'',unloadMode:'',ticketNumber:''};const items=[batch,{...batch,id:2,status:'prepared'},{...batch,id:3,vehicleId:2},{...batch,id:4,status:'closed'}];const render=()=>root.render(React.createElement(I18nProvider,{language:'zh'},React.createElement(CargoUnloadFields,{items,vehicleId:1,value,onChange:v=>{value=v;render()}})));try{await act(async()=>render());const select=document.querySelector('select');assert.deepEqual([...select.options].map(o=>o.value),['','1','4']);await act(async()=>{select.value='4';select.dispatchEvent(new Event('change',{bubbles:true}))});assert.equal(value.unloadMode,'supplement');assert.deepEqual([...document.querySelectorAll('select')[1].options].map(o=>o.value),['','supplement'])}finally{await act(async()=>root.unmount())}})

test('suffix entry assembles the selected date and padding; code is highlighted separately from plate',async()=>{
 for(const language of ['zh','en','ms']){
  const root=createRoot(document.getElementById('root')),calls=[]
  globalThis.fetch=async url=>{calls.push(url);const code=new URL(url,'https://localhost').searchParams.get('code');return{ok:true,json:async()=>url.includes('/lookup')?{...batch,code}:{items:[],trips:[],notifications:[]}}}
  const change=async(input,value)=>act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}))})
  try{
   await act(async()=>root.render(React.createElement(I18nProvider,{language},React.createElement(Page,{account:{role:'crew',employeeId:2}}))))
   await change(document.querySelector('input[type=date]'),'2026-09-18')
   assert.equal(document.querySelector('.cargo-code-entry .cargo-code').textContent,'H260918-0')
   for(const [tail,expected] of [['36','H260918-036'],['6','H260918-006'],['123','H260918-123'],['1000','H260918-1000']]){
    await change(document.querySelector('.cargo-code-input'),tail)
    assert.equal(document.querySelector('.cargo-card'),null)
    await act(async()=>document.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})))
    assert.equal(new URL(calls.findLast(u=>u.includes('/lookup')),'https://localhost').searchParams.get('code'),expected)
    assert.equal(document.querySelector('.cargo-card .cargo-code').textContent,expected)
    assert.ok(!document.querySelector('.cargo-card .cargo-code').textContent.includes('AAA111'))
   }
   await change(document.querySelector('input[type=date]'),'2026-09-17')
   await change(document.querySelector('.cargo-code-input'),'36')
   await act(async()=>document.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})))
   assert.equal(document.querySelector('.cargo-card .cargo-code').textContent,'H260917-036')
  }finally{await act(async()=>root.unmount())}
 }
})
