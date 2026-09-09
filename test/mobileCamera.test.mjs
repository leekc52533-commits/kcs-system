import test,{after} from 'node:test'
import assert from 'node:assert/strict'
import React,{act,useState} from 'react'
import {createServer} from 'vite'
import {JSDOM} from 'jsdom'
import {translate,translateUi} from '../src/translations.js'
const dom=new JSDOM('<html><body></body></html>',{url:'https://localhost/'})
for(const k of ['window','document','Node','NodeFilter','HTMLElement','MutationObserver','Event','MouseEvent','localStorage','sessionStorage'])globalThis[k]=dom.window[k]
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true})
globalThis.IS_REACT_ACT_ENVIRONMENT=true
const {createRoot}=await import('react-dom/client')
const vite=await createServer({logLevel:'silent',server:{middlewareMode:true},appType:'custom'})
after(()=>vite.close())
const {default:Picker}=await vite.ssrLoadModule('/src/ProofPhotoPicker.jsx'),{I18nProvider}=await vite.ssrLoadModule('/src/i18n.jsx'),mobile=await vite.ssrLoadModule('/src/AuthPages.jsx')
const attachments=await vite.ssrLoadModule('/src/PhotoAttachment.jsx'),vehicles=await vite.ssrLoadModule('/src/VehicleDetailPage.jsx'),expenses=await vite.ssrLoadModule('/src/ExpenseRecordsPage.jsx')
const el=React.createElement,noop=()=>{},jpeg=new Uint8Array([255,216,255,224,1,2,3,4])
window.HTMLCanvasElement.prototype.getContext=()=>({drawImage(){},fillRect(){}})
window.HTMLCanvasElement.prototype.toBlob=function(callback){callback(new Blob([jpeg],{type:'image/jpeg'}))}
window.HTMLMediaElement.prototype.play=async()=>{}
globalThis.createImageBitmap=async()=>({width:5000,height:3500,close(){}})
globalThis.FileReader=class{readAsDataURL(blob){blob.arrayBuffer().then(bytes=>{this.result='data:'+blob.type+';base64,'+Buffer.from(bytes).toString('base64');this.onload()})}}
let calls=[],uploadFails=false,saved=false,currentRoute
const bill={billNumber:'P1',serviceDate:'2026-09-09',branchName:'D VALLEY',paymentMethod:'Cash',totalCents:100,items:[]}
globalThis.fetch=async(url,options={})=>{
 calls.push([url,options]);let data={}
 if(url.endsWith('/billing'))data={bill:{...bill,paymentProofUploaded:saved},products:[],stop:{paymentMethod:'Cash',branchName:'D VALLEY'}}
 if(url==='/api/mobile/today')data=currentRoute
 if(url==='/api/mobile/cash-float')data={configured:true,balanceCents:10000,today:{topUpCents:0,purchaseCents:0,expenseCents:0}}
 if(url==='/api/mobile/unloading-weights/context')data={available:true,trip:{tripId:1,vehicleCode:'Lorry 1',estimatedWeightKg:100},recent:[]}
 if(url==='/api/mobile/unloading-weights/recognize')data={id:123,code:'W123',ocrStatus:'recognized',recognizedWeightKg:120}
 if(options.method==='POST'){if(uploadFails)return{ok:false,status:500,headers:{get:()=>null},json:async()=>({error:'Upload failed'})};saved=true}
 return{ok:true,status:200,headers:{get:()=>null},json:async()=>data}
}
async function mount(Component,props={},language='en'){
 const container=document.createElement('div');document.body.append(container);const root=createRoot(container)
 await act(async()=>{root.render(el(I18nProvider,{language,setLanguage:noop},el(Component,props)));await new Promise(r=>setTimeout(r,10))})
 return{container,close:async()=>{await act(async()=>root.unmount());container.remove()}}
}
const button=(container,text)=>[...container.querySelectorAll('button')].find(x=>x.textContent===text)
const click=async b=>{assert.ok(b);assert.equal(b.disabled,false);await act(async()=>{b.click();await new Promise(r=>setTimeout(r,5))})}
const photo={blob:new Blob([jpeg],{type:'image/jpeg'}),name:'old.jpg'}
function Harness(){const [value,setValue]=useState(null),[busy,setBusy]=useState(false);return el('div',null,el(Picker,{value,onChange:setValue,onBusyChange:setBusy}),el('output',null,busy?'busy':value?'selected':'empty'))}
async function camera(container){
 let grant;let stopped=0;Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:()=>new Promise(resolve=>{grant=resolve})}})
 await click(button(container,translate('en','purchase.takePhoto'))||button(container,translate('en','purchase.retakePhoto')))
 await act(async()=>{grant({getTracks:()=>[{stop(){stopped++}}]});await new Promise(r=>setTimeout(r,1))})
 const video=container.querySelector('video');assert.ok(video)
 Object.defineProperties(video,{videoWidth:{value:1920},videoHeight:{value:1080}})
 await act(async()=>video.dispatchEvent(new Event('loadeddata',{bubbles:true})))
 return()=>stopped
}
test('in-page camera captures, previews and releases stream without opening gallery',async()=>{
 const view=await mount(Harness);try{const stopped=await camera(view.container);await click(button(view.container,'Capture photo'));assert.equal(stopped(),1);assert.ok(view.container.querySelector('img'));assert.equal(view.container.querySelector('video'),null);assert.equal(view.container.querySelector('output').textContent,'selected')
 await click(button(view.container,translate('en','purchase.removePhoto')));assert.equal(view.container.querySelector('img'),null);assert.equal(view.container.querySelector('output').textContent,'empty')
 }finally{await view.close()}
})
test('cancelling a late camera permission result stops tracks and preserves the old photo',async()=>{
 let grant,stopped=0,changed=false
 Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:()=>new Promise(resolve=>{grant=resolve})}})
 const view=await mount(Picker,{value:photo,onChange:()=>{changed=true}});try{await click(button(view.container,translate('en','purchase.retakePhoto')));await click(button(view.container,'Cancel camera'));await act(async()=>grant({getTracks:()=>[{stop(){stopped++}}]}));assert.equal(stopped,1);assert.equal(changed,false);assert.ok(view.container.querySelector('img'))}finally{await view.close()}
})
test('permission denial provides localized camera fallback and gallery in all languages',async()=>{
 Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>{throw new Error('NotAllowedError')}}})
 for(const lang of ['en','ms','zh']){const view=await mount(Picker,{onChange:noop},lang);try{await click(button(view.container,translate(lang,'purchase.takePhoto')));assert.equal(view.container.querySelector('[role=alert]').textContent,translate(lang,'photo.cameraUnavailable'));assert.ok(view.container.querySelector('input[capture=environment]'));assert.ok(view.container.querySelector('input:not([capture])'))}finally{await view.close()}}
})
test('native file is retained during decoding, then gallery preview replaces it',async()=>{
 const view=await mount(Harness),original=globalThis.createImageBitmap;let decode
 try{globalThis.createImageBitmap=()=>new Promise(resolve=>{decode=resolve});const input=view.container.querySelector('input'),file=new File([jpeg],'camera.jpg',{type:'image/jpeg'});let nativeValue='camera.jpg'
 Object.defineProperties(input,{files:{value:[file],configurable:true},value:{get:()=>nativeValue,set:v=>{nativeValue=v},configurable:true}})
 await act(async()=>input.dispatchEvent(new Event('change',{bubbles:true})));assert.equal(nativeValue,'camera.jpg');assert.equal(view.container.querySelector('output').textContent,'busy')
 await act(async()=>decode({width:3000,height:4000,close(){}}));assert.equal(nativeValue,'');assert.ok(view.container.querySelector('img'));assert.equal(view.container.querySelector('output').textContent,'selected')
 }finally{globalThis.createImageBitmap=original;await view.close()}
})
test('unmount stops the active camera and releases parent busy state',async()=>{
 let busy=false;const view=await mount(Picker,{onChange:noop,onBusyChange:x=>{busy=x}});const stopped=await camera(view.container);assert.equal(busy,true);await view.close();assert.equal(stopped(),1);assert.equal(busy,false)
})
test('payment proof capture uploads JPEG; failed upload retains preview and retry succeeds',async()=>{
 calls=[];saved=false;uploadFails=true;const view=await mount(mobile.PurchaseBillPanel,{stop:{id:91},onChanged:noop})
 try{await camera(view.container);await click(button(view.container,'Capture photo'));const confirm=()=>button(view.container,translate('en','purchase.confirmUpload'));await click(confirm());assert.ok(view.container.querySelector('img.payment-proof-preview'));assert.equal(saved,false)
 const post=calls.find(([url,o])=>url.endsWith('/payment-proof')&&o.method==='POST');assert.ok(post);assert.match(JSON.parse(post[1].body).photo.dataUrl,/^data:image\/jpeg;base64,/)
 uploadFails=false;await click(confirm());assert.equal(saved,true);assert.equal(view.container.querySelector('.proof-photo-picker'),null)
 }finally{await view.close()}
})
test('No Goods uses processed camera photo and keeps reason/photo on upload failure',async()=>{
 calls=[];saved=false;uploadFails=true;sessionStorage.clear()
 const stop={id:92,stopSequence:1,customerName:'D VALLEY',branchName:'D VALLEY',status:'arrived',arrivedAt:'2026-09-09',canFinish:true}
 currentRoute={routeAvailable:true,date:'2026-09-09',weekday:'Wednesday',status:'in_progress',totalStops:1,completedStops:0,pendingStops:1,trips:[{id:1,tripNumber:1,currentStopId:92,stops:[stop]}]}
 const view=await mount(mobile.TodayView,{data:currentRoute})
 try{const section=view.container.querySelector('.driver-no-goods');assert.ok(section);await camera(section);await click(button(section,'Capture photo'));const reason=section.querySelector('textarea')
 await act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set.call(reason,'Shop closed');reason.dispatchEvent(new Event('input',{bubbles:true}))})
 await click(button(section,translateUi('en','No Goods')));assert.ok(section.querySelector('img'));assert.equal(reason.value,'Shop closed');const posts=()=>calls.filter(([url,o])=>url.endsWith('/no-goods')&&o.method==='POST');assert.equal(posts().length,1);const payload=JSON.parse(posts()[0][1].body);assert.equal(payload.reason,'Shop closed');assert.match(payload.photo.dataUrl,/^data:image\/jpeg;base64,/)
 uploadFails=false;await click(button(section,translateUi('en','No Goods')));assert.equal(posts().length,2);assert.equal(saved,true);assert.equal(section.querySelector('img'),null)
 }finally{await view.close()}
})

