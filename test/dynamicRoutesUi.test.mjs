import test,{after} from 'node:test'
import assert from 'node:assert/strict'
import React,{act} from 'react'
import {createServer} from 'vite'
import {JSDOM} from 'jsdom'
const dom=new JSDOM('<html><body><div id="root"></div></body></html>',{url:'https://localhost/'})
for(const k of ['window','document','Node','NodeFilter','HTMLElement','MutationObserver','Event','MouseEvent','localStorage','sessionStorage'])globalThis[k]=dom.window[k]
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true
const {createRoot}=await import('react-dom/client'),vite=await createServer({logLevel:'silent',server:{middlewareMode:true},appType:'custom'})
after(()=>vite.close())
const {default:ZoneGroupManager}=await vite.ssrLoadModule('/src/ZoneGroupManager.jsx'),{I18nProvider}=await vite.ssrLoadModule('/src/i18n.jsx')
const click=async n=>act(async()=>n.dispatchEvent(new MouseEvent('click',{bubbles:true})))
const input=async(n,value)=>act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(n,value);n.dispatchEvent(new Event('input',{bubbles:true}))})
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}})

test('add fixed route in all languages: preserves draft on outside close and failure, appends saved route',async()=>{
 for(const [language,label] of [['zh','新增路线'],['ms','Tambah laluan'],['en','Add route']]){
  const calls=[];let fail=true
  globalThis.fetch=async(url,init={})=>{
   calls.push({url,init})
   if(url==='/api/dispatch/routes'&&init.method==='POST')return fail?json({error:'Name exists'},409):json({routeNumber:6,name:'New North'},201)
   return json({routes:[{routeNumber:1,name:'Existing'}]})
  }
  const root=createRoot(document.getElementById('root'))
  await act(async()=>root.render(React.createElement(I18nProvider,{language},React.createElement(ZoneGroupManager,{groups:[],areas:[],vehicles:[],currentUser:{systemRole:'supervisor'},save:async()=>true}))))
  const add=()=>[...document.querySelectorAll('.route-name-manager > button')].find(n=>n.textContent===label)
  assert.ok(add());await click(add())
  await input(document.querySelector('[aria-labelledby="new-route-title"] input'),'New North')
  await act(async()=>document.querySelector('.route-name-manager .zone-rename-backdrop').dispatchEvent(new MouseEvent('mousedown',{bubbles:true})))
  assert.equal(document.querySelector('[aria-labelledby="new-route-title"]'),null)
  await click(add());assert.equal(document.querySelector('[aria-labelledby="new-route-title"] input').value,'New North')
  const submit=()=>act(async()=>document.querySelector('[aria-labelledby="new-route-title"] form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})))
  await submit();assert.equal(document.querySelector('[aria-labelledby="new-route-title"] input').value,'New North')
  fail=false;await submit();assert.equal(document.querySelector('[aria-labelledby="new-route-title"]'),null)
  assert.ok(document.querySelector('.route-name-list').textContent.includes('New North'))
  assert.equal(JSON.parse(calls.find(c=>c.init.method==='POST').init.body).name,'New North')
  await act(async()=>root.unmount())
 }
})
