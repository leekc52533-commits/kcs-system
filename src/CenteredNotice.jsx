import {useEffect,useId,useLayoutEffect,useRef,useSyncExternalStore,useState} from 'react'
import {createPortal} from 'react-dom'
import {useI18n} from './i18n.jsx'
import './CenteredNotice.css'
import {translateUi} from './translations.js'
export const showCenteredNotice=message=>document.dispatchEvent(new window.CustomEvent('kcs-notice',{detail:String(message)}))
const entries=new Map(),listeners=new Set()
const publish=()=>listeners.forEach(fn=>fn())
const subscribe=fn=>{listeners.add(fn);return()=>listeners.delete(fn)}
const active=()=>[...entries.keys()].at(-1)||null
const textOf=node=>Array.isArray(node)?node.map(textOf).join(''):node&&typeof node==='object'?textOf(node.props?.children):typeof node==='string'||typeof node==='number'?String(node):''
export default function CenteredNotice({children}){
 const{language}=useI18n(),id=useId(),signature=textOf(children),panel=useRef(null),pointer=useRef(null)
 const current=useSyncExternalStore(subscribe,active,()=>null)
 useLayoutEffect(()=>{if(!signature.trim())return;entries.set(id,signature);publish();return()=>{entries.delete(id);publish()}},[id,signature])
 const dismiss=()=>{for(const [key,value] of entries)if(value===signature)entries.delete(key);publish()}
 useEffect(()=>{if(current!==id)return;const previous=document.activeElement;panel.current?.querySelector('button')?.focus();return()=>{if(previous?.isConnected)previous.focus()}},[current,id])
 if(current!==id)return null
 const w=({zh:{title:'提示',close:'关闭'},ms:{title:'Makluman',close:'Tutup'},en:{title:'Notice',close:'Close'}})[language]||{title:'Notice',close:'Close'}
 return createPortal(<div className="kcs-notice-overlay" onPointerDown={e=>{e.stopPropagation();pointer.current=e.target===e.currentTarget?{x:e.clientX,y:e.clientY}:null}} onPointerCancel={()=>{pointer.current=null}} onClick={e=>{e.stopPropagation();if(e.target===e.currentTarget&&pointer.current&&Math.hypot(e.clientX-pointer.current.x,e.clientY-pointer.current.y)<5)dismiss();pointer.current=null}}><section ref={panel} className="kcs-notice-panel" role="alertdialog" aria-modal="true" aria-labelledby={id+'-title'} aria-describedby={id+'-body'} onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();dismiss()}if(e.key==='Tab'){const controls=[...panel.current.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled)')],first=controls[0],last=controls.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}}}}><header><h2 id={id+'-title'}>{w.title}</h2><button data-preview-safe type="button" aria-label={w.close} onClick={dismiss}>×</button></header><div id={id+'-body'} className="kcs-notice-body">{children}</div><footer><button data-preview-safe type="button" onClick={dismiss}>{w.close}</button></footer></section></div>,document.querySelector('dialog[open]')||document.body)
}
export function RequiredFieldNotices(){
 const{language}=useI18n(),[notice,setNotice]=useState(null),sequence=useRef(0)
 useEffect(()=>{let pending=false;const invalid=e=>{e.preventDefault();if(pending)return;pending=true;queueMicrotask(()=>{pending=false});const field=e.target,label=field.getAttribute('aria-label')||field.labels?.[0]?.childNodes?.[0]?.textContent?.trim()||field.name||'';const words=({zh:{required:'请填写必填项',invalid:'请检查填写内容'},ms:{required:'Sila isi ruangan wajib',invalid:'Sila semak maklumat'},en:{required:'Please complete the required field',invalid:'Please check the field'}})[language]||{required:'Please complete the required field',invalid:'Please check the field'};setNotice({id:++sequence.current,message:(field.validity?.valueMissing?words.required:words.invalid)+(label?': '+label:'')+(field.validity?.valueMissing?'':' — '+field.validationMessage)})};const external=e=>setNotice({id:++sequence.current,message:translateUi(language,e.detail)});document.addEventListener('kcs-notice',external);document.addEventListener('invalid',invalid,true);return()=>{document.removeEventListener('kcs-notice',external);document.removeEventListener('invalid',invalid,true)}},[language])
 return notice?<CenteredNotice key={notice.id}>{notice.message}</CenteredNotice>:null
}
