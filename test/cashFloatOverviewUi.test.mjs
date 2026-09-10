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

const{default:CashFloatPage}=await vite.ssrLoadModule('/src/CashFloatPage.jsx'),{I18nProvider}=await vite.ssrLoadModule('/src/i18n.jsx')
test('cash cards show arithmetic and suggested topup while settings sit inside More in three languages',async()=>{
 globalThis.ResizeObserver=class{observe(){}disconnect(){}}
 globalThis.fetch=async url=>({ok:true,json:async()=>String(url).includes('?date=')?{spending:{from:'2026-09-10',to:'2026-09-10',purchaseCents:12000,expenseCents:3000,voidCents:0,expenseItems:[{key:'fuel',category:'Fuel',amountCents:3000}],totalCents:15000},items:[{employeeId:1,employeeName:'Test Employee',configured:true,targetFloatCents:50000,lowBalanceThresholdCents:20000,suggestedTopUpCents:25000,balanceCents:25000,day:{date:'2026-09-10',openingCents:30000,topUpCents:10000,purchaseCents:12000,expenseCents:3000,expenseItems:[{key:"fuel",category:"Fuel",description:"",amountCents:2000},{key:"repair",category:"Repair",description:"",amountCents:1000}],otherCents:0,closingCents:25000}}]}:{items:[]}})
 for(const language of ['en','ms','zh']){
 const root=createRoot(document.getElementById('root'));await act(async()=>root.render(React.createElement(I18nProvider,{language},React.createElement(CashFloatPage,{onBack(){}}))))
 assert.equal(document.querySelectorAll('.cash-spending .cash-line').length,4);
 assert.equal(document.querySelectorAll('.cash-toolbar input[type=date]').length,2)
 assert.ok(document.querySelector('.cash-line-total').textContent.includes('150.00'))
 const card=document.querySelector('.cash-account-grid article');assert.equal(card.querySelector('.cash-line-total b').textContent,'RM 250.00');assert.equal(card.querySelectorAll('.cash-arithmetic .cash-line').length,7)
 assert.equal(card.querySelector('details').open,false);assert.equal(card.querySelectorAll('details button').length,2);assert.ok(!document.body.textContent.includes('cf.'))
 await act(async()=>root.unmount())
 }
})
