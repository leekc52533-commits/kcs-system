import {useCallback,useEffect,useState} from 'react'
import {apiRequest as api} from './apiClient.js'
import {useI18n} from './i18n.jsx'
import {kuchingDate} from '../shared/kuchingTime.js'
function TransferRow({item,onChanged}){
 const{t}=useI18n(),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const decide=async decision=>{setBusy(true);setError('');try{await api(`/api/customer-transfers/${item.id}/review`,{method:'POST',body:JSON.stringify({decision,reason})});await onChanged()}catch(e){setError(e.message)}finally{setBusy(false)}}
 return <article><h3 data-i18n-raw>{item.companyName} · {item.name}</h3><p data-i18n-raw>{item.branchCode} · {item.service_date}</p><p data-i18n-raw>{item.sourcePlate||'—'} → {item.targetPlate}</p><p>{t('pickup.requester')}: <span data-i18n-raw>{item.requesterName}</span></p><p>{item.reason}</p>{item.service_date!==kuchingDate()&&<p>{t('pickup.expired')}</p>}<label>{t('intake.reason')}<textarea required maxLength={1000} value={reason} disabled={busy} onChange={e=>setReason(e.target.value)}/></label><button type="button" disabled={busy||!reason.trim()||item.service_date!==kuchingDate()} onClick={()=>decide('approved')}>{t('pickup.approve')}</button><button type="button" disabled={busy||!reason.trim()} onClick={()=>decide('rejected')}>{t('pickup.reject')}</button>{error&&<p role="alert">{error}</p>}</article>
}
export default function CustomerTransferReviews(){
 const{t}=useI18n(),[items,setItems]=useState([]),[error,setError]=useState('')
 const load=useCallback(async()=>{setItems((await api('/api/customer-transfers')).items);setError('')},[])
 useEffect(()=>{const refresh=()=>load().catch(e=>setError(e.message));void refresh();const timer=setInterval(refresh,10000);return()=>clearInterval(timer)},[load])
 return <section className="temporary-intakes intake-review"><h2>{t('pickup.reviewTitle')} ({items.length})</h2><p>{t('pickup.reviewHelp')}</p>{error&&<p role="alert">{error}</p>}{!items.length&&<p>{t('intake.empty')}</p>}{items.map(item=><TransferRow key={item.id} item={item} onChanged={load}/>)}</section>
}
