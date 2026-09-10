import test,{after} from 'node:test'
import assert from 'node:assert/strict'
import React,{act} from 'react'
import {createServer} from 'vite'
import {JSDOM} from 'jsdom'
const dom=new JSDOM('<html><body><div id="root"></div></body></html>',{url:'https://localhost/'})
for(const k of ['window','document','Node','NodeFilter','HTMLElement','MutationObserver','Event','MouseEvent','localStorage','sessionStorage','FileReader'])globalThis[k]=dom.window[k]
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true
const{createRoot}=await import('react-dom/client'),vite=await createServer({logLevel:'silent',server:{middlewareMode:true},appType:'custom'})
after(()=>vite.close())

const{default:CompanyMenu}=await vite.ssrLoadModule('/src/CompanyMenu.jsx'),{I18nProvider}=await vite.ssrLoadModule('/src/i18n.jsx')
const{defaultMenuLayout}=await import('../shared/menuLayout.js')
test('sidebar has one active leaf and only owner can edit and save reordered documents',async()=>{
 for(const canEdit of [false,true]){
 const writes=[];globalThis.fetch=async(_url,options={})=>{if(options.method==='PUT')writes.push(JSON.parse(options.body));return{ok:true,json:async()=>({layout:writes.at(-1)?.layout||defaultMenuLayout(),revision:writes.length,canEdit})}}
 const root=createRoot(document.getElementById('root')),items=[['dashboard','x','nav.dashboard'],['purchase-bills','x','nav.purchaseBills'],['sales','x','sales.title'],['expense-records','x','nav.expenseRecords'],['bill-voids','x','void.title']]
 await act(async()=>root.render(React.createElement(I18nProvider,{language:'en'},React.createElement(CompanyMenu,{items,page:'sales',go(){}}))))
 assert.equal(document.querySelectorAll('nav .active').length,1)
 const edit=[...document.querySelectorAll('nav button')].find(n=>n.textContent==='Arrange company menu')
 assert.equal(Boolean(edit),canEdit)
 if(canEdit){await act(async()=>edit.click());const groups=document.querySelectorAll('.company-menu-editor h3');assert.equal(groups.length,2)
 const down=document.querySelectorAll('.company-menu-editor > div')[1].querySelector('.company-menu-row button:last-child');await act(async()=>down.click())
 await act(async()=>[...document.querySelectorAll('.company-menu-actions button')].find(n=>n.textContent==='Save').click())
 assert.equal(writes.length,1);assert.equal(writes[0].layout.documents[0],'sales');assert.equal(document.querySelector('[role=dialog]'),null)
 }
 await act(async()=>root.unmount())
 }
})
