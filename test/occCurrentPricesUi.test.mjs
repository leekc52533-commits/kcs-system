import test,{after} from 'node:test'
import assert from 'node:assert/strict'
import React,{act} from 'react'
import {createServer} from 'vite'
import {JSDOM} from 'jsdom'
const dom=new JSDOM('<html><body><div id="root"></div></body></html>',{url:'https://localhost/'})
for(const k of ['window','document','Node','NodeFilter','HTMLElement','MutationObserver','Event','MouseEvent','KeyboardEvent','localStorage','sessionStorage'])globalThis[k]=dom.window[k]
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true
const{createRoot}=await import('react-dom/client'),vite=await createServer({logLevel:'silent',server:{middlewareMode:true},appType:'custom'});after(()=>vite.close())
const{default:Page}=await vite.ssrLoadModule('/src/OccCurrentPrices.jsx'),{I18nProvider}=await vite.ssrLoadModule('/src/i18n.jsx')
const data={groups:[{id:1,code:'OCC-1',price:.16,customerCount:1,branchCount:1,version:'version1',status:'active',visibility:'active',members:[{key:'product:1:standard',customerId:1,customerCode:'C1',customerName:'ALPRO',priceType:'standard',branches:[{id:1,branchName:'ALPRO MJC'}]}]},{id:2,code:'OCC-2',price:.17,customerCount:0,branchCount:0,version:'version2',status:'active',visibility:'active',members:[]}],special:[],unpriced:[]}
const click=async n=>{assert.ok(n);await act(async()=>n.click())}
const change=async(n,v)=>act(async()=>{Object.getOwnPropertyDescriptor(n.tagName==='TEXTAREA'?window.HTMLTextAreaElement.prototype:window.HTMLInputElement.prototype,'value').set.call(n,v);n.dispatchEvent(new Event('input',{bubbles:true}))})
const button=text=>[...document.querySelectorAll('button')].find(n=>n.textContent===text)
test('all languages show live groups; review required before a price write; reader cannot edit',async()=>{
 for(const language of ['zh','ms','en']){
  const calls=[];globalThis.fetch=async(url,init={})=>{calls.push({url,init});return new Response(JSON.stringify(data),{headers:{'content-type':'application/json'}})}
  const root=createRoot(document.getElementById('root'))
  await act(async()=>root.render(React.createElement(I18nProvider,{language},React.createElement(Page,{canManage:true,onBack:()=>{},notify:()=>{},fail:()=>{}}))))
  assert.ok(calls.every(c=>c.url==='/api/occ-current-groups'));assert.doesNotMatch(document.body.textContent,/旧档案|Legacy/)
  await click(document.querySelector('article'));assert.match(document.body.textContent,/ALPRO MJC/)
  assert.equal(document.querySelectorAll('.expense-filter-trigger').length,3)
  await click(document.querySelector('.occ-current-actions button'))
  await change(document.querySelector('input[type=number]'),'.17');await change(document.querySelector('textarea'),'Test reason')
  await act(async()=>document.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})))
  assert.equal(calls.filter(c=>c.init.method==='PATCH').length,0);assert.match(document.querySelector('.occ-preview-members').textContent,/ALPRO/)
  await act(async()=>document.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})))
  const writes=calls.filter(c=>c.init.method==='PATCH');assert.equal(writes.length,1);assert.equal(JSON.parse(writes[0].init.body).version,'version1');assert.equal(JSON.parse(writes[0].init.body).price,'.17')
  await act(async()=>root.unmount())
 }
 const root=createRoot(document.getElementById('root'));await act(async()=>root.render(React.createElement(I18nProvider,{language:'zh'},React.createElement(Page,{canManage:false,onBack:()=>{},notify:()=>{}}))))
 await click(document.querySelector('article'));assert.equal(document.querySelector('.occ-current-actions'),null);await act(async()=>root.unmount())
})
