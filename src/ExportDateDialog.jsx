import {useState} from 'react'
import {createPortal} from 'react-dom'
import {useI18n} from './i18n.jsx'
import DateInput from './DateInput.jsx'
import {apiErrorMessage} from './apiClient.js'
import {kuchingDate} from '../shared/kuchingTime.js'
import './ExportDateDialog.css'
export async function downloadArchive(url,range){
 const target=new URL(url,window.location.origin);target.searchParams.set('from',range.from);target.searchParams.set('to',range.to);target.searchParams.set('exportRange','1')
 const response=await fetch(target.pathname+target.search,{credentials:'same-origin'})
 if(!response.ok)throw Error(apiErrorMessage(await response.json().catch(()=>({}))))
 const blob=await response.blob(),href=URL.createObjectURL(blob),a=document.createElement('a')
 a.href=href;a.download=response.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1]||'KCS.xlsx';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(href),1000)
}
export default function ExportDateDialog({title,initialFrom,initialTo,onDownload,onClose}){
 const{language}=useI18n(),m=({zh:{from:'开始日期',to:'结束日期',download:'下载 Excel',close:'关闭',failed:'下载失败，请重试。',busy:'正在生成…'},en:{from:'Start date',to:'End date',download:'Download Excel',close:'Close',failed:'Download failed. Please retry.',busy:'Preparing…'},ms:{from:'Tarikh mula',to:'Tarikh akhir',download:'Muat turun Excel',close:'Tutup',failed:'Muat turun gagal. Cuba lagi.',busy:'Sedang menyediakan…'}})[language]||{}
 const[from,setFrom]=useState(initialFrom||kuchingDate()),[to,setTo]=useState(initialTo||kuchingDate()),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const submit=async e=>{e.preventDefault();if(busy||!from||!to||from>to)return;setBusy(true);setError('');try{await onDownload({from,to});onClose()}catch(e){setError(e.message||m.failed)}finally{setBusy(false)}}
 return createPortal(<div className="kcs-export-overlay" onClick={e=>{if(!busy&&e.target===e.currentTarget)onClose()}} onKeyDown={e=>{if(!busy&&e.key==='Escape')onClose()}}><form className="kcs-export-dialog" role="dialog" aria-modal="true" aria-label={title} onSubmit={submit}><header><h2>{title}</h2><button type="button" disabled={busy} aria-label={m.close} onClick={onClose}>×</button></header><label>{m.from}<DateInput autoFocus required type="date" value={from} max={to} disabled={busy} onChange={e=>setFrom(e.target.value)}/></label><label>{m.to}<DateInput required type="date" value={to} min={from} disabled={busy} onChange={e=>setTo(e.target.value)}/></label>{error&&<p role="alert">{error}</p>}<footer>{busy&&<span role="status">{m.busy}</span>}<button className="kcs-export-submit" type="submit" disabled={busy||!from||!to||from>to} title={m.download} aria-label={m.download}><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 15V3m-5 5 5-5 5 5M4 15v6h16v-6"/></svg></button></footer></form></div>,document.body)
}
