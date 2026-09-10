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
