import test,{after} from 'node:test'
import assert from 'node:assert/strict'
import React,{act} from 'react'
import {createServer} from 'vite'
import {JSDOM} from 'jsdom'
const dom=new JSDOM('<html><body><div id="root"></div></body></html>',{url:'https://localhost/'})
for(const k of ['window','document','Node','NodeFilter','HTMLElement','MutationObserver','Event','MouseEvent','localStorage','sessionStorage'])globalThis[k]=dom.window[k]
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true
const{createRoot}=await import('react-dom/client'),vite=await createServer({logLevel:'silent',server:{middlewareMode:true},appType:'custom'});after(()=>vite.close())
const{default:Report}=await vite.ssrLoadModule('/src/DailyReport.jsx'),{I18nProvider}=await vite.ssrLoadModule('/src/i18n.jsx')
const{reportWord:w}=await import('../shared/dailyReportWords.js')
const click=label=>{const button=[...(document.querySelector('.daily-report-dialog')||document).querySelectorAll('button,[role="button"]')].find(b=>(b.getAttribute('aria-label')||b.textContent)===label||(label===w('en','open')&&b.classList.contains('daily-report-collapsed'))||(label===w('ms','open')&&b.classList.contains('daily-report-collapsed'))||(label===w('zh','open')&&b.classList.contains('daily-report-collapsed')));assert.ok(button,'button: '+label);button.click()}
const result=date=>({date,generatedAt:'2026-09-15T03:00:00Z',access:{full:true,finance:true},summary:{weightKg:2500},missingSources:[],sections:{vehicles:[{id:'1',name:'Q123',kind:'vehicle',status:'running',quantity:2500,amountCents:null,actor:'KC',time:'',detail:{trips:2,reason:"Sebab hari hujan"}}]}})
test('report loads in all languages; details and saved column order work; failures hide stale totals',async()=>{
 for(const language of ['en','ms','zh']){localStorage.clear();const root=createRoot(document.getElementById('root'));let fail=false;const calls=[];globalThis.fetch=async url=>{calls.push(url);if(fail)throw Error('offline');return{ok:true,json:async()=>result(new URL(url,'https://localhost').searchParams.get('date'))}}
 try{await act(async()=>root.render(React.createElement(I18nProvider,{language},React.createElement(Report,{account:{id:1}}))));assert.equal(calls.length,0);await act(async()=>click(w(language,'open')));assert.equal(document.querySelector('.daily-report-dialog'),null);const entry=[...document.querySelectorAll('.daily-report-matrix button')].find(b=>b.getAttribute('aria-label')===('Q123 · '+w(language,'vehicles')+' · '+w(language,'details')));entry.focus();await act(async()=>entry.click());assert.ok(document.querySelector('.daily-report-dialog'));assert.equal(document.body.style.overflow,'hidden');assert.match(document.querySelector('.daily-report-dialog').textContent,/Q123/);assert.equal(document.querySelector('.daily-report-name').getAttribute('aria-expanded'),'false');assert.equal(document.querySelector('.daily-report-row-reason').textContent,w(language,'reason')+': Sebab hari hujan');await act(async()=>document.querySelector('.daily-report-name').click());assert.match(document.body.textContent,/125.0%/);await act(async()=>document.querySelector('.daily-report-dialog-content').click());assert.equal(document.querySelector('.daily-report-name').getAttribute('aria-expanded'),'false');assert.ok(document.querySelector('.daily-report-dialog'));await act(async()=>document.querySelector('.daily-report-name').click());assert.equal(document.querySelector('.daily-report-name').getAttribute('aria-expanded'),'true')
 const title=language==='zh'?'调整栏目':language==='ms'?'Susun lajur':'Arrange columns';await act(async()=>click(title));assert.ok(document.querySelectorAll('.expense-column-row').length>0);assert.match(document.querySelector('.expense-column-list').textContent,new RegExp(w(language,'name')));await act(async()=>document.querySelector('.expense-column-row button:last-child').click());await act(async()=>document.querySelector('.expense-column-modal form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));assert.equal(JSON.parse(localStorage.getItem('kcs.daily-report.columns.1.vehicles'))[0],'kind')
 await act(async()=>document.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));assert.equal(document.querySelector('.daily-report-dialog'),null);assert.equal(document.activeElement,entry);assert.equal(document.body.style.overflow,'');fail=true;await act(async()=>click(w(language,'refresh')));assert.match(document.body.textContent,new RegExp(w(language,'failed')));assert.equal(document.querySelector('.daily-report-summary'),null)
 }finally{await act(async()=>root.unmount())}}
})
test('a superseded request cannot replace a newer report',async()=>{const root=createRoot(document.getElementById('root'));const pending=[];globalThis.fetch=url=>new Promise(resolve=>pending.push({url,resolve}));try{await act(async()=>root.render(React.createElement(I18nProvider,{language:'en'},React.createElement(Report,{account:{id:1}}))));await act(async()=>click('Open report'));await act(async()=>click('Refresh'));assert.equal(pending.length,2);const date=new URL(pending[1].url,'https://localhost').searchParams.get('date');await act(async()=>pending[1].resolve({ok:true,json:async()=>({...result(date),summary:{weightKg:777}})}));await act(async()=>pending[0].resolve({ok:true,json:async()=>({...result(date),summary:{weightKg:999}})}));assert.match(document.querySelector('.daily-report-matrix').textContent,/777/);assert.doesNotMatch(document.querySelector('.daily-report-matrix').textContent,/999/)}finally{await act(async()=>root.unmount())}})

test('summary selection narrows no-goods, unfinished, cash and pending approval details',async()=>{const {reportSelection}=await vite.ssrLoadModule('/src/DailyReport.jsx');const data={date:'2026-09-15',sections:{stops:[{id:'1',status:'no_goods'},{id:'2',status:'active'},{id:'3',status:'cancelled'},{id:'4',status:'completed',detail:{hasIssuedBill:true}}],bills:[{id:'1',status:'issued',detail:{payment:'Cash'}},{id:'2',status:'issued',detail:{payment:'Credit'}},{id:'3',status:'voided',detail:{payment:'Cash'}}],approvals:[{id:'1',status:'pending'},{id:'2',status:'approved',detail:{reviewedAt:'2026-09-15T09:00:00+08:00'}}]}};assert.deepEqual(reportSelection(data,'noGoodsBranches').rows.map(r=>r.id),['1']);assert.deepEqual(reportSelection(data,'pendingBranches').rows.map(r=>r.id),['2']);assert.deepEqual(reportSelection(data,'cashCents').rows.map(r=>r.id),['1']);assert.deepEqual(reportSelection(data,'pendingApprovals').rows.map(r=>r.id),['1']);data.sections.decisions=[data.sections.approvals[1]];assert.deepEqual(reportSelection(data,'approvals').rows.map(r=>r.id),['2']);})
test('dialog scrollbar stays in its footer, wins over background tables and tracks horizontal position',async()=>{
 const {default:Scroll}=await vite.ssrLoadModule('/src/TableBottomScroll.jsx');const root=createRoot(document.getElementById('root'));let table
 function Fixture(){const scroll=React.useRef(null),dock=React.useRef(null),background=React.useRef(null);const setup=(ref,id)=>el=>{if(!el)return;ref.current=el;if(id==='dialog')table=el;Object.defineProperty(el,'clientWidth',{configurable:true,value:400});Object.defineProperty(el,'scrollWidth',{configurable:true,value:1600});el.getBoundingClientRect=()=>({left:30,right:430,top:50,bottom:550,height:500,width:400})};return React.createElement(React.Fragment,null,React.createElement('div',{ref:setup(background,'background')}),React.createElement(Scroll,{scrollRef:background}),React.createElement('section',{'data-dialog':'true'},React.createElement('div',{ref:setup(scroll,'dialog')}),React.createElement('footer',{ref:dock,className:'daily-report-scroll-dock'}),React.createElement(Scroll,{scrollRef:scroll,dockRef:dock})))}
 try{await act(async()=>root.render(React.createElement(I18nProvider,{language:'en'},React.createElement(Fixture))));const range=document.querySelector('.daily-report-scroll-dock input[type=range]');assert.ok(range);assert.equal(document.querySelectorAll('.table-bottom-scroll').length,1);assert.equal(range.max,'1200');assert.equal(range.parentElement.style.width,'100%');table.scrollLeft=900;await act(async()=>table.dispatchEvent(new Event('scroll')));assert.equal(range.value,'900');const setter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;await act(async()=>{setter.call(range,'500');range.dispatchEvent(new Event('input',{bubbles:true}))});assert.equal(table.scrollLeft,500)}finally{await act(async()=>root.unmount())}
})

test('matrix puts vehicles across columns and total last; vehicle cells open only that vehicle',async()=>{
 const root=createRoot(document.getElementById('root'));localStorage.clear();globalThis.fetch=async url=>({ok:true,json:async()=>({...result(new URL(url,'https://localhost').searchParams.get('date')),summary:{vehicles:1,weightKg:150,plannedBranches:3},sections:{vehicles:[{id:'1',name:'Q123',status:'running',quantity:150,detail:{plannedBranches:2}},{id:'2',name:'Q456',status:'not_started',quantity:0,detail:{plannedBranches:1}}],stops:[{id:'a',name:'First branch',status:'active',detail:{vehicleId:1}},{id:'b',name:'Second branch',status:'active',detail:{vehicleId:2}}]}})});
 try{await act(async()=>root.render(React.createElement(I18nProvider,{language:'en'},React.createElement(Report,{account:{id:1}}))));await act(async()=>click('Open report'));
 const headings=[...document.querySelectorAll('.daily-report-matrix thead th')].map(n=>n.textContent);assert.match(headings[1],/Q123/);assert.match(headings[2],/Q456/);assert.match(headings.at(-1),/Total/);
 assert.deepEqual([...document.querySelectorAll('[data-metric="weightKg"] td button')].map(b=>b.textContent),['150.00','0.00','150.00']);assert.match(document.querySelector('[data-metric="vehicles"]').textContent,/Not started/);
 await act(async()=>document.querySelector('[data-metric="plannedBranches"] td button').click());assert.match(document.querySelector('.daily-report-dialog').textContent,/First branch/);assert.doesNotMatch(document.querySelector('.daily-report-dialog').textContent,/Second branch/);
 }finally{await act(async()=>root.unmount())}
})

test('report outside blank closes only deliberate taps; controls, drag and nested dialogs stay open',async()=>{
 const root=createRoot(document.getElementById('root'));globalThis.fetch=async url=>({ok:true,json:async()=>result(new URL(url,'https://localhost').searchParams.get('date'))})
 const point=(target,type,x=20)=>target.dispatchEvent(new MouseEvent(type,{bubbles:true,button:0,clientX:x,clientY:20}))
 try{
  await act(async()=>root.render(React.createElement(I18nProvider,{language:'en'},React.createElement(Report,{account:{id:1}}))))
  await act(async()=>click('Open report'))
  assert.equal(document.querySelectorAll('.daily-report-actions button').length,2)
  assert.equal([...document.querySelectorAll('.daily-report>header button')].some(b=>b.textContent==='Close'),false)
  const input=document.querySelector('.daily-report-controls input')
  await act(async()=>{point(input,'pointerdown');point(input,'pointerup')});assert.ok(document.querySelector('.daily-report-controls'))
  await act(async()=>{point(document.body,'pointerdown');point(document.body,'pointerup',60)});assert.ok(document.querySelector('.daily-report-controls'))
  await act(async()=>document.querySelector('.daily-report-matrix td button').click())
  await act(async()=>{point(document.body,'pointerdown');point(document.body,'pointerup')});assert.ok(document.querySelector('.daily-report-controls'))
  await act(async()=>click('Close'))
  await act(async()=>{point(document.body,'pointerdown');point(document.body,'pointerup')});assert.equal(document.querySelector('.daily-report-controls'),null)
 }finally{await act(async()=>root.unmount())}
})

test('approval and affected-branch summary entries open their exact server rows',async()=>{
 const {reportSelection}=await vite.ssrLoadModule('/src/DailyReport.jsx')
 const data={date:'2026-10-19',sections:{changes:[{id:'raw',name:'67'}],changedBranches:[{id:'1',name:'DIY BKW',detail:{changes:[{id:'a'},{id:'b'}]}}],approvals:[{id:'old'},{id:'pending',status:'pending'}],decisions:Array.from({length:12},(_,i)=>({id:String(i),detail:{reviewedAt:'2026-10-19 01:00:00'}}))}}
 assert.equal(reportSelection(data,'approvals').rows.length,12)
 assert.deepEqual(reportSelection(data,'changedBranches').rows.map(r=>r.name),['DIY BKW'])
 assert.equal(reportSelection(data,'changedBranches').rows[0].detail.changes.length,2)
 const {reportWord}=await import('../shared/dailyReportWords.js')
 assert.match(reportWord('zh','schedule_sync_removed'),/排程同步/)
})

test('overview hides change counts and branch changes without dropping other metrics',async()=>{
 const root=createRoot(document.getElementById('root'))
 globalThis.fetch=async url=>({ok:true,json:async()=>{const d=result(new URL(url,'https://localhost').searchParams.get('date'));d.summary={changes:162,changedBranches:57,approvals:11};d.sections.changes=[];d.sections.changedBranches=[];d.sections.decisions=[];return d}})
 try{
  await act(async()=>root.render(React.createElement(I18nProvider,{language:'en'},React.createElement(Report,{account:{id:1}}))))
  await act(async()=>click(w('en','open')))
  assert.equal(document.querySelector('[data-summary-metric="changes"]'),null)
  assert.equal(document.querySelector('[data-summary-metric="changedBranches"]'),null)
  const summary=document.querySelector('.daily-report-summary')
  assert.ok(![...summary.querySelectorAll('dt')].some(n=>[w('en','changes'),w('en','changedBranches')].includes(n.textContent)))
  assert.ok(document.querySelector('[data-summary-metric="approvals"]'))
 }finally{await act(async()=>root.unmount())}
})

test('pending GPS customer opens branch review through in-app navigation',async()=>{
 const root=createRoot(document.getElementById('root'))
 globalThis.PopStateEvent=window.PopStateEvent
 globalThis.fetch=async url=>({ok:true,json:async()=>{const d=result(new URL(url,'https://localhost').searchParams.get('date'));d.summary={pendingApprovals:1};d.sections.approvals=[{id:'gps-256',name:'HARI-HARI MTG',kind:'gps',status:'pending',detail:{branchCode:'10495'}}];return d}})
 try{
  await act(async()=>root.render(React.createElement(I18nProvider,{language:'en'},React.createElement(Report,{account:{id:1}}))))
  await act(async()=>click(w('en','open')))
  await act(async()=>document.querySelector('[data-summary-metric="pendingApprovals"] button').click())
  await act(async()=>document.querySelector('.daily-report-name').click())
  const button=[...document.querySelectorAll('button')].find(b=>b.textContent===w('en','openGpsReview'))
  assert.ok(button)
  await act(async()=>button.click())
  const q=new URLSearchParams(window.location.search)
  assert.equal(q.get('page'),'customers');assert.equal(q.get('tab'),'branches');assert.equal(q.get('branch'),'10495')
 }finally{await act(async()=>root.unmount());window.history.replaceState({},'','/')}
})

test('GPS correction opens location confirmation without submitting; explicit submit sends captured coordinates',async()=>{
 const {GpsReleaseRequest}=await vite.ssrLoadModule('/src/GpsRelease.jsx')
 const root=createRoot(document.getElementById('root')),posts=[]
 Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition:success=>success({coords:{latitude:1.5,longitude:110.3,accuracy:8}})}})
 globalThis.fetch=async(url,options)=>{posts.push({url,body:JSON.parse(options.body)});return{ok:true,json:async()=>({id:1,status:'pending'})}}
 try{
  await act(async()=>root.render(React.createElement(I18nProvider,{language:'en'},React.createElement(GpsReleaseRequest,{stop:{id:42},available:true,onChanged:async()=>{}}))))
  await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='At customer, GPS is incorrect').click())
  assert.ok(document.querySelector('[aria-label="Confirm current location"]'));assert.equal(posts.length,0)
  assert.match(document.body.textContent,/1.5, 110.3/)
  await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Send location to supervisor').click())
  assert.equal(posts.length,1);assert.equal(posts[0].body.latitude,1.5);assert.equal(posts[0].body.longitude,110.3);assert.equal(posts[0].body.correctionRequired,true)
 }finally{await act(async()=>root.unmount());delete navigator.geolocation}
})
