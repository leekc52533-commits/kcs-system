import {useCallback,useEffect,useState} from 'react'
import {useI18n} from './i18n.jsx'
import {apiRequest} from './apiClient.js'
export default function DriverDateApprovals(){
 const{t}=useI18n(),[items,setItems]=useState([]),[error,setError]=useState(''),[busy,setBusy]=useState(false),[routes,setRoutes]=useState({}),[message,setMessage]=useState('')
 const load=useCallback(async()=>{try{setItems((await apiRequest('/api/dispatch/date-requests/pending')).items||[]);setError('')}catch(e){setError(e.message)}},[])
 useEffect(()=>{void load();const timer=setInterval(load,10000);return()=>clearInterval(timer)},[load])
 const decide=async(item,decision)=>{
  const reason=window.prompt(t('routeTrial.reviewReason'));if(!reason?.trim())return
  setBusy(true);setError('');setMessage('')
  try{await apiRequest(`/api/dispatch/date-requests/${item.id}/${decision}`,{method:'POST',body:JSON.stringify({reason,routeNumber:routes[item.id]})});setMessage(t(decision==='approve'?'routeTrial.approvedHelp':'routeTrial.rejected'));await load();window.dispatchEvent(new Event('kcs-handover-saved'))}catch(e){setError(e.message)}finally{setBusy(false)}
 }
 return <section className="dashboard-approvals"><h3>{t('routeTrial.approvals')} ({items.length})</h3>{error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}{items.map(item=><article key={item.id}><div><b data-i18n-raw>{item.branchId} — {item.branchName}</b><p data-i18n-raw>{item.employeeName} · {item.plate}</p><p>{item.sourceDate} → {item.targetDate}</p><p data-i18n-raw>{item.reason}</p><label>{t('routeTrial.targetRoute')}<select value={routes[item.id]||''} onChange={e=>setRoutes({...routes,[item.id]:e.target.value})}><option value="">{t('common.select')}</option>{item.routes.map(r=><option key={r.routeNumber} value={r.routeNumber} data-i18n-raw>{r.name}</option>)}</select></label><small>{t('routeTrial.approvalHelp')}</small></div><button disabled={busy||!routes[item.id]} onClick={()=>decide(item,'approve')}>{t('deferApproval.approve')}</button><button disabled={busy} onClick={()=>decide(item,'reject')}>{t('deferApproval.reject')}</button></article>)}</section>
}
