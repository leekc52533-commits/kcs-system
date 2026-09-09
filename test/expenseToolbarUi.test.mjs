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

const{default:Page}=await vite.ssrLoadModule('/src/ExpenseRecordsPage.jsx'),{I18nProvider}=await vite.ssrLoadModule('/src/i18n.jsx')
let urls=[]
globalThis.fetch=async url=>{urls.push(String(url));return{ok:true,json:async()=>({items:[],employees:[{employeeId:8,employeeName:'New Employee',configured:true}],vehicles:[]})}}
const click=async n=>act(async()=>n.dispatchEvent(new MouseEvent('click',{bubbles:true})))
test('inline dates, column filters and live employee options work in all languages',async()=>{
 for(const language of ['en','ms','zh']){
  const root=createRoot(document.getElementById('root'))
  await act(async()=>root.render(React.createElement(I18nProvider,{language},React.createElement(Page))))
  assert.equal(document.querySelectorAll('.expense-toolbar input[type=date]').length,2)
  assert.equal(document.querySelector('.archive-filters'),null)
  assert.equal(document.querySelectorAll('.expense-toolbar button').length,3)
  await click(document.querySelectorAll('.expense-filter-trigger')[3])
  assert.equal(document.querySelector('[role=dialog]').parentElement,document.body)
  await act(async()=>{const s=document.querySelector('.expense-filter-menu select');s.value='Fuel';s.dispatchEvent(new Event('change',{bubbles:true}))})
  assert.ok(urls.at(-1).includes('category=Fuel'))
  assert.equal(document.querySelector('.expense-filter-menu'),null)
  await click(document.querySelectorAll('.expense-filter-trigger')[2])
  assert.ok(document.querySelector('option[value="8"]'))
  await act(async()=>{const s=document.querySelector('.expense-filter-menu select');s.value='8';s.dispatchEvent(new Event('change',{bubbles:true}))})
  assert.ok(urls.at(-1).includes('employeeId=8'))
  await click(document.querySelectorAll('.expense-filter-trigger')[4])
  assert.equal(document.querySelectorAll('.expense-filter-menu input').length,2)
  await act(async()=>document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})))
  assert.equal(document.querySelector('.expense-filter-menu'),null)
  await act(async()=>root.unmount())
 }
})
