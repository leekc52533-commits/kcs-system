import test,{after} from 'node:test'
import assert from 'node:assert/strict'
import React,{act} from 'react'
import {createServer} from 'vite'
import {JSDOM} from 'jsdom'
const dom=new JSDOM('<html><body><div id="materials-header-back"></div><div id="page-data-exports"></div><div id="root"></div></body></html>',{url:'https://localhost/'})
for(const k of ['window','document','Node','NodeFilter','HTMLElement','MutationObserver','Event','MouseEvent','localStorage','sessionStorage'])globalThis[k]=dom.window[k]
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true})
globalThis.IS_REACT_ACT_ENVIRONMENT=true
const{createRoot}=await import('react-dom/client'),vite=await createServer({logLevel:'silent',server:{middlewareMode:true},appType:'custom'})
after(()=>vite.close())
const{I18nProvider}=await vite.ssrLoadModule('/src/i18n.jsx'),{default:Materials}=await vite.ssrLoadModule('/src/MaterialsPricesPage.jsx')
test('localized catalogue keeps a single header back action and returns from category without writes',async()=>{
 const calls=[],category={id:1,category_name:'All Scrape',product_count:0,price_group_count:0,branch_count:0,products:[]}
 globalThis.fetch=async(url,options={})=>{calls.push({url,method:options.method||'GET'});return{ok:true,headers:new Headers(),json:async()=>String(url).endsWith('/1')?category:{items:[category]}}}
 const root=createRoot(document.getElementById('root')),noop=()=>{}
 for(const [language,label] of [['zh','新增分类'],['ms','Tambah Kategori'],['en','Add Category']]){
  await act(async()=>root.render(React.createElement(I18nProvider,{language},React.createElement(Materials,{currentUser:{systemRole:'owner_admin'},notify:noop,fail:noop}))))
  assert.equal(document.querySelector('.master-actions button').textContent,label)
  assert.equal(document.querySelectorAll('#materials-header-back button').length,1)
  assert.equal(document.querySelectorAll('#root .material-back-button').length,0)
 }
 await act(async()=>document.querySelector('.category-open').click())
 assert.equal(document.querySelectorAll('.category-open').length,0)
 await act(async()=>document.querySelector('#materials-header-back button').click())
 assert.equal(document.querySelectorAll('.category-open').length,1)
 assert.ok(calls.every(call=>call.method==='GET'))
 await act(async()=>root.unmount())
 assert.equal(document.querySelectorAll('#materials-header-back button').length,0)
})
