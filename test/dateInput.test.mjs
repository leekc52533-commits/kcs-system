import test,{after} from 'node:test'
import assert from 'node:assert/strict'
import React,{act} from 'react'
import {createServer} from 'vite'
import {JSDOM} from 'jsdom'
import {parseDateInput,formatDateDisplay} from '../src/dateDisplay.js'
const dom=new JSDOM('<html><body><div id="root"></div></body></html>',{url:'https://localhost/'})
for(const k of ['window','document','Node','NodeFilter','HTMLElement','MutationObserver','Event','MouseEvent','localStorage','sessionStorage'])globalThis[k]=dom.window[k]
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true
const{createRoot}=await import('react-dom/client'),vite=await createServer({logLevel:'silent',server:{middlewareMode:true},appType:'custom'})
after(()=>vite.close())
const{default:DateInput}=await vite.ssrLoadModule('/src/DateInput.jsx'),{I18nProvider}=await vite.ssrLoadModule('/src/i18n.jsx')
const change=async(n,v)=>act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(n,v);n.dispatchEvent(new Event('input',{bubbles:true}));n.dispatchEvent(new Event('change',{bubbles:true}))})
test('day/month/year preserves years and validates actual dates, leap years and local time',()=>{
 assert.equal(formatDateDisplay('1906-09-28'),'28/09/1906');assert.equal(formatDateDisplay('2026-09-28T18:30'),'28/09/2026 18:30');assert.equal(formatDateDisplay('CP-2026092978'),'CP-2026092978')
 assert.equal(parseDateInput('28/09/2006'),'2006-09-28');assert.equal(parseDateInput('29/02/2024'),'2024-02-29');assert.equal(parseDateInput('29/02/2026'),null);assert.equal(parseDateInput('09/28/2026'),null);assert.equal(parseDateInput('28/09/2026 24:00','datetime-local'),null);assert.equal(parseDateInput('28/09/2026 18:30','datetime-local'),'2026-09-28T18:30')
})
test('all languages display DMY, send ISO from typing/calendar, preserve invalid drafts and enforce range',async()=>{
 for(const language of ['zh','en','ms']){const root=createRoot(document.getElementById('root')),received=[];let setDate
 function Form(){const[value,setValue]=React.useState('2026-09-28');setDate=setValue;return React.createElement(DateInput,{type:'date',required:true,value,min:'2026-09-01',max:'2026-09-30',onChange:e=>{received.push(e.target.value);setValue(e.target.value)}})}
 try{
 await act(async()=>root.render(React.createElement(I18nProvider,{language},React.createElement(Form))))
 const text=document.querySelector('.kcs-date-text');assert.equal(text.value,'28/09/2026')
 await change(text,'29/09/2026');assert.equal(received.at(-1),'2026-09-29');assert.equal(text.value,'29/09/2026')
 await change(text,'31/09/2026');assert.equal(received.at(-1),'2026-09-29');assert.equal(text.value,'31/09/2026');assert.equal(text.validity.customError,true)
 await change(text,'01/10/2026');assert.equal(text.validity.customError,true)
 await change(document.querySelector('.kcs-date-picker input'),'2026-09-12');assert.equal(received.at(-1),'2026-09-12');assert.equal(text.value,'12/09/2026');assert.equal(text.validity.customError,false)
 await act(async()=>setDate('2006-09-28'));assert.equal(text.value,'28/09/2006')
 await change(text,'');assert.equal(received.at(-1),'');assert.equal(text.validity.valueMissing,true)
 }finally{await act(async()=>root.unmount())}
 }
})
