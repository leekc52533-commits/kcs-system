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

const{default:Page}=await vite.ssrLoadModule('/src/CompanyMenu.jsx'),{I18nProvider}=await vite.ssrLoadModule('/src/i18n.jsx')
const click=async n=>act(async()=>n.dispatchEvent(new MouseEvent('click',{bubbles:true})))

window.HTMLDialogElement.prototype.showModal=function(){this.open=true};window.HTMLDialogElement.prototype.close=function(){this.open=false}
const {defaultMenuLayout}=await import('../shared/menuLayout.js')
test('owner clicks page name, saves alias and sidebar renders it without changing page identity',async()=>{
 let config={layout:defaultMenuLayout(),canEdit:true,revision:0},saved
 fetch=async(url,options={})=>{if(options.method==='PUT'){saved=JSON.parse(options.body);config={...config,layout:saved.layout,revision:1}}return{ok:true,json:async()=>config}}
 const root=createRoot(document.getElementById('root'));let page
 try{
  await act(async()=>root.render(React.createElement(I18nProvider,{language:'en'},React.createElement(Page,{items:[['dashboard','x','nav.dashboard'],['sales','x','sales.title']],page:'sales',go:id=>page=id}))))
  await click([...document.querySelectorAll('nav>button')].at(-1))
  const edit=document.querySelectorAll('.menu-page-name');assert(edit.length>0)
  await click(edit[0])
  const input=document.querySelector('input.menu-page-name')
  await act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(input,'My Overview');input.dispatchEvent(new Event('input',{bubbles:true}))})
  await click([...document.querySelectorAll('.company-menu-actions button')].at(-1))
  assert.equal(saved.layout.pageNames.dashboard,'My Overview');assert.equal(saved.revision,0)
  const renamed=[...document.querySelectorAll('nav button')].find(n=>n.textContent==='My Overview');assert(renamed);await click(renamed);assert.equal(page,'dashboard')
 }finally{await act(async()=>root.unmount())}
})
