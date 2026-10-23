import test,{after} from 'node:test'
import assert from 'node:assert/strict'
import React,{act} from 'react'
import {createServer} from 'vite'
import {JSDOM} from 'jsdom'
const dom=new JSDOM('<html><body><div id="root"></div></body></html>',{url:'https://localhost/',pretendToBeVisual:true})
for(const k of ['window','document','Node','NodeFilter','HTMLElement','MutationObserver','Event','MouseEvent','localStorage','sessionStorage'])globalThis[k]=dom.window[k]
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true
const {createRoot}=await import('react-dom/client')
const vite=await createServer({logLevel:'silent',server:{middlewareMode:true},appType:'custom'})
after(()=>vite.close())
const {default:Planner}=await vite.ssrLoadModule('/src/WeeklyDispatchPage.jsx')
const {I18nProvider}=await vite.ssrLoadModule('/src/i18n.jsx')
test('planner coalesces background requests, pauses after failure and offers explicit retry',async()=>{
  const root=createRoot(document.getElementById('root'));let count=0,reject,resolve
  globalThis.fetch=()=>{count++;return new Promise((yes,no)=>{resolve=yes;reject=no})}
  try{
    await act(async()=>root.render(React.createElement(I18nProvider,{language:'en'},React.createElement(Planner,{currentUser:{role:'driver'}}))))
    assert.equal(count,1)
    await act(async()=>{window.dispatchEvent(new Event('focus'));window.dispatchEvent(new Event('focus'))})
    assert.equal(count,1)
    await act(async()=>reject(Error('offline')))
    assert.match(document.body.textContent,/Automatic refresh is paused/)
    assert.doesNotMatch(document.body.textContent,/Loading dispatch data/)
    await act(async()=>window.dispatchEvent(new Event('focus')))
    assert.equal(count,1)
    const retry=[...document.querySelectorAll('button')].find(b=>b.textContent==='Retry')
    assert.ok(retry);await act(async()=>retry.click());assert.equal(count,2)
    await act(async()=>resolve({ok:true,json:async()=>({days:[]})}))
    assert.equal(document.querySelector('[role="alert"]'),null)
    assert.match(document.body.textContent,/No draft for this date/)
  }finally{await act(async()=>root.unmount())}
})
