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

const{default:Page}=await vite.ssrLoadModule('/src/PurchaseBillsPage.jsx'),{I18nProvider}=await vite.ssrLoadModule('/src/i18n.jsx')
let urls=[]
const kind='purchase',index=kind==='expense'?3:2,key=kind==='expense'?'category':'paymentMethod',values=kind==='expense'?['Fuel','Services']:['Cash','Credit']
globalThis.fetch=async url=>{urls.push(String(url));return{ok:true,json:async()=>({items:[],filterOptions:{[key]:['',...values]},employees:[],vehicles:[]})}}
const click=async n=>act(async()=>n.dispatchEvent(new MouseEvent('click',{bubbles:true})))
test('purchase inline dates and checkbox multi-select, blank, sort and clear in three languages',async()=>{
 for(const language of ['en','ms','zh']){
  const root=createRoot(document.getElementById('root'))
  await act(async()=>root.render(React.createElement(I18nProvider,{language},React.createElement(Page))))
  assert.equal(document.querySelectorAll('.expense-toolbar input[type=date]').length,2)
  assert.equal(document.querySelector('.archive-filters'),null)
  assert.equal(document.querySelectorAll('.expense-toolbar button').length,3)
  await click(document.querySelectorAll('.expense-filter-trigger')[index])
  assert.equal(document.querySelector('[role=dialog]').parentElement,document.body)
  const boxes=()=>document.querySelectorAll('.expense-filter-menu input[type=checkbox]')
  await click(boxes()[0]);await click(boxes()[2]);await click(boxes()[3])
  const query=()=>new URL(urls.at(-1),'https://localhost').searchParams
  assert.deepEqual(JSON.parse(query().get('columns'))[key],values)
  assert.ok(document.querySelector('.expense-filter-menu'))
  await click(boxes()[1]);assert.deepEqual(JSON.parse(query().get('columns'))[key],[...values,''])
  await click(document.querySelector('.archive-sort-actions button'))
  assert.equal(query().get('sortKey'),key);assert.equal(query().get('sortDirection'),'asc')
  assert.equal(document.querySelectorAll('th')[index].getAttribute('aria-sort'),'ascending')
  await click(document.querySelectorAll('.archive-sort-actions button')[1])
  assert.equal(query().get('sortDirection'),'desc')
  const actions=document.querySelector('.expense-filter-menu').lastElementChild
  await click(actions.firstElementChild);assert.equal(JSON.parse(query().get('columns'))[key],null)
  await act(async()=>document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})))
  assert.equal(document.querySelector('.expense-filter-menu'),null)
  await act(async()=>root.unmount())
 }
})
