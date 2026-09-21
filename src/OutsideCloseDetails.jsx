import {useEffect,useRef} from 'react'
import {useI18n} from './i18n.jsx'
const prompts={zh:'内容已修改，确定收起？尚未保存的内容会保留在此面板中。',en:'Changes were made. Collapse this panel? Unsaved entries will remain here.',ms:'Maklumat telah diubah. Tutup panel ini? Entri yang belum disimpan akan dikekalkan.'}
// Collapse without unmounting children, so local drafts and pending work survive.
export default function OutsideCloseDetails({children,busy=false,dirty=false,...props}){
 const root=useRef(null),edited=useRef(false),latest=useRef(null),{language}=useI18n()
 latest.current={busy,dirty,language}
 useEffect(()=>{
  let down=null
  const start=e=>{down={target:e.target,x:e.clientX,y:e.clientY}}
  const click=e=>{
   const node=root.current,state=latest.current,target=e.target
   if(!node?.open||state.busy||!down||down.target!==target||Math.hypot(e.clientX-down.x,e.clientY-down.y)>6)return
   if(node.contains(target)||target.closest('button,a,input,select,textarea,label,summary,[role="button"],[role="dialog"],[role="menu"],dialog,[contenteditable="true"]')||window.getSelection()?.toString())return
   if((state.dirty||edited.current)&&!window.confirm(prompts[state.language]||prompts.en))return
   node.open=false
  }
  document.addEventListener('pointerdown',start);document.addEventListener('click',click)
  return()=>{document.removeEventListener('pointerdown',start);document.removeEventListener('click',click)}
 },[])
 return <details {...props} ref={root} onInputCapture={()=>{edited.current=true}} onChangeCapture={()=>{edited.current=true}}>{children}</details>
}
