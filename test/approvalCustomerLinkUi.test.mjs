import test,{after} from 'node:test'
import assert from 'node:assert/strict'
import React,{act} from 'react'
import {createServer} from 'vite'
import {JSDOM} from 'jsdom'
const dom=new JSDOM('<html><body><div id="root"></div></body></html>',{url:'https://localhost/'})
for(const k of ['window','document','Node','NodeFilter','HTMLElement','MutationObserver','Event','MouseEvent','localStorage','sessionStorage'])globalThis[k]=dom.window[k]
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true})
globalThis.IS_REACT_ACT_ENVIRONMENT=true;window.scrollTo=()=>{}
const{createRoot}=await import('react-dom/client'),vite=await createServer({logLevel:'silent',server:{middlewareMode:true},appType:'custom'})
after(()=>vite.close())
const{I18nProvider}=await vite.ssrLoadModule('/src/i18n.jsx'),{default:Link}=await vite.ssrLoadModule('/src/ApprovalCustomerLink.jsx')
test('approval name opens public branch code without toggling the parent or writing; missing identity stays plain',async()=>{
 const calls=[];let parentClicks=0
 globalThis.fetch=async(url,options={})=>{calls.push({url,method:options.method||'GET'});throw Error('Read denied')}
 const root=createRoot(document.getElementById('root'))
 const render=code=>root.render(React.createElement(I18nProvider,{language:'en'},React.createElement('div',{onClick:()=>parentClicks++},React.createElement(Link,{branchCode:code},'BASK BEAR SATOK'))))
 try{
  await act(async()=>render('B10317'))
  await act(async()=>document.querySelector('.approval-customer-link').click())
  assert.equal(parentClicks,0);assert.equal(calls[0].url,'/api/master/branches/10317');assert.equal(calls[0].method,'GET')
  assert.ok(document.querySelector('[role=dialog]'));assert.ok(document.querySelector('.approval-customer-link'))
  await act(async()=>document.querySelector('[role=dialog] button').click())
  assert.equal(document.querySelector('[role=dialog]'),null)
  await act(async()=>render(null))
  assert.equal(document.querySelector('.approval-customer-link'),null);assert.match(document.body.textContent,/BASK BEAR SATOK/)
 }finally{await act(async()=>root.unmount())}
})
