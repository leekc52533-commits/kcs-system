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
const{DateRequestReview}=await vite.ssrLoadModule('/src/DriverDateApprovals.jsx'),{I18nProvider}=await vite.ssrLoadModule('/src/i18n.jsx')
const item={id:1,sourceDate:'2026-09-10',targetDate:'2026-09-14',schedule:{updatedAt:'token',weekdays:['Thursday']}}
const click=async n=>act(async()=>n.dispatchEvent(new MouseEvent('click',{bubbles:true})))
const change=async(n,value)=>act(async()=>{Object.getOwnPropertyDescriptor(n.tagName==='SELECT'?window.HTMLSelectElement.prototype:n.tagName==='TEXTAREA'?window.HTMLTextAreaElement.prototype:window.HTMLInputElement.prototype,'value').set.call(n,value);n.dispatchEvent(new Event(n.tagName==='SELECT'?'change':'input',{bubbles:true}))})
test('review supports inline reason, edited date, scope and date-specific options in en/ms/zh',async()=>{
 for(const language of ['en','ms','zh']){
  const calls=[],saved=[],planner=[]
  globalThis.fetch=async(url,init={})=>{calls.push({url,init});return new Response(JSON.stringify(String(url).includes('/options')?{dayReady:true,revision:3,routes:[{routeNumber:1,name:'ROUTE 1',available:true},{routeNumber:2,name:'ROUTE 2',available:false}]}:{id:1,status:'approved'}),{status:200,headers:{'content-type':'application/json'}})}
  window.prompt=()=>{throw new Error('No browser prompt allowed')}
  const root=createRoot(document.getElementById('root'))
  await act(async()=>root.render(React.createElement(I18nProvider,{language},React.createElement(DateRequestReview,{item,onSaved:(...args)=>saved.push(args),onPlanner:date=>planner.push(date)}))))
  const approve=()=>document.querySelector('.primary'),selects=()=>document.querySelectorAll('select')
  assert.equal(selects()[1].value,'once');assert.equal(approve().disabled,true)
  await change(selects()[0],'1');await change(document.querySelector('textarea'),'Confirmed')
  assert.equal(approve().disabled,false)
  await change(document.querySelector('input[type=date]'),'2026-09-10')
  assert.equal(selects()[0].value,'');assert.ok(calls.at(-1).url.includes('2026-09-10'))
  await click(document.querySelector('.date-review-actions button'));assert.equal(planner[0],'2026-09-10')
  await change(selects()[0],'1');await change(selects()[1],'permanent')
  await click(approve())
  const body=JSON.parse(calls.at(-1).init.body)
  assert.equal(body.targetDate,'2026-09-10');assert.equal(body.scope,'permanent');assert.equal(body.reason,'Confirmed');assert.equal(body.targetRevision,3);assert.equal(body.expectedScheduleUpdatedAt,'token');assert.equal(saved.length,1)
  assert.ok(!document.body.textContent.includes('dateReview.'))
  await act(async()=>root.unmount())
 }
})
test('missing target plans disable approval but keep rejection and planner available',async()=>{
 globalThis.fetch=async()=>new Response(JSON.stringify({dayReady:false,routes:[]}),{status:200,headers:{'content-type':'application/json'}})
 const root=createRoot(document.getElementById('root'))
 await act(async()=>root.render(React.createElement(I18nProvider,{language:'zh'},React.createElement(DateRequestReview,{item,onSaved:()=>{},onPlanner:()=>{}}))))
 await change(document.querySelector('textarea'),'保持原安排')
 assert.equal(document.querySelector('.primary').disabled,true)
 assert.equal(document.querySelector('.date-review-actions').firstElementChild.disabled,false)
 assert.equal(document.querySelectorAll('.date-review-actions')[1].lastElementChild.disabled,false)
 await act(async()=>root.unmount())
})

test('future date with unassigned active routes permits office confirmation',async()=>{
 globalThis.fetch=async()=>new Response(JSON.stringify({dayReady:false,revision:null,routes:[{routeNumber:1,name:'ROUTE 1',available:true,vehicleReady:false,vehicleId:null}]}),{status:200,headers:{'content-type':'application/json'}})
 const root=createRoot(document.getElementById('root'))
 await act(async()=>root.render(React.createElement(I18nProvider,{language:'zh'},React.createElement(DateRequestReview,{item,onSaved:()=>{}}))))
 await change(document.querySelector('select'),'1');await change(document.querySelector('textarea'),'确认改期')
 assert.equal(document.querySelector('.primary').disabled,false)
 assert.ok(document.body.textContent.includes('待配车'))
 await act(async()=>root.unmount())
})

test('customer card opens direct date/route editor on an approved plan without an employee request',async()=>{
 const{default:RouteCustomerList}=await vite.ssrLoadModule('/src/RouteCustomerList.jsx')
 const calls=[]
 globalThis.fetch=async(url,init={})=>{calls.push({url,init});return new Response(JSON.stringify(String(url).includes('/options')?{dayReady:false,routes:[{routeNumber:1,name:'ROUTE 1',available:true,vehicleReady:false}]}:init.method==='POST'?{status:'approved'}:item),{status:200,headers:{'content-type':'application/json'}})}
 const root=createRoot(document.getElementById('root'))
 const day={id:1,dispatch_date:'2026-09-10',status:'approved'},route={routeNumber:1,stops:[{id:1,branchId:'10065',branchName:'DIY BSQ',status:'locked'}]}
 await act(async()=>root.render(React.createElement(I18nProvider,{language:'zh'},React.createElement(RouteCustomerList,{day,route,days:[day],canEdit:true,onReorder:()=>{}}))))
 await click(document.querySelector('.route-customer-name'))
 const edit=[...document.querySelectorAll('button')].find(b=>b.textContent==='修改日期／路线')
 assert.equal(edit.disabled,false);await click(edit)
 await change(document.querySelector('.date-request-review select'),'1');await change(document.querySelector('.date-request-review textarea'),'办公室确认')
 await click(document.querySelector('.date-request-review .primary'))
 assert.ok(calls.some(c=>c.url==='/api/dispatch/stops/1/review-change'&&c.init.method==='POST'))
 await act(async()=>root.unmount())
})
