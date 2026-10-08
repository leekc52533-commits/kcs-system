import test,{after} from 'node:test'
import assert from 'node:assert/strict'
import React,{act} from 'react'
import {createServer} from 'vite'
import {JSDOM} from 'jsdom'
const dom=new JSDOM('<html><body><div id="root"></div></body></html>',{url:'https://localhost/'})
for(const k of ['window','document','Node','NodeFilter','HTMLElement','MutationObserver','Event','MouseEvent','localStorage','sessionStorage','FileReader'])globalThis[k]=dom.window[k]
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true
window.confirm=()=>true
const{createRoot}=await import('react-dom/client'),vite=await createServer({logLevel:'silent',server:{middlewareMode:true},appType:'custom'})
after(()=>vite.close())

const{SalesForm}=await vite.ssrLoadModule('/src/SalesPage.jsx'),{I18nProvider}=await vite.ssrLoadModule('/src/i18n.jsx')
const{default:SalePricesPage}=await vite.ssrLoadModule('/src/SalePricesPage.jsx')
const change=async(n,v)=>act(async()=>{Object.getOwnPropertyDescriptor(n.tagName==='SELECT'?window.HTMLSelectElement.prototype:window.HTMLInputElement.prototype,'value').set.call(n,v);n.dispatchEvent(new Event(n.tagName==='SELECT'?'change':'input',{bubbles:true}))})
test('three-language review form requires confirmation and blocks a mismatched total',async()=>{
 for(const language of ['en','ms','zh']){
 const root=createRoot(document.getElementById('root')),saved=[]
 const initial={id:1,buyerId:1,vehicleId:1,billNumber:'CP1',settlementDate:'2026-09-10',total:'10.00',rounding:'0.00',lines:[{deliveryDate:'2026-09-09',slipNumber:'TN1',description:'OCC',weightKg:'20',unitPrice:'0.50',amount:'10.00'}]}
 await act(async()=>root.render(React.createElement(I18nProvider,{language},React.createElement(SalesForm,{initial,masters:{buyers:[{id:1,name:'Factory'}],vehicles:[{id:1,plate:'QTY5028'}]},onSave:v=>saved.push(v),onClose:()=>{}}))))
 const save=()=>document.querySelector('footer button:last-child'),check=()=>document.querySelector('input[type=checkbox]')
 assert.equal(save().disabled,true)
 await act(async()=>check().click());assert.equal(save().disabled,false)
 const price=document.querySelectorAll('fieldset input:not([type=date]):not([type=datetime-local]), fieldset select')[4];await change(price,'0.60')
 assert.equal(check().checked,false);assert.equal(document.querySelectorAll('fieldset input:not([type=date]):not([type=datetime-local]), fieldset select')[5].value,'12.00');assert.equal(save().disabled,true)
 await change(document.querySelectorAll('.sales-fields input:not([type=date]):not([type=datetime-local])')[2],'12.00');await act(async()=>check().click());assert.equal(save().disabled,false)
 await act(async()=>document.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})))
 assert.equal(saved[0].lines[0].unitPrice,'0.60');assert.equal(saved[0].reviewed,true);assert.ok(!document.body.textContent.includes('sales.'))
 await act(async()=>root.unmount())
 }
})
test('several prices for a material require choosing the actual price',async()=>{
 const root=createRoot(document.getElementById('root'))
 const initial={id:1,buyerId:1,vehicleId:1,billNumber:'CP1',settlementDate:'2026-09-10',total:'10.00',rounding:'0.00',lines:[{deliveryDate:'2026-09-09',slipNumber:'TN1',description:'OCC',weightKg:'20',unitPrice:'0.50',amount:'10.00'}]}
 const masters={buyers:[{id:1,name:'Factory'}],vehicles:[{id:1,plate:'QTY5028'}],salePrices:[{buyerId:null,description:'MIX PAPER',unitPrice:'0.25'},{buyerId:null,description:'MIX PAPER',unitPrice:'0.30'},{buyerId:2,description:'MIX PAPER',unitPrice:'0.90'},{buyerId:null,description:'CARDBOARD',unitPrice:'0.17'}]}
 await act(async()=>root.render(React.createElement(I18nProvider,{language:'zh'},React.createElement(SalesForm,{initial,masters,onSave:()=>{},onClose:()=>{}}))))
 assert.equal(document.querySelectorAll('fieldset label input:not([type=date]):not([type=datetime-local]), fieldset label select').length,6)
 assert.ok([...document.querySelectorAll('fieldset select option')].some(option=>option.value==='MIX PAPER'))
 await change(document.querySelectorAll('fieldset input:not([type=date]):not([type=datetime-local]), fieldset select')[2],'MIX PAPER')
 assert.equal(document.querySelectorAll('fieldset input:not([type=date]):not([type=datetime-local]), fieldset select')[4].value,'')
 assert.equal(document.querySelectorAll('fieldset input:not([type=date]):not([type=datetime-local]), fieldset select')[5].value,'')
 assert.deepEqual([...document.querySelectorAll('#sales-prices-0 option')].map(option=>option.value),['0.250','0.300'])
 await change(document.querySelectorAll('fieldset input:not([type=date]):not([type=datetime-local]), fieldset select')[4],'0.30')
 assert.equal(document.querySelectorAll('fieldset input:not([type=date]):not([type=datetime-local]), fieldset select')[4].value,'0.30')
 assert.equal(document.querySelectorAll('fieldset input:not([type=date]):not([type=datetime-local]), fieldset select')[5].value,'6.00')
 await change(document.querySelectorAll('fieldset input:not([type=date]):not([type=datetime-local]), fieldset select')[4],'0.28')
 assert.equal(document.querySelectorAll('fieldset input:not([type=date]):not([type=datetime-local]), fieldset select')[5].value,'5.60')
 await change(document.querySelectorAll('fieldset input:not([type=date]):not([type=datetime-local]), fieldset select')[2],'CARDBOARD')
 assert.equal(document.querySelectorAll('fieldset input:not([type=date]):not([type=datetime-local]), fieldset select')[4].value,'0.170')
 assert.equal(document.querySelectorAll('fieldset input:not([type=date]):not([type=datetime-local]), fieldset select')[5].value,'3.40')
 assert.deepEqual([...document.querySelectorAll('#sales-prices-0 option')].map(option=>option.value),['0.170'])
 await act(async()=>root.unmount())
})
test('price catalog sends the material and price as direct API fields',async()=>{
 const previousFetch=globalThis.fetch,requests=[]
 globalThis.fetch=async(url,options={})=>{if(options.method==='POST')requests.push(JSON.parse(options.body));return{ok:true,json:async()=>({items:[],productNames:[]})}}
 const root=createRoot(document.getElementById('root'))
 try{
  await act(async()=>root.render(React.createElement(I18nProvider,{language:'zh'},React.createElement(SalePricesPage,{onBack:()=>{}}))))
  await change(document.querySelectorAll('.sale-prices-form input')[0],'OCC')
  await change(document.querySelectorAll('.sale-prices-form input')[1],'0.42')
  await act(async()=>document.querySelector('.sale-prices-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})))
  assert.deepEqual(requests,[{description:'OCC',unitPrice:'0.42'}])
 }finally{await act(async()=>root.unmount());globalThis.fetch=previousFetch}
})

test('new sales default to the Kuching date and OCC with selectable materials',async()=>{
 const root=createRoot(document.getElementById('root'))
 await act(async()=>root.render(React.createElement(I18nProvider,{language:'en'},React.createElement(SalesForm,{masters:{productNames:['Mixed Paper']},onSave:()=>{},onClose:()=>{}}))))
 assert.equal(document.querySelector('.sales-fields input[type="date"]').value,new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kuching',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()))
 assert.equal(document.querySelector('fieldset select').value,'OCC')
 await change(document.querySelector('fieldset select'),'Mixed Paper')
 assert.equal(document.querySelector('fieldset select').value,'Mixed Paper')
 await act(async()=>root.unmount())
})


test('declining an old settlement date keeps the draft, accepting submits the exact confirmed date',async()=>{
 const root=createRoot(document.getElementById('root')),saved=[],messages=[],previous=window.confirm
 const initial={id:1,buyerId:1,vehicleId:1,billNumber:'CP1',settlementDate:'2006-09-28',total:'10.00',rounding:'0.00',lines:[{deliveryDate:'2006-09-28',slipNumber:'TN1',description:'OCC',weightKg:'20',unitPrice:'0.50',amount:'10.00'}]}
 try{
 await act(async()=>root.render(React.createElement(I18nProvider,{language:'zh'},React.createElement(SalesForm,{initial,onSave:v=>saved.push(v),onClose:()=>{}}))))
 await act(async()=>document.querySelector('input[type=checkbox]').click())
 window.confirm=message=>{messages.push(message);return false}
 await act(async()=>document.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})))
 assert.equal(saved.length,0);assert.match(messages[0],/28-Sep-06/);assert.match(messages[0],/7/)
 assert.equal(document.querySelector('.sales-fields input[type=date]').value,'2006-09-28')
 window.confirm=()=>true
 await act(async()=>document.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})))
 assert.equal(saved[0].confirmedSettlementDate,'2006-09-28')
 }finally{window.confirm=previous;await act(async()=>root.unmount())}
})

