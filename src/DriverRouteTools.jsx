import {useState} from 'react'
import {useI18n} from './i18n.jsx'
import {apiRequest} from './apiClient.js'

export default function DriverRouteTools({stop,trip,route,busy,run}){
 const{t}=useI18n(),[open,setOpen]=useState(false),[date,setDate]=useState(''),[reason,setReason]=useState('')
 const untouched=s=>!s.arrivedAt&&!s.deferred&&!s.billCreated&&!['active','completed','cancelled'].includes(s.status)&&s.deferApprovalStatus!=='pending'
 const index=trip.stops.findIndex(s=>s.id===stop.id),blocked=trip.stops.some(s=>s.status==='active'||s.deferApprovalStatus==='pending')
 const canMove=route.trialOrderEnabled&&trip.executionStatus==='in_progress'&&!blocked&&untouched(stop)
 const move=direction=>run('order-'+stop.id,()=>apiRequest(`/api/mobile/stops/${stop.id}/trial-reorder`,{method:'POST',body:JSON.stringify({direction,expectedOrder:trip.stops.map(s=>s.id)})}),t('routeTrial.orderSaved'),true)
 const submit=()=>run('date-'+stop.id,async()=>{await apiRequest(`/api/mobile/stops/${stop.id}/request-date`,{method:'POST',body:JSON.stringify({targetDate:date,reason})});setOpen(false);setReason('')},t('routeTrial.requestSent'))
 return <div className="driver-route-tools">
  {route.trialOrderEnabled&&untouched(stop)&&<div><button type="button" disabled={busy||!canMove||!trip.stops[index-1]||!untouched(trip.stops[index-1])} onClick={()=>move('up')}>{t('routeTrial.up')}</button><button type="button" disabled={busy||!canMove||!trip.stops[index+1]||!untouched(trip.stops[index+1])} onClick={()=>move('down')}>{t('routeTrial.down')}</button></div>}
  {stop.dateRequest&&<p>{t('routeTrial.'+stop.dateRequest.status)} · {stop.dateRequest.targetDate}{stop.dateRequest.reviewReason&&<span data-i18n-raw> · {stop.dateRequest.reviewReason}</span>}</p>}
  {untouched(stop)&&stop.dateRequest?.status!=='pending'&&<button type="button" disabled={busy} onClick={()=>setOpen(!open)}>{t(open?'common.cancel':'routeTrial.requestDate')}</button>}
  {open&&<div><label>{t('routeTrial.targetDate')}<input type="date" value={date} min={route.date} onChange={e=>setDate(e.target.value)}/></label><label>{t('routeTrial.reason')}<textarea maxLength={1000} value={reason} onChange={e=>setReason(e.target.value)}/></label><small>{t('routeTrial.pendingHelp')}</small><button type="button" disabled={busy||!reason.trim()||date<=route.date} onClick={submit}>{t('routeTrial.submit')}</button></div>}
 </div>
}
