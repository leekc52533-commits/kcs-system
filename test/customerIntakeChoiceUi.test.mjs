import test,{after} from 'node:test'
import assert from 'node:assert/strict'
import React,{act} from 'react'
import {createServer} from 'vite'
import {JSDOM} from 'jsdom'
const dom=new JSDOM('<html><body><div id="root"></div></body></html>',{url:'https://localhost/'})
for(const k of ['window','document','Node','NodeFilter','HTMLElement','MutationObserver','Event','MouseEvent','localStorage','sessionStorage'])globalThis[k]=dom.window[k]
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true
const{createRoot}=await import('react-dom/client'),vite=await createServer({logLevel:'silent',server:{middlewareMode:true},appType:'custom'});after(()=>vite.close())
const{I18nProvider}=await vite.ssrLoadModule('/src/i18n.jsx'),{default:Search}=await vite.ssrLoadModule('/src/CustomerPickupSearch.jsx')
let draftValue
function Harness(){const[draft,setDraft]=React.useState({name:'',phone:''});draftValue=draft;return React.createElement(Search,{draft,onChange:setDraft})}
const wait=()=>new Promise(r=>setTimeout(r,300))
const name=async text=>{await act(async()=>{const input=document.querySelector('input');Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(input,text);input.dispatchEvent(new Event('input',{bubbles:true}))});await act(wait)}
test('old customers must be selected; no-match enables explicit new choice and confirmation; changing name clears it',async()=>{
 for(const language of ['zh','en','ms']){
 const root=createRoot(document.getElementById('root'));const b={id:1,name:'HARI-HARI MTG',branchCode:'B10495',customerCode:'C10272',companyName:'HARI-HARI',products:[],paymentMethod:'Cash',latitude:1,longitude:1}
 globalThis.fetch=async url=>({ok:true,json:async()=>url.includes('details')?b:{items:url.includes('Hari')?[b]:[]}})
 await act(async()=>root.render(React.createElement(I18nProvider,{language},React.createElement(Harness))))
 assert.ok(document.querySelector('[role=group] button:nth-child(2)').disabled)
 await name('Hari');assert.match(document.body.textContent,/B10495/);assert.match(document.body.textContent,/C10272/);assert.ok(document.querySelector('[role=group] button:nth-child(2)').disabled)
 await act(async()=>document.querySelector('.pickup-matches button').click());assert.equal(draftValue.existingBranchId,1)
 await name('New Unlisted Shop');assert.equal(draftValue.existingBranchId,undefined)
 await act(async()=>document.querySelector('[role=group] button:nth-child(2)').click());assert.equal(draftValue.customerType,'new');assert.equal(Boolean(draftValue.newConfirmed),false)
 await act(async()=>document.querySelector('input[type=checkbox]').click());assert.equal(draftValue.newConfirmed,true)
 await name('Hari');assert.equal(draftValue.newConfirmed,false);assert.equal(draftValue.customerType,'existing')
 await act(async()=>root.unmount())
 }
})
