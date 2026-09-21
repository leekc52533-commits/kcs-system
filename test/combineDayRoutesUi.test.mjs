import test,{after} from 'node:test'
import assert from 'node:assert/strict'
import React,{act} from 'react'
import {createServer} from 'vite'
import {JSDOM} from 'jsdom'
const dom=new JSDOM('<html><body><div id="root"></div></body></html>',{url:'https://localhost/'})
for(const k of ['window','document','Node','NodeFilter','HTMLElement','MutationObserver','Event','MouseEvent','localStorage','sessionStorage'])globalThis[k]=dom.window[k]
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true
const{createRoot}=await import('react-dom/client'),vite=await createServer({logLevel:'silent',server:{middlewareMode:true},appType:'custom'});after(()=>vite.close())
const{I18nProvider}=await vite.ssrLoadModule('/src/i18n.jsx'),{default:Page}=await vite.ssrLoadModule('/src/CombineDayRoutes.jsx')
const day={id:4,dispatch_date:'2026-09-21',revision:7,status:'draft',routeBoards:[{routeNumber:1,name:'North',vehicleId:1,registrationNumber:'ABC1',customerCount:2,stops:[{zoneGroup:'Kuching MPKS'}]},{routeNumber:2,name:'South',vehicleId:2,registrationNumber:'ABC2',customerCount:3,stops:[{zoneGroup:'Kuching DPKU'}]}]}
test('three-language multi-route form submits selected date, revision and routes; errors keep draft',async()=>{
 for(const language of ['en','ms','zh']){
 const root=createRoot(document.getElementById('root')),calls=[];let saved=0,fail=true
 globalThis.fetch=async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return{ok:!fail,status:409,headers:new Headers(),json:async()=>fail?{errorCode:'MULTI_STALE'}:{updated:true}}}
 await act(async()=>root.render(React.createElement(I18nProvider,{language},React.createElement(Page,{day,onSaved:async()=>saved++}))))
 await act(async()=>document.querySelector('button').click())
 const select=document.querySelector('select');await act(async()=>{select.value='1';select.dispatchEvent(new Event('change',{bubbles:true}))})
 assert.equal(document.querySelectorAll('input[type=checkbox]').length,1)
 await act(async()=>document.querySelector('input[type=checkbox]').click())
 const reason=document.querySelector('input:not([type=checkbox])');await act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(reason,'Short staffed');reason.dispatchEvent(new Event('input',{bubbles:true}))})
 await act(async()=>document.querySelector('.combine-route-actions button').click())
 assert.ok(document.querySelector('[role=alert]'));assert.equal(saved,0);assert.equal(reason.value,'Short staffed');assert.ok(!document.querySelector('[role=alert]').textContent.includes('MULTI_'))
 fail=false;await act(async()=>document.querySelector('.combine-route-actions button').click())
 assert.equal(saved,1);assert.equal(document.querySelector('.combine-day-editor'),null)
 assert.deepEqual(calls[1],{url:'/api/dispatch/day/2026-09-21/combine-routes',body:{expectedRevision:7,targetRouteNumber:1,sourceRouteNumbers:[2],reason:'Short staffed'}})
 await act(async()=>root.unmount())
 }
})
