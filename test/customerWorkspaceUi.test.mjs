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
const{default:Editor}=await vite.ssrLoadModule('/src/CustomerWorkspaceEditor.jsx'),{I18nProvider}=await vite.ssrLoadModule('/src/i18n.jsx'),{customerWorkspaceWords:words}=await vite.ssrLoadModule('/src/customerWorkspaceWords.js')
const change=async(n,value)=>act(async()=>{Object.getOwnPropertyDescriptor(n.tagName==='TEXTAREA'?window.HTMLTextAreaElement.prototype:window.HTMLInputElement.prototype,'value').set.call(n,value);n.dispatchEvent(new Event('input',{bubbles:true}))})
test('combined editor sends one request and keeps failed draft for retry in all languages',async()=>{
 for(const language of ['en','ms','zh']){
 const w=words[language],posts=[],data={customer:{customerId:'C1',customerName:'Existing',status:'active',materialPricing:[]},branch:null,schedule:null,pending:[],routeOptions:[],areas:[],canManagePricing:false,canCaptureGps:false,canReviewGps:false,revision:'revision-1'}
 globalThis.fetch=async(url,options={})=>{if(options.method==='POST'){posts.push(JSON.parse(options.body));return{ok:false,status:409,headers:new Map(),json:async()=>({errorCode:'CONFLICT'})}}return{ok:true,json:async()=>String(url).startsWith('/api/materials')?{items:[]}:data}}
 const root=createRoot(document.getElementById('root'));try{
 await act(async()=>root.render(React.createElement(I18nProvider,{language},React.createElement(Editor,{customerId:'C1',onClose(){}}))))
 const label=[...document.querySelectorAll('label')].find(l=>l.textContent===w.name);assert.ok(label)
 await change(label.querySelector('input'),'Branch One');await change(document.querySelector('.customer-save-reason textarea'),'New branch')
 await act(async()=>document.querySelector('.master-modal form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})))
 assert.equal(posts.length,1);assert.equal(posts[0].branch.branchName,'Branch One');assert.equal(posts[0].customerId,'C1');assert.equal(posts[0].revision,'revision-1');assert.equal(posts[0].reason,'New branch');assert.equal(document.querySelector('.customer-save-reason textarea').value,'New branch')
 await act(async()=>document.querySelector('.master-modal form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})))
 assert.equal(posts[0].requestId,posts[1].requestId)
 }finally{await act(async()=>root.unmount())}
 }
})

test('address check stages suggestions without saving and clears stale results when inputs change',async()=>{
 const {default:Check,locationWords}=await vite.ssrLoadModule('/src/CustomerLocationCheck.jsx')
 for(const language of ['en','ms','zh']){
  const w=locationWords[language],root=createRoot(document.getElementById('root')),calls=[],areas=[{areaId:'A1',name:'BDC',zone:'Kuching'}]
  let staged=null,payload={branch:{branchName:'Shop',address:'Old address',areaId:'A1'},revision:'r1'}
  const render=()=>React.createElement(I18nProvider,{language},React.createElement(Check,{payload,data:{areas,locationReviews:[]},value:staged,onChange:v=>{staged=v},onReview(){}}))
  globalThis.fetch=async(url,options={})=>{calls.push(String(url));return{ok:true,json:async()=>({token:'preview-token',address:'New address',areaId:'A1',areas,gpsSource:'official',confidence:'low',conflict:true})}}
  try{
   await act(async()=>root.render(render()))
   await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent===w.check).click())
   assert.equal(document.querySelector('input').value,'New address');assert.equal(staged,null)
   await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent===w.use).click())
   assert.equal(staged.address,'New address');assert.deepEqual(calls,['/api/customer-workspace/check-location'])
   payload={...payload,branch:{...payload.branch,address:'Changed address'}}
   await act(async()=>root.render(render()));assert.equal(staged,null);assert.equal(document.querySelector('input'),null)
  }finally{await act(async()=>root.unmount())}
 }
})

