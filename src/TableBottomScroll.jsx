import {useEffect,useState} from 'react'
import {createPortal} from 'react-dom'
import {useI18n} from './i18n.jsx'

// A persistent drag handle also works on phones that hide native scrollbars.
export default function TableBottomScroll({scrollRef}){
 const{t}=useI18n(),[view,setView]=useState(null)
 useEffect(()=>{
  const element=scrollRef.current;if(!element)return
  const measure=()=>{
   const rect=element.getBoundingClientRect(),max=Math.max(0,element.scrollWidth-element.clientWidth),left=Math.max(8,rect.left),right=Math.min(window.innerWidth-8,rect.right)
   element.style.setProperty('--compact-viewport-width',`${element.clientWidth}px`)
   const next=max>1&&rect.top<window.innerHeight-40&&rect.bottom>40&&right>left?{left,width:right-left,max,value:element.scrollLeft}:null
   setView(current=>JSON.stringify(current)===JSON.stringify(next)?current:next)
  }
  measure()
  const resize=typeof ResizeObserver==='function'?new ResizeObserver(measure):null
  resize?.observe(element);if(element.firstElementChild)resize?.observe(element.firstElementChild)
  const mutation=new MutationObserver(measure);mutation.observe(element,{childList:true,subtree:true,characterData:true})
  element.addEventListener('scroll',measure,{passive:true})
  window.addEventListener('scroll',measure,{capture:true,passive:true});window.addEventListener('resize',measure)
  return()=>{resize?.disconnect();mutation.disconnect();element.removeEventListener('scroll',measure);window.removeEventListener('scroll',measure,true);window.removeEventListener('resize',measure)}
 },[scrollRef])
 if(!view)return null
 return createPortal(<div className="table-bottom-scroll" style={{left:view.left,width:view.width}}><span aria-hidden="true">↔</span><input type="range" min="0" max={view.max} step="1" value={Math.min(view.max,Math.max(0,view.value))} aria-label={t('list.horizontalScroll')} title={t('list.horizontalScroll')} onChange={event=>{const value=Number(event.target.value);scrollRef.current.scrollLeft=value;setView(current=>current?{...current,value}:null)}}/></div>,document.body)
}
