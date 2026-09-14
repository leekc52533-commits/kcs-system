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

const{default:Page}=await vite.ssrLoadModule('/src/ProofViewer.jsx'),{I18nProvider}=await vite.ssrLoadModule('/src/i18n.jsx')
const click=async n=>act(async()=>n.dispatchEvent(new MouseEvent('click',{bubbles:true})))

window.HTMLDialogElement.prototype.showModal=function(){this.open=true}
let revoked=[];URL.createObjectURL=()=> 'blob:proof';URL.revokeObjectURL=url=>revoked.push(url)
test('proof opens with current session in-page, releases photo and translates expired login',async()=>{
 for(const language of ['en','ms','zh']){
  let calls=[];revoked=[]
  fetch=async(url,options)=>{calls.push({url,options});return{ok:true,blob:async()=>new Blob(['proof'],{type:'image/png'})}}
  const root=createRoot(document.getElementById('root'))
  try{
   await act(async()=>root.render(React.createElement(I18nProvider,{language},React.createElement(Page,{url:'/api/cash-floats/proofs/1'},'Proof'))))
   await click(document.querySelector('.proof-view-link'))
   assert.equal(calls.length,1);assert.equal(calls[0].url,'/api/cash-floats/proofs/1');assert.equal(calls[0].options.credentials,'same-origin')
   assert.equal(document.querySelector('dialog img').getAttribute('src'),'blob:proof');assert.equal(document.querySelector('a[target="_blank"]'),null)
   await click(document.querySelector('dialog button'));assert.deepEqual(revoked,['blob:proof']);assert.equal(document.querySelector('dialog'),null)
   fetch=async()=>({ok:false,status:401,json:async()=>({errorCode:'AUTH_REQUIRED'})})
   await click(document.querySelector('.proof-view-link'));assert.equal(document.querySelector('dialog img'),null)
   assert.equal(document.querySelector('[role="alert"]').textContent,{en:'Please log in to KCS.',ms:'Sila log masuk ke KCS.',zh:'请先登录KCS。'}[language])
  }finally{await act(async()=>root.unmount())}
 }
})
