import test,{after} from 'node:test'
import assert from 'node:assert/strict'
import React,{act} from 'react'
import {createServer} from 'vite'
import {JSDOM} from 'jsdom'
const dom=new JSDOM('<html><body><div id="root"></div></body></html>',{url:'https://localhost/'})
for(const k of ['window','document','Node','NodeFilter','HTMLElement','MutationObserver','Event','MouseEvent','localStorage','sessionStorage'])globalThis[k]=dom.window[k]
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true
const{createRoot}=await import('react-dom/client'),vite=await createServer({logLevel:'silent',server:{middlewareMode:true},appType:'custom'})
after(()=>vite.close())
const {default:Form,backfillCopy}=await vite.ssrLoadModule('/src/PurchaseBackfill.jsx'),{I18nProvider}=await vite.ssrLoadModule('/src/i18n.jsx')
const click=async n=>act(async()=>n.dispatchEvent(new MouseEvent('click',{bubbles:true})))
const change=async(n,value)=>act(async()=>{Object.getOwnPropertyDescriptor(Object.getPrototypeOf(n),'value').set.call(n,value);n.dispatchEvent(new Event(n.tagName==='SELECT'?'change':'input',{bubbles:true}))})
test('backfill dialog translates controls, loads named tasks, saves explicit confirmed actual items and closes',async()=>{
 for(const language of ['zh','en','ms']){
 let payload,saved=0
 globalThis.fetch=async(url,options)=>({ok:true,json:async()=>{if(options?.method==='POST'){payload=JSON.parse(options.body);return{billNumber:'P261105-099'}}return{customers:[{id:1,name:'Company',code:'C1'},{id:2,name:'Other Company',code:'C2'}],stops:[{id:5,customerId:1,customerName:'Company',branchName:'Branch',driverName:'Driver',vehicleCode:'V1'}],products:[{id:1,name:'Paper',unit:'kg'}]}}})
 const root=createRoot(document.getElementById('root'))
 await act(async()=>root.render(React.createElement(I18nProvider,{language},React.createElement(Form,{onSaved:()=>saved++}))))
 assert.equal(document.querySelector('button').textContent,backfillCopy[language].title)
 await click(document.querySelector('button'))
 assert.match(document.querySelector('select').textContent,/Company · C1/);assert.match(document.querySelector('select').textContent,/Other Company · C2/)
 await change(document.querySelectorAll('select')[0],'2');assert.equal(document.querySelectorAll('select')[1].options.length,1);assert.match(document.querySelector('[role=status]').textContent,new RegExp(backfillCopy[language].empty.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')))
 await change(document.querySelectorAll('select')[0],'1');assert.match(document.querySelectorAll('select')[1].textContent,/Company — Branch/)
 assert.equal(document.querySelector('button[type=submit]').disabled,true)
 await change(document.querySelectorAll('select')[1],'5')
 await change(document.querySelector('input[type=search]'),'Other')
 assert.equal(document.querySelectorAll('select')[0].options.length,2)
 assert.equal(document.querySelectorAll('select')[1].value,'');assert.equal(document.querySelectorAll('select')[1].disabled,true)
 await change(document.querySelector('input[type=search]'),'')
 await change(document.querySelectorAll('select')[0],'1');await change(document.querySelectorAll('select')[1],'5')
 await change(document.querySelectorAll('select')[3],'1')
 await change(document.querySelectorAll('input[type=number]')[0],'35.25')
 await change(document.querySelectorAll('input[type=number]')[1],'0.421')
 await change(document.querySelector('textarea'),'Actual goods collected, bill missed')
 await click(document.querySelector('input[type=checkbox]'))
 assert.equal(document.querySelector('button[type=submit]').disabled,false)
 await act(async()=>document.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})))
 assert.equal(payload.customerId,1);assert.equal(payload.stopId,5);assert.equal(payload.items[0].quantity,'35.25');assert.equal(payload.items[0].unitPrice,'0.421');assert.equal(payload.confirmCollected,true);assert.equal(saved,1)
 assert.equal(document.querySelector('[role=dialog]'),null);assert.match(document.querySelector('[role=status]').textContent,/P261105-099/)
 await act(async()=>root.unmount())
 }
})
