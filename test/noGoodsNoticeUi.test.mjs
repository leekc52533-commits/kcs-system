import test,{after} from 'node:test'
import assert from 'node:assert/strict'
import React,{act} from 'react'
import {createServer} from 'vite'
import {JSDOM} from 'jsdom'
const dom=new JSDOM('<html><body><div id="root"></div></body></html>',{url:'https://localhost/'})
for(const k of ['window','document','Node','NodeFilter','HTMLElement','MutationObserver','Event','MouseEvent','localStorage','sessionStorage','FileReader'])globalThis[k]=dom.window[k]
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true
const{createRoot}=await import('react-dom/client'),vite=await createServer({logLevel:'silent',server:{middlewareMode:true},appType:'custom'})
after(()=>vite.close())

const{TodayView}=await vite.ssrLoadModule('/src/AuthPages.jsx'),{NoGoodsRecord}=await vite.ssrLoadModule('/src/NoGoodsNotice.jsx'),{I18nProvider}=await vite.ssrLoadModule('/src/i18n.jsx')
const click=async n=>act(async()=>n.dispatchEvent(new MouseEvent('click',{bubbles:true})))
test('today exposes no-goods before arrival and collapses skipped records at the bottom in all languages',async()=>{
 globalThis.fetch=async()=>new Response(JSON.stringify({configured:false}),{status:200})
 for(const language of ['en','ms','zh']){
 const root=createRoot(document.getElementById('root'))
 const data={date:'2026-09-10',weekday:'Thursday',approved:true,routeAvailable:true,totalStops:2,completedStops:0,pendingStops:1,noGoodsCount:1,trips:[{id:1,tripNumber:1,executionStatus:'not_started',approved:true,stops:[{id:1,stopSequence:1,customerName:'Alpha',branchName:'Pending',status:'scheduled',canReportNoGoods:true},{id:2,stopSequence:2,customerName:'Beta',branchName:'Skipped',status:'completed',completionOutcome:'no_goods_notice',noGoodsNotice:{id:1,employeeName:'Driver',contactMethod:'phone',reason:'No cartons',createdAt:'2026-09-10T01:00:00Z'}}]}]}
 await act(async()=>root.render(React.createElement(I18nProvider,{language},React.createElement(TodayView,{data}))))
 assert.equal(document.querySelectorAll('.no-goods-action').length,1)
 assert.equal(document.querySelector('.no-goods-archive').open,false)
 assert.ok(document.querySelector('.no-goods-archive').textContent.includes('Skipped'))
 assert.ok(!document.querySelector('.driver-trip').textContent.includes('Skipped'))
 await click(document.querySelector('.no-goods-action button'))
 assert.equal(document.querySelector('.no-goods-action button[type=submit]').disabled,true)
 assert.equal(document.querySelectorAll('.no-goods-action select option').length,4)
 assert.ok(!document.body.textContent.includes('ng.'))
 await act(async()=>root.unmount())
 }
})
test('office restore requires a reason and sends it with the exact notice ID',async()=>{
 const calls=[];globalThis.fetch=async(url,init)=>{calls.push({url,init});return new Response('{}',{status:200})}
 const root=createRoot(document.getElementById('root'));let saved=0
 await act(async()=>root.render(React.createElement(I18nProvider,{language:'zh'},React.createElement(NoGoodsRecord,{stop:{branchName:'Store',noGoodsNotice:{id:7,contactMethod:'phone',createdAt:'2026-09-10T00:00:00Z'}},canRestore:true,onSaved:()=>saved++}))))
 assert.equal(document.querySelector('button').disabled,true)
 await act(async()=>{const n=document.querySelector('input');Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(n,'Customer called back');n.dispatchEvent(new Event('input',{bubbles:true}))})
 await click(document.querySelector('button'))
 assert.equal(calls[0].url,'/api/no-goods-notices/7/restore');assert.equal(JSON.parse(calls[0].init.body).reason,'Customer called back');assert.equal(saved,1)
 await act(async()=>root.unmount())
})
