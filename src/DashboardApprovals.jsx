import {useEffect,useState} from 'react'
import {apiRequest as api} from './apiClient.js'
import {useI18n} from './i18n.jsx'

export default function DashboardApprovals({enabled}){
  const{t}=useI18n(),[items,setItems]=useState([]),[busy,setBusy]=useState(null),[error,setError]=useState('')
  const load=async()=>{if(!enabled)return;try{setItems((await api('/api/dispatch/defer-requests/pending')).items||[]);setError('')}catch(item){setError(item.message)}}
  useEffect(()=>{if(!enabled)return undefined;void load();const timer=setInterval(()=>void load(),5000);return()=>clearInterval(timer)},[enabled])
  const decide=async(item,decision)=>{const reason=window.prompt(t(decision==='approve'?'deferApproval.approveReason':'deferApproval.rejectReason'));if(!reason?.trim())return;setBusy(item.id);try{await api(`/api/dispatch/defer-requests/${item.id}/${decision}`,{method:'POST',body:JSON.stringify({reason:reason.trim()})});await load()}catch(value){setError(value.message)}finally{setBusy(null)}}
  if(!enabled)return null
  return <div className="dashboard-approvals"><header><strong>{t('dashboard.employeeApprovals')}</strong><span>{items.length}</span></header>{error&&<div className="data-error" role="alert">{error}</div>}{!items.length?<p>{t('dashboard.noEmployeeApprovals')}</p>:items.map(item=><article key={item.id}><div><b>{item.driverName} · {item.registrationNumber||item.vehicleName}</b><strong>{item.branchId} — {item.customerName||item.branchName}</strong><small>{t('mobile.expectedReturnTime')}：{item.expectedReturnTime} · {String(item.reason||'other').replaceAll('_',' ')}</small></div><button disabled={busy!==null} onClick={()=>decide(item,'approve')}>{t('deferApproval.approve')}</button><button disabled={busy!==null} onClick={()=>decide(item,'reject')}>{t('deferApproval.reject')}</button></article>)}</div>
}
