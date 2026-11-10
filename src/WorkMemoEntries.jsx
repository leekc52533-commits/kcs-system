import {useState,useEffect} from 'react'
import DateInput from './DateInput.jsx'
import {apiRequest} from './apiClient.js'
import {formatDateDisplay} from './dateDisplay.js'
import {kuchingDate} from '../shared/kuchingTime.js'
export const words={
 zh:{title:'工作备忘',add:'＋记一件事',other:'其他事项',repair:'维修',visit:'拜访客户',kind:'事项类别',note:'要做什么',customer:'客户／分店（选填）',date:'跟进日期（选填）',none:'未定日期',late:'已过期',pending:'待处理',done:'标记已完成',history:'已完成',confirm:'确认这件事已办妥？',empty:'目前没有其他待办事项。'},
 en:{title:'Work memos',add:'+ Add an item',other:'Other',repair:'Repair',visit:'Customer visit',kind:'Type',note:'What needs doing?',customer:'Customer / branch (optional)',date:'Follow-up date (optional)',none:'No date set',late:'Overdue',pending:'Pending',done:'Mark complete',history:'Completed',confirm:'Mark this item as completed?',empty:'No other pending items.'},
 ms:{title:'Memo kerja',add:'+ Tambah perkara',other:'Lain-lain',repair:'Pembaikan',visit:'Lawatan pelanggan',kind:'Jenis',note:'Apa yang perlu dibuat?',customer:'Pelanggan / cawangan (pilihan)',date:'Tarikh susulan (pilihan)',none:'Belum bertarikh',late:'Lewat',pending:'Belum selesai',done:'Tandakan selesai',history:'Selesai',confirm:'Tandakan perkara ini sebagai selesai?',empty:'Tiada perkara lain yang belum selesai.'}}
const blank={kind:'other',note:'',customer:'',due_date:''}
export default function WorkMemoEntries({editor,setEditor,onRegister,canComplete,t,w}){
 const [items,setItems]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[tick,reload]=useState(0)
 useEffect(()=>{let live=true,seq=0;const load=async()=>{const n=++seq;try{const d=await apiRequest('/api/work-memos');if(live&&n===seq)setItems(d.items)}catch(e){if(live&&n===seq)setError(e.message)}};load();const timer=setInterval(()=>{if(!document.hidden)load()},60000);window.addEventListener('focus',load);return()=>{live=false;clearInterval(timer);window.removeEventListener('focus',load)}},[tick])
 const draft=editor&&{...blank,...editor}
 const change=(key,value)=>setEditor({...draft,[key]:value})
 async function save(complete=false){if(busy||(!complete&&!draft.note.trim())||(complete&&!window.confirm(w.confirm)))return;setBusy(true);setError('')
 try{await apiRequest('/api/work-memos'+(draft.id?'/'+draft.id:''),{method:draft.id?'PATCH':'POST',body:JSON.stringify(complete?{complete:true,revision:draft.revision}:draft)});setEditor(null);reload(n=>n+1)}catch(e){setError(e.message);reload(n=>n+1)}finally{setBusy(false)}}
 const row=r=><li key={r.id}><span>{w[r.kind]}</span><button className="link-button" type="button" data-i18n-raw onClick={()=>{setEditor({...r});setError('')}}>{[r.customer,r.note].filter(Boolean).join(' · ')}</button><small>{r.due_date?formatDateDisplay(r.due_date):w.none} · {r.completed_at?w.history:r.due_date&&r.due_date<kuchingDate()?w.late:w.pending}</small></li>
 const active=items?.filter(r=>!r.completed_at)||[],history=items?.filter(r=>r.completed_at)||[]
 return <div className="work-memos">{error&&<p role="alert">{error} <button onClick={()=>{setError('');reload(n=>n+1)}}>{t('appts.retry')}</button></p>}
 {draft&&<form onSubmit={e=>{e.preventDefault();save()}}><fieldset disabled={busy||!!draft.completed_at}><label>{w.kind}<select value={draft.kind} onChange={e=>{if(e.target.value==='pickup'){setEditor(null);onRegister()}else change('kind',e.target.value)}}>{!draft.id&&<option value="pickup">{t('appts.title')}</option>}{['other','repair','visit'].map(k=><option key={k} value={k}>{w[k]}</option>)}</select></label>
 <label>{w.note}<textarea required maxLength={2000} value={draft.note} onChange={e=>change('note',e.target.value)}/></label><label>{w.customer}<input maxLength={200} value={draft.customer} onChange={e=>change('customer',e.target.value)}/></label><label>{w.date}<DateInput type="date" value={draft.due_date||''} onChange={e=>change('due_date',e.target.value)}/></label></fieldset>
 {!draft.completed_at&&<button disabled={busy||!draft.note.trim()}>{t('common.save')}</button>} {canComplete&&draft.id&&!draft.completed_at&&<button type="button" disabled={busy} onClick={()=>save(true)}>{w.done}</button>} <button type="button" disabled={busy} onClick={()=>setEditor(null)}>{t('common.close')}</button></form>}
 {active.length>0?<ul>{active.map(row)}</ul>:items&&<p>{w.empty}</p>}{history.length>0&&<details><summary>{w.history}（{history.length}）</summary><ul>{history.map(row)}</ul></details>}</div>
}
