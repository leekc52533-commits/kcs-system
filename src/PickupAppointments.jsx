import {useEffect,useState} from 'react'
import {apiRequest} from './apiClient.js'
import {useI18n} from './i18n.jsx'
import {formatDateDisplay} from './dateDisplay.js'
import {addCalendarDays,kuchingDate} from '../shared/kuchingTime.js'
import './PickupAppointments.css'

export function appointmentList(items,today){
 const cutoff=addCalendarDays(today,2)
 return items.filter(r=>!['completed','rejected','cancelled'].includes(r.status)&&r.completionStatus!=='completed').map(r=>{
  const planned=Boolean(r.scheduledDate)||['scheduled','published'].includes(r.status)
  const urgent=!planned&&r.requestedCollectionDate<=cutoff
  return {...r,planned,urgent}
 }).sort((a,b)=>Number(b.urgent)-Number(a.urgent)||a.requestedCollectionDate.localeCompare(b.requestedCollectionDate)||Number(Boolean(b.promisedToCustomer))-Number(Boolean(a.promisedToCustomer))||a.id-b.id)
}
export default function PickupAppointments({onRegister,onManage}){
 const {t}=useI18n(),[items,setItems]=useState(null),[error,setError]=useState(''),[expanded,setExpanded]=useState(false),[attempt,retry]=useState(0)
 useEffect(()=>{let active=true,seq=0
  const refresh=async()=>{const id=++seq;try{const data=await apiRequest('/api/special-requests');if(active&&id===seq){setItems(data.items);setError('')}}catch(e){if(active&&id===seq)setError(e.message)}}
  refresh();window.addEventListener('focus',refresh);return()=>{active=false;window.removeEventListener('focus',refresh)}
 },[attempt])
 const today=kuchingDate(),rows=appointmentList(items||[],today),urgent=rows.filter(x=>x.urgent)
 return <section className="pickup-appts"><header><h2><button type="button" aria-expanded={expanded} onClick={()=>setExpanded(v=>!v)}>{t('appts.title')} {expanded?'▴':'▾'}</button></h2><button type="button" onClick={onRegister}>{t('appts.register')}</button></header>
 {error?<p role="alert">{error} <button onClick={()=>retry(n=>n+1)}>{t('appts.retry')}</button></p>:items===null?<p>{t('common.loadingData')}</p>:<>
 <p>{rows.length?t('appts.summary',{count:rows.length,urgent:urgent.length}):t('appts.empty')}</p>
 {rows.length>0&&<ul>{(expanded?rows:urgent.slice(0,1)).map(r=><li key={r.id}><strong data-i18n-raw>{formatDateDisplay(r.requestedCollectionDate)} · {[...new Set([r.customerName||r.temporaryCustomerName,r.branchName].filter(Boolean))].join(' / ')}</strong>
 <span>{t(r.planned?'appts.planned':'appts.pending')}{r.planned&&r.scheduledDate?' · '+formatDateDisplay(r.scheduledDate):''}</span>
 {r.promisedToCustomer&&<b className="promise">{t('specialRequest.promised')}</b>}{r.urgent&&<b>{t(r.requestedCollectionDate<today?'appts.overdue':'appts.soon')}</b>}
 {(r.specialRequirement||r.remark)&&<small data-i18n-raw>{[r.specialRequirement,r.remark].filter(Boolean).join(' · ')}</small>}</li>)}</ul>}
 {expanded&&<button type="button" onClick={onManage}>{t('appts.manage')}</button>}</>}
 </section>
}
