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
 assert.equal(formatDateDisplay('1906-09-28'),'28-Sep-06');assert.equal(formatDateDisplay('2026-09-28T18:30'),'28-Sep-26 18:30');assert.equal(formatDateDisplay('CP-2026092978'),'CP-2026092978')
 assert.equal(parseDateInput('28/09/2006'),'2006-09-28');assert.equal(parseDateInput('29/02/2024'),'2024-02-29');assert.equal(parseDateInput('29/02/2026'),null);assert.equal(parseDateInput('09/28/2026'),null);assert.equal(parseDateInput('28/09/2026 24:00','datetime-local'),null);assert.equal(parseDateInput('28/09/2026 18:30','datetime-local'),'2026-09-28T18:30')
})
test('all languages display DMY, send ISO from typing/calendar, preserve invalid drafts and enforce range',async()=>{
 for(const language of ['zh','en','ms']){const root=createRoot(document.getElementById('root')),received=[];let setDate
 function Form(){const[value,setValue]=React.useState('2026-09-28');setDate=setValue;return React.createElement(DateInput,{type:'date',required:true,value,min:'2026-09-01',max:'2026-09-30',onChange:e=>{received.push(e.target.value);setValue(e.target.value)}})}
 try{
 await act(async()=>root.render(React.createElement(I18nProvider,{language},React.createElement(Form))))
 const text=document.querySelector('.kcs-date-text');assert.equal(text.value,'28-Sep-26')
 await change(text,'29/09/2026');assert.equal(received.at(-1),'2026-09-29');assert.equal(text.value,'29/09/2026')
 await change(text,'31/09/2026');assert.equal(received.at(-1),'2026-09-29');assert.equal(text.value,'31/09/2026');assert.equal(text.validity.customError,true)
 await change(text,'01/10/2026');assert.equal(text.validity.customError,true)
 await change(document.querySelector('.kcs-date-picker input'),'2026-09-12');assert.equal(received.at(-1),'2026-09-12');assert.equal(text.value,'12-Sep-26');assert.equal(text.validity.customError,false)
 await act(async()=>setDate('2006-09-28'));assert.equal(text.value,'28-Sep-06')
 await change(text,'');assert.equal(received.at(-1),'');assert.equal(text.validity.valueMissing,true)
 }finally{await act(async()=>root.unmount())}
 }
})

test('new date notation validates and retains historical reference century',()=>{assert.equal(parseDateInput('04-Oct-26'),'2026-10-04');assert.equal(parseDateInput('29-Feb-26'),null);assert.equal(parseDateInput('28-Sep-06','date','1906-09-28'),'1906-09-28')})

test('numeric shortcuts inherit the field year and reject invalid dates and incomplete years',()=>{
 assert.equal(parseDateInput('31/10','date','2026-11-03'),'2026-10-31')
 assert.equal(parseDateInput('1/2','date','2024-12-03'),'2024-02-01')
 assert.equal(parseDateInput('29/2','date','2024-01-01'),'2024-02-29')
 assert.equal(parseDateInput('29/2','date','2026-01-01'),null)
 assert.equal(parseDateInput('31/02','date','2026-01-01'),null)
 assert.equal(parseDateInput('31/10/2'),null)
 assert.equal(parseDateInput('31/10/26'),'2026-10-31')
 assert.equal(parseDateInput('31/10/06','date','1906-01-01'),'1906-10-31')
 assert.equal(parseDateInput('31/10 08:30','datetime-local','2025-11-01T12:00'),'2025-10-31T08:30')
 assert.equal(parseDateInput('31/10','datetime-local','2025-11-01T12:00'),null)
})
test('Enter normalizes without submitting; blur normalizes; invalid drafts and original year survive',async()=>{
 for(const language of ['zh','en','ms']){
  const root=createRoot(document.getElementById('root'));let submits=0,keys=0,lastValue
  function Form(){const[value,setValue]=React.useState('2024-11-03');return React.createElement('form',{onSubmit:e=>{e.preventDefault();submits++},onKeyDown:()=>keys++},React.createElement(DateInput,{type:'date',value,onChange:e=>{lastValue=e.target.value;setValue(lastValue)}}))}
  try{
   await act(async()=>root.render(React.createElement(I18nProvider,{language},React.createElement(Form))))
   const text=document.querySelector('.kcs-date-text')
   await change(text,'');await change(text,'31/10')
   const enter=new window.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true})
   await act(async()=>text.dispatchEvent(enter))
   assert.equal(enter.defaultPrevented,true);assert.equal(keys,0);assert.equal(submits,0)
   assert.equal(lastValue,'2024-10-31');assert.equal(text.value,'31-Oct-24')
   await change(text,'29/02/24');await act(async()=>text.dispatchEvent(new window.FocusEvent('focusout',{bubbles:true})))
   assert.equal(text.value,'29-Feb-24');assert.equal(lastValue,'2024-02-29')
   await change(text,'31/02');await act(async()=>text.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true})))
   assert.equal(text.value,'31/02');assert.equal(text.validity.customError,true);assert.equal(submits,0)
  }finally{await act(async()=>root.unmount())}
 }
})

test('date entry selects existing text without changing values; later clicks allow caret editing',async()=>{
 const root=createRoot(document.getElementById('root'));let changes=0,focuses=0
 try{
  await act(async()=>root.render(React.createElement(I18nProvider,{language:'zh'},React.createElement('div',null,
   React.createElement(DateInput,{type:'date',autoFocus:true,defaultValue:'2026-11-03',onChange:()=>changes++,onFocus:()=>focuses++}),
   React.createElement(DateInput,{type:'date',defaultValue:'2026-11-04',onChange:()=>changes++})
  ))))
  const [start,end]=document.querySelectorAll('.kcs-date-text')
  assert.equal(document.activeElement,start)
  assert.equal(start.selectionStart,0);assert.equal(start.selectionEnd,start.value.length)
  await act(async()=>end.focus())
  assert.equal(end.selectionStart,0);assert.equal(end.selectionEnd,end.value.length)
  await act(async()=>{
   start.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0,clientX:10,clientY:10}))
   start.focus()
   start.setSelectionRange(3,3)
   start.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,cancelable:true,button:0,clientX:10,clientY:10}))
  })
  assert.equal(start.selectionStart,0);assert.equal(start.selectionEnd,start.value.length)
  await act(async()=>{
   start.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0}))
   start.setSelectionRange(3,3)
   start.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,cancelable:true,button:0}))
  })
  assert.equal(start.selectionStart,3);assert.equal(start.selectionEnd,3)
  assert.equal(changes,0);assert.equal(start.value,'03-Nov-26');assert.equal(end.value,'04-Nov-26');assert.equal(focuses,2)
 }finally{await act(async()=>root.unmount())}
})
