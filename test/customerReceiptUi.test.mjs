import test,{after} from 'node:test'
import assert from 'node:assert/strict'
import React,{act,useState} from 'react'
import {createServer} from 'vite'
import {JSDOM} from 'jsdom'
const dom=new JSDOM('<html><body><div id="root"></div></body></html>',{url:'https://localhost/'})
for(const k of ['window','document','Node','NodeFilter','HTMLElement','MutationObserver','Event','MouseEvent','localStorage','sessionStorage','FileReader'])globalThis[k]=dom.window[k]
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true
const{createRoot}=await import('react-dom/client'),vite=await createServer({logLevel:'silent',server:{middlewareMode:true},appType:'custom'})
after(()=>vite.close())

const{default:Page}=await vite.ssrLoadModule('/src/CustomerReceipt.jsx'),{I18nProvider}=await vite.ssrLoadModule('/src/i18n.jsx')
const click=async n=>act(async()=>n.dispatchEvent(new MouseEvent('click',{bubbles:true})))

window.HTMLDialogElement.prototype.showModal=function(){this.open=true}
test('receipt opens inside page with translated controls and isolated print frame',async()=>{
 for(const language of ['en','ms','zh']){
  const root=createRoot(document.getElementById('root'))
  try{
   await act(async()=>root.render(React.createElement(I18nProvider,{language},React.createElement(Page,{bill:{billNumber:'P-1',items:[],totalCents:100,status:'issued'}}))))
   await click(document.querySelector('.proof-view-link'))
   const frame=document.querySelector('iframe');assert.match(frame.getAttribute('srcdoc'),/P-1/);assert.equal(frame.getAttribute('sandbox'),'allow-same-origin allow-modals')
   assert.equal(document.querySelector('dialog header button').textContent,'×')
   assert.ok(document.querySelector('dialog .expense-toolbar button[aria-label] svg'))
   assert.equal(document.querySelectorAll('dialog').length,1)
   await click(document.querySelector('dialog header button'));assert.equal(document.querySelector('dialog'),null)
  }finally{await act(async()=>root.unmount())}
 }
})
