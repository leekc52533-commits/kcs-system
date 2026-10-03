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

const route={routeNumber:4,vehicleId:1,customerCount:2,stops:[{id:11,branchName:'Serian A',status:'locked'},{id:12,branchName:'Customer B',status:'locked'}]},day={id:4,dispatch_date:'2026-10-04',revision:7,status:'approved',routeBoards:[route]},vehicles=[{id:1,status:'active',registrationNumber:'ORIGINAL'},{id:2,status:'active',registrationNumber:'SPARE'}],employees=[{id:3,name:'Driver',role:'driver',isActive:1,employmentStatus:'active'},{id:4,name:'Crew',role:'crew',isActive:1,employmentStatus:'active'}]
test('support form in all languages sends date, revision, staff and selected customers only on confirmation',async()=>{
 for(const language of ['en','ms','zh']){
  const root=createRoot(document.getElementById('root')),calls=[]
  globalThis.fetch=async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return {ok:true,headers:new Headers(),json:async()=>({updated:true})}}
  await act(async()=>root.render(React.createElement(I18nProvider,{language},React.createElement(Page,{day,route,vehicles,employees}))))
  await act(async()=>document.querySelector('button').click());assert.equal(calls.length,0)
  const selects=document.querySelectorAll('select');assert.equal(selects[0].options.length,2)
  for(const [i,value] of [[0,'2'],[1,'3']])await act(async()=>{selects[i].value=value;selects[i].dispatchEvent(new Event('change',{bubbles:true}))})
  const boxes=document.querySelectorAll('input[type=checkbox]');await act(async()=>{boxes[0].click();boxes[1].click()})
  assert.ok(!document.querySelector('.support-editor button').disabled);await act(async()=>document.querySelector('.support-editor button').click())
  assert.equal(calls.length,1);assert.equal(calls[0].url,'/api/dispatch/day/2026-10-04/route/4/support');assert.deepEqual(calls[0].body,{vehicleId:2,driverId:3,assistantIds:[4],stopIds:[11],expectedRevision:7})
  await act(async()=>root.unmount())
 }
})
