import test from 'node:test'
import assert from 'node:assert/strict'
import React,{act} from 'react'
import {createServer} from 'vite'
import {JSDOM} from 'jsdom'
test('return-later opens with arrival directly under its heading and survives refresh',async()=>{
 const dom=new JSDOM('<html><body><div id="root"></div></body></html>',{url:'https://localhost/'})
 for(const k of ['window','document','Node','NodeFilter','HTMLElement','MutationObserver','Event','MouseEvent','localStorage','sessionStorage'])globalThis[k]=dom.window[k]
 Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true})
 globalThis.IS_REACT_ACT_ENVIRONMENT=true
 let scrolled=null;HTMLElement.prototype.scrollIntoView=function(){scrolled=this.dataset.mobileStop}
 globalThis.requestAnimationFrame=fn=>fn()
 globalThis.fetch=async()=>({ok:true,json:async()=>({configured:false})})
 const vite=await createServer({logLevel:'silent',server:{middlewareMode:true},appType:'custom'})
 const {createRoot}=await import('react-dom/client')
 const {TodayView}=await vite.ssrLoadModule('/src/AuthPages.jsx')
 const root=createRoot(document.getElementById('root'))
 const data={routeAvailable:true,date:'2026-10-10',weekday:'Saturday',trips:[{id:1,approved:true,executionStatus:'in_progress',currentStopId:3,stops:[
 {id:2,stopSequence:2,customerName:'LIAN KEE',branchName:'LIAN KEE BAU',deferred:true,canArrive:true,status:'available',gpsAvailable:true},
 {id:3,stopSequence:3,customerName:'Next',branchName:'Next',status:'available'}]}]}
 try{
  await act(async()=>root.render(React.createElement(TodayView,{data})))
  const card=()=>document.querySelector('[data-mobile-stop="2"]')
  await act(async()=>card().querySelector('.stop-name-button').click())
  assert.equal(card().querySelector('.stop-name-button').getAttribute('aria-expanded'),'true')
  assert.ok(card().children[1].matches('button.primary-mobile'))
  assert.equal(scrolled,'2')
  await act(async()=>root.render(React.createElement(TodayView,{data:structuredClone(data)})))
  assert.ok(card().children[1].matches('button.primary-mobile'))
  await act(async()=>card().querySelector('.stop-name-button').click())
  assert.equal(card().querySelector('.stop-name-button').getAttribute('aria-expanded'),'false')
  assert.equal(card().querySelector('.primary-mobile'),null)
 }finally{await act(async()=>root.unmount());await vite.close();dom.window.close()}
})
