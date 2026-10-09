import test,{after} from 'node:test'
import assert from 'node:assert/strict'
import React,{act} from 'react'
import {createServer} from 'vite'
import {JSDOM} from 'jsdom'
const dom=new JSDOM('<html><body><div id="root"></div></body></html>',{url:'https://localhost/'})
for(const k of ['window','document','Node','NodeFilter','HTMLElement','MutationObserver','Event','MouseEvent','KeyboardEvent','localStorage','sessionStorage','FileReader'])globalThis[k]=dom.window[k]
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true
window.scrollTo=()=>{}
const{createRoot}=await import('react-dom/client'),vite=await createServer({logLevel:'silent',server:{middlewareMode:true},appType:'custom'})
after(()=>vite.close())
const{default:Approvals}=await vite.ssrLoadModule('/src/DriverDateApprovals.jsx'),{I18nProvider}=await vite.ssrLoadModule('/src/i18n.jsx')
const original=[1,2].map(id=>({id,branchId:'B'+id,branchName:'CUSTOMER '+id,employeeName:'DRIVER',plate:'TEST',reason:'Tak sempat',evidence:{reasonCode:'time'},canDirectApprove:true,sourceDate:'2026-10-09',targetDate:'2026-10-12',schedule:{updatedAt:'token',weekdays:['Friday']}}))
const click=async node=>{assert.ok(node);await act(async()=>node.click())}
const change=async(node,value)=>act(async()=>{Object.getOwnPropertyDescriptor(node.tagName==='SELECT'?window.HTMLSelectElement.prototype:window.HTMLTextAreaElement.prototype,'value').set.call(node,value);node.dispatchEvent(new Event(node.tagName==='SELECT'?'change':'input',{bubbles:true}))})
const overlay=()=>document.querySelector('.date-review-overlay'),dialog=()=>document.querySelector('.date-review-dialog')
let root,calls,items,postHandler
async function mount(language='zh'){
 items=structuredClone(original);calls=[];postHandler=async()=>({id:1,status:'approved'})
 globalThis.fetch=async(url,init={})=>{
  calls.push({url,init})
  let result=String(url).includes('/pending')?{items}:String(url).includes('/options')?{dayReady:true,revision:1,routes:[{routeNumber:1,name:'Route 1',available:true}]}:await postHandler(url,init)
  return new Response(JSON.stringify(result),{status:200,headers:{'content-type':'application/json'}})
 }
 root=createRoot(document.getElementById('root'));await act(async()=>root.render(React.createElement(I18nProvider,{language},React.createElement(Approvals))))
 const trigger=document.querySelector('.date-request-summary');trigger.focus();document.getElementById('root').scrollTop=77;await click(trigger);return trigger
}
async function unmount(){await act(async()=>root.unmount())}
test('only selected customer opens; clean backdrop/back/escape closes without requests and restores list scroll/focus in all languages',async()=>{
 for(const language of ['zh','ms','en']){
  const trigger=await mount(language)
  assert.match(dialog().textContent,/CUSTOMER 1/);assert.doesNotMatch(dialog().textContent,/CUSTOMER 2/)
  assert.ok(dialog().querySelector('.approval-customer-link'));assert.equal(document.querySelectorAll('.date-request-review').length,1)
  assert.equal(document.getElementById('root').inert,true)
  window.confirm=()=>{throw Error('Clean form must not confirm')}
  await click(dialog());assert.ok(overlay())
  await click(overlay());assert.equal(overlay(),null);assert.equal(document.activeElement,trigger);assert.equal(document.getElementById('root').scrollTop,77)
  assert.equal(document.body.style.overflow,'');assert.ok(!document.getElementById('root').inert)
  await click(trigger);await click(document.querySelector('.date-review-dialog-header button'));assert.equal(overlay(),null)
  await click(trigger);await act(async()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));assert.equal(overlay(),null)
  assert.equal(calls.filter(c=>c.init.method==='POST').length,0);await unmount()
 }
})
test('edited reason or route requires discard confirmation; declining keeps exact draft and no write',async()=>{
 await mount();let confirmations=0;window.confirm=()=>{confirmations++;return false}
 await change(dialog().querySelector('textarea'),'Keep this reason')
 await click(overlay());assert.equal(confirmations,1);assert.equal(dialog().querySelector('textarea').value,'Keep this reason')
 await change(dialog().querySelector('select'),'1');await click(document.querySelector('.date-review-dialog-header button'));assert.equal(confirmations,2);assert.equal(dialog().querySelector('select').value,'1')
 window.confirm=()=>true;await click(overlay());assert.equal(overlay(),null)
 assert.equal(calls.filter(c=>c.init.method==='POST').length,0);await unmount()
})
test('submission blocks backdrop and escape; success closes and removes only approved customer',async()=>{
 await mount();let finish;postHandler=()=>new Promise(resolve=>{finish=resolve})
 await click(dialog().querySelector('.owner-date-direct-approve'))
 assert.equal(document.querySelector('.date-review-dialog-header button').disabled,true)
 await click(overlay());await act(async()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));assert.ok(dialog())
 items=items.filter(i=>i.id!==1);await act(async()=>finish({id:1,status:'approved'}))
 assert.equal(dialog(),null);assert.match(document.body.textContent,/CUSTOMER 2/);assert.doesNotMatch(document.body.textContent,/CUSTOMER 1/)
 assert.equal(calls.filter(c=>c.init.method==='POST').length,1);await unmount()
})
