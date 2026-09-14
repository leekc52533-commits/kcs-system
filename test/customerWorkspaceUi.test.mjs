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
const{default:Editor}=await vite.ssrLoadModule('/src/CustomerWorkspaceEditor.jsx'),{I18nProvider}=await vite.ssrLoadModule('/src/i18n.jsx'),{customerWorkspaceWords:words}=await vite.ssrLoadModule('/src/customerWorkspaceWords.js')
const change=async(n,value)=>act(async()=>{Object.getOwnPropertyDescriptor(n.tagName==='TEXTAREA'?window.HTMLTextAreaElement.prototype:window.HTMLInputElement.prototype,'value').set.call(n,value);n.dispatchEvent(new Event('input',{bubbles:true}))})
test('combined editor sends one request and keeps failed draft for retry in all languages',async()=>{
 for(const language of ['en','ms','zh']){
 const w=words[language],posts=[],data={customer:{customerId:'C1',customerName:'Existing',status:'active',materialPricing:[]},branch:null,schedule:null,pending:[],routeOptions:[],areas:[],canManagePricing:false,canCaptureGps:false,canReviewGps:false,revision:'revision-1'}
 globalThis.fetch=async(url,options={})=>{if(options.method==='POST'){posts.push(JSON.parse(options.body));return{ok:false,status:409,headers:new Map(),json:async()=>({errorCode:'CONFLICT'})}}return{ok:true,json:async()=>String(url).startsWith('/api/materials')?{items:[]}:data}}
 const root=createRoot(document.getElementById('root'));try{
 await act(async()=>root.render(React.createElement(I18nProvider,{language},React.createElement(Editor,{customerId:'C1',onClose(){}}))))
 const label=[...document.querySelectorAll('label')].find(l=>l.textContent===w.name);assert.ok(label)
 await change(label.querySelector('input'),'Branch One');await change(document.querySelector('.customer-workspace-fields textarea'),'New branch')
 await act(async()=>document.querySelector('.master-modal form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})))
 assert.equal(posts.length,1);assert.equal(posts[0].branch.branchName,'Branch One');assert.equal(posts[0].customerId,'C1');assert.equal(posts[0].revision,'revision-1');assert.equal(posts[0].reason,'New branch');assert.equal(document.querySelector('.customer-workspace-fields textarea').value,'New branch')
 await act(async()=>document.querySelector('.master-modal form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})))
 assert.equal(posts[0].requestId,posts[1].requestId)
 }finally{await act(async()=>root.unmount())}
 }
})
