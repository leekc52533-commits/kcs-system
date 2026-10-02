import {useEffect,useState} from 'react'
import {useI18n} from './i18n.jsx'
import {apiRequest as api} from './apiClient.js'
import {formatDateDisplay} from './dateDisplay.js'
import CenteredNotice from './CenteredNotice.jsx'
import {kuchingDate} from '../shared/kuchingTime.js'
const labels={
 en:{title:'GPS exception approval',request:'Request GPS exception',reason:'Reason for GPS failure',send:'Submit',cancel:'Cancel',pending:'Waiting for supervisor',approved:'Released by supervisor (GPS exception)',rejected:'Rejected',approve:'Approve release',reject:'Reject',review:'Review reason',expired:'Trial ended; approval unavailable',problem:'Request cannot be processed. Refresh and check the current customer, assignment and trial date.'},
 ms:{title:'Kelulusan pengecualian GPS',request:'Mohon pengecualian GPS',reason:'Sebab masalah GPS',send:'Hantar',cancel:'Batal',pending:'Menunggu penyelia',approved:'Dibenarkan oleh penyelia (pengecualian GPS)',rejected:'Ditolak',approve:'Luluskan',reject:'Tolak',review:'Sebab keputusan',expired:'Percubaan tamat; kelulusan tidak tersedia',problem:'Permohonan tidak dapat diproses. Muat semula dan semak pelanggan semasa, tugasan serta tarikh percubaan.'},
 zh:{title:'GPS 异常放行审批',request:'申请 GPS 异常放行',reason:'定位异常原因',send:'提交',cancel:'取消',pending:'等待主管批准',approved:'主管已放行（GPS 异常）',rejected:'已拒绝',approve:'批准放行',reject:'拒绝',review:'审批原因',expired:'试跑已结束，不能批准放行',problem:'无法处理申请，请刷新并检查当前客户、人员安排及试跑日期。'}
}
export function GpsReleaseRequest({stop,available,onChanged}){
 const{language}=useI18n(),w=labels[language]||labels.en
 const[open,setOpen]=useState(false),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const submit=async e=>{e.preventDefault();setBusy(true);setError('');try{await api(`/api/mobile/stops/${stop.id}/gps-release`,{method:'POST',body:JSON.stringify({reason})});setOpen(false);setReason('');await onChanged()}catch(e){setError(e.code?.startsWith('GPS_RELEASE_')?w.problem:e.message)}finally{setBusy(false)}}
 return <div>{stop.gpsRelease&&<p>{w[stop.gpsRelease.status]} <span data-i18n-raw>{stop.gpsRelease.reviewReason}</span></p>}{available&&!stop.arrivedAt&&stop.gpsRelease?.status!=='pending'&&<button disabled={busy} onClick={()=>setOpen(!open)}>{w.request}</button>}{open&&<form onSubmit={submit}><label>{w.reason}<textarea required maxLength={1000} value={reason} disabled={busy} onChange={e=>setReason(e.target.value)}/></label><button disabled={busy||!reason.trim()}>{w.send}</button><button type="button" disabled={busy} onClick={()=>setOpen(false)}>{w.cancel}</button></form>}{error&&<CenteredNotice onClose={()=>setError('')}>{error}</CenteredNotice>}</div>
}
function Review({item,reload,w}){
 const[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const decide=async decision=>{setBusy(true);setError('');try{await api(`/api/gps-releases/${item.id}/review`,{method:'POST',body:JSON.stringify({decision,reason})});await reload()}catch(e){setError(e.code?.startsWith('GPS_RELEASE_')?w.problem:e.message)}finally{setBusy(false)}}
 const expired=kuchingDate()!=='2026-10-05'
 return <article><h3 data-i18n-raw>{item.branchName}</h3><p data-i18n-raw>{item.employeeName} · {item.plate} · {formatDateDisplay(item.service_date)}</p><p data-i18n-raw>{item.reason}</p>{expired&&<p>{w.expired}</p>}<label>{w.review}<textarea required maxLength={1000} value={reason} disabled={busy} onChange={e=>setReason(e.target.value)}/></label><button disabled={busy||expired||!reason.trim()} onClick={()=>decide('approved')}>{w.approve}</button><button disabled={busy||!reason.trim()} onClick={()=>decide('rejected')}>{w.reject}</button>{error&&<CenteredNotice onClose={()=>setError('')}>{error}</CenteredNotice>}</article>
}
export function GpsReleaseApprovals(){
 const{language}=useI18n(),w=labels[language]||labels.en,[items,setItems]=useState([]),[error,setError]=useState('')
 const load=async()=>{try{setItems((await api('/api/gps-releases')).items);setError('')}catch(e){if(e.status!==403)setError(e.message)}}
 useEffect(()=>{load();const timer=setInterval(load,10000);return()=>clearInterval(timer)},[])
 if(!items.length&&!error)return null
 return <section className="temporary-intakes intake-review"><h2>{w.title} ({items.length})</h2>{error&&<CenteredNotice onClose={()=>setError('')}>{error}</CenteredNotice>}{items.map(item=><Review key={item.id} item={item} reload={load} w={w}/>)}</section>
}
