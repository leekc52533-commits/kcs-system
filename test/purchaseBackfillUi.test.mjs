import test,{after} from 'node:test'
import assert from 'node:assert/strict'
import React,{act} from 'react'
import {createServer} from 'vite'
import {JSDOM} from 'jsdom'
const dom=new JSDOM('<html><body><div id="root"></div></body></html>',{url:'https://localhost/'})
for(const k of ['window','document','Node','NodeFilter','HTMLElement','MutationObserver','Event','MouseEvent','KeyboardEvent','FocusEvent','localStorage','sessionStorage'])globalThis[k]=dom.window[k]
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true
const{createRoot}=await import('react-dom/client'),vite=await createServer({logLevel:'silent',server:{middlewareMode:true},appType:'custom'})
after(()=>vite.close())
const {default:Form,backfillCopy}=await vite.ssrLoadModule('/src/PurchaseBackfill.jsx'),{I18nProvider}=await vite.ssrLoadModule('/src/i18n.jsx')
const click=async n=>act(async()=>n.dispatchEvent(new MouseEvent('click',{bubbles:true})))
const change=async(n,value)=>act(async()=>{Object.getOwnPropertyDescriptor(Object.getPrototypeOf(n),'value').set.call(n,value);n.dispatchEvent(new Event(n.tagName==='SELECT'?'change':'input',{bubbles:true}))})
test('single company picker, all branches, existing bill review and separate collection confirmation work in three languages',async()=>{
 for(const language of ['zh','en','ms']){
 let payload,saved=0
 globalThis.fetch=async(url,options)=>({ok:true,json:async()=>{if(options?.method==='POST'){payload=JSON.parse(options.body);return{billNumber:'P261105-099'}}return{
 customers:[{id:1,name:'FARLEY',code:'C1'},{id:2,name:'Other Company',code:'C2'}],
 branches:[{id:5,customerId:1,name:'FARLEY MALL',paymentMethod:'Credit'},{id:6,customerId:1,name:'FARLEY MALL GF',paymentMethod:'Credit'},{id:7,customerId:2,name:'Other branch',paymentMethod:'Credit'}],
 drivers:[{id:1,name:'Driver',code:'D1'}],vehicles:[{id:1,name:'Q1'}],products:[{id:1,name:'Paper',unit:'kg'}],
 bills:[{id:10,branchId:5,billNumber:'P261001-001',quantity:100,totalCents:2000,status:'issued',driverName:'Driver',registrationNumber:'Q1'}]}}})
 const root=createRoot(document.getElementById('root')),m=backfillCopy[language]
 await act(async()=>root.render(React.createElement(I18nProvider,{language},React.createElement(Form,{onSaved:()=>saved++}))))
 await click(document.querySelector('button'))
 const picker=document.querySelector('[role=combobox]')
 await act(async()=>picker.focus());assert.equal(document.querySelectorAll('[role=option]').length,2)
 await change(picker,'far');assert.equal(document.querySelectorAll('[role=option]').length,1)
 await click(document.querySelector('[role=option]'));assert.match(picker.value,/FARLEY/);assert.equal(document.querySelector('[role=listbox]'),null)
 const branch=()=>document.querySelector(`select[aria-label="${m.task}"]`)
 assert.equal(branch().options.length,3);assert.match(branch().textContent,/FARLEY MALL GF/);assert.doesNotMatch(branch().textContent,/Other branch/)
 await change(branch(),'5');assert.match(document.querySelector('.backfill-existing').textContent,/P261001-001/);assert.match(document.querySelector('.backfill-existing').textContent,/20.00/)
 await change(document.querySelector(`select[aria-label="${m.driver}"]`),'1');await change(document.querySelector(`select[aria-label="${m.vehicle}"]`),'1')
 await change(document.querySelectorAll('select')[4],'1')
 await change(document.querySelectorAll('input[type=number]')[0],'35.25');await change(document.querySelectorAll('input[type=number]')[1],'0.421');await change(document.querySelector('textarea'),'Second trip missed bill')
 await click(document.querySelectorAll('input[type=checkbox]')[1]);assert.equal(document.querySelector('button[type=submit]').disabled,true)
 await click(document.querySelectorAll('input[type=checkbox]')[0]);assert.equal(document.querySelector('button[type=submit]').disabled,false)
 // Editing company invalidates the branch and both confirmations.
 await click(picker);await change(picker,'Other');assert.equal(branch().value,'');assert.equal(document.querySelector('button[type=submit]').disabled,true)
 await change(picker,'far');await act(async()=>picker.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true})))
 await act(async()=>new Promise(resolve=>setTimeout(resolve,5)));assert.ok(document.activeElement===branch(),'Enter selects company and focuses branch')
 await change(branch(),'5');await click(document.querySelectorAll('input[type=checkbox]')[0]);await click(document.querySelectorAll('input[type=checkbox]')[1])
 await act(async()=>document.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})))
 assert.equal(payload.customerId,1);assert.equal(payload.branchId,5);assert.equal(payload.driverId,1);assert.equal(payload.vehicleId,1);assert.deepEqual(payload.reviewedBillIds,[10]);assert.equal(payload.additionalCollectionConfirmed,true);assert.equal(saved,1)
 assert.equal(document.querySelector('[role=dialog]'),null)
 await act(async()=>root.unmount())
 }
})
