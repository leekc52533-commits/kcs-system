import test,{after} from 'node:test'
import assert from 'node:assert/strict'
import React,{act} from 'react'
import {createServer} from 'vite'
import {JSDOM} from 'jsdom'
const dom=new JSDOM('<html><body><div id="root"></div></body></html>',{url:'https://localhost/'})
for(const k of ['window','document','Node','NodeFilter','HTMLElement','MutationObserver','Event','MouseEvent','localStorage','sessionStorage'])globalThis[k]=dom.window[k]
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true
globalThis.ResizeObserver=class{observe(){}disconnect(){}};globalThis.requestAnimationFrame=fn=>setTimeout(fn,0);globalThis.cancelAnimationFrame=clearTimeout
const{createRoot}=await import('react-dom/client'),vite=await createServer({logLevel:'silent',server:{middlewareMode:true},appType:'custom'});after(()=>vite.close())
const{I18nProvider}=await vite.ssrLoadModule('/src/i18n.jsx'),{default:Page}=await vite.ssrLoadModule('/src/EmployeeEarnings.jsx'),{earningsWords:words}=await vite.ssrLoadModule('/shared/earningsWords.js')
const periodFor=url=>{const date=new URL(url,'https://localhost').searchParams.get('date');return {start:date.slice(0,7)+(Number(date.slice(8))<=15?'-01':'-16'),end:date.slice(0,7)+(Number(date.slice(8))<=15?'-15':'-30'),due:'2026-09-20'}}
const report={period:{start:'2026-09-01',end:'2026-09-15',due:'2026-09-20'},companyKg:28000,pendingCompanyKg:0,unlinkedCount:0,rules:{version:0},items:[{employeeId:2,name:'Crew B',driverKg:0,crewKg:28000,pendingKg:0,pendingCount:0,rate:.03,crewRate:.03,amount:840,paidAt:null,details:[{recordId:1,collectionDate:'2026-09-15',deliveryDate:'2026-09-17',role:'crew',plate:'AAA',batch:'H001',ticket:'TN-1',weight:28010,settledKg:28000,matched:true}]}]}
test('personal reports use scoped API and mobile cards; daily details available in all languages',async()=>{for(const language of ['zh','en','ms']){const calls=[],root=createRoot(document.getElementById('root'));globalThis.fetch=async url=>{calls.push(url);return{ok:true,json:async()=>({...report,period:periodFor(url)})}};try{await act(async()=>root.render(React.createElement(I18nProvider,{language},React.createElement(Page,{personal:true}))));assert.equal(calls.length,2);assert.ok(calls.every(u=>u.startsWith('/api/mobile/earnings?')));assert.match(document.body.textContent,/RM 840.00/);assert.equal(document.querySelectorAll('table').length,0);assert.ok(![...document.querySelectorAll('button')].some(b=>b.textContent===words[language].settings));await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent===words[language].details).click());assert.match(document.body.textContent,/TN-1/);assert.ok(document.body.textContent.includes(words[language].matched))}finally{await act(async()=>root.unmount())}}})
test('management report renders employees and opens rate settings with effective date and tiers',async()=>{const root=createRoot(document.getElementById('root'));globalThis.fetch=async url=>({ok:true,json:async()=>url.endsWith('/settings')?{revision:0,versions:[],defaults:{driver:[{from:0,rate:.03},{from:25000,rate:.04}],crewRate:.03}}:{...report,period:periodFor(url)}});try{await act(async()=>root.render(React.createElement(I18nProvider,{language:'zh'},React.createElement(Page))));assert.equal(document.querySelectorAll('table').length,2);await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent===words.zh.settings).click());assert.equal(document.querySelectorAll('.earnings-tier').length,2);assert.ok(document.body.textContent.includes(words.zh.effective));assert.ok(document.body.textContent.includes(words.zh.crewRate))}finally{await act(async()=>root.unmount())}})
test('employee name opens a labelled dialog, empty records are explicit, close restores focus',async()=>{const root=createRoot(document.getElementById('root'));globalThis.fetch=async url=>({ok:true,json:async()=>({...report,period:periodFor(url),items:[{...report.items[0],details:[]}]})});try{await act(async()=>root.render(React.createElement(I18nProvider,{language:'zh'},React.createElement(Page))));const name=document.querySelector('.earnings-scroll .earnings-name');name.focus();await act(async()=>name.click());const dialog=document.querySelector('dialog.earnings-detail-dialog');assert.ok(dialog?.hasAttribute('open'));assert.ok(dialog.getAttribute('aria-labelledby'));assert.match(dialog.textContent,/暂无记录|没有符合条件的资料/);assert.equal(dialog.querySelectorAll('article').length,0);assert.equal(document.querySelector('.earnings-details'),null);await act(async()=>[...dialog.querySelectorAll('button')].find(b=>b.textContent===words.zh.close).click());assert.equal(document.querySelector('dialog.earnings-detail-dialog'),null);assert.equal(document.activeElement,name);await act(async()=>name.click());await act(async()=>document.querySelector('dialog.earnings-detail-dialog').dispatchEvent(new Event('cancel',{bubbles:true,cancelable:true})));assert.equal(document.querySelector('dialog.earnings-detail-dialog'),null);assert.equal(document.activeElement,name)}finally{await act(async()=>root.unmount())}})
test('merged weight and rate preserve earnings and migrate saved columns without duplicates',async()=>{
 const root=createRoot(document.getElementById('root'))
 localStorage.setItem('earnings-columns',JSON.stringify(['name','driverKg','crewKg','pendingKg','rate','crewRate','amount','paidAt']))
 const items=[{...report.items[0],employeeId:1,name:'Driver A',driverKg:28000,crewKg:0,rate:.043,amount:1204},{...report.items[0]},{...report.items[0],employeeId:3,name:'Mixed C',driverKg:28000,crewKg:1000,rate:.043,amount:1234}]
 globalThis.fetch=async url=>({ok:true,json:async()=>({...report,items,period:periodFor(url)})})
 try{
  await act(async()=>root.render(React.createElement(I18nProvider,{language:'en'},React.createElement(Page))))
  const table=document.querySelector('table'),headers=table.querySelectorAll('thead th')
  assert.equal(headers.length,6)
  assert.ok(table.textContent.includes(words.en.weightKg));assert.ok(table.textContent.includes(words.en.unitRate))
  for(const label of [words.en.note,words.en.company,words.en.unlinked,words.en.driverKg,words.en.crewKg,words.en.rate,words.en.crewRate])assert.ok(!document.body.textContent.includes(label),label)
  const values=[...table.querySelectorAll('tbody tr')].map(row=>[...row.querySelectorAll('td')].map(td=>td.textContent))
  assert.deepEqual(values.map(row=>row.slice(1,5)),[['28000','0','0.043','1204.00'],['28000','0','0.03','840.00'],['29000','0','0.043 / 0.03','1234.00']])
 }finally{await act(async()=>root.unmount());localStorage.removeItem('earnings-columns')}
})

test('personal driver and attendant screens show only own weight and applicable rate without role headings',async()=>{
 for(const role of ['driver','crew']){
  const root=createRoot(document.getElementById('root'))
  const employee={...report.items[0],name:'My Name',driverKg:role==='driver'?28000:0,crewKg:role==='crew'?28000:0,rate:.043,crewRate:.03,amount:role==='driver'?1204:840,details:report.items[0].details.map(d=>({...d,role}))}
  globalThis.fetch=async url=>({ok:true,json:async()=>({...report,period:periodFor(url),items:[employee]})})
  try{
   await act(async()=>root.render(React.createElement(I18nProvider,{language:'en'},React.createElement(Page,{personal:true}))))
   const card=document.querySelector('.earnings-personal article')
   assert.ok(card.textContent.includes('28000'))
   assert.ok(card.textContent.includes(role==='driver'?'0.043':'0.03'))
   assert.ok(!card.textContent.includes(role==='driver'?'0.03':'0.043'))
   await act(async()=>card.querySelector('.earnings-name').click())
   assert.match(document.querySelector('dialog').textContent,/TN-1/)
   assert.doesNotMatch(document.body.textContent,/Driver|Attendant/)
  }finally{await act(async()=>root.unmount())}
 }
})
