import DateRequestPlanner from './DateRequestPlanner.jsx'
import CustomerWorkspaceEditor from './CustomerWorkspaceEditor.jsx'
import {dateSystemWords} from './dateSystemReviewWords.js'
import {systemReviewReasons,dualReviewReasons,systemReviewSection} from '../shared/dateSystemReview.js'
import {DateEvidenceReview,evidenceWords} from './DateRequestEvidence.jsx'
import {useCallback,useEffect,useState} from 'react'
import {useI18n,useUi} from './i18n.jsx'
import {apiRequest} from './apiClient.js'
import {kuchingDate} from '../shared/kuchingTime.js'
import {weekdayName} from '../shared/scheduleRecurrence.js'
import './DriverDateApprovals.css'

export function DateRequestReview({item,onSaved,onPlanner,submitUrl}){
 const{t,language}=useI18n(),ui=useUi(),ew=evidenceWords[language]||evidenceWords.en
 const sw=dateSystemWords[language]||dateSystemWords.en,code=item.evidence?.reasonCode,dual=dualReviewReasons.includes(code),pendingSystem=item.systemReview?.status==='pending'?item.systemReview:null
 const [systemPrompt,setSystemPrompt]=useState(false),[editingSystem,setEditingSystem]=useState(false),[plannerOpen,setPlannerOpen]=useState(false),[plannerBeforeRevision,setPlannerBeforeRevision]=useState(null)
 const[date,setDate]=useState(pendingSystem?.proposal.targetDate||item.targetDate),[route,setRoute]=useState(String(pendingSystem?.proposal.routeNumber||'')),[scope,setScope]=useState(pendingSystem?.proposal.scope||'once'),[reason,setReason]=useState(''),[sunday,setSunday]=useState(Boolean(pendingSystem?.proposal.sundayAuthorized)),[checked,setChecked]=useState(false)
 const[schedule]=useState(item.schedule),[options,setOptions]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[reload,setReload]=useState(0)
 useEffect(()=>{let current=true;setOptions(null);setRoute(String(pendingSystem?.proposal.routeNumber||''));setError('')
  if(date)apiRequest(`/api/dispatch/date-requests/options?date=${encodeURIComponent(date)}`).then(data=>{if(current)setOptions(data)}).catch(e=>{if(current)setError(e.message)})
  return()=>{current=false}
 },[date,reload])
 const decide=async (decision,systemChange,workspaceDraft)=>{
  setBusy(true);setError('')
  try{const result=await apiRequest(submitUrl||`/api/dispatch/date-requests/${item.id}/${decision}`,{method:'POST',body:JSON.stringify({proposalToken:pendingSystem?.proposalToken,systemChange,workspaceDraft,plannerBeforeRevision,reason,targetDate:date,routeNumber:route,scope,targetRevision:options?.revision,evidenceChecked:checked,expectedScheduleUpdatedAt:schedule?.updatedAt,sundayAuthorized:sunday})});onSaved(result,decision);window.dispatchEvent(new Event('kcs-handover-saved'))}
  catch(e){setError(e.code==='SYSTEM_REVIEW_DIFFERENT'?sw.different:e.code==='SYSTEM_REVIEW_STALE'?sw.stale:e.code==='SYSTEM_REVIEW_SUPERVISOR'?sw.supervisor:e.message);throw e}finally{setBusy(false)}
 }
 const ready=options?.routes.some(r=>r.available),chosen=options?.routes.find(r=>String(r.routeNumber)===route)
 const weekdays=(schedule?.weekdays||[]).map(day=>day===weekdayName(item.sourceDate)?weekdayName(date||item.targetDate):day)
 return <div className="date-request-review">
  {dual&&<p>{sw.dual}</p>}
  {pendingSystem&&<section><h4>{sw.waiting}</h4><p>{sw.first}: <span data-i18n-raw>{pendingSystem.firstName} · {pendingSystem.firstAt}</span></p><h4>{sw.proposal}</h4>{pendingSystem.proposal.workspaceDraft?<><p>{t('list.lifecycleStatus')}: {t('branchLifecycle.status.'+pendingSystem.proposal.workspaceDraft.branch.lifecycleStatus)}</p><p data-i18n-raw>{item.branchName} · {pendingSystem.proposal.workspaceDraft.reason}</p></>:<p>{sw.unchanged}</p>}<p>{pendingSystem.proposal.targetDate} · {t('routeTrial.targetRoute')}: {pendingSystem.proposal.routeNumber}</p></section>}
  {systemPrompt&&<div className="master-modal"><section className="customer-workspace-result"><h3>{sw.question}</h3>{dual&&<p>{sw.dual}</p>}<button disabled={busy} onClick={()=>{setSystemPrompt(false);if(code==='full'){setPlannerOpen(true);return}setEditingSystem(true)}}>{sw.yes}</button><button disabled={busy} onClick={()=>void decide('approve','none').then(()=>setSystemPrompt(false)).catch(()=>{})}>{sw.no}</button><button disabled={busy} onClick={()=>setSystemPrompt(false)}>{sw.cancel}</button>{error&&<p role="alert">{error}</p>}</section></div>}
  {plannerOpen&&<DateRequestPlanner date={item.sourceDate} onClose={()=>setPlannerOpen(false)} onSaved={revision=>{setPlannerBeforeRevision(revision);setPlannerOpen(false);setReload(x=>x+1)}}/>}
  {editingSystem&&<CustomerWorkspaceEditor branchId={item.branchId} statusOnly={dual} focusSection={systemReviewSection(code)} draftLabel={sw.draft} onClose={()=>setEditingSystem(false)} onSubmitDraft={draft=>decide('approve','workspace',draft)}/>}

  {!submitUrl&&<><DateEvidenceReview item={item}/><label><input type="checkbox" checked={checked} disabled={busy} onChange={e=>setChecked(e.target.checked)}/>{ew.verified}</label></>}
  <fieldset disabled={Boolean(pendingSystem)} style={{border:0,padding:0}}><label>{t('dateReview.date')}<input type="date" min={kuchingDate()} value={date} disabled={busy} onChange={e=>setDate(e.target.value)}/></label>
  <small>{t('dateReview.sameDay')}</small><small>{t('dateReview.reuseHelp')}</small>
  <label>{t('routeTrial.targetRoute')}<select value={route} disabled={busy||!options} onChange={e=>setRoute(e.target.value)}><option value="">{t('common.select')}</option>{options?.routes.map(r=><option data-i18n-raw key={r.routeNumber} value={r.routeNumber} disabled={!r.available}>{r.name}{r.plate?` · ${r.plate}`:''}{r.vehicleReady===false?` · ${t('dateReview.waitVehicle')}`:''}</option>)}</select></label>
  <p>{t('dateReview.autoPlan')}</p>{!ready&&<p>{options?t('routeTrial.chooseRoute'):t('dateReview.loading')}</p>}
  <div className="date-review-actions">{onPlanner&&<button type="button" disabled={busy} onClick={()=>onPlanner(date)}>{t('dateReview.planner')}</button>}<button type="button" disabled={busy} onClick={()=>setReload(x=>x+1)}>{t('dateReview.reload')}</button></div>
  {(!systemReviewReasons.includes(code)||submitUrl)&&<><label>{t('dateReview.scope')}<select value={scope} disabled={busy} onChange={e=>setScope(e.target.value)}><option value="once">{t('dateReview.once')}</option><option value="permanent">{t('dateReview.permanent')}</option></select></label>
  <p>{t(scope==='once'?'dateReview.onceHelp':'dateReview.permanentHelp')}</p>
  {scope==='permanent'&&<><p>{t('schedule.weekdays')}: {(schedule?.weekdays||[]).map(ui).join(', ')} → {weekdays.map(ui).join(', ')}<br/>{t('schedule.effectiveDate')}: {item.sourceDate}</p>{weekdays.includes('Sunday')&&!schedule?.weekdays.includes('Sunday')&&<label><input type="checkbox" checked={sunday} disabled={busy} onChange={e=>setSunday(e.target.checked)}/>{t('dateReview.sunday')}</label>}</>}
  </>} </fieldset><label>{t('routeTrial.reviewReason')}<textarea maxLength={1000} value={reason} disabled={busy} onChange={e=>setReason(e.target.value)}/></label>
  {error&&<p role="alert">{error}</p>}
  <div className="date-review-actions"><button type="button" className="primary" disabled={busy||(!submitUrl&&!checked)||!date||(!pendingSystem&&!chosen?.available)||!reason.trim()} onClick={()=>{if(!submitUrl&&systemReviewReasons.includes(code)&&!pendingSystem&&plannerBeforeRevision==null)setSystemPrompt(true);else void decide('approve',plannerBeforeRevision!=null?'planner':undefined).catch(()=>{})}}>{pendingSystem?sw.approve:t('dateReview.approve')}</button>{!submitUrl&&<button type="button" disabled={busy||!reason.trim()} onClick={()=>void decide('reject').catch(()=>{})}>{ew.reject}</button>}</div>
 </div>
}
export default function DriverDateApprovals({onPlanner}){
 const{t,language}=useI18n(),[items,setItems]=useState([]),[error,setError]=useState(''),[open,setOpen]=useState(null),[message,setMessage]=useState('')
 const load=useCallback(async()=>{try{setItems((await apiRequest('/api/dispatch/date-requests/pending')).items||[]);setError('')}catch(e){setError(e.message)}},[])
 useEffect(()=>{void load();const timer=setInterval(load,10000);return()=>clearInterval(timer)},[load])
 const saved=(result,decision)=>{setOpen(null);setError('');setMessage(result.awaitingSecond?(dateSystemWords[language]||dateSystemWords.en).waiting:t(decision==='approve'?'routeTrial.approvedHelp':'routeTrial.rejected')+(result.preservedDates?.length?` ${t('dateReview.preserved')} ${result.preservedDates.join(', ')}`:''));void load()}
 if(!error&&!items.length)return null
 return <section className="dashboard-approvals date-request-approvals"><h3>{t('routeTrial.approvals')} ({items.length})</h3>{error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}{items.map(item=><article key={item.id}><button type="button" className="date-request-summary" aria-expanded={open===item.id} onClick={()=>setOpen(open===item.id?null:item.id)}><b data-i18n-raw>{item.branchId} — {item.branchName}</b><span data-i18n-raw>{item.employeeName} · {item.plate}</span><span>{item.sourceDate} → {item.targetDate}</span><span data-i18n-raw>{item.reason}</span><strong>{t('dateReview.open')} {open===item.id?'▴':'▾'}</strong></button>{open===item.id&&<DateRequestReview key={item.systemReview?.proposalToken||item.id} item={item} onSaved={saved} onPlanner={onPlanner}/>}</article>)}</section>
}
