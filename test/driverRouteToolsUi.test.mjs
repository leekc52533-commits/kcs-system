import test,{after} from 'node:test'
import assert from 'node:assert/strict'
import React,{act} from 'react'
import {createServer} from 'vite'
import {JSDOM} from 'jsdom'
import {translate} from '../src/translations.js'
const dom=new JSDOM('<html><body><div id="root"></div></body></html>',{url:'https://localhost/'})
for(const k of ['window','document','Node','NodeFilter','HTMLElement','MutationObserver','Event','MouseEvent','localStorage','sessionStorage'])globalThis[k]=dom.window[k]
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true})
globalThis.IS_REACT_ACT_ENVIRONMENT=true
const {createRoot}=await import('react-dom/client'),vite=await createServer({logLevel:'silent',server:{middlewareMode:true},appType:'custom'})
after(()=>vite.close())
const {default:Tools}=await vite.ssrLoadModule('/src/DriverRouteTools.jsx'),{I18nProvider}=await vite.ssrLoadModule('/src/i18n.jsx')
const stops=[{id:1,status:'locked'},{id:2,status:'locked'}]
for(const language of ['en','ms','zh'])test(`${language}: reorder sends expected order; expired trial hides arrows; request remains pending`,async()=>{
 let calls=[];globalThis.fetch=async(url,options)=>{calls.push([url,JSON.parse(options.body)]);return{ok:true,json:async()=>({ok:true})}}
 const root=createRoot(document.getElementById('root')),render=async(active,stop=stops[1])=>act(async()=>root.render(React.createElement(I18nProvider,{language},React.createElement(Tools,{stop,trip:{executionStatus:'in_progress',stops},route:{date:'2026-09-10',trialOrderEnabled:active},busy:false,run:async(_key,fn)=>fn()}))))
 await render(true)
 let buttons=[...document.querySelectorAll('button')],up=buttons.find(b=>b.textContent===translate(language,'routeTrial.up'))
 assert.ok(up);assert.equal(up.disabled,false)
 await act(async()=>up.dispatchEvent(new MouseEvent('click',{bubbles:true})))
 assert.deepEqual(calls[0],['/api/mobile/stops/2/trial-reorder',{direction:'up',expectedOrder:[1,2]}])
 await render(false,{...stops[1],dateRequest:{status:'pending',targetDate:'2026-09-12'}})
 assert.equal(document.querySelectorAll('button').length,0)
 assert.match(document.body.textContent,/2026-09-12/)
 assert.ok(document.body.textContent.includes(translate(language,'routeTrial.pending')))
 for(const key of ['banner','requestDate','approvalHelp','dateReason','expired'])assert.notEqual(translate(language,'routeTrial.'+key),'routeTrial.'+key)
 assert.notEqual(translate(language,'apiError.route_trial_stale'),'apiError.route_trial_stale')
 await act(async()=>root.unmount())
})
