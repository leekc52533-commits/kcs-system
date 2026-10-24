import {createPortal} from 'react-dom'
import GoogleMapPreview from './GoogleMapPreview.jsx'
import CustomerWorkspaceEditor from './CustomerWorkspaceEditor.jsx'
import ApprovalCustomerLink from './ApprovalCustomerLink.jsx'
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
const correctionWords={
 zh:{request:'已到店，GPS不准',pending:'已通知主管，请等待主管更正客户 GPS；保存后系统自动放行，无需重新申请。',notice:'员工反映 GPS 不准确。请核实并修改准确位置，保存成功后系统自动放行当前收货任务。',open:'知道了，前往修改',location:'员工上报位置（请核实）',missing:'未取得员工当前位置，请通过地图核实客户准确位置。'},
 en:{request:'At customer, GPS is incorrect',pending:'Supervisor notified. Collection will unlock after the corrected GPS is saved; no new request is needed.',notice:'Driver reports incorrect GPS. Verify and correct the customer location. Saving releases this collection task automatically.',open:'Understood, edit GPS',location:'Reported location (verify first)',missing:'Employee location unavailable. Verify the customer location on the map.'},
 ms:{request:'Sudah sampai, GPS tidak tepat',pending:'Penyelia telah dimaklumkan. Kutipan dibuka selepas GPS dibetulkan dan disimpan; tidak perlu mohon semula.',notice:'Pemandu melaporkan GPS tidak tepat. Semak dan betulkan lokasi pelanggan. Selepas disimpan, tugasan kutipan dibuka secara automatik.',open:'Faham, ubah GPS',location:'Lokasi dilaporkan (sila semak)',missing:'Lokasi pekerja tidak tersedia. Sila semak lokasi pelanggan pada peta.'}
}
const captureLocation=()=>new Promise(resolve=>{
 if(!navigator.geolocation)return resolve({})
 let done=false;const finish=value=>{if(done)return;done=true;clearTimeout(timer);resolve(value)},timer=setTimeout(()=>finish({}),12000)
 try{navigator.geolocation.getCurrentPosition(p=>finish({latitude:p.coords.latitude,longitude:p.coords.longitude,accuracy:p.coords.accuracy}),()=>finish({}),{enableHighAccuracy:true,maximumAge:0,timeout:10000})}catch{finish({})}
})
const locationWords={zh:{title:'确认当前位置',retry:'重新定位',send:'提交当前位置给主管',failed:'无法取得当前位置，请允许定位后重试。',hint:'请确认地图上的位置是当前客户位置，再提交给主管。',accuracy:'定位精度',waiting:'正在取得当前位置…'},en:{title:'Confirm current location',retry:'Locate again',send:'Send location to supervisor',failed:'Location unavailable. Allow location access and retry.',hint:'Confirm the marker is at the current customer before submitting.',accuracy:'Accuracy',waiting:'Getting current location…'},ms:{title:'Sahkan lokasi semasa',retry:'Dapatkan lokasi semula',send:'Hantar lokasi kepada penyelia',failed:'Lokasi tidak tersedia. Benarkan akses lokasi dan cuba lagi.',hint:'Pastikan penanda berada di pelanggan semasa sebelum menghantar.',accuracy:'Ketepatan',waiting:'Mendapatkan lokasi semasa…'}}
export function GpsReleaseRequest({stop,available,onChanged}){
 const{language}=useI18n(),w=labels[language]||labels.en,c=correctionWords[language]||correctionWords.en,l=locationWords[language]||locationWords.en
 const[busy,setBusy]=useState(false),[error,setError]=useState(''),[open,setOpen]=useState(false),[location,setLocation]=useState(null),[locating,setLocating]=useState(false)
 const locate=async()=>{setLocating(true);setLocation(null);setError('');const value=await captureLocation();if(Number.isFinite(value.latitude)&&Number.isFinite(value.longitude))setLocation({...value,obtainedAt:Date.now()});else setError(l.failed);setLocating(false)}
 const submit=async()=>{if(!location||locating||busy)return;if(Date.now()-location.obtainedAt>120000){await locate();return}setBusy(true);setError('');try{await api(`/api/mobile/stops/${stop.id}/gps-release`,{method:'POST',body:JSON.stringify({reason:'Customer GPS reported inaccurate',correctionRequired:true,latitude:location.latitude,longitude:location.longitude,accuracy:location.accuracy})});setOpen(false);await onChanged()}catch(e){setError(e.code?.startsWith('GPS_RELEASE_')?w.problem:e.message)}finally{setBusy(false)}}
 return <div>{stop.gpsRelease&&<p>{stop.gpsRelease.status==='pending'?c.pending:w[stop.gpsRelease.status]}</p>}{available&&!stop.arrivedAt&&stop.gpsRelease?.status!=='pending'&&<button type="button" disabled={busy} onClick={()=>{setOpen(true);locate()}}>{c.request}</button>}{open&&createPortal(<div className="master-modal" role="dialog" aria-modal="true" aria-label={l.title}><section className="customer-workspace-result" style={{maxHeight:'90dvh',overflowY:'auto',width:'min(95vw,640px)'}}><h2>{l.title}</h2><p>{l.hint}</p>{locating&&<p role="status">{l.waiting}</p>}{location&&<><GoogleMapPreview latitude={location.latitude} longitude={location.longitude}/><p data-i18n-raw>{location.latitude}, {location.longitude}</p><p>{l.accuracy}: ±{Math.round(location.accuracy)} m</p></>}{error&&<p role="alert">{error}</p>}<button type="button" disabled={busy||locating} onClick={locate}>{l.retry}</button><button type="button" disabled={busy||locating||!location} onClick={submit}>{l.send}</button><button type="button" disabled={busy||locating} onClick={()=>setOpen(false)}>{w.cancel}</button></section></div>,document.body)}{error&&!open&&<CenteredNotice onClose={()=>setError('')}>{error}</CenteredNotice>}</div>
}