test('sales error dialog closes by button, Escape and backdrop, but not inside clicks',async()=>{
 const{SalesErrorDialog}=await vite.ssrLoadModule('/src/SalesPage.jsx'),root=createRoot(document.getElementById('root'));let closed=0
 try{
 await act(async()=>root.render(React.createElement(I18nProvider,{language:'zh'},React.createElement(SalesErrorDialog,{onClose:()=>closed++},'Date error'))))
 const dialog=document.querySelector('[role=alertdialog]'),overlay=document.querySelector('.sales-error-overlay')
 assert.ok(dialog);assert.equal(document.activeElement.getAttribute('aria-label'),'关闭')
 await act(async()=>dialog.click());assert.equal(closed,0)
 await act(async()=>document.activeElement.click());assert.equal(closed,1)
 await act(async()=>dialog.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));assert.equal(closed,2)
 await act(async()=>{overlay.dispatchEvent(new MouseEvent('pointerdown',{bubbles:true,clientX:2,clientY:2}));overlay.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:2,clientY:2}))});assert.equal(closed,3)
 }finally{await act(async()=>root.unmount())}
})
test('history header search matches ISO years and keeps checkbox multi-selection',async()=>{
 const{FilterHeader}=await vite.ssrLoadModule('/src/ExpenseRecordsPage.jsx'),root=createRoot(document.getElementById('root')),changes=[]
 try{
 await act(async()=>root.render(React.createElement(I18nProvider,{language:'en'},React.createElement('table',null,React.createElement('thead',null,React.createElement('tr',null,React.createElement(FilterHeader,{label:'Settlement date',open:true,onClose:()=>{},onChange:v=>changes.push(v),onSort:()=>{},value:[],matchOptionValue:true,options:[{value:'2006-09-28',label:'28-09-06'},{value:'2026-09-28',label:'28-09-26'}]})))))))
 await change(document.querySelector('.expense-filter-menu input:not([type=checkbox])'),'2006')
 const options=document.querySelectorAll('.archive-check-options input[value]');assert.equal(options.length,1);assert.equal(options[0].value,'2006-09-28')
 await act(async()=>options[0].click());assert.deepEqual(changes,[['2006-09-28']])
 }finally{await act(async()=>root.unmount())}
})

