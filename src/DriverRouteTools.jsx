import {dateRequestReasons,reasonNotes} from './dateRequestReasons.js'
import {useState} from 'react'
import {useI18n} from './i18n.jsx'
import {apiRequest} from './apiClient.js'

export default function DriverRouteTools({stop,trip,route,busy,run}){
 const{t,language}=useI18n(),[open,setOpen]=useState(false),[date,setDate]=useState(''),[reason,setReason]=useState(''),[reasonCode,setReasonCode]=useState('')
 const untouched=s=>!s.arrivedAt&&!s.deferred&&!s.billCreated&&!['active','completed','cancelled'].includes(s.status)&&s.deferApprovalStatus!=='pending'
 const index=trip.stops.findIndex(s=>s.id===stop.id),blocked=trip.stops.some(s=>s.status==='active'||s.deferApprovalStatus==='pending')
 const orderRequest=stop.arrangementRequests?.find(r=>r.kind==='order'),orderEnabled=route.trialOrderEnabled||route.driverApprovalRequired
 const canMove=orderEnabled&&orderRequest?.status!=='pending'&&trip.executionStatus==='in_progress'&&!blocked&&untouched(stop)
 const move=direction=>{const reason=route.driverApprovalRequired?window.prompt(t('routeTrial.reason')):'';if(route.driverApprovalRequired&&!reason?.trim())return;return run('order-'+stop.id,()=>apiRequest(`/api/mobile/stops/${stop.id}/trial-reorder`,{method:'POST',body:JSON.stringify({direction,reason,expectedOrder:trip.stops.map(s=>s.id)})}),t(route.driverApprovalRequired?'arrange.sent':'routeTrial.orderSaved'),true)}
 const chosen=dateRequestReasons.find(r=>r.id===reasonCode),notes=reasonNotes[language]||reasonNotes.en
 const finalReason=chosen?(reasonCode==='other'?reason.trim():[chosen[language]||chosen.en,reason.trim()].filter(Boolean).join(' — ')):''
 const submit=()=>{if(busy||!finalReason||date<=route.date)return;return run('date-'+stop.id,async()=>{await apiRequest(`/api/mobile/stops/${stop.id}/request-date`,{method:'POST',body:JSON.stringify({targetDate:date,reason:finalReason})});setOpen(false);setReason('');setReasonCode('')},t('routeTrial.requestSent'))}
 return <div className="driver-route-tools">
  {orderEnabled&&untouched(stop)&&<div><button type="button" disabled={busy||!canMove||!trip.stops[index-1]||!untouched(trip.stops[index-1])} onClick={()=>move('up')}>{t(route.driverApprovalRequired?'arrange.up':'routeTrial.up')}</button><button type="button" disabled={busy||!canMove||!trip.stops[index+1]||!untouched(trip.stops[index+1])} onClick={()=>move('down')}>{t(route.driverApprovalRequired?'arrange.down':'routeTrial.down')}</button></div>}
  {orderRequest&&<p>{t('arrange.order')} · {t('arrange.'+orderRequest.status)} <span data-i18n-raw>{orderRequest.reviewReason}</span></p>}
  {stop.dateRequest&&<p>{t('routeTrial.'+stop.dateRequest.status)} · {stop.dateRequest.targetDate}{stop.dateRequest.reviewReason&&<span data-i18n-raw> · {stop.dateRequest.reviewReason}</span>}</p>}
  {untouched(stop)&&stop.dateRequest?.status!=='pending'&&<button data-preview-safe type="button" disabled={busy} onClick={()=>setOpen(!open)}>{t(open?'common.cancel':'routeTrial.requestDate')}</button>}
  {open&&<div><label>{t('routeTrial.targetDate')}<input type="date" value={date} min={route.date} onChange={e=>setDate(e.target.value)}/></label><label>{t('routeTrial.reason')}<select required disabled={busy} value={reasonCode} onChange={e=>setReasonCode(e.target.value)}><option value="">{t('common.select')}</option>{dateRequestReasons.map(r=><option data-i18n-raw key={r.id} value={r.id}>{r[language]||r.en}</option>)}</select></label>{reasonCode&&<label>{reasonCode==='other'?notes.required:notes.optional}<textarea required={reasonCode==='other'} disabled={busy} maxLength={800} value={reason} onChange={e=>setReason(e.target.value)}/></label>}<small>{t('routeTrial.pendingHelp')}</small><button type="button" disabled={busy||!finalReason||date<=route.date} onClick={submit}>{t('routeTrial.submit')}</button></div>}
 </div>
}
