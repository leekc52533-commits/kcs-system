import test,{after} from 'node:test'
import assert from 'node:assert/strict'
import React,{act} from 'react'
import {createServer} from 'vite'
import {JSDOM} from 'jsdom'
const dom=new JSDOM('<html><body><div id="root"></div></body></html>',{url:'https://localhost/'})
for(const k of ['window','document','Node','NodeFilter','HTMLElement','MutationObserver','Event','MouseEvent','localStorage','sessionStorage'])globalThis[k]=dom.window[k]
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true
const employees=[{id:1,name:'First Employee',employeeCode:'EMP-0001',employmentStatus:'active',employmentType:'Permanent',jobRole:'Driver',accountId:10,username:'first',systemRole:'driver',accountActive:true},{id:2,name:'Former Employee',employeeCode:'EMP-0002',employmentStatus:'resigned',employmentType:'Permanent',jobRole:'Driver',accountId:20,username:'former',systemRole:'driver',accountActive:false}].map(e=>({...e,documents:[],employmentPeriods:[],history:[],additionalRoles:[],usualAreaIds:[],accountPermissions:[]}))
let writes=[]
globalThis.fetch=async(url,options={})=>{if(options.method==='PATCH')writes.push([url,JSON.parse(options.body)]);return{ok:true,json:async()=>url.endsWith('next-code')?{employeeCode:'EMP-0003'}:url.startsWith('/api/employees/')?employees.find(e=>url.endsWith('/'+e.id)):{}}}
const{createRoot}=await import('react-dom/client'),vite=await createServer({logLevel:'silent',server:{middlewareMode:true},appType:'custom'})
after(()=>vite.close())
const{default:Page}=await vite.ssrLoadModule('/src/EmployeeMasterPage.jsx'),{I18nProvider}=await vite.ssrLoadModule('/src/i18n.jsx')
const click=async node=>{assert.ok(node);await act(async()=>node.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true})))}
test('one employee list defaults current, opens full inline account editor and groups former employees',async()=>{
 const root=createRoot(document.getElementById('root')),props={resources:{employees,locations:[],areas:[]},currentUser:{role:'admin',systemRole:'owner_admin'},account:{id:99,role:'owner_admin'},reload:async()=>{}}
 await act(async()=>root.render(React.createElement(I18nProvider,{language:'en'},React.createElement(Page,props))))
 assert.equal(document.querySelectorAll('.employee-toolbar .active').length,1)
 assert.equal(document.querySelectorAll('.entity-name-link').length,1)
 await click(document.querySelector('.entity-name-link'))
 const panel=document.querySelector('.employee-inline-panel');assert.ok(panel.closest('tr').previousElementSibling.textContent.includes('First Employee'))
 assert.ok(panel.querySelector('.employee-account-card'));assert.ok([...panel.querySelectorAll('button')].some(b=>b.textContent==='Reset password'))
 await click([...panel.querySelectorAll('button')].find(b=>b.textContent==='Disable login'))
 assert.deepEqual(writes,[['/api/auth/accounts/10',{isActive:false}]])
 await click(document.querySelector('[data-staff-view=departed]'))
 assert.equal(document.querySelectorAll('.entity-name-link').length,1);assert.equal(document.querySelector('.entity-name-link').textContent,'Former Employee')
 await click(document.querySelector('.entity-name-link'))
 assert.ok([...document.querySelectorAll('button')].find(b=>b.textContent==='Enable login').disabled)
 await act(async()=>root.unmount())
})
test('new employee offers optional account within same form in all languages',async()=>{
 for(const language of ['en','ms','zh']){
 const root=createRoot(document.getElementById('root'));await act(async()=>root.render(React.createElement(I18nProvider,{language},React.createElement(Page,{resources:{employees,locations:[],areas:[]},currentUser:{role:'admin',systemRole:'owner_admin'},account:{role:'owner_admin'},reload:async()=>{}}))))
 await click(document.querySelector('[data-staff-view=create]'))
 assert.equal(document.querySelectorAll('.employee-toolbar .active').length,1)
 assert.equal(document.querySelector('.employee-toolbar .active').dataset.staffView,'create')
 assert.ok(!document.querySelector('.employee-create-mode').textContent.includes('Usual/Familiar'))
 const box=document.querySelector('.employee-create-mode input[type=checkbox]');await click(box)
 assert.ok(document.querySelector('.employee-create-mode input[autocomplete="new-password"]'))
 assert.ok(!document.body.textContent.includes('staff.createLogin'))
 assert.ok(!document.body.textContent.includes('System Accounts tab'))
 await act(async()=>root.unmount())
 }
})
