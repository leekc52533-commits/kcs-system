import test,{after} from 'node:test'
import assert from 'node:assert/strict'
import React,{act} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'

import {createServer} from 'vite'
import {JSDOM} from 'jsdom'
import {translateUi,operationalUiMessages} from '../src/translations.js'
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost/?page=operations&tab=weekly'})
for(const k of ['window','document','Node','NodeFilter','HTMLElement','MutationObserver','Event','MouseEvent','PopStateEvent','localStorage','sessionStorage'])globalThis[k]=dom.window[k]
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true})
globalThis.IS_REACT_ACT_ENVIRONMENT=true
const {createRoot}=await import('react-dom/client')
const vite=await createServer({logLevel:'silent',server:{middlewareMode:true},appType:'custom'})
after(()=>vite.close())
const zone=await vite.ssrLoadModule('/src/ZoneGroupManager.jsx')
const i18n=await vite.ssrLoadModule('/src/i18n.jsx'),schedule=await vite.ssrLoadModule('/src/DataPages.jsx'),weekly=await vite.ssrLoadModule('/src/WeeklyDispatchPage.jsx'),mobile=await vite.ssrLoadModule('/src/AuthPages.jsx'),app=await vite.ssrLoadModule('/src/App.jsx')
const noop=()=>{},el=React.createElement
const wrap=(lang,child)=>el(i18n.I18nProvider,{language:lang,setLanguage:noop},child)
const html=(lang,component,props)=>renderToStaticMarkup(wrap(lang,el(component,props)))
function visible(markup){const d=new JSDOM(markup).window.document;d.querySelectorAll('[data-i18n-raw]').forEach(x=>x.remove());return d.body.textContent}
function noChinese(lang,markup){if(lang!=='zh')assert.doesNotMatch(visible(markup),/[\p{Script=Han}]/u)}
const item={branchId:'B10048',branchName:'Daily',area:'BATU 7',zone:'Serian B — Penrissen',homeRouteNumber:1,frequency:'Daily',weekdays:['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'],updatedAt:'1',routeOptions:[{routeNumber:1,name:'Serian Penrissen'},{routeNumber:2,name:'Kuching MPKS'},{routeNumber:6,name:'New Route'}]}
const day={id:1,dispatch_date:'2026-09-13',status:'draft',revision:1,routeBoards:[{routeNumber:2,name:'Kuching MPKS',customerCount:1,vehicleId:2,registrationNumber:'QM630S',approvalStatus:'draft',stops:[]}]}
const vehicle={id:2,registrationNumber:'QM630S',vehicleCode:'Lorry 6',status:'available'}
let calls=[]
function mockFetch(url,options={}){calls.push([url,options]);let data={};
 if(url==='/api/auth/session')data={account:{id:1,username:'supervisor',role:'supervisor',employeeName:'KC',preferredLanguage:'en',permissions:[]}}
 else if(url==='/api/system/status')data={database:'connected',schemaVersion:54}
 else if((String(url).includes('/api/dispatch/week')||url==='/api/dispatch/ensure-rolling-week'))data={days:[],vehicles:[],employees:[]}
 else if(url==='/api/dashboard/summary')data={routeReadyCount:1,branchCount:1,scheduledMissingGpsCount:0,noScheduleCount:0,unmatchedScheduleCount:0}
 else if(url==='/api/mobile/cash-float')data={configured:true,lowBalance:true,balanceCents:200,today:{topUpCents:300,purchaseCents:50,expenseCents:50}}
 else if(String(url).endsWith('/billing'))data={bill:null,products:[{productId:1,productCode:'OCC',shortForm:'OCC',fullName:'OCC',currentPrice:0.2}],stop:{paymentMethod:'Cash',branchName:'Daily'}}
 else if(String(url).includes('/collection-schedule'))data={item}
 else if(String(url).includes('/collection-schedule-management'))data={items:[item]}
 else if(String(url).includes('dashboard')||String(url).includes('approvals')||String(url).includes('alerts'))data={items:[],pending:[],summary:{},employeeRequests:[],deferRequests:[],approvals:[]}
 return Promise.resolve({ok:true,status:200,headers:{get:()=>null},json:async()=>data})
}
globalThis.fetch=mockFetch
async function mount(lang,component,props){const container=document.createElement('div');document.body.append(container);const root=createRoot(container);await act(async()=>{root.render(wrap(lang,el(component,props)));await new Promise(r=>setTimeout(r,25))});return{container,root,close:async()=>{await act(async()=>root.unmount());container.remove()}}}
test('all operational phrases have three nonempty translations and parameter messages localize',()=>{
 for(const row of operationalUiMessages){assert.equal(row.length,4);row.forEach(v=>assert.ok(v.trim()));assert.doesNotMatch(row[1]+row[2],/[\p{Script=Han}]/u)}
 assert.equal(translateUi('ms','Route 6 has no customers.'),'Laluan 6 tiada pelanggan.')
 assert.equal(translateUi('zh','Monday, Tuesday'),'星期一, 星期二')
 assert.equal(translateUi('en','Serian Penrissen'),'Serian Penrissen')
})
test('schedule editor translates labels and weekdays but preserves frequency and route option values',()=>{
 for(const lang of ['en','ms','zh']){const markup=html(lang,schedule.ScheduleEditor,{item,t:k=>k,onClose:noop,onSaved:noop});noChinese(lang,markup);const d=new JSDOM(markup).window.document;
 assert.ok(d.body.textContent.includes(translateUi(lang,'星期日执行路线')))
 assert.ok(d.body.textContent.includes(translateUi(lang,'Monday')))
 assert.ok(d.querySelector('option[value="Daily"]'));assert.equal(d.querySelector('option[value="Daily"]').textContent,translateUi(lang,'Daily'))
 assert.equal(d.querySelector('option[value="6"]').textContent,'New Route')
 assert.ok(markup.includes('data-i18n-raw'))
 }
})
test('route cards and weekly dates use chosen language, including a newly supplied route',()=>{
 for(const lang of ['en','ms','zh']){const cards=html(lang,weekly.RouteAssignmentPanel,{day,days:[day],vehicles:[vehicle],employees:[],canEdit:true,canHandover:false,onAssign:noop,onRename:noop,onReorder:noop,onApprove:noop,onWithdraw:noop});noChinese(lang,cards);assert.ok(visible(cards).includes(translateUi(lang,'批准这条 Route')));
 const dates=html(lang,weekly.WeekDayTabs,{days:[day],selectedDate:day.dispatch_date,onSelect:noop});noChinese(lang,dates)
 const routes=html(lang,weekly.RouteWeekTabs,{days:[{routeBoards:[...day.routeBoards,{routeNumber:6,name:'New Route'}]}],selectedRouteNumber:6,onSelect:noop});assert.match(routes,/New Route/)
 }
})
test('employee route and receipt translate statuses, action buttons and payment labels',()=>{
 const stop={id:1,stopSequence:1,customerName:'Daily',branchName:'Branch',address:'Jalan Batu 7',status:'pending',canArrive:true,gpsAvailable:false};const data={routeAvailable:true,date:'2026-09-13',weekday:'Sunday',status:'approved',totalStops:1,completedStops:0,pendingStops:1,trips:[{id:1,registrationNumber:'QM630S',tripNumber:1,canStart:true,executionStatus:'pending',currentStopId:1,stops:[stop]}]}
 for(const lang of ['en','ms','zh']){const markup=html(lang,mobile.TodayView,{data});noChinese(lang,markup);assert.ok(visible(markup).includes(translateUi(lang,'Sunday')));assert.ok(visible(markup).includes(translateUi(lang,'Pending')))
 const receipt=html(lang,mobile.PurchaseReceipt,{bill:{billNumber:'P1',serviceDate:'2026-09-13',branchName:'Daily',vehicleCode:'Lorry 6',registrationNumber:'QM630S',paymentMethod:'Cash',totalCents:100,items:[]}});assert.ok(visible(receipt).includes(translateUi(lang,'Cash')));assert.ok(visible(receipt).includes(translateUi(lang,'Total')))
 }
})
test('live language switch keeps a named customer and form state unchanged and saves canonical values',async()=>{
 calls=[];const view=await mount('en',schedule.ScheduleEditor,{item,t:k=>k,onClose:noop,onSaved:noop});try{
 const {container,root}=view;const textarea=container.querySelector('textarea');await act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set.call(textarea,'Sunday exception');textarea.dispatchEvent(new Event('input',{bubbles:true}));textarea.dispatchEvent(new Event('change',{bubbles:true}));});
 await act(async()=>root.render(wrap('ms',el(schedule.ScheduleEditor,{item,t:k=>k,onClose:noop,onSaved:noop}))));
 assert.equal(container.querySelector('option[value="Daily"]').textContent,'Setiap hari');assert.equal(container.querySelector('b[data-i18n-raw]').textContent,'Daily')
 assert.equal(container.querySelector('textarea').value,'Sunday exception');
 await act(async()=>container.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 const saved=calls.find(([url,options])=>url.includes('/collection-schedule')&&options.method==='PATCH');assert.ok(saved);const payload=JSON.parse(saved[1].body);assert.equal(payload.frequency,'Daily');assert.equal(payload.routeNumber,1);assert.deepEqual(payload.weekdays,item.weekdays);
 assert.equal(container.querySelector('select').value,'1');assert.equal(container.querySelector('option[value="Daily"]').value,'Daily')
 }finally{await view.close()}
})
test('mobile billing and expense form show localized text with stable expense category values',async()=>{
 for(const lang of ['en','ms','zh']){const bill=await mount(lang,mobile.PurchaseBillPanel,{stop:{id:1},onChanged:noop});try{noChinese(lang,bill.container.innerHTML);assert.ok(bill.container.textContent.includes(translateUi(lang,'Create Electronic Purchase Bill')));assert.equal(bill.container.querySelector('option[value="print"]').textContent,translateUi(lang,'Create electronic Bill and print'))}finally{await bill.close()}
 const cash=await mount(lang,mobile.CashFloatMobileCard,{});try{const btn=[...cash.container.querySelectorAll('button')].find(x=>x.textContent===translateUi(lang,'Record Expense'));assert.ok(btn);await act(async()=>btn.click());assert.equal(cash.container.querySelector('option[value="Fuel"]').textContent,translateUi(lang,'Fuel'));noChinese(lang,cash.container.innerHTML)}finally{await cash.close()}
 }
})
test('supervisor enters overview from an old URL and saved collector mode',async()=>{
 window.history.replaceState({kcsPage:'operations'},'','/?page=operations&tab=weekly');sessionStorage.setItem('kcs_acting_collector_mode','1');const view=await mount('en',app.default,{});try{assert.equal(new URLSearchParams(window.location.search).get('page'),'dashboard');assert.ok(view.container.querySelector('.dashboard-features'));assert.equal(view.container.querySelector('.mobile-app'),null);const operations=[...view.container.querySelectorAll('.sidebar nav button')].find(b=>b.textContent.includes('Dispatch & Collection'));assert.ok(operations);await act(async()=>{operations.click();await new Promise(r=>setTimeout(r,30))});assert.equal(new URLSearchParams(window.location.search).get('page'),'operations');assert.ok(view.container.querySelector('.planner-page'))}finally{await view.close()}
})

test('area and zone creation dialog translates labels and preserves input values',async()=>{
 for(const lang of ['en','ms','zh']){const view=await mount(lang,zone.default,{groups:[],areas:[],vehicles:[],save:noop,currentUser:{role:'supervisor',systemRole:'supervisor'}});try{
 const add=[...view.container.querySelectorAll('button')].find(b=>b.textContent===translateUi(lang,'＋ Add Zone Group'));assert.ok(add);await act(async()=>add.click());const dialog=view.container.querySelector('[role="dialog"]');assert.ok(dialog);noChinese(lang,dialog.outerHTML);assert.ok(dialog.textContent.includes(translateUi(lang,'Zone Group Name')));assert.ok(dialog.textContent.includes(translateUi(lang,'Code (optional)')))
 }finally{await view.close()}}
})
