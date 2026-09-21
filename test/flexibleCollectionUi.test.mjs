import test,{after} from 'node:test'
import assert from 'node:assert/strict'
import React,{act} from 'react'
import {createServer} from 'vite'
import {JSDOM} from 'jsdom'
const dom=new JSDOM('<html><body><div id="root"></div></body></html>',{url:'https://localhost/'})
for(const k of ['window','document','Node','NodeFilter','HTMLElement','MutationObserver','Event','MouseEvent','localStorage','sessionStorage'])globalThis[k]=dom.window[k]
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true
const{createRoot}=await import('react-dom/client'),vite=await createServer({logLevel:'silent',server:{middlewareMode:true},appType:'custom'});after(()=>vite.close())
const{default:Switch}=await vite.ssrLoadModule('/src/RouteCollectionSwitch.jsx')
const{I18nProvider}=await vite.ssrLoadModule('/src/i18n.jsx'),{default:Page}=await vite.ssrLoadModule('/src/FlexibleCollectionPanel.jsx')
test('owner switches use live revision and translated labels; supervisors retain dispatch without toggle controls',async()=>{
 for(const language of ['zh','en','ms'])for(const canEdit of [true,false]){
  const root=createRoot(document.getElementById('root')),calls=[];let isOpen=0,revision=4
  globalThis.fetch=async(url,options={})=>{calls.push([url,options]);if(options.method==='PATCH'){const p=JSON.parse(options.body);assert.equal(p.revision,4);assert.equal(p.isOpen,true);isOpen=1;revision++}return{ok:true,json:async()=>({canEdit,items:[{id:1,name:'Kuching MPKS',isOpen,active:1,revision}]})}}
  try{await act(async()=>root.render(React.createElement(I18nProvider,{language},React.createElement(React.Fragment,null,React.createElement(Switch,{routeNumber:1,access:{data:{canEdit,items:[{id:1,name:'Kuching MPKS',isOpen:0,revision:4}]},refresh:async()=>{}}}),React.createElement(Page)))))
   if(canEdit)assert.match(document.querySelector('[role=switch]').getAttribute('aria-label'),/Kuching MPKS/);assert.equal(document.body.textContent.includes('flex.'),false)
   assert.equal(document.querySelectorAll('[role=switch]').length,canEdit?1:0)
   assert.ok(document.querySelector('details form'));assert.equal(document.querySelectorAll('input[type=date]').length,0)
   if(canEdit){await act(async()=>document.querySelector('[role=switch]').click());assert.equal(calls.filter(c=>c[1].method==='PATCH').length,1);assert.equal(calls.find(c=>c[1].method==='PATCH')[0],'/api/route-collection-access/1')}
  }finally{await act(async()=>root.unmount())}
 }
})
