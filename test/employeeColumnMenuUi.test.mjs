import test,{after} from 'node:test'
import assert from 'node:assert/strict'
import React,{act,useState} from 'react'
import {createServer} from 'vite'
import {JSDOM} from 'jsdom'
const dom=new JSDOM('<html><body><div id="root"></div></body></html>',{url:'https://localhost/'})
for(const k of ['window','document','Node','NodeFilter','HTMLElement','MutationObserver','Event','MouseEvent','localStorage','sessionStorage','FileReader'])globalThis[k]=dom.window[k]
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true
const{createRoot}=await import('react-dom/client'),vite=await createServer({logLevel:'silent',server:{middlewareMode:true},appType:'custom'})
after(()=>vite.close())

const{EmployeeDirectory}=await vite.ssrLoadModule('/src/EmployeeMasterPage.jsx'),{I18nProvider}=await vite.ssrLoadModule('/src/i18n.jsx')
const{employeeMatchesDirectory,sortEmployeeDirectory}=await vite.ssrLoadModule('/src/employeeMasterState.js')
const rows=[{id:10,employeeCode:'EMP-10',name:'Zulu',jobRole:'Driver',phone:'',employmentPeriods:[{startDate:'2024-01-01',employmentStatus:'active'}]},{id:2,employeeCode:'EMP-2',name:'Alpha',jobRole:'Office',phone:'0123',employmentPeriods:[{startDate:'2026-01-01',employmentStatus:'active'}]},{id:3,employeeCode:'EMP-3',name:'Beta',jobRole:'Driver',phone:'0124',employmentPeriods:[{startDate:'2025-01-01',employmentStatus:'active'}]}]
function Harness(){const[filters,setFilters]=useState({columns:{}}),[sort,setSort]=useState({});return React.createElement(EmployeeDirectory,{items:sortEmployeeDirectory(rows.filter(r=>employeeMatchesDirectory(r,filters)),sort),optionItems:rows,filters,setFilters,sort,setSort,openEmployee:()=>{},renderDetail:()=>null})}
const click=async n=>act(async()=>n.dispatchEvent(new MouseEvent('click',{bubbles:true})))
const ids=()=>[...document.querySelectorAll('tbody>tr')].map(r=>r.firstElementChild.textContent)
const open=async index=>click(document.querySelectorAll('.expense-filter-trigger')[index])
const boxes=()=>[...document.querySelectorAll('.expense-filter-menu input[type=checkbox]')]
const choose=async value=>click(boxes().find(b=>b.value===value))
test('all eleven employee menus share archive layout; one at a time, search, multi-select, blank and sorting in three languages',async()=>{
 for(const language of ['en','ms','zh']){
  const root=createRoot(document.getElementById('root'))
  await act(async()=>root.render(React.createElement(I18nProvider,{language},React.createElement(Harness))))
  assert.equal(document.querySelectorAll('.expense-filter-trigger').length,11)
  await open(0);await open(1);assert.equal(document.querySelectorAll('[role=dialog]').length,1)
  assert.equal(document.querySelectorAll('[aria-expanded=true]').length,1)
  await open(0);await click(document.querySelector('.archive-sort-actions button'));assert.deepEqual(ids(),['EMP-2','EMP-3','EMP-10'])
  await open(6);await click(document.querySelectorAll('.archive-sort-actions button')[1]);assert.deepEqual(ids(),['EMP-2','EMP-3','EMP-10'])
  await open(10);await click(boxes()[0]);assert.deepEqual(ids(),[])
  await choose('');assert.deepEqual(ids(),['EMP-10'])
  await choose('0123');assert.deepEqual(ids(),['EMP-2','EMP-10'])
  assert.equal(boxes().length,4) // Available choices do not shrink with results.
  await open(2);await click(boxes()[0]);await choose('Office');assert.deepEqual(ids(),['EMP-2'])
  const input=document.querySelector('.expense-filter-menu input:not([type=checkbox])')
  await act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(input,'zzzz');input.dispatchEvent(new Event('input',{bubbles:true}))})
  assert.equal(document.querySelectorAll('.archive-check-options label').length,0)
  assert.deepEqual(ids(),['EMP-2']) // Searching options does not change selection.
  await click(document.querySelector('.expense-filter-menu').lastElementChild.firstElementChild)
  assert.deepEqual(ids(),['EMP-2','EMP-10'])
  await act(async()=>document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})))
  assert.equal(document.querySelector('[role=dialog]'),null)
  await open(10);await click(document.querySelector('.expense-filter-menu').lastElementChild.firstElementChild);assert.equal(ids().length,3)
  await click(document.querySelector('.expense-filter-menu').lastElementChild.lastElementChild);assert.equal(document.querySelector('[role=dialog]'),null)
  await act(async()=>root.unmount())
 }
})
