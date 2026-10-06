import test,{after} from 'node:test'
import assert from 'node:assert/strict'
import React,{act} from 'react'
import {createServer} from 'vite'
import {JSDOM} from 'jsdom'
const dom=new JSDOM('<html><body><div id="root"></div></body></html>',{url:'https://localhost/?mobileSimulation=1'})
for(const k of ['window','document','Node','NodeFilter','HTMLElement','MutationObserver','Event','MouseEvent','localStorage','sessionStorage','XMLHttpRequest','FileReader','Blob','File'])globalThis[k]=dom.window[k]
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
test('training phone navigation and new customer form use simulated GPS without storage or network writes',async()=>{
 const calls=[];globalThis.fetch=window.fetch=async(url,options)=>{calls.push([url,options]);return{ok:true,json:async()=>({allowed:true,date:'2026-10-06'})}}
 let gps=0;navigator.geolocation={getCurrentPosition(){gps++},watchPosition(){gps++}}
 const before={...sessionStorage},root=createRoot(document.getElementById('root'))
 await act(async()=>root.render(React.createElement(Simulation)))
 await click('已检查，提交主管');await click('模拟主管批准')
 await act(async()=>document.querySelector('.simulation-phone .primary-mobile').click())
 assert.ok(document.querySelector('.driver-route-tools'))
 await act(async()=>document.querySelector('.no-goods-action button').click())
 const ngReason=document.querySelector('.no-goods-action textarea')
 await act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set.call(ngReason,'TEST no goods');ngReason.dispatchEvent(new Event('input',{bubbles:true}))})
 await click('模拟照片')
 await act(async()=>{document.querySelector('.no-goods-action form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,50))})
 assert.ok(document.querySelector('.simulation-reviews button'))
 await act(async()=>document.querySelector('.simulation-reviews button').click())

 const nav=async index=>act(async()=>document.querySelectorAll('.simulation-phone>nav button')[index].click())
 await nav(1);assert.ok(document.querySelector('.weight-capture'))
 await act(async()=>document.querySelector('.weight-capture button').click())
 await click('模拟照片')
 const readButton=document.querySelector('.weight-capture button.primary-mobile')
 await act(async()=>{readButton.click();await new Promise(r=>setTimeout(r,50))});assert.ok(document.querySelector('.weight-review'))
 const ticket=document.querySelector('.cargo-unload-fields input'),mode=document.querySelectorAll('.cargo-unload-fields select')[1]
 await act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(ticket,'TEST-TN');ticket.dispatchEvent(new Event('input',{bubbles:true}))})
 await act(async()=>{mode.value='full';mode.dispatchEvent(new Event('change',{bubbles:true}))})
 await act(async()=>document.querySelector('.weight-review .primary-mobile').click());assert.ok(document.querySelector('.weight-recent'))

 await nav(3);assert.match(document.body.textContent,/TEST DRIVER/);assert.ok(document.querySelector('.earnings-page'))
 await nav(2);await click('临时客户')
 const name=document.querySelector('input[autocomplete=off]')
 await act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(name,'TEST NEW SHOP');name.dispatchEvent(new Event('input',{bubbles:true}))})
 await act(()=>new Promise(r=>setTimeout(r,300)))
 await act(async()=>document.querySelector('.pickup-search [role=group] button:nth-child(2)').click())
 await act(async()=>document.querySelector('.pickup-new-check input').click())
 const{translate}=await vite.ssrLoadModule('/src/translations.js')
 await click(translate('zh','intake.capture'))
 assert.ok(document.querySelector('.simulation-map'))
 await act(async()=>document.querySelector('.temporary-intakes form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})))
 assert.ok(document.querySelector('.purchase-bill-panel'));assert.equal(gps,0);assert.deepEqual({...sessionStorage},before);assert.equal(calls.length,1)
 await click('重置测试');assert.equal(document.querySelector('.temporary-intakes'),null);assert.equal(calls.length,1)
 await act(async()=>root.unmount())
})

test('shared live router exposes every More page, cargo history and sandboxed GPS/receipts',async()=>{
 Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true})
 const calls=[];globalThis.fetch=window.fetch=async url=>{calls.push(url);return{ok:true,json:async()=>({allowed:true,date:'2026-10-06'})}}
 let gps=0;navigator.geolocation={getCurrentPosition(){gps++},watchPosition(){gps++}}
 const stored={local:{...localStorage},session:{...sessionStorage}},root=createRoot(document.getElementById('root'))
 const nav=async index=>act(async()=>document.querySelectorAll('.simulation-phone>nav button')[index].click())
 const input=async(el,value)=>act(async()=>{Object.getOwnPropertyDescriptor(window[el.tagName==='TEXTAREA'?'HTMLTextAreaElement':'HTMLInputElement'].prototype,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}))})
 try{
  await act(async()=>root.render(React.createElement(Simulation)))
  const{translate}=await vite.ssrLoadModule('/src/translations.js')
  await nav(2);assert.equal(document.querySelectorAll('.mobile-more>button').length,6)
  await click(translate('zh','guide.title'));assert.ok(document.querySelector('.driver-guide'))
  await nav(2);await click(translate('zh','notice.title'));assert.match(document.querySelector('.notice-board').textContent,/TEST — 教学通告/)
  await nav(2);await click('我的单据');await click('全部日期');assert.match(document.body.textContent,/TEST-DEMO-001/)
  await click('查看收据');const dialog=document.querySelector('.proof-view-dialog');assert.ok(dialog);assert.equal(dialog.querySelectorAll('.expense-toolbar button:disabled').length,2);assert.match(dialog.querySelector('iframe').srcdoc,/NOT VALID/)
  await act(async()=>dialog.querySelector('header button').click())
  await nav(2);await click(translate('zh','void.title'));assert.match(document.body.textContent,/TEST-DEMO-001/)
  await input(document.querySelector('.bill-void-card textarea'),'TEST correction')
  await act(async()=>document.querySelector('.bill-void-card form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})))
  await act(async()=>document.querySelector('.simulation-reviews button').click())
  assert.ok(!document.querySelector('.bill-void-card form'));assert.match(document.querySelector('.bill-void-card').textContent,/TEST-VOID/)
  await nav(2);await click(translate('zh','mobile.gps'));await act(()=>new Promise(r=>setTimeout(r,280)))
  await act(async()=>document.querySelector('.gps-branch-card').click());await click(translate('zh','mobile.getGps'))
  await click('模拟照片');await act(()=>new Promise(r=>setTimeout(r,50)))
  await click(translate('zh','mobile.submitGps'));await act(()=>new Promise(r=>setTimeout(r,50)))
  assert.match(document.querySelector('.simulation-reviews').textContent,/GPS 申请/);assert.equal(gps,0)
  await act(async()=>document.querySelector('.simulation-reviews button').click())
  await nav(1);assert.ok(document.querySelector('.cargo-entry'));await act(async()=>document.querySelector('.cargo-entry').click());assert.ok(document.querySelector('.cargo-page'))
  assert.equal(calls.length,1);assert.deepEqual({local:{...localStorage},session:{...sessionStorage}},stored)
 }finally{await act(async()=>root.unmount())}
})
