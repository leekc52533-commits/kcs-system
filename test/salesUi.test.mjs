import test,{after} from 'node:test'
import assert from 'node:assert/strict'
import React,{act} from 'react'
import {createServer} from 'vite'
import {JSDOM} from 'jsdom'
const dom=new JSDOM('<html><body><div id="root"></div></body></html>',{url:'https://localhost/'})
for(const k of ['window','document','Node','NodeFilter','HTMLElement','MutationObserver','Event','MouseEvent','localStorage','sessionStorage','FileReader'])globalThis[k]=dom.window[k]
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true
const{createRoot}=await import('react-dom/client'),vite=await createServer({logLevel:'silent',server:{middlewareMode:true},appType:'custom'})
after(()=>vite.close())

const{SalesForm}=await vite.ssrLoadModule('/src/SalesPage.jsx'),{I18nProvider}=await vite.ssrLoadModule('/src/i18n.jsx')
const{default:SalePricesPage}=await vite.ssrLoadModule('/src/SalePricesPage.jsx')
const change=async(n,v)=>act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(n,v);n.dispatchEvent(new Event('input',{bubbles:true}))})
test('three-language review form requires confirmation and blocks a mismatched total',async()=>{
 for(const language of ['en','ms','zh']){
 const root=createRoot(document.getElementById('root')),saved=[]
 const initial={id:1,buyerId:1,vehicleId:1,billNumber:'CP1',settlementDate:'2026-09-10',total:'10.00',rounding:'0.00',lines:[{deliveryDate:'2026-09-09',slipNumber:'TN1',description:'OCC',weightKg:'20',unitPrice:'0.50',amount:'10.00'}]}
 await act(async()=>root.render(React.createElement(I18nProvider,{language},React.createElement(SalesForm,{initial,masters:{buyers:[{id:1,name:'Factory'}],vehicles:[{id:1,plate:'QTY5028'}]},onSave:v=>saved.push(v),onClose:()=>{}}))))
 const save=()=>document.querySelector('footer button:last-child'),check=()=>document.querySelector('input[type=checkbox]')
 assert.equal(save().disabled,true)
 await act(async()=>check().click());assert.equal(save().disabled,false)
 const price=document.querySelectorAll('fieldset input')[4];await change(price,'0.60')
 assert.equal(check().checked,false);assert.equal(document.querySelectorAll('fieldset input')[5].value,'12.00');assert.equal(save().disabled,true)
 await change(document.querySelectorAll('.sales-fields input')[2],'12.00');await act(async()=>check().click());assert.equal(save().disabled,false)
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
 assert.equal(document.querySelectorAll('fieldset label input').length,6)
 assert.ok([...document.querySelectorAll('#sales-products-0 option')].some(option=>option.value==='MIX PAPER'))
 await change(document.querySelectorAll('fieldset input')[2],'MIX PAPER')
 assert.equal(document.querySelectorAll('fieldset input')[4].value,'')
 assert.equal(document.querySelectorAll('fieldset input')[5].value,'')
 assert.deepEqual([...document.querySelectorAll('#sales-prices-0 option')].map(option=>option.value),['0.25','0.30'])
 await change(document.querySelectorAll('fieldset input')[4],'0.30')
 assert.equal(document.querySelectorAll('fieldset input')[4].value,'0.30')
 assert.equal(document.querySelectorAll('fieldset input')[5].value,'6.00')
 await change(document.querySelectorAll('fieldset input')[4],'0.28')
 assert.equal(document.querySelectorAll('fieldset input')[5].value,'5.60')
 await change(document.querySelectorAll('fieldset input')[2],'CARDBOARD')
 assert.equal(document.querySelectorAll('fieldset input')[4].value,'0.17')
 assert.equal(document.querySelectorAll('fieldset input')[5].value,'3.40')
 assert.deepEqual([...document.querySelectorAll('#sales-prices-0 option')].map(option=>option.value),['0.17'])
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
