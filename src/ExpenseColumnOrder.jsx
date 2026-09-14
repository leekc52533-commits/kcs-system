import {useEffect,useRef,useState} from 'react'
export const expenseColumnWords={zh:{title:'调整栏目',save:'保存',close:'关闭',reset:'恢复默认',hint:'按住名称或 ⋮⋮ 上下拖动，靠近边缘会自动滚动。排好后按「保存」。',up:'上移',down:'下移',history:'更正记录',corrected:'已更正',unchanged:'未更正',number:'费用编号',failed:'无法保存排列，请检查浏览器储存设置。'},en:{title:'Arrange columns',save:'Save',close:'Close',reset:'Restore default',hint:'Hold a name or ⋮⋮ and drag up/down. Drag near an edge to scroll. Select Save when finished.',up:'Move up',down:'Move down',history:'Correction history',corrected:'Corrected',unchanged:'Unchanged',number:'Expense No.',failed:'Unable to save order. Check browser storage settings.'},ms:{title:'Susun lajur',save:'Simpan',close:'Tutup',reset:'Susunan asal',hint:'Tekan dan tahan nama atau ⋮⋮, kemudian seret ke atas/bawah. Dekati tepi untuk menatal. Tekan Simpan selepas selesai.',up:'Naik',down:'Turun',history:'Sejarah pembetulan',corrected:'Dibetulkan',unchanged:'Tidak dibetulkan',number:'No. belanja',failed:'Gagal menyimpan susunan. Semak tetapan storan pelayar.'}}
export const expenseOrderKey='kcs.expense-column-order.v1'
export function normalizeExpenseOrder(saved,keys){return [...new Set([...(Array.isArray(saved)?saved.filter(k=>keys.includes(k)):[]),...keys])]}
export function readExpenseOrder(keys){try{return normalizeExpenseOrder(JSON.parse(localStorage.getItem(expenseOrderKey)),keys)}catch{return keys}}
export default function ExpenseColumnOrder({order,columns,w,onSave,onClose}){
 const[draft,setDraft]=useState(order),[drag,setDrag]=useState(null),[error,setError]=useState(''),list=useRef(null),gesture=useRef(null)
 const move=(key,target)=>setDraft(current=>{const next=current.filter(k=>k!==key);next.splice(target,0,key);return next})
 const finish=(cancel=false)=>{const g=gesture.current;if(!g)return;gesture.current=null;if(cancel)setDraft(g.before);setDrag(null);if(list.current?.hasPointerCapture?.(g.id))list.current.releasePointerCapture(g.id)}
 const start=e=>{if(e.button!==0||gesture.current||!e.target.closest('.expense-column-grip'))return;const row=e.target.closest('[data-column-key]');if(!row)return;e.preventDefault();gesture.current={id:e.pointerId,key:row.dataset.columnKey,y:e.clientY,before:[...draft]};list.current.setPointerCapture?.(e.pointerId);setDrag(row.dataset.columnKey)}
 useEffect(()=>{
  if(!drag)return
  let frame
  const tick=()=>{const g=gesture.current,el=list.current;if(!g||!el)return;const bounds=el.getBoundingClientRect(),edge=Math.min(56,bounds.height/4)
   const speed=g.y<bounds.top+edge?-Math.min(14,Math.max(0,(bounds.top+edge-g.y)/4)):g.y>bounds.bottom-edge?Math.min(14,Math.max(0,(g.y-bounds.bottom+edge)/4)):0
   if(speed)el.scrollTop+=speed
   const others=[...el.querySelectorAll('[data-column-key]')].filter(n=>n.dataset.columnKey!==g.key)
   const target=others.filter(n=>{const r=n.getBoundingClientRect();return g.y>r.top+r.height/2}).length
   setDraft(current=>{if(current.indexOf(g.key)===target)return current;const next=current.filter(k=>k!==g.key);next.splice(target,0,g.key);return next})
   frame=requestAnimationFrame(tick)
  }
  frame=requestAnimationFrame(tick)
  const cancel=()=>finish(true);window.addEventListener('blur',cancel)
  return()=>{cancelAnimationFrame(frame);window.removeEventListener('blur',cancel)}
 },[drag])
 const save=()=>{if(gesture.current)return;try{localStorage.setItem(expenseOrderKey,JSON.stringify(draft));onSave(draft);onClose()}catch{setError(w.failed)}}
 return <div className="cash-modal expense-column-modal" role="dialog" aria-modal="true" aria-label={w.title} onClick={e=>{if(e.target===e.currentTarget&&!gesture.current)onClose()}} onKeyDown={e=>{if(e.key==='Escape'){if(gesture.current)finish(true);else onClose()}}}><form onSubmit={e=>{e.preventDefault();save()}}><header><h2>{w.title}</h2><button type="button" onClick={onClose} aria-label={w.close}>×</button></header><p className="expense-column-hint">{w.hint}</p><div className="expense-column-list" ref={list} onPointerDown={start} onPointerMove={e=>{if(gesture.current?.id===e.pointerId){gesture.current.y=e.clientY;e.preventDefault()}}} onPointerUp={e=>{if(gesture.current?.id===e.pointerId)finish()}} onPointerCancel={()=>finish(true)} onLostPointerCapture={()=>finish(true)}>
 {draft.map((key,i)=><div className={'expense-column-row'+(drag===key?' is-dragging':'')} key={key} data-column-key={key}><span className="expense-column-grip"><span className="expense-column-handle" aria-hidden="true">⋮⋮</span><span>{columns.find(c=>c[0]===key)?.[1]}</span></span><span className="expense-column-position" aria-hidden="true">{i+1}</span><button type="button" disabled={!i||Boolean(drag)} aria-label={w.up+': '+columns.find(c=>c[0]===key)?.[1]} onClick={()=>move(key,i-1)}>↑</button><button type="button" disabled={i===draft.length-1||Boolean(drag)} aria-label={w.down+': '+columns.find(c=>c[0]===key)?.[1]} onClick={()=>move(key,i+1)}>↓</button></div>)}
 </div>{error&&<p role="alert">{error}</p>}<footer><span aria-live="polite">{drag?`${columns.find(c=>c[0]===drag)?.[1]} · ${draft.indexOf(drag)+1} / ${draft.length}`:''}</span><button type="button" disabled={Boolean(drag)} onClick={()=>setDraft(columns.map(c=>c[0]))}>{w.reset}</button><button disabled={Boolean(drag)}>{w.save}</button></footer></form></div>
}
