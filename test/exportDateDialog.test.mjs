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
