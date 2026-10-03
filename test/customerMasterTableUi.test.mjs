import test,{after} from 'node:test'
import assert from 'node:assert/strict'
import React,{act} from 'react'
import {createServer} from 'vite'
import {JSDOM} from 'jsdom'
const dom=new JSDOM('<html><body><div id="root"></div></body></html>',{url:'https://localhost/'})
for(const key of ['window','document','Node','NodeFilter','HTMLElement','MutationObserver','Event','MouseEvent','localStorage','sessionStorage','FileReader'])globalThis[key]=dom.window[key]
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true})
globalThis.IS_REACT_ACT_ENVIRONMENT=true
const{createRoot}=await import('react-dom/client'),vite=await createServer({logLevel:'silent',server:{middlewareMode:true},appType:'custom'})
after(()=>vite.close())
const{default:Table}=await vite.ssrLoadModule('/src/CustomerMasterTable.jsx'),{I18nProvider}=await vite.ssrLoadModule('/src/i18n.jsx')
const items=[{customerId:10010,customerName:'Shop 10',status:'active',branchCount:10},{customerId:10002,customerName:'Shop 2',status:'paused',branchCount:2}]
const click=async node=>act(async()=>node.dispatchEvent(new MouseEvent('click',{bubbles:true})))
const names=()=>[...document.querySelectorAll('tbody .entity-name-link')].map(node=>node.textContent)
const open=async index=>click(document.querySelectorAll('.expense-filter-trigger')[index])
test('customer headers sort naturally and numerically, multi-select, clear and dismiss in each language',async()=>{
 for(const language of ['en','ms','zh']){
  const root=createRoot(document.getElementById('root'))
  await act(async()=>root.render(React.createElement(I18nProvider,{language},React.createElement(Table,{items,loading:false,onOpen:()=>{},preferenceId:'test'}))))
  assert.equal(document.querySelectorAll('.expense-filter-trigger').length,4)
  await open(1);await click(document.querySelector('.archive-sort-actions button'));assert.deepEqual(names(),['Shop 2','Shop 10'])
  await open(3);assert.equal(document.querySelectorAll('.expense-filter-menu').length,1)
  await click(document.querySelectorAll('.archive-sort-actions button')[1]);assert.deepEqual(names(),['Shop 10','Shop 2'])
  await open(2);await click(document.querySelector('.archive-check input'));assert.deepEqual(names(),[])
  await click(document.querySelector('input[value="active"]'));assert.deepEqual(names(),['Shop 10'])
  await click(document.querySelector('input[value="paused"]'));assert.equal(names().length,2)
  await click(document.querySelector('.expense-filter-menu').lastElementChild.firstElementChild);assert.equal(names().length,2)
  await act(async()=>document.body.dispatchEvent(new Event('pointerdown',{bubbles:true})))
  assert.equal(document.querySelector('.expense-filter-menu'),null)
  await act(async()=>root.unmount())
 }
})
