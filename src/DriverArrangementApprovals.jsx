import {useCallback,useEffect,useState} from 'react'
import {apiRequest as api} from './apiClient.js'
import {useI18n} from './i18n.jsx'
import {kuchingDate} from '../shared/kuchingTime.js'
function Row({item,onChanged}){
 const{t}=useI18n(),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const decide=async decision=>{setBusy(true);setError('');try{await api(`/api/driver-arrangements/${item.id}/review`,{method:'POST',body:JSON.stringify({decision,reason})});await onChanged()}catch(e){setError(e.message)}finally{setBusy(false)}}
 return <article><h3>{t('arrange.'+item.kind)} · <span data-i18n-raw>{item.customerName} — {item.branchName}</span></h3><p data-i18n-raw>{item.service_date} · {item.plate} · {item.employeeName}</p>{item.kind==='order'?<p>{t(item.direction==='up'?'arrange.up':'arrange.down')} · <span data-i18n-raw>{item.otherBranchName}</span></p>:<a href={`/api/driver-arrangements/${item.id}/photo`} target="_blank" rel="noreferrer">{t('ng.viewProof')}</a>}<p data-i18n-raw>{item.reason}</p>{item.service_date!==kuchingDate()&&<p>{t('pickup.expired')}</p>}<label>{t('intake.reason')}<textarea maxLength={1000} required disabled={busy} value={reason} onChange={e=>setReason(e.target.value)}/></label><button disabled={busy||!reason.trim()||item.service_date!==kuchingDate()} onClick={()=>decide('approved')}>{t('deferApproval.approve')}</button><button disabled={busy||!reason.trim()} onClick={()=>decide('rejected')}>{t('deferApproval.reject')}</button>{error&&<p role="alert">{error}</p>}</article>
}
export default function DriverArrangementApprovals(){
 const{t}=useI18n(),[items,setItems]=useState([]),[error,setError]=useState('')
 const load=useCallback(async()=>{setItems((await api('/api/driver-arrangements')).items);setError('')},[])
 useEffect(()=>{const refresh=()=>load().catch(e=>setError(e.message));void refresh();const timer=setInterval(refresh,10000);return()=>clearInterval(timer)},[load])
 if(!error&&!items.length)return null
 return <section className="temporary-intakes intake-review"><h2>{t('arrange.title')} ({items.length})</h2>{!items.length&&<p>{t('intake.empty')}</p>}{error&&<p role="alert">{error}</p>}{items.map(item=><Row key={item.id} item={item} onChanged={load}/>)}</section>
}
