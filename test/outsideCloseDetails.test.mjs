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
const {default:Panel}=await vite.ssrLoadModule('/src/OutsideCloseDetails.jsx'),{I18nProvider}=await vite.ssrLoadModule('/src/i18n.jsx')
const click=async node=>act(async()=>{node.dispatchEvent(new MouseEvent('pointerdown',{bubbles:true}));node.click()})
test('route panel closes outside, protects changes and busy state, preserves draft and ignores controls',async()=>{
 const root=createRoot(document.getElementById('root'));let busy=false,prompts=0;
 const render=()=>React.createElement(I18nProvider,{language:'zh'},React.createElement(Panel,{busy},React.createElement('summary',null,'Route'),React.createElement('input',{defaultValue:'Draft'})));
 try{
 await act(async()=>root.render(render()));const panel=document.querySelector('details'),input=panel.querySelector('input');panel.open=true;
 await click(input);assert.equal(panel.open,true);await click(document.body);assert.equal(panel.open,false);
 panel.open=true;await act(async()=>input.dispatchEvent(new Event('input',{bubbles:true})));window.confirm=()=>{prompts++;return false};await click(document.body);assert.equal(panel.open,true);assert.equal(prompts,1);
 busy=true;await act(async()=>root.render(render()));await click(document.body);assert.equal(prompts,1);assert.equal(panel.open,true);
 busy=false;await act(async()=>root.render(render()));window.confirm=()=>true;await click(document.body);assert.equal(panel.open,false);assert.equal(input.value,'Draft');assert.ok(document.body.contains(input));
 }finally{await act(async()=>root.unmount())}
})
