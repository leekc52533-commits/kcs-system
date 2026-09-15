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
const{default:Table}=await vite.ssrLoadModule('/src/CompactDataTable.jsx')
test('name entry replaces plus column and supports keyboard without double toggling; default tables keep plus',async()=>{
 const root=createRoot(document.getElementById('root')),items=[{id:1,name:'MEDTOWN SATOK'}],labels={selected:'{count} selected',columns:'Columns',selectAll:'All',selectRow:'Select',details:'Details',expand:'Expand',collapse:'Collapse'},columns=[{key:'name',label:'Branch',required:true,render:(item,table)=>React.createElement('button',{'aria-expanded':table.open,onClick:e=>{e.stopPropagation();table.toggleDetails()}},item.name)}]
 const props={items,rowKey:x=>x.id,columns,labels,renderDetails:()=>React.createElement('div',null,'Reason and history')}
 try{
  await act(async()=>root.render(React.createElement(Table,{...props,hideExpandColumn:true})))
  assert.equal(document.querySelector('.compact-expand'),null)
  const button=document.querySelector('tbody button');await act(async()=>button.click())
  assert.match(document.querySelector('.compact-detail-row').textContent,/Reason and history/)
  assert.equal(document.querySelector('.compact-detail-row td').colSpan,2)
  await act(async()=>button.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Enter',bubbles:true})))
  assert.equal(button.getAttribute('aria-expanded'),'true')
  await act(async()=>button.click());assert.equal(document.querySelector('.compact-detail-row'),null)
  await act(async()=>root.render(React.createElement(Table,props)))
  assert.ok(document.querySelector('.compact-expand button'))
 }finally{await act(async()=>root.unmount())}
})
