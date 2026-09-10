import {useCallback,useEffect,useState} from 'react'
import {useI18n,useUi} from './i18n.jsx'
import {apiRequest} from './apiClient.js'
import {kuchingDate} from '../shared/kuchingTime.js'
import {weekdayName} from '../shared/scheduleRecurrence.js'
import './DriverDateApprovals.css'

export function DateRequestReview({item,onSaved,onPlanner}){
 const{t}=useI18n(),ui=useUi()
 const[date,setDate]=useState(item.targetDate),[route,setRoute]=useState(''),[scope,setScope]=useState('once'),[reason,setReason]=useState(''),[sunday,setSunday]=useState(false)
 const[schedule]=useState(item.schedule),[options,setOptions]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[reload,setReload]=useState(0)
 useEffect(()=>{let current=true;setOptions(null);setRoute('');setError('')
  if(date)apiRequest(`/api/dispatch/date-requests/options?date=${encodeURIComponent(date)}`).then(data=>{if(current)setOptions(data)}).catch(e=>{if(current)setError(e.message)})
  return()=>{current=false}
 },[date,reload])
 const decide=async decision=>{
  setBusy(true);setError('')
  try{const result=await apiRequest(`/api/dispatch/date-requests/${item.id}/${decision}`,{method:'POST',body:JSON.stringify({reason,targetDate:date,routeNumber:route,scope,targetRevision:options?.revision,expectedScheduleUpdatedAt:schedule?.updatedAt,sundayAuthorized:sunday})});onSaved(result,decision);window.dispatchEvent(new Event('kcs-handover-saved'))}
  catch(e){setError(e.message)}finally{setBusy(false)}
 }
 const ready=options?.dayReady&&options.routes.some(r=>r.available),chosen=options?.routes.find(r=>String(r.routeNumber)===route)
 const weekdays=(schedule?.weekdays||[]).map(day=>day===weekdayName(item.sourceDate)?weekdayName(date||item.targetDate):day)
 return <div className="date-request-review">
  <label>{t('dateReview.date')}<input type="date" min={kuchingDate()} value={date} disabled={busy} onChange={e=>setDate(e.target.value)}/></label>
  <small>{t('dateReview.sameDay')}</small>
  <label>{t('routeTrial.targetRoute')}<select value={route} disabled={busy||!options} onChange={e=>setRoute(e.target.value)}><option value="">{t('common.select')}</option>{options?.routes.map(r=><option data-i18n-raw key={r.routeNumber} value={r.routeNumber} disabled={!r.available}>{r.name}{r.plate?` · ${r.plate}`:''}{r.available?'':` · ${t('dateReview.unavailable')}`}</option>)}</select></label>
  {!ready&&<p>{options?t('routeTrial.approvalHelp'):t('dateReview.loading')}</p>}
  <div className="date-review-actions"><button type="button" disabled={busy} onClick={()=>onPlanner?.(date)}>{t('dateReview.planner')}</button><button type="button" disabled={busy} onClick={()=>setReload(x=>x+1)}>{t('dateReview.reload')}</button></div>
  <label>{t('dateReview.scope')}<select value={scope} disabled={busy} onChange={e=>setScope(e.target.value)}><option value="once">{t('dateReview.once')}</option><option value="permanent">{t('dateReview.permanent')}</option></select></label>
  <p>{t(scope==='once'?'dateReview.onceHelp':'dateReview.permanentHelp')}</p>
  {scope==='permanent'&&<><p>{t('schedule.weekdays')}: {(schedule?.weekdays||[]).map(ui).join(', ')} → {weekdays.map(ui).join(', ')}<br/>{t('schedule.effectiveDate')}: {item.sourceDate}</p>{weekdays.includes('Sunday')&&!schedule?.weekdays.includes('Sunday')&&<label><input type="checkbox" checked={sunday} disabled={busy} onChange={e=>setSunday(e.target.checked)}/>{t('dateReview.sunday')}</label>}</>}
  <label>{t('routeTrial.reviewReason')}<textarea maxLength={1000} value={reason} disabled={busy} onChange={e=>setReason(e.target.value)}/></label>
  {error&&<p role="alert">{error}</p>}
  <div className="date-review-actions"><button type="button" className="primary" disabled={busy||!date||!chosen?.available||!reason.trim()} onClick={()=>decide('approve')}>{t('dateReview.approve')}</button><button type="button" disabled={busy||!reason.trim()} onClick={()=>decide('reject')}>{t('deferApproval.reject')}</button></div>
 </div>
}
export default function DriverDateApprovals({onPlanner}){
 const{t}=useI18n(),[items,setItems]=useState([]),[error,setError]=useState(''),[open,setOpen]=useState(null),[message,setMessage]=useState('')
 const load=useCallback(async()=>{try{setItems((await apiRequest('/api/dispatch/date-requests/pending')).items||[])}catch(e){setError(e.message)}},[])
 useEffect(()=>{void load();const timer=setInterval(load,10000);return()=>clearInterval(timer)},[load])
 const saved=(result,decision)=>{setOpen(null);setError('');setMessage(t(decision==='approve'?'routeTrial.approvedHelp':'routeTrial.rejected')+(result.preservedDates?.length?` ${t('dateReview.preserved')} ${result.preservedDates.join(', ')}`:''));void load()}
 return <section className="dashboard-approvals date-request-approvals"><h3>{t('routeTrial.approvals')} ({items.length})</h3>{error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}{items.map(item=><article key={item.id}><button type="button" className="date-request-summary" aria-expanded={open===item.id} onClick={()=>setOpen(open===item.id?null:item.id)}><b data-i18n-raw>{item.branchId} — {item.branchName}</b><span data-i18n-raw>{item.employeeName} · {item.plate}</span><span>{item.sourceDate} → {item.targetDate}</span><span data-i18n-raw>{item.reason}</span><strong>{t('dateReview.open')} {open===item.id?'▴':'▾'}</strong></button>{open===item.id&&<DateRequestReview item={item} onSaved={saved} onPlanner={onPlanner}/>}</article>)}</section>
}
