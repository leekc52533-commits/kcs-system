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

const{default:Page}=await vite.ssrLoadModule('/src/PurchaseBillsPage.jsx'),{I18nProvider}=await vite.ssrLoadModule('/src/i18n.jsx')
let urls=[]
globalThis.fetch=async url=>{urls.push(String(url));return{ok:true,json:async()=>String(url).includes('unloading-weights')?{items:[]}:{items:[{id:1,billNumber:'PO-123',serviceDate:'2026-09-09',paymentMethod:'Cash',customerName:'Real Customer',branchName:'Real Branch',issuedBy:'New Employee',proofId:7,status:'issued',totalCents:100,items:[]}],employees:[{id:8,name:'New Employee'}]}}}
const click=async n=>act(async()=>n.dispatchEvent(new MouseEvent('click',{bubbles:true})))
test('purchase filters preserve server values, proof links and weight navigation in three languages',async()=>{
 for(const language of ['en','ms','zh']){
  const root=createRoot(document.getElementById('root'))
  await act(async()=>root.render(React.createElement(I18nProvider,{language},React.createElement(Page))))
  assert.equal(document.querySelectorAll('.expense-toolbar input[type=date]').length,2)
  assert.equal(document.querySelector('.archive-filters'),null)
  assert.equal(document.querySelectorAll('.expense-toolbar button').length,3)
  await click(document.querySelectorAll('.expense-filter-trigger')[2])
  await act(async()=>{const s=document.querySelector('.expense-filter-menu select');s.value='Credit';s.dispatchEvent(new Event('change',{bubbles:true}))})
  assert.ok(urls.at(-1).includes('paymentMethod=Credit'))
  await click(document.querySelectorAll('.expense-filter-trigger')[5])
  assert.ok(document.querySelector('option[value="8"]'))
  await act(async()=>{const s=document.querySelector('.expense-filter-menu select');s.value='8';s.dispatchEvent(new Event('change',{bubbles:true}))})
  assert.ok(urls.at(-1).includes('employeeId=8'))
  await click(document.querySelectorAll('.expense-filter-trigger')[1])
  assert.equal(document.querySelectorAll('.expense-filter-menu input').length,2)
  await act(async()=>document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})))
  assert.equal(document.querySelector('a[href="/api/purchase-bills/proofs/7"]').target,'_blank')
  await click(document.querySelector('.bill-number'));assert.ok(document.querySelector('.bill-detail'))
  await click(document.querySelectorAll('.expense-toolbar button')[1]);assert.ok(urls.at(-1).includes('/api/unloading-weights?'))
  await click(document.querySelector('.archive-actions button'));assert.ok(document.querySelector('.expense-toolbar'))
  await act(async()=>root.unmount())
 }
})
