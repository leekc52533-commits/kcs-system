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

window.HTMLDialogElement.prototype.showModal=function(){this.open=true};window.HTMLDialogElement.prototype.close=function(){this.open=false}
const{default:CompanyMenu}=await vite.ssrLoadModule('/src/CompanyMenu.jsx'),{I18nProvider}=await vite.ssrLoadModule('/src/i18n.jsx')
const{defaultMenuLayout}=await import('../shared/menuLayout.js')
test('sidebar has one active leaf and only owner can edit and save reordered documents',async()=>{
 for(const canEdit of [false,true]){
 const writes=[];globalThis.fetch=async(_url,options={})=>{if(options.method==='PUT')writes.push(JSON.parse(options.body));return{ok:true,json:async()=>({layout:writes.at(-1)?.layout||defaultMenuLayout(),revision:writes.length,canEdit:true,companyCanEdit:canEdit,hidden:[],shortcuts:[]})}}
 const root=createRoot(document.getElementById('root')),items=[['dashboard','x','nav.dashboard'],['purchase-bills','x','nav.purchaseBills'],['sales','x','sales.title'],['expense-records','x','nav.expenseRecords'],['bill-voids','x','void.title']]
 await act(async()=>root.render(React.createElement(I18nProvider,{language:'en'},React.createElement(CompanyMenu,{items,page:'sales',go(){}}))))
 assert.equal(document.querySelectorAll('nav .active').length,1)
 const edit=[...document.querySelectorAll('nav button')].find(n=>n.textContent==='Menu settings')
 assert.equal(Boolean(edit),true)
 if(canEdit){await act(async()=>edit.click());const groups=document.querySelectorAll('.company-menu-editor h3');assert.equal(groups.length,2)
 const down=document.querySelectorAll('.company-menu-group')[1].querySelector('.company-menu-row button:last-child');await act(async()=>down.click())
 await act(async()=>[...document.querySelectorAll('.company-menu-actions button')].find(n=>n.textContent==='Save').click())
 assert.equal(writes.length,1);assert.equal(writes[0].layout.documents[0],'sales');assert.equal(document.querySelector('[role=dialog]'),null)
 }
 await act(async()=>root.unmount())
 }
})


test('personal editor moves a folder page outside and saves independent visibility and overview choices',async()=>{
 let config={layout:defaultMenuLayout(),revision:0,canEdit:true,hidden:[],shortcuts:[],defaultLayout:defaultMenuLayout()},write
 globalThis.fetch=async(url,options={})=>{assert.equal(url,'/api/personal-menu');if(options.method==='PUT'){write=JSON.parse(options.body);config={...config,...write,revision:1}}return {ok:true,json:async()=>config}}
 const root=createRoot(document.getElementById('root'))
 try{
  await act(async()=>root.render(React.createElement(I18nProvider,{language:'en'},React.createElement(CompanyMenu,{items:[['dashboard','x','nav.dashboard'],['sales','x','sales.title']],page:'sales',go(){}}))))
  await act(async()=>[...document.querySelectorAll('nav button')].find(n=>n.textContent==='Menu settings').click())
  let row=[...document.querySelectorAll('.company-menu-row')].find(n=>n.querySelector('select')?.value==='documents')
  await act(async()=>{const select=row.querySelector('select');select.value='top';select.dispatchEvent(new Event('change',{bubbles:true}))})
  row=[...document.querySelectorAll('.company-menu-row')].find(n=>n.querySelector('.menu-page-name')?.textContent==='Sales Records')||[...document.querySelectorAll('.company-menu-row')].find(n=>n.querySelector('select')&&n.querySelector('input[type=checkbox]')&&!n.querySelector('input[type=checkbox]').disabled)
  assert(row)
  await act(async()=>row.querySelectorAll('input[type=checkbox]')[0].click())
  await act(async()=>row.querySelectorAll('input[type=checkbox]')[1].click())
  await act(async()=>[...document.querySelectorAll('.company-menu-actions button')].find(n=>n.textContent==='Save').click())
  assert(write.layout.top.includes('sales'));assert(!write.layout.documents.includes('sales'))
  assert.deepEqual(write.hidden,['sales']);assert.deepEqual(write.shortcuts,['sales'])
  assert.equal(document.querySelectorAll('nav .active').length,0)
 }finally{await act(async()=>root.unmount())}
})

test('overview folder retains ordered permitted links and closes on outside click',async()=>{
 const{default:OverviewModules}=await vite.ssrLoadModule('/src/OverviewModules.jsx')
 const layout=defaultMenuLayout();layout.documents=['sales','expense-records','bill-voids','purchase-bills','unloading-records'];layout.documentName='Bill'
 const root=createRoot(document.getElementById('root'));let opened
 try{
  await act(async()=>root.render(React.createElement(I18nProvider,{language:'en'},React.createElement(OverviewModules,{preferences:{layout,shortcuts:['documents']},items:[['sales','x','sales.title'],['purchase-bills','x','nav.purchaseBills']],go:id=>opened=id}))))
  const folder=document.querySelector('details');assert(folder);assert.equal(folder.querySelectorAll('button').length,2)
  await act(async()=>folder.querySelector('summary').click());assert(folder.open)
  await act(async()=>folder.querySelector('button').click());assert.equal(opened,'sales')
  await act(async()=>{document.body.dispatchEvent(new MouseEvent('pointerdown',{bubbles:true,clientX:2,clientY:2}));document.body.dispatchEvent(new MouseEvent('pointerup',{bubbles:true,clientX:2,clientY:2}))});assert.equal(folder.open,false)
 }finally{await act(async()=>root.unmount())}
})

test('dragging an outside page onto Employee saves once and renders it only inside',async()=>{
 const layout=defaultMenuLayout();layout.top.push('folder-team');layout.folders=[{id:'folder-team',name:'Employee',items:[]}]
 let config={layout,revision:0,canEdit:true,hidden:[],shortcuts:[],defaultLayout:layout},writes=0
 globalThis.fetch=async(url,options={})=>{assert.equal(url,'/api/personal-menu');if(options.method==='PUT'){writes++;config={...config,...JSON.parse(options.body),revision:writes}}return{ok:true,json:async()=>config}}
 const root=createRoot(document.getElementById('root'))
 try{
 await act(async()=>root.render(React.createElement(I18nProvider,{language:'en'},React.createElement(CompanyMenu,{items:[['attendance','x','attendance.title']],page:'attendance',go(){}}))))
 const row=document.querySelector('.sidebar-entry[draggable]'),folder=document.querySelector('.sidebar-folder')
 const start=new Event('dragstart',{bubbles:true});Object.defineProperty(start,'dataTransfer',{value:{setData(){}}})
 await act(async()=>row.dispatchEvent(start))
 await act(async()=>folder.dispatchEvent(new Event('drop',{bubbles:true,cancelable:true})))
 assert.equal(writes,1);assert(!config.layout.top.includes('attendance'));assert.deepEqual(config.layout.folders[0].items,['attendance'])
 assert.equal(document.querySelectorAll('.company-menu-children .sidebar-entry').length,1)
 assert.equal(document.querySelectorAll('.sidebar-entry[draggable]').length,1)
 }finally{await act(async()=>root.unmount())}
})
