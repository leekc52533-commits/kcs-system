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
const{default:Page}=await vite.ssrLoadModule('/src/CollectionHistoryPage.jsx'),{I18nProvider}=await vite.ssrLoadModule('/src/i18n.jsx')
const change=async(el,value)=>act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}))})
test('company search needs no date, opens branch history, keeps requested and approved dates distinct in three languages',async()=>{
 for(const language of ['en','ms','zh']){
 const calls=[];globalThis.fetch=async url=>{calls.push(String(url));return{ok:true,json:async()=>String(url).includes('/master/branches')?{items:[{branchId:'B10001',branchName:'Store One',customerName:'Company',status:'active'}],pagination:{pages:1}}:{branch:{branchId:'B10001',branchName:'Store One',customerName:'Company',enabled:true},current:[{scheduleId:'123',frequency:'Weekly',weekdays:['Monday'],nextFixedDate:'2026-09-21'}],routes:[],upcoming:[],history:[{id:'1',time:'2026-01-01 17:00:00',type:'request',status:'approved',scope:'once',actor:'Driver',reviewer:'KC',reason:'Holiday',before:{sourceDate:'2026-01-03'},after:{requestedDate:'2026-01-04',approvedDate:'2026-01-05'}}]}}}
 const root=createRoot(document.getElementById('root'));try{
 await act(async()=>root.render(React.createElement(I18nProvider,{language},React.createElement(Page))));assert.equal(document.querySelectorAll('input[type=date]').length,0);
 await change(document.querySelector('form input'),'Company');await act(async()=>document.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 assert.match(calls[0],/search=Company/);await act(async()=>document.querySelector('.history-link').click());assert.ok(calls.some(c=>c.endsWith('branchId=B10001&from=&to=')));
 for(const value of ['2026-01-03','2026-01-04','2026-01-05','2026-01-02','Holiday','KC'])assert.ok(document.body.textContent.includes(value),value);
 assert.equal(document.querySelectorAll('.archive-table table').length,2);assert.equal(document.querySelectorAll('input[type=date]').length,2)
 }finally{await act(async()=>root.unmount())}
 }
})
