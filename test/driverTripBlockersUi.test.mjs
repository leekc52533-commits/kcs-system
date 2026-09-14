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


const{default:Blockers}=await vite.ssrLoadModule('/src/DriverTripBlockers.jsx'),{I18nProvider}=await vite.ssrLoadModule('/src/i18n.jsx')
test('driver blockers localize actions and only link actionable stops',async()=>{
 for(const language of ['en','ms','zh']){
 const root=createRoot(document.getElementById('root')),visited=[]
 await act(async()=>root.render(React.createElement(I18nProvider,{language},React.createElement(Blockers,{items:[{stopId:1,stopSequence:1,branchName:'MEDTOWN SATOK',issue:'closed_protected',contactSupervisor:true,canGo:false},{stopId:2,stopSequence:2,branchName:'Customer B',issue:'proof',canGo:true,contactSupervisor:false}],onGo:id=>visited.push(id),busy:false}))))
 assert.equal(document.querySelectorAll('button').length,1);assert.ok(document.querySelector('[role=alert]'));assert.match(document.body.textContent,/MEDTOWN SATOK/)
 assert.ok(document.body.textContent.includes(({en:'Contact your supervisor',ms:'Hubungi penyelia',zh:'请联系主管处理'})[language]))
 await act(async()=>document.querySelector('button').dispatchEvent(new MouseEvent('click',{bubbles:true})))
 assert.deepEqual(visited,[2]);await act(async()=>root.unmount())
 }
})