function CorrectionReview({item,reload}){
 const{language}=useI18n(),c=correctionWords[language]||correctionWords.en,[open,setOpen]=useState(false)
 return <article><h3 data-i18n-raw>{item.branchName}</h3><p data-i18n-raw>{item.employeeName} · {item.plate} · {formatDateDisplay(item.service_date)}</p><p>{c.notice}</p><p>{item.reported_latitude!=null?`${c.location}: ${item.reported_latitude}, ${item.reported_longitude} (±${item.reported_accuracy??'—'}m)`:c.missing}</p><button type="button" onClick={()=>setOpen(true)}>{c.open}</button>{open&&<CustomerWorkspaceEditor branchId={item.branchCode} gpsReleaseRequestId={item.id} initialGps={item.reported_latitude!=null&&item.reported_longitude!=null?{latitude:item.reported_latitude,longitude:item.reported_longitude,accuracyM:item.reported_accuracy,locationSource:'employee_reported_device'}:null} focusSection="gps" onClose={()=>{setOpen(false);reload()}} onSaved={()=>{setOpen(false);reload()}}/>}</article>
}

function Review({item,reload,w}){
 const[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const decide=async decision=>{setBusy(true);setError('');try{await api(`/api/gps-releases/${item.id}/review`,{method:'POST',body:JSON.stringify({decision,reason})});await reload()}catch(e){setError(e.code?.startsWith('GPS_RELEASE_')?w.problem:e.message)}finally{setBusy(false)}}
 const expired=kuchingDate()!=='2026-10-05'
 return <article><h3><ApprovalCustomerLink branchCode={item.branchCode} disabled={busy}>{item.branchName}</ApprovalCustomerLink></h3><p data-i18n-raw>{item.employeeName} · {item.plate} · {formatDateDisplay(item.service_date)}</p><p data-i18n-raw>{item.reason}</p>{expired&&<p>{w.expired}</p>}<label>{w.review}<textarea required maxLength={1000} value={reason} disabled={busy} onChange={e=>setReason(e.target.value)}/></label><button disabled={busy||expired||!reason.trim()} onClick={()=>decide('approved')}>{w.approve}</button><button disabled={busy||!reason.trim()} onClick={()=>decide('rejected')}>{w.reject}</button>{error&&<CenteredNotice onClose={()=>setError('')}>{error}</CenteredNotice>}</article>
}
export function GpsReleaseApprovals(){
 const{language}=useI18n(),w=labels[language]||labels.en,[items,setItems]=useState([]),[error,setError]=useState('')
 const load=async()=>{try{setItems((await api('/api/gps-releases')).items);setError('')}catch(e){if(e.status!==403)setError(e.message)}}
 useEffect(()=>{load();const timer=setInterval(load,10000);return()=>clearInterval(timer)},[])
 if(!items.length&&!error)return null
 return <section className="temporary-intakes intake-review"><h2>{w.title} ({items.length})</h2>{error&&<CenteredNotice onClose={()=>setError('')}>{error}</CenteredNotice>}{items.map(item=>item.correction_required?<CorrectionReview key={item.id} item={item} reload={load}/>:<Review key={item.id} item={item} reload={load} w={w}/>)}</section>
}
