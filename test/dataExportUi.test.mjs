import test,{after} from 'node:test'
import assert from 'node:assert/strict'
import React,{act} from 'react'
import {createServer} from 'vite'
import {JSDOM} from 'jsdom'
import ExcelJS from 'exceljs'
const dom=new JSDOM('<html><body><div id="root"></div><div id="page-data-exports"></div></body></html>',{url:'https://localhost/'})
for(const k of ['window','document','Node','NodeFilter','HTMLElement','MutationObserver','Event','MouseEvent','localStorage','sessionStorage'])globalThis[k]=dom.window[k]
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true
const{createRoot}=await import('react-dom/client'),vite=await createServer({logLevel:'silent',server:{middlewareMode:true},appType:'custom'})
after(()=>vite.close())
const{default:Button}=await vite.ssrLoadModule('/src/DataExportButton.jsx'),{I18nProvider}=await vite.ssrLoadModule('/src/i18n.jsx')
test('header export downloads a valid workbook, keeps zeros and escapes formulas',async()=>{
 const root=createRoot(document.getElementById('root'));let blob,filename,error,finish;const downloaded=new Promise(resolve=>{finish=resolve});
 const original=dom.window.HTMLAnchorElement.prototype.click,make=URL.createObjectURL,revoke=URL.revokeObjectURL;
 dom.window.HTMLAnchorElement.prototype.click=function(){filename=this.download};
 URL.createObjectURL=value=>{blob=value;finish();return 'blob:test'};URL.revokeObjectURL=()=>{};window.alert=value=>{error=value;finish()};
 try{
 await act(async()=>root.render(React.createElement(I18nProvider,{language:'zh'},React.createElement(Button,{name:'客户/分店',rows:[{name:'=SUM(A1)',amount:0,secret:'hidden'}],columns:[{key:'name',label:'Name'},{key:'amount',label:'Amount'}]}))));
 const button=document.querySelector('#page-data-exports button');assert.ok(button);assert.match(button.getAttribute('aria-label'),/导出/);
 await act(async()=>{button.click();await downloaded});
 assert.equal(error,undefined);assert.ok(blob);assert.equal(filename,'客户_分店.xlsx');
 const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(await blob.arrayBuffer());
 const sheet=workbook.worksheets[0];assert.equal(sheet.getCell('A2').value,"'=SUM(A1)");assert.equal(sheet.getCell('B2').value,0);assert.equal(sheet.columnCount,2);
 }finally{await act(async()=>root.unmount());dom.window.HTMLAnchorElement.prototype.click=original;URL.createObjectURL=make;URL.revokeObjectURL=revoke}
});
