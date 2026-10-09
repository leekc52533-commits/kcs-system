import test,{after} from 'node:test'
import assert from 'node:assert/strict'
import React,{act} from 'react'
import {createServer} from 'vite'
import {JSDOM} from 'jsdom'
const dom=new JSDOM('<html><body><div id="root"></div></body></html>',{url:'https://localhost/'})
for(const k of ['window','document','Node','NodeFilter','HTMLElement','MutationObserver','Event','MouseEvent','KeyboardEvent','localStorage','sessionStorage'])globalThis[k]=dom.window[k]
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true
const{createRoot}=await import('react-dom/client'),vite=await createServer({logLevel:'silent',server:{middlewareMode:true},appType:'custom'});after(()=>vite.close())
const{default:Page}=await vite.ssrLoadModule('/src/OccPriceGrouping.jsx'),{I18nProvider}=await vite.ssrLoadModule('/src/i18n.jsx')
const plan={version:'snapshot',recordCount:1,customerCount:1,blocked:[],items:[{key:'0.18',price:.18,defaultTarget:'',options:[{id:1,code:'OCC-1',customerCount:5},{id:2,code:'OCC-2',customerCount:8}],members:[{key:'material:1:standard',customerCode:'C1',customerName:'MIXUE',priceType:'standard',specialPrice:.18}]}]}
const click=async n=>{assert.ok(n);await act(async()=>n.click())}
test('same-price preview requires an explicit duplicate choice and confirmation in all languages',async()=>{
 for(const language of ['zh','ms','en']){
  const writes=[],notices=[];let saved=0
  globalThis.fetch=async(url,init={})=>{if(init.method==='POST')writes.push(JSON.parse(init.body));return new Response(JSON.stringify(init.method==='POST'?{changedCount:1,customerCount:1}:plan),{headers:{'content-type':'application/json'}})}
  const root=createRoot(document.getElementById('root'));await act(async()=>root.render(React.createElement(I18nProvider,{language},React.createElement(Page,{onSaved:()=>{saved++},notify:m=>notices.push(m)}))))
  await click(document.querySelector('button'));const dialog=document.querySelector('[role=dialog]');assert.match(dialog.textContent,/MIXUE/)
  assert.equal(dialog.querySelector('footer button:last-child').disabled,true);assert.equal(writes.length,0)
  const select=dialog.querySelector('select');await act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value').set.call(select,'2');select.dispatchEvent(new Event('change',{bubbles:true}))})
  assert.equal(dialog.querySelector('footer button:last-child').disabled,false)
  await click(dialog.querySelector('footer button:last-child'))
  assert.deepEqual(writes,[{version:'snapshot',choices:{'0.18':'2'}}]);assert.equal(saved,1);assert.equal(notices.length,1);assert.equal(document.querySelector('[role=dialog]'),null)
  await act(async()=>root.unmount())
 }
})
