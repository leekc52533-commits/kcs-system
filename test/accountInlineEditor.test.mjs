import test,{after} from 'node:test'
import assert from 'node:assert/strict'
import React,{act} from 'react'
import {createServer} from 'vite'
import {JSDOM} from 'jsdom'
const dom=new JSDOM('<html><body><div id="root"></div></body></html>',{url:'https://localhost/'})
for(const k of ['window','document','Node','NodeFilter','HTMLElement','MutationObserver','Event','MouseEvent','localStorage','sessionStorage'])globalThis[k]=dom.window[k]
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true})
globalThis.IS_REACT_ACT_ENVIRONMENT=true
Object.defineProperty(HTMLElement.prototype,'clientWidth',{get(){return this.classList.contains('compact-table-scroll')?600:0},configurable:true})
Object.defineProperty(HTMLElement.prototype,'scrollWidth',{get(){return this.classList.contains('compact-table-scroll')?1200:0},configurable:true})
HTMLElement.prototype.getBoundingClientRect=function(){return{left:30,right:630,top:100,bottom:900,width:600,height:800}}
let records=[{id:1,employeeCode:'EMP-0001',employeeName:'First Employee',username:'EMP-0001',role:'driver',isActive:true},{id:2,employeeCode:'EMP-0002',employeeName:'Second Employee',username:'EMP-0002',role:'crew',isActive:true}],writes=[]
globalThis.fetch=async(url,options={})=>{if(options.method==='PATCH'){writes.push(url);return{ok:true,json:async()=>records.find(r=>url.endsWith('/'+r.id))}}return{ok:true,json:async()=>url==='/api/resources'?{employees:[]}:{items:records.map(r=>({...r}))}}}
const {createRoot}=await import('react-dom/client'),vite=await createServer({logLevel:'silent',server:{middlewareMode:true},appType:'custom'})
after(()=>vite.close())
const {default:Page}=await vite.ssrLoadModule('/src/AccountManagementPage.jsx'),{I18nProvider}=await vite.ssrLoadModule('/src/i18n.jsx')
const click=async node=>{assert.ok(node);await act(async()=>{node.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}))})}
test('name opens editor immediately below that employee, switching/save/close retain correct identity',async()=>{
 const root=createRoot(document.getElementById('root'))
 await act(async()=>root.render(React.createElement(I18nProvider,{language:'en'},React.createElement(Page,{account:{id:99,role:'owner_admin'}}))))
 await click(document.querySelectorAll('.entity-name-link')[0])
 let editor=document.querySelector('.account-editor'),row=editor.closest('tr')
 assert.ok(row.previousElementSibling.textContent.includes('First Employee'))
 assert.equal(document.querySelectorAll('.account-editor').length,1)
 await click(document.querySelectorAll('.entity-name-link')[1])
 editor=document.querySelector('.account-editor');assert.ok(editor.closest('tr').previousElementSibling.textContent.includes('Second Employee'))
 await click([...editor.querySelectorAll('button')].find(b=>b.textContent==='Save'))
 assert.deepEqual(writes,['/api/auth/accounts/2'])
 assert.ok(document.querySelector('.account-editor').closest('tr').previousElementSibling.textContent.includes('Second Employee'))
 await click(document.querySelector('.account-editor header > button'))
 assert.equal(document.querySelector('.account-editor'),null)
 const scroller=document.querySelector('.compact-table-scroll'),slider=document.querySelector('.table-bottom-scroll input')
 assert.ok(slider);assert.equal(slider.max,'600')
 await act(async()=>{scroller.scrollLeft=240;scroller.dispatchEvent(new Event('scroll'))})
 assert.equal(slider.value,'240')
 await act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(slider,'420');slider.dispatchEvent(new Event('input',{bubbles:true}))})
 assert.equal(scroller.scrollLeft,420)
 await act(async()=>root.unmount());assert.equal(document.querySelector('.table-bottom-scroll'),null)
})
