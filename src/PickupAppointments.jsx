import {useEffect,useState} from 'react'
import {apiRequest} from './apiClient.js'
import {useI18n} from './i18n.jsx'
import {formatDateDisplay} from './dateDisplay.js'
import {addCalendarDays,kuchingDate} from '../shared/kuchingTime.js'
import './PickupAppointments.css'

export function appointmentList(items,today){
 const cutoff=addCalendarDays(today,2)
 return items.filter(r=>!['completed','rejected','cancelled'].includes(r.status)&&r.completionStatus!=='completed').map(r=>{
  const collectionDate=r.scheduledDate||r.requestedCollectionDate
  const planned=Boolean(r.scheduledDate)||['scheduled','published'].includes(r.status)
  const urgent=!planned&&collectionDate>=today&&collectionDate<=cutoff
  return {...r,collectionDate,planned,urgent}
 }).filter(r=>r.collectionDate>=today).sort((a,b)=>Number(b.urgent)-Number(a.urgent)||a.collectionDate.localeCompare(b.collectionDate)||Number(Boolean(b.promisedToCustomer))-Number(Boolean(a.promisedToCustomer))||a.id-b.id)
}
export function waitingForVehicle(items,today){
 const tomorrow=addCalendarDays(today,1)
 return items.filter(r=>{const date=r.scheduledDate||r.requestedCollectionDate
   return date&&date<=tomorrow&&!r.vehicleId&&!r.dispatchVehicleId&&!['cancelled','completed','rejected'].includes(r.status)&&r.completionStatus!=='completed'
 }).sort((a,b)=>(a.scheduledDate||a.requestedCollectionDate).localeCompare(b.scheduledDate||b.requestedCollectionDate)||a.id-b.id)
}
export default function PickupAppointments({onRegister,onManage}){
 const {t,language}=useI18n(),[items,setItems]=useState(null),[error,setError]=useState(''),[expanded,setExpanded]=useState(false),[attempt,retry]=useState(0)
 useEffect(()=>{let active=true,seq=0
  const refresh=async()=>{const id=++seq;try{const data=await apiRequest('/api/special-requests');if(active&&id===seq){setItems(data.items);setError('')}}catch(e){if(active&&id===seq)setError(e.message)}}
  refresh();const timer=window.setInterval(()=>{if(!document.hidden)refresh()},60000);window.addEventListener('focus',refresh);return()=>{active=false;window.clearInterval(timer);window.removeEventListener('focus',refresh)}
 },[attempt])
 const today=kuchingDate(),rows=appointmentList(items||[],today),waiting=waitingForVehicle(items||[],today)
 return <section className="pickup-appts"><header><h2><button type="button" aria-expanded={expanded} onClick={()=>setExpanded(v=>!v)}>{t('appts.title')} {expanded?'▴':'▾'}</button></h2><button type="button" onClick={onRegister}>{t('appts.register')}</button></header>
 {error?<p role="alert">{error} <button onClick={()=>retry(n=>n+1)}>{t('appts.retry')}</button></p>:items===null?<p>{t('common.loadingData')}</p>:<>
 {waiting.length>0&&<aside><strong>{({zh:'待安排车辆',en:'Vehicle assignment needed',ms:'Menunggu penugasan kenderaan'})[language]}（{waiting.length}）</strong><ul>{waiting.map(r=><li key={r.id} data-i18n-raw>{formatDateDisplay(r.scheduledDate||r.requestedCollectionDate)} · {[...new Set([r.customerName||r.temporaryCustomerName,r.branchName].filter(Boolean))].join(' / ')}</li>)}</ul><button type="button" onClick={onManage}>{t('appts.manage')}</button></aside>}
 <p>{rows.length?({zh:`共 ${rows.length} 个收货预约`,ms:`Jumlah janji temu kutipan: ${rows.length}`,en:`Collection appointments: ${rows.length}`})[language]:waiting.length?null:t('appts.empty')}</p>
 {rows.length>0&&<ul>{(expanded?rows:rows.slice(0,1)).map(r=><li key={r.id}><strong data-i18n-raw>{formatDateDisplay(r.collectionDate)} · {[...new Set([r.customerName||r.temporaryCustomerName,r.branchName].filter(Boolean))].join(' / ')}</strong>
 <span>{t(r.planned?'appts.planned':'appts.pending')}</span>
 {r.promisedToCustomer&&<b className="promise">{t('specialRequest.promised')}</b>}{r.urgent&&<b>{t('appts.soon')}</b>}
 {(r.specialRequirement||r.remark)&&<small data-i18n-raw>{[r.specialRequirement,r.remark].filter(Boolean).join(' · ')}</small>}</li>)}</ul>}
 {expanded&&<button type="button" onClick={onManage}>{t('appts.manage')}</button>}</>}
 </section>
}
