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

const{default:Page}=await vite.ssrLoadModule('/src/ReceiptShare.jsx'),{I18nProvider}=await vite.ssrLoadModule('/src/i18n.jsx')
const click=async n=>act(async()=>n.dispatchEvent(new MouseEvent('click',{bubbles:true})))

window.HTMLCanvasElement.prototype.getContext=()=>({measureText:s=>({width:s.length*12}),fillRect(){},fillText(){}})
window.HTMLCanvasElement.prototype.toBlob=function(fn){fn(new Blob(['png'],{type:'image/png'}))}
test('receipt share is optional in all languages and cancellation leaves the saved bill alone',async()=>{
 for(const language of ['en','ms','zh']){
  let shares=0;const bill={billNumber:'P1',serviceDate:'2026-09-14',branchName:'Customer',vehicleCode:'CAR',totalCents:100,paymentMethod:'Cash',items:[]},before=JSON.stringify(bill)
  navigator.canShare=()=>true;navigator.share=async()=>{shares++;throw Object.assign(Error(),{name:'AbortError'})}
  fetch=()=>assert.fail('Sharing must not write or request bill data')
  const root=createRoot(document.getElementById('root'))
  try{
   await act(async()=>root.render(React.createElement(I18nProvider,{language},React.createElement(Page,{bill}))))
   assert.equal(shares,0)
   const buttons=document.querySelectorAll('button');assert.equal(buttons.length,2);assert.equal(buttons[0].disabled,false)
   await click(buttons[0]);assert.equal(shares,1);assert.equal(buttons[0].disabled,false);assert.equal(document.querySelector('[role="status"]'),null);assert.equal(JSON.stringify(bill),before)
  }finally{await act(async()=>root.unmount())}
 }
})
