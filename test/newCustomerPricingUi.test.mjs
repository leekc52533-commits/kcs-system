import test,{after} from 'node:test'
import assert from 'node:assert/strict'
import React,{act} from 'react'
import {createServer} from 'vite'
import {JSDOM} from 'jsdom'
const dom=new JSDOM('<html><body><div id="root"></div></body></html>',{url:'https://localhost/'})
for(const k of ['window','document','Node','NodeFilter','HTMLElement','MutationObserver','Event','MouseEvent','localStorage','sessionStorage'])globalThis[k]=dom.window[k]
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true
const{createRoot}=await import('react-dom/client'),vite=await createServer({logLevel:'silent',server:{middlewareMode:true},appType:'custom'});after(()=>vite.close())
const{CustomerEditor}=await vite.ssrLoadModule('/src/MasterDataPage.jsx'),{I18nProvider}=await vite.ssrLoadModule('/src/i18n.jsx')
const catalog=[{productId:1,name:'OCC',unit:'kg',prices:[{id:10,price:.2}],requiresChoice:true,standardPriceLevelId:null},{productId:2,name:'Other',unit:'kg',prices:[{id:20,price:.3}],standardPriceLevelId:20},{productId:3,name:'Multiple',unit:'kg',prices:[{id:30,price:.4},{id:31,price:.5}],requiresChoice:true},{productId:4,name:'No price',unit:'kg',prices:[]}]
test('new customer editor displays all products, requires choices and sends automatic plus explicit prices in three languages',async()=>{
 globalThis.fetch=async()=>({ok:true,json:async()=>({items:[]})})
 for(const language of ['zh','ms','en']){
 const root=createRoot(document.getElementById('root'));let saved=null,error=''
 try{
 await act(async()=>root.render(React.createElement(I18nProvider,{language},React.createElement(CustomerEditor,{initial:{customerName:'New',status:'active'},lockId:false,newProductCatalog:catalog,canManagePricing:true,onClose:()=>{},onSave:v=>{saved=v},fail:v=>{error=v}}))))
 const submit=()=>act(async()=>document.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})))
 assert.equal(document.querySelector('[aria-label=Other]').value,'20');assert.equal(document.querySelector('[aria-label=OCC]').value,'')
 assert.ok(document.querySelector('.customer-pricing').textContent.includes('No price'))
 await submit();assert.equal(saved,null);assert.ok(error)
 for(const [name,value] of [['OCC','10'],['Multiple','31']])await act(async()=>{const s=document.querySelector(`[aria-label="${name}"]`);s.value=value;s.dispatchEvent(new Event('change',{bubbles:true}))})
 await submit();assert.deepEqual(saved.newProductPricing,[{productId:1,standardPriceLevelId:10},{productId:2,standardPriceLevelId:20},{productId:3,standardPriceLevelId:31}])
 }finally{await act(async()=>root.unmount())}
 }
})
