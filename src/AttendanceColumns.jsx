import './AttendanceColumns.css'
import {useState} from 'react'
import {expenseColumnWords,normalizeExpenseOrder} from './ExpenseColumnOrder.jsx'
import CenteredNotice from './CenteredNotice.jsx'
export const attendanceColumnKey='kcs.attendance-columns.v1'
export function readAttendanceColumns(keys){try{const saved=JSON.parse(localStorage.getItem(attendanceColumnKey));return {order:normalizeExpenseOrder(saved?.order,keys),hidden:Array.isArray(saved?.hidden)?saved.hidden.filter(k=>keys.includes(k)):[]}}catch{return {order:keys,hidden:[]}}}
export default function AttendanceColumns({columns,layout,language,onSave,onClose,title}){
 const w=expenseColumnWords[language]||expenseColumnWords.en,[draft,setDraft]=useState(layout),[error,setError]=useState('')
 const move=(key,offset)=>setDraft(d=>{const order=[...d.order],i=order.indexOf(key);[order[i],order[i+offset]]=[order[i+offset],order[i]];return {...d,order}})
 const save=e=>{e.preventDefault();try{localStorage.setItem(attendanceColumnKey,JSON.stringify(draft));onSave(draft);onClose()}catch{setError(w.failed)}}
 return <div className="cash-modal expense-column-modal" role="dialog" aria-modal="true" aria-label={title} onClick={e=>{if(e.target===e.currentTarget)onClose()}} onKeyDown={e=>{if(e.key==='Escape')onClose()}}><form onSubmit={save}><header><h2>{title}</h2><button type="button" aria-label={w.close} onClick={onClose}>×</button></header><div className="expense-column-list">{draft.order.map((key,i)=>{const label=columns.find(c=>c[0]===key)?.[1],checked=!draft.hidden.includes(key);return <div className="expense-column-row" key={key}><label className="expense-column-grip"><input type="checkbox" checked={checked} disabled={checked&&draft.hidden.length===columns.length-1} onChange={()=>setDraft(d=>({...d,hidden:checked?[...d.hidden,key]:d.hidden.filter(k=>k!==key)}))}/>{label}</label><button type="button" aria-label={w.up+': '+label} disabled={!i} onClick={()=>move(key,-1)}>↑</button><button type="button" aria-label={w.down+': '+label} disabled={i===draft.order.length-1} onClick={()=>move(key,1)}>↓</button></div>})}</div>{error&&<CenteredNotice>{error}</CenteredNotice>}<footer><button type="button" onClick={()=>setDraft({order:columns.map(c=>c[0]),hidden:[]})}>{w.reset}</button><button>{w.save}</button></footer></form></div>
}
