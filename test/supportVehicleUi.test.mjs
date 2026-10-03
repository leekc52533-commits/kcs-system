import test,{after} from 'node:test'
import assert from 'node:assert/strict'
import React,{act} from 'react'
import {createServer} from 'vite'
import {JSDOM} from 'jsdom'
const dom=new JSDOM('<html><body><div id="root"></div></body></html>',{url:'https://localhost/'})
for(const k of ['window','document','Node','NodeFilter','HTMLElement','MutationObserver','Event','MouseEvent','localStorage','sessionStorage'])globalThis[k]=dom.window[k]
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true
const{createRoot}=await import('react-dom/client'),vite=await createServer({logLevel:'silent',server:{middlewareMode:true},appType:'custom'});after(()=>vite.close())
const{I18nProvider}=await vite.ssrLoadModule('/src/i18n.jsx'),{default:Page}=await vite.ssrLoadModule('/src/SupportVehicle.jsx')

const route={routeNumber:4,vehicleId:1,customerCount:2,stops:[{id:11,branchName:'Serian A',status:'locked'},{id:12,branchName:'Customer B',status:'locked'}]},day={id:4,dispatch_date:'2026-10-04',revision:7,status:'approved',routeBoards:[route,{routeNumber:2,name:'Kuching MPKS',vehicleId:5,customerCount:2,stops:[{id:21,branchName:'C',status:'locked'},{id:22,branchName:'D',status:'locked'}]}]},vehicles=[{id:1,status:'active',registrationNumber:'ORIGINAL'},{id:2,status:'active',registrationNumber:'SPARE'}],employees=[{id:3,name:'Driver',role:'driver',isActive:1,employmentStatus:'active'},{id:4,name:'Crew',role:'crew',isActive:1,employmentStatus:'active'}]
test('support form in all languages sends date, revision, staff and selected customers only on confirmation',async()=>{
 for(const language of ['en','ms','zh']){
  const root=createRoot(document.getElementById('root')),calls=[]
  globalThis.fetch=async(url,options)=>{if(!options?.body)return {ok:true,headers:new Headers(),json:async()=>({items:[],routes:[]})};calls.push({url,body:JSON.parse(options.body)});return {ok:true,headers:new Headers(),json:async()=>({updated:true})}}
  await act(async()=>root.render(React.createElement(I18nProvider,{language},React.createElement(Page,{day,route,vehicles,employees}))))
  await act(async()=>document.querySelector('button').click());assert.equal(calls.length,0);assert.equal(document.querySelectorAll('.support-route-group').length,2)
  const selects=document.querySelectorAll('select');assert.equal(selects[0].options.length,2)
  for(const [i,value] of [[0,'2'],[1,'3']])await act(async()=>{selects[i].value=value;selects[i].dispatchEvent(new Event('change',{bubbles:true}))})
  const boxes=document.querySelectorAll('input[type=checkbox]');await act(async()=>{boxes[0].click();boxes[1].click();boxes[3].click()})
  assert.ok(!document.querySelector('[data-support-save]').disabled);await act(async()=>document.querySelector('[data-support-save]').click())
  assert.equal(calls.length,1);assert.equal(calls[0].url,'/api/dispatch/day/2026-10-04/support');assert.deepEqual(calls[0].body,{vehicleId:2,driverId:3,assistantIds:[4],stopIds:[11,21],branchIds:[],expectedRevision:7})
  await act(async()=>root.unmount())
 }
})

test('other customers can be filtered by route and name together, with selections retained across filters',async()=>{
 const root=createRoot(document.getElementById('root')),calls=[]
 const items=[{id:31,customerName:'Shop',branchName:'Alpha',branchCode:'B31',routeNumbers:[1]},{id:32,customerName:'Shop',branchName:'Beta',branchCode:'B32',routeNumbers:[2]}]
 globalThis.fetch=async(url,options={})=>{if(options.method==='POST')calls.push(JSON.parse(options.body));return {ok:true,headers:new Headers(),json:async()=>options.method==='POST'?{updated:true}:{items,routes:[{routeNumber:1,name:'Serian A'},{routeNumber:2,name:'Kuching MPKS'}]}}}
 await act(async()=>root.render(React.createElement(I18nProvider,{language:'zh'},React.createElement(Page,{day,vehicles,employees}))))
 await act(async()=>document.querySelector('button').click())
 const selects=document.querySelectorAll('select');for(const [i,value] of [[0,'2'],[1,'3']])await act(async()=>{selects[i].value=value;selects[i].dispatchEvent(new Event('change',{bubbles:true}))})
 const filter=document.querySelector('.support-other select'),search=document.querySelector('.support-other input:not([type=checkbox])')
 await act(async()=>{filter.value='1';filter.dispatchEvent(new Event('change',{bubbles:true}))});assert.equal(document.querySelectorAll('.support-other-results label').length,1)
 await act(async()=>document.querySelector('.support-other-results input').click())
 await act(async()=>{filter.value='2';filter.dispatchEvent(new Event('change',{bubbles:true}))});assert.ok(document.querySelector('.support-other').textContent.includes('Alpha'))
 await act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(search,'Alpha');search.dispatchEvent(new Event('input',{bubbles:true}))});assert.equal(document.querySelectorAll('.support-other-results label').length,0)
 assert.equal(document.querySelector('[data-support-save]').disabled,false);await act(async()=>document.querySelector('[data-support-save]').click())
 assert.deepEqual(calls[0].branchIds,[31]);assert.deepEqual(calls[0].stopIds,[])
 await act(async()=>root.unmount())
})

test('priority selection sorts descending and synchronizes with route and other-customer checkboxes without duplicate IDs',async()=>{
 const root=createRoot(document.getElementById('root')),calls=[]
 const extra={id:31,customerName:'Shop',branchName:'Extra',branchCode:'B31',routeNumbers:[1]}
 globalThis.fetch=async(url,options={})=>{if(options.method==='POST')calls.push(JSON.parse(options.body));return{ok:true,headers:new Headers(),json:async()=>({items:[extra],routes:[{routeNumber:1,name:'Serian A'}],priority:[{...extra,count:1,stopId:null},{id:1,branchName:'Scheduled',routeNumbers:[4],count:3,stopId:11}]})}}
 await act(async()=>root.render(React.createElement(I18nProvider,{language:'zh'},React.createElement(Page,{day,vehicles,employees}))))
 await act(async()=>document.querySelector('button').click())
 assert.equal(document.querySelectorAll('.rescheduled-customers th').length,3)
 assert.ok(document.querySelector('.rescheduled-customers tbody tr').textContent.includes('Scheduled'))
 const boxes=()=>document.querySelectorAll('.rescheduled-customers tbody input')
 await act(async()=>{boxes()[0].click();boxes()[1].click()})
 assert.equal(document.querySelector('.support-route-group input').checked,true)
 assert.equal(document.querySelector('.support-other-results input').checked,true)
 await act(async()=>document.querySelector('.support-other-results input').click());assert.equal(boxes()[1].checked,false)
 await act(async()=>boxes()[1].click())
 const selects=document.querySelectorAll('select');for(const[i,value]of [[0,'2'],[1,'3']])await act(async()=>{selects[i].value=value;selects[i].dispatchEvent(new Event('change',{bubbles:true}))})
 await act(async()=>document.querySelector('[data-support-save]').click())
 assert.deepEqual(calls[0].stopIds,[11]);assert.deepEqual(calls[0].branchIds,[31])
 await act(async()=>root.unmount())
})
