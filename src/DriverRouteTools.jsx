import {customerDateWords} from '../shared/customerDatePromise.js'
import {stopActionWords} from './stopActionWords.js'
import './StopActions.css'
import {formatDateDisplay} from './dateDisplay.js'
import DateInput from './DateInput.jsx'
import DateRequestEvidence from './DateRequestEvidence.jsx'
import {evidenceProblem} from '../shared/dateRequestEvidence.js'
import {proofData} from './paymentProofImage.js'
import {dateRequestReasons,reasonNotes} from './dateRequestReasons.js'
import {useState} from 'react'
import {useI18n} from './i18n.jsx'
import {apiRequest} from './apiClient.js'

export default function DriverRouteTools({stop,trip,route,busy,run}){
 const{t,language}=useI18n(),[open,setOpen]=useState(false),[date,setDate]=useState(stop.nextScheduledDate||''),[reason,setReason]=useState(''),[reasonCode,setReasonCode]=useState(''),[evidence,setEvidence]=useState({}),[proofBusy,setProofBusy]=useState(false)
 const untouched=s=>!s.arrivedAt&&!s.deferred&&!s.billCreated&&!['active','completed','cancelled'].includes(s.status)&&s.deferApprovalStatus!=='pending'
 const index=trip.stops.findIndex(s=>s.id===stop.id),blocked=trip.stops.some(s=>s.status==='active'||s.deferApprovalStatus==='pending')
 const orderRequest=stop.arrangementRequests?.find(r=>r.kind==='order'),orderEnabled=route.trialOrderEnabled||route.driverApprovalRequired
 const canMove=orderEnabled&&orderRequest?.status!=='pending'&&trip.executionStatus==='in_progress'&&!blocked&&untouched(stop)
 const move=direction=>{const reason=route.driverApprovalRequired?window.prompt(t('routeTrial.reason')):'';if(route.driverApprovalRequired&&!reason?.trim())return;return run('order-'+stop.id,()=>apiRequest(`/api/mobile/stops/${stop.id}/trial-reorder`,{method:'POST',body:JSON.stringify({direction,reason,expectedOrder:trip.stops.map(s=>s.id)})}),t(route.driverApprovalRequired?'arrange.sent':'routeTrial.orderSaved'),true)}
 const cw=customerDateWords[language]||customerDateWords.en
 const chosen=dateRequestReasons.find(r=>r.id===reasonCode),notes=reasonNotes[language]||reasonNotes.en
 const finalReason=chosen?(reasonCode==='other'?reason.trim():chosen[language]||chosen.en):''
 const evidenceDraft={...evidence,details:reasonCode==='other'?reason:''},evidenceInvalid=evidenceProblem(reasonCode,evidenceDraft)
 const submit=()=>{if(stop.customerDatePromise||busy||proofBusy||evidenceInvalid||!finalReason||!date||date<=route.date)return;return run('date-'+stop.id,async()=>{await apiRequest(`/api/mobile/stops/${stop.id}/request-date`,{method:'POST',body:JSON.stringify({targetDate:date,reason:finalReason,reasonCode,evidence:{...evidenceDraft,contactAt:evidence.contactAt?new Date(evidence.contactAt).toISOString():undefined,photo:evidence.photo?await proofData(evidence.photo):undefined}})});setOpen(false);setReason('');setReasonCode('');setEvidence({})},t('routeTrial.requestSent'))}
 return <div className="driver-route-tools">
  {orderEnabled&&untouched(stop)&&<button className="stop-action-return" type="button" disabled={busy||!canMove||!trip.stops[index+1]||!untouched(trip.stops[index+1])} onClick={()=>move('down')}>{(stopActionWords[language]||stopActionWords.en).back}</button>}
  {orderRequest&&<p>{t('arrange.order')} · {t('arrange.'+orderRequest.status)} <span data-i18n-raw>{orderRequest.reviewReason}</span></p>}
  {stop.dateRequest&&<p>{formatDateDisplay(t('routeTrial.'+stop.dateRequest.status))} · {formatDateDisplay(stop.dateRequest.targetDate)}{stop.dateRequest.reviewReason&&<span data-i18n-raw> · {formatDateDisplay(stop.dateRequest.reviewReason)}</span>}</p>}
  {!stop.customerDatePromise&&untouched(stop)&&stop.dateRequest?.status!=='pending'&&<button className="stop-action-date" data-preview-safe type="button" disabled={busy||proofBusy} onClick={()=>{if(!open&&!date)setDate(stop.nextScheduledDate||'');setOpen(!open)}}>{open?t('common.cancel'):(stopActionWords[language]||stopActionWords.en).date}</button>}
  {open&&<div><label>{reasonCode==='customer'?cw.date:formatDateDisplay(t('routeTrial.targetDate'))}<DateInput type="date" value={date} min={new Date(Date.parse(route.date+'T00:00:00Z')+86400000).toISOString().slice(0,10)} disabled={busy} onChange={e=>setDate(e.target.value)}/></label>{!stop.nextScheduledDate&&<small>{formatDateDisplay(({en:'No next collection scheduled. Please select a date.',ms:'Tiada jadual seterusnya. Sila pilih tarikh.',zh:'没有下一次收货排程，请选择日期。'})[language]||'Please select a date.')}</small>}<label>{t('routeTrial.reason')}<select required disabled={busy||proofBusy} value={reasonCode} onChange={e=>{setReasonCode(e.target.value);if(e.target.value==='customer')setDate('');setReason('');setEvidence({})}}><option value="">{t('common.select')}</option>{dateRequestReasons.map(r=><option data-i18n-raw key={r.id} value={r.id}>{r[language]||r.en}</option>)}</select></label>{reasonCode==='other'&&<label>{notes.required}<textarea required={reasonCode==='other'} disabled={busy} maxLength={800} value={reason} onChange={e=>setReason(e.target.value)}/></label>}<DateRequestEvidence key={reasonCode} code={reasonCode} value={evidenceDraft} onChange={setEvidence} busy={busy||proofBusy} onBusyChange={setProofBusy}/>{reasonCode==='customer'?<p role="alert" style={{color:'#a12622',fontWeight:700}}>{cw.warning}</p>:<small>{t('routeTrial.pendingHelp')}</small>}<button type="button" disabled={busy||proofBusy||Boolean(evidenceInvalid)||!finalReason||!date||date<=route.date} onClick={submit}>{t('routeTrial.submit')}</button></div>}
 </div>
}
