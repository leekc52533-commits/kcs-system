import test,{after} from 'node:test'
import assert from 'node:assert/strict'
import React,{act} from 'react'
import {JSDOM} from 'jsdom'
import {createServer} from 'vite'
import {applyArchiveColumns} from '../shared/archiveColumns.mjs'
const dom=new JSDOM('<html><body><div id="root"></div></body></html>',{url:'https://localhost/'})
for(const k of ['window','document','Node','NodeFilter','HTMLElement','MutationObserver','Event','MouseEvent','localStorage','sessionStorage'])globalThis[k]=dom.window[k]
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true
const {createRoot}=await import('react-dom/client'),vite=await createServer({logLevel:'silent',server:{middlewareMode:true},appType:'custom'})
after(()=>vite.close())
const {default:Page}=await vite.ssrLoadModule('/src/PurchaseBillsPage.jsx'),{I18nProvider}=await vite.ssrLoadModule('/src/i18n.jsx')
const click=async n=>{assert.ok(n);await act(async()=>n.click())}
const items=Array.from({length:501},(_,id)=>({id,billNumber:'P261001-'+String(id).padStart(3,'0'),serviceDate:'2026-10-01',issuedAt:'2026-10-01T12:00:00Z',totalCents:1000,paymentMethod:'Credit',customerName:'FARLEY',branchName:id%2?'FARLEY MALL':'FARLEY SAMARAHAN',status:'issued',items:[]}))
test('archive and checkbox pages stay bounded while filters, search, selection and all matching results remain complete',async()=>{
 let calls=0,lastQuery
 globalThis.fetch=async url=>{calls++;lastQuery=Object.fromEntries(new URL(url,'https://localhost').searchParams);return {ok:true,json:async()=>applyArchiveColumns('purchase',items,lastQuery)}}
 const root=createRoot(document.getElementById('root'))
 try{
 await act(async()=>root.render(React.createElement(I18nProvider,{language:'zh'},React.createElement(Page))))
 const rowCount=()=>document.querySelectorAll('.bill-row').length
 assert.equal(rowCount(),100)
 const pageNav=()=>document.querySelector('.purchase-archive > .archive-pager')
 await click(pageNav().querySelector('button:last-child'));assert.match(document.querySelector('.bill-number').textContent,/100$/)
 await click(document.querySelectorAll('thead .expense-filter-trigger')[1])
 const panel=()=>document.querySelector('.expense-filter-menu')
 assert.equal(panel().querySelectorAll('.archive-check input').length,101)
 await click(panel().querySelector('.archive-pager button:last-child'))
 assert.equal(panel().querySelectorAll('.archive-check input').length,101)
 const term=panel().querySelectorAll('input.archive-option-search')[1]
 await act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(term,'P261001-500');term.dispatchEvent(new Event('input',{bubbles:true}))})
 assert.equal(panel().querySelectorAll('.archive-check input').length,2)
 await click(panel().querySelector('.archive-select-all input'))
 assert.equal(rowCount(),0);assert.deepEqual(JSON.parse(lastQuery.columns).billNumber,[])
 await click(panel().querySelector('input[type="checkbox"][value="P261001-500"]'))
 assert.equal(rowCount(),1);assert.match(document.querySelector('.bill-number').textContent,/500$/)
 assert.ok(panel(),'multi-selection keeps menu open')
 await click(panel().querySelector('.archive-filter-footer button'))
 assert.equal(rowCount(),100);assert.equal(JSON.parse(lastQuery.columns).billNumber,null)
 assert.equal(applyArchiveColumns('purchase',items,lastQuery).items.length,501,'paging never limits filtered/export data')
 await click(panel().querySelector('.archive-filter-footer button:last-child'))
 await click(document.querySelectorAll('thead .expense-filter-trigger')[5])
 await click(panel().querySelector('.archive-select-all input'));await click(panel().querySelector('input[value="FARLEY MALL"]'))
 assert.equal(rowCount(),100);assert.equal(applyArchiveColumns('purchase',items,lastQuery).items.length,250)
 assert.ok([...document.querySelectorAll('.bill-row')].every(row=>row.textContent.includes('FARLEY MALL')))
 assert.equal(calls,6,'one request per filter change; option paging/search do not query')
 }finally{await act(async()=>root.unmount())}
})