async function changeValue(input,value){await act(async()=>{Object.getOwnPropertyDescriptor(input.tagName==='TEXTAREA'?window.HTMLTextAreaElement.prototype:input.tagName==='SELECT'?window.HTMLSelectElement.prototype:window.HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event(input.tagName==='SELECT'?'change':'input',{bubbles:true}))})}
async function submitForm(container){await act(async()=>{container.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,5))})}
test('mobile expense camera keeps amount, category and photo on failure and clears after success',async()=>{
 calls=[];saved=false;uploadFails=true;const view=await mount(mobile.CashFloatMobileCard)
 try{await click(button(view.container,translateUi('en','Record Expense')));await changeValue(view.container.querySelector('input[type=number]'),'12.50');await changeValue(view.container.querySelector('select'),'Fuel');await camera(view.container);await click(button(view.container,'Capture photo'));await submitForm(view.container)
 assert.ok(view.container.querySelector('img'));assert.equal(view.container.querySelector('input[type=number]').value,'12.50');const post=calls.find(([url,o])=>url.endsWith('/cash-float/expenses')&&o.method==='POST');assert.ok(post);const payload=JSON.parse(post[1].body);assert.equal(payload.description,'Fuel');assert.match(payload.proof.dataUrl,/^data:image\/jpeg;base64,/)
 uploadFails=false;await submitForm(view.container);assert.equal(view.container.querySelector('form'),null)
 }finally{await view.close()}
})
test('weight photo is previewed before OCR, survives failure and is cleared after confirmed weight',async()=>{
 calls=[];uploadFails=true;const view=await mount(mobile.WeightView)
 try{await camera(view.container);await click(button(view.container,'Capture photo'));assert.equal(calls.filter(([url])=>url.endsWith('/recognize')).length,0);assert.ok(view.container.querySelector('img'))
 await click(button(view.container,translate('en','photo.readWeight')));assert.ok(view.container.querySelector('img'));uploadFails=false;await click(button(view.container,translate('en','photo.readWeight')));assert.equal(view.container.querySelector('input[type=number]').value,'120');await click(button(view.container,translate('en','mobile.weightConfirm')));assert.equal(view.container.querySelector('img'),null)
 }finally{await view.close()}
})
test('office expense uses same preview and saves processed proof with canonical category',async()=>{
 let payload;const view=await mount(expenses.ExpenseForm,{employees:[{employeeId:1,employeeName:'KC',configured:true}],busy:false,close:noop,save:x=>{payload=x}})
 try{await changeValue(view.container.querySelectorAll('select')[1],'1');await camera(view.container);await click(button(view.container,'Capture photo'));await submitForm(view.container);assert.ok(payload.proof.blob);assert.equal(payload.proof.type,'image/jpeg');assert.ok(view.container.querySelector('img'))}finally{await view.close()}
})
test('vehicle repair photos survive rejected save and clear only on successful save',async()=>{
 let accepts=false,payload;const view=await mount(vehicles.Maintenance,{records:[],disabled:false,save:async x=>{payload=x;return accepts}})
 try{const picker=view.container.querySelectorAll('.photo-attachment')[1];await camera(picker);await click(button(picker,'Capture photo'));await submitForm(view.container);assert.match(payload.beforePhoto.dataUrl,/^data:image\/jpeg;base64,/);assert.ok(view.container.querySelector('img'));accepts=true;await submitForm(view.container);assert.equal(view.container.querySelector('img'),null)}finally{await view.close()}
})
test('document picker keeps PDF uploads and explicit confirmation retains file on failed upload',async()=>{
 let payload,accepts=false;const view=await mount(attachments.PhotoUpload,{label:'File',allowPdf:true,save:async file=>{payload=file;return accepts}})
 try{const input=view.container.querySelector('input[accept="application/pdf,.pdf"]');const pdf=new File(['%PDF-1.7'],'insurance.pdf',{type:'application/pdf'});Object.defineProperty(input,'files',{value:[pdf]});await act(async()=>input.dispatchEvent(new Event('change',{bubbles:true})));assert.equal(payload,undefined);await click(button(view.container,translate('en','photo.confirmUpload')));assert.equal(payload.type,'application/pdf');assert.equal(await payload.text(),'%PDF-1.7');assert.match(view.container.textContent,/insurance.pdf/);accepts=true;await click(button(view.container,translate('en','photo.confirmUpload')));assert.doesNotMatch(view.container.textContent,/insurance.pdf/)}finally{await view.close()}
})