test('selecting paused bypasses schedule date validation and submits no schedule; active restores validation',async()=>{
 for(const language of ['en','ms','zh']){
 const posts=[],data={customer:{customerId:'C1',customerName:'Existing',status:'active',materialPricing:[]},branch:{branchId:'B1',branchName:'Branch'},schedule:{scheduleId:'S1',frequency:'Once a week',weekdays:['Monday'],effectiveDate:'',routeNumber:''},pending:[],routeOptions:[],areas:[],canManagePricing:false,canCaptureGps:false,canReviewGps:false,revision:'r1'};
 globalThis.fetch=async(url,options={})=>{if(options.method==='POST'){posts.push(JSON.parse(options.body));return{ok:false,status:409,headers:new Map(),json:async()=>({errorCode:'CONFLICT'})}}return{ok:true,json:async()=>String(url).startsWith('/api/materials')?{items:[]}:data}};
 const root=createRoot(document.getElementById('root'));try{
 await act(async()=>root.render(React.createElement(I18nProvider,{language},React.createElement(Editor,{branchId:'B1',onClose(){}}))));
 const date=document.querySelector('input[type=date]'),status=[...document.querySelectorAll('select')].find(s=>[...s.options].some(o=>o.value==='paused'));
 assert.equal(date.willValidate,true);assert.equal(date.checkValidity(),false);
 await act(async()=>{status.value='paused';status.dispatchEvent(new Event('change',{bubbles:true}))});assert.equal(date.willValidate,false);
 await change(document.querySelector('.customer-save-reason textarea'),'Duplicate');await act(async()=>document.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 assert.equal(posts[0].customer.status,'paused');assert.equal(posts[0].schedule,null);
 await act(async()=>{status.value='active';status.dispatchEvent(new Event('change',{bubbles:true}))});assert.equal(date.willValidate,true);assert.equal(date.checkValidity(),false);
 }finally{await act(async()=>root.unmount())}
 }
})

test('backdrop closes clean drafts, guards changed drafts and saving; successful save closes modal',async()=>{
 for(const language of ['en','ms','zh']){
 let closed=0,saved=0,resolveSave,prompts=0;
 const data={customer:{customerId:'C1',customerName:'Existing',status:'active',materialPricing:[]},branch:{branchId:'B1',branchName:'Branch'},schedule:null,pending:[],routeOptions:[],areas:[],canManagePricing:false,canCaptureGps:false,revision:'r1'};
 globalThis.fetch=async(url,options={})=>options.method==='POST'?new Promise(resolve=>{resolveSave=()=>resolve({ok:true,json:async()=>({customer:data.customer,branch:data.branch,review:[],pending:[]})})}):{ok:true,json:async()=>String(url).startsWith('/api/materials')?{items:[]}:data};
 window.confirm=()=>{prompts++;return false};
 const root=createRoot(document.getElementById('root'));
 try{
 await act(async()=>root.render(React.createElement(I18nProvider,{language},React.createElement(Editor,{branchId:'B1',onClose(){closed++},onSaved(){saved++}}))));
 await act(async()=>document.querySelector('.master-modal form').click());assert.equal(closed,0);
 await act(async()=>document.querySelector('.master-modal').click());assert.equal(closed,1);assert.equal(prompts,0);
 await change(document.querySelector('.customer-save-reason textarea'),'Correction');
 await act(async()=>document.querySelector('.master-modal').click());assert.equal(closed,1);assert.equal(prompts,1);
 await act(async()=>document.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 await act(async()=>document.querySelector('.master-modal').click());assert.equal(closed,1);assert.equal(prompts,1);
 await act(async()=>resolveSave());assert.equal(saved,1);assert.equal(closed,2);assert.equal(document.querySelector('.master-modal'),null);
 }finally{await act(async()=>root.unmount())}
 }
});

test('successful save retains supervisor follow-up outside the closed modal',async()=>{
 const data={customer:{customerId:'C1',customerName:'Existing',status:'active',materialPricing:[]},branch:{branchId:'B1',branchName:'Branch'},schedule:null,pending:[],routeOptions:[],areas:[],canManagePricing:false,canCaptureGps:false,revision:'r1'};
 globalThis.fetch=async(url,options={})=>({ok:true,json:async()=>options.method==='POST'?{...data,canConfirmSchedule:true,review:[{date:'2026-09-22',kind:'missing',expectedRevision:1}]}:String(url).startsWith('/api/materials')?{items:[]}:data});
 let saved=0;const root=createRoot(document.getElementById('root'));
 try{
 await act(async()=>root.render(React.createElement(I18nProvider,{language:'zh'},React.createElement(Editor,{branchId:'B1',onClose(){},onSaved(){saved++}}))));
 await change(document.querySelector('.customer-save-reason textarea'),'Correction');
 await act(async()=>document.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 assert.equal(saved,1);assert.equal(document.querySelector('.master-modal'),null);assert.ok([...document.querySelectorAll('button')].some(b=>b.textContent===words.zh.confirm));
 }finally{await act(async()=>root.unmount())}
});

test('switching branches after a saved review starts a fresh editor and request identity',async()=>{
 const posts=[];const base={customer:{customerId:'C1',customerName:'Existing',status:'active',materialPricing:[]},schedule:null,pending:[],routeOptions:[],areas:[],canManagePricing:false,canCaptureGps:false,revision:'r1'};
 globalThis.fetch=async(url,options={})=>{
 if(options.method==='POST'){const body=JSON.parse(options.body);posts.push(body);return{ok:true,json:async()=>({...base,branch:body.branch,review:[{date:'2026-09-22',kind:'missing'}]})}}
 const id=new URL(String(url),'https://localhost').searchParams.get('branchId');return{ok:true,json:async()=>String(url).startsWith('/api/materials')?{items:[]}:{...base,branch:{branchId:id,branchName:id==='B1'?'First branch':'Second branch'}}};
 };
 const root=createRoot(document.getElementById('root'));
 const render=id=>React.createElement(I18nProvider,{language:'zh'},React.createElement(Editor,{branchId:id,customerId:'C1',onClose(){},onSaved(){}}));
 try{
 await act(async()=>root.render(render('B1')));
 await change(document.querySelector('.customer-save-reason textarea'),'First change');
 await act(async()=>document.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 assert.equal(document.querySelector('.master-modal'),null);assert.ok(document.querySelector('.customer-workspace-saved'));
 await act(async()=>root.render(render('B2')));
 assert.ok(document.querySelector('.master-modal form'));assert.equal(document.querySelector('.customer-workspace-saved'),null);
 assert.equal(document.querySelector('.customer-workspace-fields input').value,'Second branch');assert.equal(document.querySelector('.customer-save-reason textarea').value,'');
 await change(document.querySelector('.customer-save-reason textarea'),'Second change');
 await act(async()=>document.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 assert.equal(posts[1].branchId,'B2');assert.equal(posts[1].branch.branchName,'Second branch');assert.notEqual(posts[0].requestId,posts[1].requestId);
 }finally{await act(async()=>root.unmount())}
});

test('paused schedule needs no first date and reason stays beside save without a cancel button',async()=>{
 const data={customer:{customerId:'C1',customerName:'Existing',status:'active',materialPricing:[]},branch:{branchId:'B1',branchName:'Branch'},schedule:{frequency:'Paused',weekdays:[],effectiveDate:'',anchorDate:''},pending:[],routeOptions:[],areas:[],canManagePricing:false,canCaptureGps:false,revision:'r1'}
 globalThis.fetch=async url=>({ok:true,json:async()=>String(url).startsWith('/api/materials')?{items:[]}:data})
 const root=createRoot(document.getElementById('root'))
 try{
 await act(async()=>root.render(React.createElement(I18nProvider,{language:'zh'},React.createElement(Editor,{branchId:'B1',onClose(){}}))))
 const date=document.querySelector('input[type="date"]');assert.ok(date);assert.equal(date.required,false);assert.equal(date.disabled,true)
 const reason=document.querySelector('.customer-save-reason textarea');assert.ok(reason.required)
 const bar=reason.closest('.form-action-bar');assert.ok(bar);assert.ok([...bar.querySelectorAll('button')].some(b=>b.textContent===words.zh.save));assert.ok(![...bar.querySelectorAll('button')].some(b=>b.textContent==='取消'))
 await change(reason,'暂停收货');assert.equal(document.querySelector('form').checkValidity(),true)
 }finally{await act(async()=>root.unmount())}
})

test('independent branch status bypasses inactive schedule validation and is sent without changing parent',async()=>{
 for(const language of ['en','ms','zh']){
  const posts=[],data={customer:{customerId:'C1',customerName:'Existing',status:'active',materialPricing:[]},branch:{branchId:'B1',branchName:'Branch',lifecycleStatus:'ACTIVE'},schedule:{frequency:'Once a week',weekdays:[],effectiveDate:''},pending:[],routeOptions:[],areas:[],revision:'r1'}
  globalThis.fetch=async(url,options={})=>{if(options.method==='POST'){posts.push(JSON.parse(options.body));return{ok:false,status:409,headers:new Map(),json:async()=>({errorCode:'CONFLICT'})}}return{ok:true,json:async()=>String(url).startsWith('/api/materials')?{items:[]}:data}}
  const root=createRoot(document.getElementById('root'))
  try{
   await act(async()=>root.render(React.createElement(I18nProvider,{language},React.createElement(Editor,{branchId:'B1',onClose(){}}))))
   const status=[...document.querySelectorAll('select')].find(s=>[...s.options].some(o=>o.value==='TEMPORARILY_PAUSED'))
   assert.deepEqual([...status.options].map(o=>o.value),['ACTIVE','TEMPORARILY_PAUSED','CLOSED'])
   for(const value of ['TEMPORARILY_PAUSED','CLOSED']){
    await act(async()=>{status.value=value;status.dispatchEvent(new Event('change',{bubbles:true}))})
    await change(document.querySelector('.customer-save-reason textarea'),'Branch status')
    assert.equal(document.querySelector('input[type=date]').willValidate,false)
    await act(async()=>document.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})))
    assert.equal(posts.at(-1).branch.lifecycleStatus,value);assert.equal(posts.at(-1).customer.status,'active');assert.equal(posts.at(-1).schedule,null)
   }
  }finally{await act(async()=>root.unmount())}
 }
})

test('standalone customer editor closes outside only when clean or discard confirmed; saving and drag stay open',async()=>{
 const {CustomerEditor}=await vite.ssrLoadModule('/src/MasterDataPage.jsx')
 globalThis.fetch=async()=>({ok:true,json:async()=>({items:[]})})
 const root=createRoot(document.getElementById('root')),initial={customerId:'C1',customerName:'Original',status:'active',materialPricing:[]};let closed=0,asked=0
 const originalConfirm=window.confirm;window.confirm=()=>{asked++;return false}
 const render=saving=>React.createElement(I18nProvider,{language:'zh'},React.createElement(CustomerEditor,{initial,lockId:true,onClose:()=>closed++,onSave(){},fail(){},saving}))
 try{
  await act(async()=>root.render(render(false)))
  const backdrop=document.querySelector('.master-modal')
  await act(async()=>document.querySelector('form').click());assert.equal(closed,0)
  await act(async()=>backdrop.click());assert.equal(closed,1);assert.equal(asked,0)
  await change(document.querySelector('input:not([disabled])'),'Changed')
  await act(async()=>backdrop.click());assert.equal(closed,1);assert.equal(asked,1)
  window.confirm=()=>true
  await act(async()=>root.render(render(true)));await act(async()=>backdrop.click());assert.equal(closed,1)
  await act(async()=>root.render(render(false)))
  await act(async()=>{document.querySelector('form').dispatchEvent(new MouseEvent('pointerdown',{bubbles:true,clientX:5,clientY:5}));backdrop.click()});assert.equal(closed,1)
  await act(async()=>backdrop.click());assert.equal(closed,2)
 }finally{window.confirm=originalConfirm;await act(async()=>root.unmount())}
})

test('search result opens exact branch directly and closing preserves search; customer opens branch list',async()=>{
 const {CustomerManager}=await vite.ssrLoadModule('/src/MasterDataPage.jsx')
 const customer={customerId:'10063',customerName:'JUMBO',status:'active',branches:[{branchId:'10452',branchName:'JUMBO BAU',lifecycleStatus:'ACTIVE'}]},branch={...customer.branches[0],customerId:'10063'},calls=[]
 window.history.replaceState({},'','/')
 globalThis.fetch=async(url)=>{url=String(url);calls.push(url);let data
 if(url.startsWith('/api/customer-workspace?'))data={customer,branch,schedule:null,pending:[],areas:[],routeOptions:[],revision:'r1'}
 else if(url==='/api/master/branches/10452')data=branch
 else if(url.startsWith('/api/master/branches?'))data={items:[branch]}
 else if(url==='/api/customers/10063')data=customer
 else if(url.startsWith('/api/customers?'))data={items:[customer]}
 else data={items:[]}
 return{ok:true,json:async()=>data}}
 const root=createRoot(document.getElementById('root'))
 try{
  await act(async()=>root.render(React.createElement(I18nProvider,{language:'en'},React.createElement(CustomerManager,{actor:{canManageMaster:true},notify(){},fail:e=>{throw Error(e)}}))))
  await change(document.querySelector('.master-filters input'),'JUMBO')
  await act(async()=>new Promise(resolve=>setTimeout(resolve,250)))
  await act(async()=>document.querySelector('.customer-branch-search-results button').click())
  assert.ok(document.querySelector('.master-modal'));assert.ok([...document.querySelectorAll('.master-modal input')].some(x=>x.value==='JUMBO BAU'))
  assert.equal(calls.includes('/api/customers/10063'),false);assert.equal(window.location.search,'')
  await act(async()=>document.querySelector('.master-modal').click())
  assert.equal(document.querySelector('.master-modal'),null);assert.equal(document.querySelector('.master-filters input').value,'JUMBO')
  await act(async()=>[...document.querySelectorAll('.customer-master-table button')].find(b=>b.textContent==='JUMBO').click())
  assert.ok(document.querySelector('.customer-detail'));assert.ok(document.querySelector('.customer-branch-list'));assert.equal(document.querySelector('.master-modal'),null)
 }finally{await act(async()=>root.unmount());window.history.replaceState({},'','/')}
})
