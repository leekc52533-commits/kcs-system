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
globalThis.fetch=async(url,options={})=>{if(options.method==='PATCH')writes.push([url,JSON.parse(options.body)]);return{ok:true,json:async()=>url.startsWith('/api/attendance/employees/')?{mode:'company',locations:[],records:[],radiusM:200,revision:0}:url.endsWith('next-code')?{employeeCode:'EMP-0003'}:url.startsWith('/api/employees/')?employees.find(e=>url.endsWith('/'+e.id)):{}}}
const{createRoot}=await import('react-dom/client'),vite=await createServer({logLevel:'silent',server:{middlewareMode:true},appType:'custom'})
after(()=>vite.close())
const{default:Page}=await vite.ssrLoadModule('/src/EmployeeMasterPage.jsx'),{I18nProvider}=await vite.ssrLoadModule('/src/i18n.jsx')
const click=async node=>{assert.ok(node);await act(async()=>node.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true})))}
window.scrollTo=()=>{}
test('header back stays in directory, preserves scroll and protects unsaved edits; save requires reason and exits only on success',async()=>{
 const root=createRoot(document.getElementById('root'));let back=null,reloads=0,fail=false,promptValue=null
 globalThis.prompt=()=>promptValue;globalThis.confirm=()=>false
 globalThis.fetch=async(url,options={})=>{
  if(options.method==='PATCH'){
   if(fail)return {ok:false,status:500,headers:{get:()=>''},json:async()=>({message:'Save failed'})}
   writes.push([url,JSON.parse(options.body)])
  }
  return{ok:true,json:async()=>url.startsWith('/api/attendance/employees/')?{mode:'company',locations:[],records:[],radiusM:200,revision:0}:url.endsWith('next-code')?{employeeCode:'EMP-0003'}:url.startsWith('/api/employees/')?employees.find(e=>url.endsWith('/'+e.id)):{}}
 }
 const props={resources:{employees,locations:[],areas:[]},currentUser:{role:'admin',systemRole:'owner_admin'},account:{id:99,role:'owner_admin'},reload:async()=>{reloads++},onDetailBackChange:value=>{back=typeof value==='function'?value():value}}
 const edit=async()=>{const el=document.querySelector('.employee-inline-panel textarea');await act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set.call(el,'New address');el.dispatchEvent(new Event('input',{bubbles:true}))})}
 const save=()=>click(document.querySelector('.employee-detail-actions .primary'))
 try{
 await act(async()=>root.render(React.createElement(I18nProvider,{language:'en'},React.createElement(Page,props))))
 document.querySelector('.employee-directory-table').scrollLeft=125
 await click(document.querySelector('.entity-name-link'));assert.equal(typeof back,'function')
 await act(async()=>back());assert.ok(document.querySelector('.employee-directory-table'));assert.equal(document.querySelector('.employee-directory-table').scrollLeft,125);assert.equal(back,null)
 await click(document.querySelector('.entity-name-link'));await edit()
 await act(async()=>back());assert.ok(document.querySelector('.employee-inline-panel'))
 promptValue='   ';await save();assert.equal(writes.length,0);assert.ok(document.querySelector('.employee-inline-panel'))
 promptValue='Correct home address';fail=true;await save();assert.ok(document.querySelector('.employee-inline-panel'));assert.equal(reloads,0)
 fail=false;await save();assert.equal(document.querySelector('.employee-inline-panel'),null);assert.ok(document.querySelector('.employee-directory-table'));assert.equal(reloads,1)
 assert.equal(writes[0][1].reason,'Correct home address');assert.equal(back,null);assert.equal(document.querySelector('.employee-directory-table').scrollLeft,125)
 }finally{await act(async()=>root.unmount())}
})
