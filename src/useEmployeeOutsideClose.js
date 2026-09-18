import {useEffect,useRef} from 'react'
// Dismiss only an intentional blank-space click, not scrolling, controls or
// clicks in portalled dialogs. Keep a conservative guard for nested editors.
export function useEmployeeOutsideClose({open,saving,dirty,onClose,confirmDiscard,resetKey}){
 const panel=useRef(null),nestedEdited=useRef(false),latest=useRef(null)
 latest.current={saving,dirty,onClose,confirmDiscard}
 useEffect(()=>{nestedEdited.current=false},[resetKey])
 useEffect(()=>{
  if(!open)return
  let down=null
  const start=e=>{down={target:e.target,x:e.clientX,y:e.clientY}}
  const change=e=>{if(panel.current?.contains(e.target))nestedEdited.current=true}
  const click=e=>{
   const node=panel.current,target=e.target,state=latest.current
   if(!node||state.saving||!down||down.target!==target||Math.hypot(e.clientX-down.x,e.clientY-down.y)>6)return
   if(node.contains(target)||target.closest('button,a,input,select,textarea,label,summary,[role="button"],[role="dialog"],dialog,[contenteditable="true"]'))return
   if(window.getSelection()?.toString())return
   if(!state.dirty&&nestedEdited.current&&!state.confirmDiscard())return
   state.onClose()
  }
  document.addEventListener('pointerdown',start);document.addEventListener('click',click)
  document.addEventListener('input',change);document.addEventListener('change',change)
  return()=>{document.removeEventListener('pointerdown',start);document.removeEventListener('click',click);document.removeEventListener('input',change);document.removeEventListener('change',change)}
 },[open])
 return panel
}
