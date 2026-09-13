import {useEffect,useState} from 'react'
import {createPortal} from 'react-dom'
import {useI18n} from './i18n.jsx'

// Multiple tables share one visible bottom handle; hovering/focusing selects a table.
const tables=new Map()
let preferred=null
function publish(){
 const visible=[...tables.entries()].filter(([,r])=>r.view)
 const winner=visible.find(([id])=>id===preferred)||visible.sort((a,b)=>b[1].view.visibleHeight-a[1].view.visibleHeight)[0]
 for(const [id,row] of tables)row.update(winner?.[0]===id?row.view:null)
}
export default function TableBottomScroll({scrollRef}){
 const{t}=useI18n(),[view,setView]=useState(null)
 useEffect(()=>{
  const element=scrollRef.current;if(!element)return
  const id=Symbol(),update=next=>setView(current=>JSON.stringify(current)===JSON.stringify(next)?current:next)
  tables.set(id,{view:null,update});element.classList.add('single-horizontal-scroll')
  const measure=()=>{
   const rect=element.getBoundingClientRect(),max=Math.max(0,element.scrollWidth-element.clientWidth),left=Math.max(8,rect.left),right=Math.min(window.innerWidth-8,rect.right)
   element.style.setProperty('--compact-viewport-width',`${element.clientWidth}px`)
   const next=max>1&&rect.top<window.innerHeight-40&&rect.bottom>40&&right>left?{left,width:right-left,max,value:element.scrollLeft,visibleHeight:Math.min(rect.bottom,window.innerHeight)-Math.max(0,rect.top),thumb:Math.max(32,Math.min((right-left)*element.clientWidth/element.scrollWidth,(right-left)/2))}:null
   const entry=tables.get(id);if(entry){entry.view=next;publish()}
  }
  const select=()=>{preferred=id;measure()}
  measure()
  const resize=typeof ResizeObserver==='function'?new ResizeObserver(measure):null
  resize?.observe(element);if(element.firstElementChild)resize?.observe(element.firstElementChild)
  const mutation=new MutationObserver(measure);mutation.observe(element,{childList:true,subtree:true,characterData:true})
  element.addEventListener('scroll',measure,{passive:true});element.addEventListener('pointerenter',select);element.addEventListener('focusin',select)
  window.addEventListener('scroll',measure,{capture:true,passive:true});window.addEventListener('resize',measure)
  return()=>{resize?.disconnect();mutation.disconnect();element.removeEventListener('scroll',measure);element.removeEventListener('pointerenter',select);element.removeEventListener('focusin',select);window.removeEventListener('scroll',measure,true);window.removeEventListener('resize',measure);element.classList.remove('single-horizontal-scroll');tables.delete(id);if(preferred===id)preferred=null;publish()}
 },[scrollRef])
 if(!view)return null
 return createPortal(<div className="table-bottom-scroll" style={{left:view.left,width:view.width,'--scroll-thumb-width':`${view.thumb}px`}}><input type="range" min="0" max={view.max} step="1" value={Math.min(view.max,Math.max(0,view.value))} aria-label={t('list.horizontalScroll')} title={t('list.horizontalScroll')} onChange={event=>{const value=Number(event.target.value);scrollRef.current.scrollLeft=value;setView(current=>current?{...current,value}:null)}}/></div>,document.body)
}
