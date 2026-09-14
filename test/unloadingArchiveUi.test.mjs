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

const{default:Page}=await vite.ssrLoadModule('/src/UnloadingArchivePage.jsx'),{I18nProvider}=await vite.ssrLoadModule('/src/i18n.jsx')
const click=async n=>act(async()=>n.dispatchEvent(new MouseEvent('click',{bubbles:true})))

fetch=async()=>({ok:true,json:async()=>({items:[{id:1,date:'2026-09-14',time:'09:30:00',code:'UL-20260914-000001',vehicle:'QAA4293N',driverName:'Official Name',crew:'',tripNumber:1,locationName:'Factory',confirmedWeightKg:null,status:'pending_confirmation',photoUrl:'/api/unloading-weights/1/photo'}],filterOptions:{}})})
test('archive renders three languages, icon-only back, photo link and separate download dates',async()=>{
 for(const language of ['en','ms','zh']){
  const root=createRoot(document.getElementById('root'))
  try{
   await act(async()=>root.render(React.createElement(I18nProvider,{language},React.createElement(Page))))
   assert.equal(document.querySelector('.global-back').textContent,'←')
   assert.ok(document.querySelector('.global-back').getAttribute('aria-label'))
   assert.equal(document.querySelectorAll('thead th').length,10)
   assert.match(document.body.textContent,/Official Name/)
   assert.match(document.body.textContent,/09:30:00/)
   assert.equal(document.querySelector('tbody a').getAttribute('href'),'/api/unloading-weights/1/photo')
   assert.equal(document.querySelectorAll('input[type="date"]').length,2)
   await click(document.querySelector('.unloading-download'))
   assert.equal(document.querySelectorAll('input[type="date"]').length,4)
   assert(!document.body.textContent.includes('unloading.'))
   await click(document.querySelector('.unloading-download'))
   assert.equal(document.querySelectorAll('input[type="date"]').length,2)
  }finally{await act(async()=>root.unmount())}
 }
})
