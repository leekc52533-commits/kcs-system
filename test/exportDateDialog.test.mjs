import test,{after} from 'node:test'
import assert from 'node:assert/strict'
import React,{act} from 'react'
import {createServer} from 'vite'
import {JSDOM} from 'jsdom'
const dom=new JSDOM('<html><body><div id="root"></div></body></html>',{url:'https://localhost/'})
for(const k of ['window','document','Node','NodeFilter','HTMLElement','MutationObserver','Event','MouseEvent','localStorage','sessionStorage'])globalThis[k]=dom.window[k]
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true
const{createRoot}=await import('react-dom/client'),vite=await createServer({logLevel:'silent',server:{middlewareMode:true},appType:'custom'});after(()=>vite.close())
const{I18nProvider}=await vite.ssrLoadModule('/src/i18n.jsx'),{default:Dialog,downloadArchive}=await vite.ssrLoadModule('/src/ExportDateDialog.jsx')
test('export dialog closes only on successful download and retains errors in three languages',async()=>{
 for(const language of ['zh','en','ms']){
 const root=createRoot(document.getElementById('root'));let closes=0,calls=0,fail=true
 await act(async()=>root.render(React.createElement(I18nProvider,{language},React.createElement(Dialog,{title:'Export',initialFrom:'2026-10-01',initialTo:'2026-10-04',onClose:()=>closes++,onDownload:async range=>{calls++;assert.deepEqual(range,{from:'2026-10-01',to:'2026-10-04'});if(fail)throw Error('Retry export')}}))))
 assert.equal(calls,0);assert.equal(document.querySelector('.kcs-export-submit svg').getAttribute('width'),'30')
 await act(async()=>document.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})))
 assert.equal(closes,0);assert.equal(document.querySelector('[role=alert]').textContent,'Retry export')
 fail=false;await act(async()=>document.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})))
 assert.equal(closes,1);await act(async()=>root.unmount())
 }
})
test('archive fetch preserves column filters while replacing range, and rejects failed downloads',async()=>{
 let url;globalThis.fetch=async u=>{url=u;return {ok:false,json:async()=>({})}}
 await assert.rejects(()=>downloadArchive('/api/sales/export.xlsx?from=2026-09-01&columns=test',{from:'2026-10-01',to:'2026-10-04'}))
 const params=new URL(url,'https://localhost').searchParams
 assert.equal(params.get('from'),'2026-10-01');assert.equal(params.get('to'),'2026-10-04');assert.equal(params.get('columns'),'test');assert.equal(params.get('exportRange'),'1')
})

test('background export survives page navigation, retains manual download and reports errors',async()=>{
 const{default:BackgroundExports}=await vite.ssrLoadModule('/src/BackgroundExports.jsx')
 const root=createRoot(document.getElementById('root'));let resolveFile,rejectFile,range,goElsewhere,downloads=0;const revoked=[]
 const oldCreate=URL.createObjectURL,oldRevoke=URL.revokeObjectURL,oldClick=window.HTMLAnchorElement.prototype.click
 URL.createObjectURL=()=> 'blob:test-export';URL.revokeObjectURL=url=>revoked.push(url);window.HTMLAnchorElement.prototype.click=()=>downloads++
 function Screen(){
  const[open,setOpen]=React.useState(true),[page,setPage]=React.useState('expenses');goElsewhere=setPage
  return React.createElement(BackgroundExports,null,React.createElement('div',{'data-page':page},page),
   open&&page==='expenses'&&React.createElement(Dialog,{title:'Expense export',initialFrom:'2026-10-01',initialTo:'2026-10-31',onClose:()=>setOpen(false),onDownload:options=>{range=options;return new Promise((resolve,reject)=>{resolveFile=resolve;rejectFile=reject})}}))
 }
 try{
  await act(async()=>root.render(React.createElement(I18nProvider,{language:'zh'},React.createElement(Screen))))
  await act(async()=>document.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})))
  assert.equal(document.querySelector('form'),null)
  await act(async()=>new Promise(resolve=>setTimeout(resolve,10)))
  assert.equal(range.from,'2026-10-01');assert.equal(range.background,true)
  await act(async()=>goElsewhere('customers'))
  assert.equal(document.querySelector('[data-page]').textContent,'customers')
  assert.match(document.querySelector('aside').textContent,/文件正在生成/)
  await act(async()=>range.onProgress('downloading'))
  assert.match(document.querySelector('aside').textContent,/正在接收/)
  await act(async()=>resolveFile({blob:new Blob(['workbook']),fileName:'Expenses Bill Oct 01-31.xlsx'}))
  assert.equal(downloads,1)
  assert.equal(document.querySelector('aside a').download,'Expenses Bill Oct 01-31.xlsx')
  await act(async()=>document.querySelector('aside button').click())
  assert.deepEqual(revoked,['blob:test-export'])
  await act(async()=>root.unmount())
  await act(async()=>{
   const another=createRoot(document.getElementById('root'));globalThis.backgroundTestRoot=another
   another.render(React.createElement(I18nProvider,{language:'ms'},React.createElement(Screen)))
  })
  await act(async()=>document.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})))
  await act(async()=>new Promise(resolve=>setTimeout(resolve,10)))
  await act(async()=>rejectFile(Error('Connection failed')))
  assert.match(document.querySelector('[role=alert]').textContent,/Connection failed/)
  await act(async()=>globalThis.backgroundTestRoot.unmount());delete globalThis.backgroundTestRoot
 }finally{
  URL.createObjectURL=oldCreate;URL.revokeObjectURL=oldRevoke;window.HTMLAnchorElement.prototype.click=oldClick
 }
})

test('background exports reject concurrent work and abort on logout/unmount',async()=>{
 const{default:BackgroundExports,useBackgroundExports}=await vite.ssrLoadModule('/src/BackgroundExports.jsx')
 const root=createRoot(document.getElementById('root'));let manager,signal,calls=0
 function Control(){manager=useBackgroundExports();return null}
 try{
  await act(async()=>root.render(React.createElement(I18nProvider,{language:'en'},React.createElement(BackgroundExports,null,React.createElement(Control)))))
  const operation=range=>{calls++;signal=range.signal;return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted'))))}
  await act(async()=>{
   assert.equal(manager.start('Export',{from:'2026-10-01',to:'2026-10-31'},operation),true)
   assert.equal(manager.start('Duplicate',{},operation),false)
  })
  await act(async()=>new Promise(resolve=>setTimeout(resolve,10)))
  assert.equal(calls,1);assert.equal(signal.aborted,false)
  await act(async()=>root.unmount())
  assert.equal(signal.aborted,true);assert.equal(document.querySelector('aside'),null)
 }catch(error){await act(async()=>root.unmount());throw error}
})