test('shared centered notices consolidate errors, dismiss without losing form input, and capture required fields',async()=>{
 const{default:CenteredNotice}=await vite.ssrLoadModule('/src/CenteredNotice.jsx'),root=createRoot(document.getElementById('root'))
 const render=(error=true)=>root.render(React.createElement(I18nProvider,{language:'zh'},React.createElement('form',null,React.createElement('label',null,'姓名',React.createElement('input',{required:true,name:'name',defaultValue:''})),React.createElement('input',{name:'draft',defaultValue:'keep draft'}),error&&React.createElement(CenteredNotice,null,'错误'),error&&React.createElement(CenteredNotice,null,'错误'))))
 try{
 await act(async()=>render());assert.equal(document.querySelectorAll('[role=alertdialog]').length,1)
 await act(async()=>document.querySelector('.kcs-notice-panel footer button').click());assert.equal(document.querySelectorAll('[role=alertdialog]').length,0)
 assert.equal(document.querySelector('input[name=draft]').value,'keep draft')
 await act(async()=>render(false))
 await act(async()=>document.querySelector('input[required]').dispatchEvent(new Event('invalid',{cancelable:true})))
 assert.match(document.querySelector('[role=alertdialog]').textContent,/请填写必填项/)
 const overlay=document.querySelector('.kcs-notice-overlay')
 await act(async()=>{overlay.dispatchEvent(new MouseEvent('pointerdown',{bubbles:true,clientX:3,clientY:3}));overlay.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:3,clientY:3}))})
 assert.equal(document.querySelector('[role=alertdialog]'),null);assert.equal(document.querySelector('input[name=draft]').value,'keep draft')
 await act(async()=>document.querySelector('input[required]').dispatchEvent(new Event('invalid',{cancelable:true})))
 assert.ok(document.querySelector('[role=alertdialog]'))
 await act(async()=>document.querySelector('[role=alertdialog]').dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})))
 assert.equal(document.querySelector('[role=alertdialog]'),null)
 }finally{await act(async()=>root.unmount())}
})
