import test,{after} from 'node:test'
import assert from 'node:assert/strict'
import React,{act} from 'react'
import {createServer} from 'vite'
import {JSDOM} from 'jsdom'
const dom=new JSDOM('<html><body><div id="root"></div></body></html>',{url:'https://localhost/?mobileSimulation=1'})
for(const k of ['window','document','Node','NodeFilter','HTMLElement','MutationObserver','Event','MouseEvent','localStorage','sessionStorage','XMLHttpRequest'])globalThis[k]=dom.window[k]
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true
const{createRoot}=await import('react-dom/client'),vite=await createServer({logLevel:'silent',server:{middlewareMode:true},appType:'custom'})
after(()=>vite.close())
const{default:Simulation}=await vite.ssrLoadModule('/src/MobileSimulation.jsx'),api=await vite.ssrLoadModule('/src/apiClient.js')
const click=async text=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.includes(text)&&!b.disabled);assert.ok(b,'Button missing: '+text);await act(async()=>b.click())}
test('real screens: reorder/check/approve/arrive/bill/complete/reset without live writes, GPS, storage or print',async()=>{
 const calls=[];globalThis.fetch=window.fetch=async(url,options)=>{calls.push([url,options]);return{ok:true,json:async()=>({allowed:true,date:'2026-10-05'})}}
 let gps=0,printed=0;navigator.geolocation={getCurrentPosition(){gps++}};window.print=()=>printed++
 sessionStorage.setItem('kcs-bill-draft:1','{"items":[{"productId":1,"quantity":999}]}');sessionStorage.setItem('kcs-mobile-open-stop','777');const before={...sessionStorage}
 const root=createRoot(document.getElementById('root'));await act(async()=>root.render(React.createElement(Simulation)))
 assert.match(document.body.textContent,/不保存正式记录/);assert.match(document.body.textContent,/已检查，提交主管/)
 await click('下移');assert.match(document.querySelector('[data-mobile-stop]').textContent,/TEST Branch 2/)
 await click('已检查，提交主管');await click('模拟主管批准');
 let button=[...document.querySelectorAll('button')].find(b=>b.className==='primary-mobile'&&!b.disabled);assert.ok(button);await act(async()=>button.click())
 button=[...document.querySelectorAll('button')].find(b=>b.className==='primary-mobile'&&!b.disabled);await act(async()=>button.click())
 const input=document.querySelector('.bill-item input');assert.ok(input);assert.notEqual(input.value,'999')
 await act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(input,'100');input.dispatchEvent(new Event('input',{bubbles:true}))})
 button=document.querySelector('.purchase-bill-panel button.primary-mobile');assert.equal(button.disabled,false);await act(async()=>button.click())
 assert.match(document.body.textContent,/TEST-0001/);assert.match(document.body.textContent,/RM 20.00/)
 assert.equal(document.querySelector('.purchase-bill-panel button.secondary-mobile').disabled,true)
 await act(async()=>document.querySelector('.next-customer').click())
 assert.equal(gps,0);assert.equal(printed,0);assert.deepEqual({...sessionStorage},before)
 await assert.rejects(()=>api.apiRequest('/api/sales',{method:'POST',body:'{}'}));assert.equal(calls.length,1)
 await assert.rejects(()=>window.fetch('/api/mobile/stops/999/arrive',{method:'POST'}))
 assert.throws(()=>new XMLHttpRequest().open('POST','/api/sales'))
 await click('重置测试');assert.match(document.body.textContent,/已检查，提交主管/);assert.ok(!document.body.textContent.includes('TEST-0001'))
 for(const [lang,text] of [['ms','Ujian simulasi'],['en','Simulation · No live records saved']]){const select=document.querySelector('.language-selector select');await act(async()=>{select.value=lang;select.dispatchEvent(new Event('change',{bubbles:true}))});assert.ok(document.body.textContent.includes(text))}
 await act(async()=>root.unmount());await assert.rejects(()=>api.apiRequest('/api/sales',{method:'POST'}));assert.equal(calls.length,1)
})
test('failed manager authorization never mounts interactive simulation',async()=>{
 globalThis.fetch=window.fetch=async()=>({ok:false,json:async()=>({})});const root=createRoot(document.getElementById('root'))
 await act(async()=>root.render(React.createElement(Simulation)));assert.ok(!document.querySelector('.driver-route'));assert.match(document.body.textContent,/主管以上/);await act(async()=>root.unmount())
})
