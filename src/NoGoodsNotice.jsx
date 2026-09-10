import {useState} from 'react'
import {useI18n} from './i18n.jsx'
import {apiRequest} from './apiClient.js'
import ProofPhotoPicker from './ProofPhotoPicker.jsx'
import {proofData} from './paymentProofImage.js'
import './NoGoodsNotice.css'

export function NoGoodsButton({stop,onSaved,disabled=false}){
 const{t}=useI18n(),[open,setOpen]=useState(false),[method,setMethod]=useState('phone'),[reason,setReason]=useState(''),[photo,setPhoto]=useState(null),[busy,setBusy]=useState(false),[processing,setProcessing]=useState(false),[error,setError]=useState('')
 if(!stop.canReportNoGoods)return null
 const submit=async e=>{e.preventDefault();if(busy||processing||!photo||!reason.trim())return;setBusy(true);setError('');try{await apiRequest(`/api/mobile/stops/${stop.id}/no-goods-notice`,{method:'POST',body:JSON.stringify({contactMethod:method,reason,photo:await proofData(photo)})});await onSaved();setOpen(false)}catch(e){setError(e.message)}finally{setBusy(false)}}
 return <div className="no-goods-action"><button type="button" disabled={disabled||busy||processing} onClick={()=>setOpen(!open)}>{t(open?'common.cancel':'ng.title')}</button>{open&&<form onSubmit={submit}><p>{t('ng.help')}</p><label>{t('ng.method')}<select value={method} disabled={busy} onChange={e=>setMethod(e.target.value)}>{['phone','whatsapp','sms','onsite'].map(x=><option key={x} value={x}>{t('ng.'+x)}</option>)}</select></label><label>{t('ng.reason')}<textarea required maxLength={1000} value={reason} disabled={busy} onChange={e=>setReason(e.target.value)}/></label><b>{t('ng.proof')}</b><ProofPhotoPicker value={photo} onChange={setPhoto} onBusyChange={setProcessing} disabled={busy}/>{error&&<p role="alert">{error}</p>}<button type="submit" disabled={busy||processing||!photo||!reason.trim()}>{t(busy?'common.processing':'ng.submit')}</button></form>}</div>
}
export function NoGoodsRecord({stop,canRestore=false,onSaved}){
 const{t}=useI18n(),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),n=stop.noGoodsNotice
 const restore=async()=>{setBusy(true);setError('');try{await apiRequest(`/api/no-goods-notices/${n.id}/restore`,{method:'POST',body:JSON.stringify({reason})});await onSaved?.()}catch(e){setError(e.message)}finally{setBusy(false)}}
 return <div className="no-goods-record"><b data-i18n-raw>{stop.customerName} — {stop.branchName}</b><p>{t(stop.arrivedAt?'ng.visited':'ng.advance')}</p>{n&&<><p>{t('ng.'+n.contactMethod)} · <span data-i18n-raw>{n.employeeName}</span> · {new Date(n.createdAt).toLocaleString('en-GB',{timeZone:'Asia/Kuching'})}</p><p data-i18n-raw>{n.reason}</p><a href={`/api/no-goods-notices/${n.id}/photo`} target="_blank" rel="noreferrer">{t('ng.viewProof')}</a>{canRestore&&<div><label>{t('ng.restoreReason')}<input maxLength={1000} value={reason} onChange={e=>setReason(e.target.value)}/></label><button type="button" disabled={busy||!reason.trim()} onClick={restore}>{t(busy?'common.processing':'ng.restore')}</button></div>}</>}{error&&<p role="alert">{error}</p>}</div>
}
