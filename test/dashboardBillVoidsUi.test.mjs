import test,{after} from 'node:test'
import assert from 'node:assert/strict'
import React,{act} from 'react'
import {createServer} from 'vite'
import {JSDOM} from 'jsdom'
const dom=new JSDOM('<html><body><div id="root"></div></body></html>',{url:'https://localhost/'})
for(const k of ['window','document','Node','NodeFilter','HTMLElement','MutationObserver','Event','MouseEvent','localStorage','sessionStorage'])globalThis[k]=dom.window[k]
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true
const{createRoot}=await import('react-dom/client'),vite=await createServer({logLevel:'silent',server:{middlewareMode:true},appType:'custom'})
after(()=>vite.close())
const{default:Approvals}=await vite.ssrLoadModule('/src/DashboardApprovals.jsx'),{I18nProvider}=await vite.ssrLoadModule('/src/i18n.jsx')
test('pending bill void appears in overview count, opens review and clears on polling',async()=>{
 const root=createRoot(document.getElementById('root')),originalInterval=globalThis.setInterval
 let poll,opened=false,items=[{bill_number:'P260924-047',branch_name_snapshot:'Ever kitchen',total_cents:10550234,requests:[{id:1,status:'pending',requested_name:'PHANG',reason:'Wrong amount'}]}]
 globalThis.setInterval=(fn,delay)=>{if(delay===5000)poll=fn;return originalInterval(fn,delay)}
 globalThis.fetch=async url=>({ok:true,json:async()=>url.startsWith('/api/bill-voids')?{canReview:true,items}:{items:[]}})
 try{
  await act(async()=>root.render(React.createElement(I18nProvider,{language:'zh'},React.createElement(Approvals,{enabled:true,onOpenBillVoids:()=>{opened=true}}))))
  assert.match(document.querySelector('article').textContent,/P260924-047.*PHANG.*105502.34.*Wrong amount/)
  assert.match(document.title,/\(1\)/)
  await act(async()=>document.querySelector('article button').click());assert.equal(opened,true)
  items=[];await act(async()=>{poll();await new Promise(resolve=>setTimeout(resolve,0))})
  assert.equal(document.querySelector('article'),null);assert.doesNotMatch(document.title,/🔔/)
 }finally{await act(async()=>root.unmount());globalThis.setInterval=originalInterval}
})
