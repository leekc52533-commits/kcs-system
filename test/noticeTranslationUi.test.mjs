import test,{after} from 'node:test'
import assert from 'node:assert/strict'
import React,{act} from 'react'
import {createServer} from 'vite'
import {JSDOM} from 'jsdom'
const dom=new JSDOM('<html><body><div id="root"></div></body></html>',{url:'https://localhost/'})
for(const k of ['window','document','Node','NodeFilter','HTMLElement','MutationObserver','Event','MouseEvent','localStorage','sessionStorage','FileReader'])globalThis[k]=dom.window[k]
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true
const {createRoot}=await import('react-dom/client'),vite=await createServer({logLevel:'silent',server:{middlewareMode:true},appType:'custom'})
after(()=>vite.close())
const {NoticeManagement,NoticeMobileProvider,NoticeHistory}=await vite.ssrLoadModule('/src/NoticeBoard.jsx'),{I18nProvider}=await vite.ssrLoadModule('/src/i18n.jsx')
const click=async n=>act(async()=>n.dispatchEvent(new MouseEvent('click',{bubbles:true})))
const change=async(n,value)=>act(async()=>{Object.getOwnPropertyDescriptor(n.tagName==='TEXTAREA'?window.HTMLTextAreaElement.prototype:window.HTMLInputElement.prototype,'value').set.call(n,value);n.dispatchEvent(new Event('input',{bubbles:true}))})
const json=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}})
test('management previews all languages, saves edits, invalidates stale translations and permits fallback publishing',async()=>{
 for(const language of ['zh','ms','en']){
  const calls=[];let fail=false
  globalThis.fetch=async(url,init={})=>{calls.push({url,init});if(url.endsWith('/recipients'))return json({items:[{id:1,name:'KC',employeeCode:'S1'}]});if(url.endsWith('/translate'))return json(fail?{status:'failed',translations:{},failedLanguages:['ms','en']}:{status:'ready',translations:{zh:{title:'通告',body:'没有到顾客那里，不可填写理由'},ms:{title:'Notis',body:'Jangan isi alasan'},en:{title:'Notice',body:'Do not enter reasons'}}});return json({items:[]})}
  const root=createRoot(document.getElementById('root'));await act(async()=>root.render(React.createElement(I18nProvider,{language},React.createElement(NoticeManagement))))
  await change(document.querySelector('form input'),'通告');await change(document.querySelector('form textarea'),'没有到顾客那里，不可填写理由')
  await act(async()=>document.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})))
  assert.equal(document.querySelectorAll('.notice-language-card').length,3);assert.equal(calls.filter(c=>c.init.method==='POST'&&c.url==='/api/notices').length,0)
  await change(document.querySelector('.notice-language-card[lang=ms] textarea'),'Jangan sesuka hati isi alasan')
  fail=true;await click(document.querySelector('.notice-preview > button'));assert.equal(document.querySelector('.notice-language-card[lang=ms] textarea').value,'Jangan sesuka hati isi alasan');fail=false
  await click(document.querySelector('.notice-preview > .notice-primary'))
  const body=JSON.parse(calls.find(c=>c.url==='/api/notices'&&c.init.method==='POST').init.body)
  assert.equal(body.translations.ms.body,'Jangan sesuka hati isi alasan');assert.equal(body.sourceLanguage,'zh')
  await change(document.querySelector('form input'),'第二个通告');await change(document.querySelector('form textarea'),'新的原文');fail=true
  await act(async()=>document.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})))
  assert.equal(document.querySelector('.notice-preview > .notice-primary').disabled,false)
  assert.equal(document.querySelector('.notice-language-card[lang=ms] textarea').value,'')
  assert.equal(document.querySelector('.notice-language-card[lang=ms] textarea').placeholder,'新的原文')
  assert.ok(!document.body.textContent.includes('noticeTranslation.'))
  await act(async()=>root.unmount())
 }
})
test('employee language changes display saved text, search finds translated body, never auto-acknowledges',async()=>{
 const calls=[],item={id:1,title:'原文',body:'原内容',priority:'normal',createdAt:'2026-10-03T10:00:00Z',publisherName:'KC',readAt:'2026-10-03T10:01:00Z',translations:{ms:{title:'Notis',body:'Jangan isi alasan'},en:{title:'Notice',body:'Do not enter reasons'}}}
 globalThis.fetch=async(url,init={})=>{calls.push({url,init});return json(url.endsWith('/guide')?{active:false}:{items:[item]})}
 const root=createRoot(document.getElementById('root')),render=language=>act(async()=>root.render(React.createElement(I18nProvider,{language},React.createElement(NoticeMobileProvider,null,React.createElement(NoticeHistory)))))
 await render('ms');assert.equal(document.querySelector('article h3').textContent,'Notis')
 await change(document.querySelector('.notice-board input'),'alasan');assert.equal(document.querySelectorAll('article').length,1)
 await change(document.querySelector('.notice-board input'),'');await render('en');assert.equal(document.querySelector('article h3').textContent,'Notice')
 await render('zh');assert.equal(document.querySelector('article h3').textContent,'原文')
 assert.equal(calls.filter(c=>c.init.method==='POST').length,0);await act(async()=>root.unmount())
})
