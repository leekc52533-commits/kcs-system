import {useEffect,useState} from 'react'
import {useI18n} from './i18n.jsx'
import ProofPhotoPicker from './ProofPhotoPicker.jsx'
import {dateEvidenceMode,evidenceProblem} from '../shared/dateRequestEvidence.js'
import {collectHighAccuracyPosition} from './highAccuracyGps.js'
import {apiRequest} from './apiClient.js'
export const evidenceWords={
 en:{title:'Supporting evidence',details:'Explanation',contact:'Contact person',contactAt:'Contact time',method:'How were you notified?',message:'Message / screenshot',phone:'Phone call',onsite:'In person',record:'Original purchase bill number',photo:'Attach a photo or screenshot',capture:'Take a new on-site photo with location',gps:'Location is required. Enable location and retake the photo.',required:'Complete the required evidence before submitting.',operations:'Explain the delay or staffing shortage. The supervisor will check the trip and assignment.',legacy:'No evidence attached to this earlier request.',view:'View proof',verified:'I have checked the evidence and verified the reason',position:'Photo time / location',summary:'Trip / staffing snapshot',driver:'Driver ID',crew:'Crew ID',vehicle:'Vehicle ID',completed:'Completed / total stops',time:'Departure time',recordDate:'Bill issued',reject:'Reject / request more evidence'},
 ms:{title:'Bukti',details:'Penjelasan',contact:'Nama orang dihubungi',contactAt:'Masa dihubungi',method:'Cara diberitahu',message:'Mesej / tangkap layar',phone:'Telefon',onsite:'Bersemuka',record:'Nombor bil kutipan asal',photo:'Lampirkan gambar / tangkap layar',capture:'Ambil gambar di tempat dengan lokasi',gps:'Lokasi diperlukan. Hidupkan lokasi dan ambil gambar semula.',required:'Lengkapkan bukti sebelum hantar.',operations:'Nyatakan sebab tak sempat atau kurang pekerja. Penyelia akan semak jadual dan petugas.',legacy:'Permintaan lama ini tiada bukti dilampirkan.',view:'Lihat bukti',verified:'Saya sudah semak bukti dan sahkan sebab',position:'Masa gambar / lokasi',summary:'Rekod perjalanan / petugas',driver:'ID pemandu',crew:'ID kelindan',vehicle:'ID lori',completed:'Selesai / jumlah kedai',time:'Masa bertolak',recordDate:'Tarikh bil',reject:'Tolak / minta bukti tambahan'},
 zh:{title:'申请证明',details:'具体说明',contact:'客户联系人',contactAt:'通知时间',method:'通知方式',message:'聊天信息／截图',phone:'电话',onsite:'当面通知',record:'原收货单号',photo:'请附照片或截图',capture:'请现场拍照并记录定位',gps:'需要定位，请开启定位后重新拍照。',required:'请补齐对应证明后提交。',operations:'请说明时间或人手不足的具体情况，主管会核对行程和人员安排。',legacy:'这笔旧申请没有附加证明。',view:'查看证明',verified:'我已核对证明并确认申请原因',position:'拍摄时间／定位',summary:'提交时行程／人员记录',driver:'司机编号',crew:'跟车员编号',vehicle:'车辆编号',completed:'已完成／总站数',time:'出发时间',recordDate:'开单时间',reject:'拒绝／要求补充证明'}
}
export default function DateRequestEvidence({code,value,onChange,busy,onBusyChange}){
 const{language}=useI18n(),w=evidenceWords[language]||evidenceWords.en,mode=dateEvidenceMode(code),[error,setError]=useState(''),[locating,setLocating]=useState(false),[processing,setProcessing]=useState(false)
 useEffect(()=>{onBusyChange(processing||locating);return()=>onBusyChange(false)},[processing,locating,onBusyChange])
 const change=(k,v)=>onChange({...value,[k]:v})
 const photoRequired=mode==='onsite'||mode==='photo'||mode==='contact'&&value.contactMethod==='message'
 const photo=async p=>{
  setError('');onChange({...value,photo:p,position:null,capturedAt:p?.capturedAt,captureSource:p?.captureSource})
  if(!p||mode!=='onsite')return
  if(!['camera','system_camera'].includes(p.captureSource)){setError(w.capture);return}
  setLocating(true)
  try{const reading=await collectHighAccuracyPosition(navigator.geolocation),position={...reading,latitude:Number(reading.latitude),longitude:Number(reading.longitude)};onChange({...value,photo:p,position,capturedAt:p.capturedAt,captureSource:p.captureSource})}catch{setError(w.gps)}finally{setLocating(false)}
 }
 if(!mode)return null
 return <section className="date-evidence"><b>{w.title}</b>
 {mode==='contact'&&<><label>{w.method}<select disabled={busy} value={value.contactMethod||''} onChange={e=>change('contactMethod',e.target.value)}><option value="">—</option>{['message','phone','onsite'].map(m=><option key={m} value={m}>{w[m]}</option>)}</select></label><label>{w.contact}<input maxLength={200} disabled={busy} value={value.contactName||''} onChange={e=>change('contactName',e.target.value)}/></label><label>{w.contactAt}<input type="datetime-local" disabled={busy} value={value.contactAt||''} onChange={e=>change('contactAt',e.target.value)}/></label></>}
 {mode==='record'&&<label>{w.record}<input disabled={busy} value={value.billNumber||''} onChange={e=>change('billNumber',e.target.value)}/></label>}
 {mode==='operations'&&<p>{w.operations}</p>}
 {photoRequired&&<><p>{mode==='onsite'?w.capture:w.photo}</p><ProofPhotoPicker value={value.photo||null} onChange={photo} onBusyChange={setProcessing} disabled={busy||locating}/></>}
 {value.position&&<small data-i18n-raw>{value.capturedAt} · {value.position.latitude}, {value.position.longitude} ±{value.position.accuracyM}m</small>}
 {error&&<p role="alert">{error}</p>}{evidenceProblem(code,value)&&<small>{w.required}</small>}
 </section>
}
export function DateEvidenceReview({item}){
 const{language}=useI18n(),w=evidenceWords[language]||evidenceWords.en,[e,setEvidence]=useState(item.evidence),[error,setError]=useState('')
 useEffect(()=>{let alive=true;if(item.evidence===undefined)apiRequest(`/api/dispatch/date-requests/${item.id}/evidence`).then(r=>{if(alive)setEvidence(r.evidence)}).catch(err=>{if(alive)setError(err.message)});return()=>{alive=false}},[item.id,item.evidence])
 return <section className="date-evidence"><b>{w.title}</b>{error?<p role="alert">{error}</p>:e===undefined?<p>…</p>:!e?<p>{w.legacy}</p>:<>
 <p data-i18n-raw>{e.details}</p>{e.contactName&&<p>{w.contact}: <span data-i18n-raw>{e.contactName}</span> · {w[e.contactMethod]} · {e.contactAt}</p>}
 {e.bill&&<p>{w.record}: <span data-i18n-raw>{e.bill.number}</span> · {w.recordDate}: {e.bill.issuedAt}</p>}
 {e.position&&<p>{w.position}: <span data-i18n-raw>{e.capturedAt} · {e.position.latitude}, {e.position.longitude} ±{e.position.accuracyM}m</span></p>}
 {e.operations&&<p>{w.summary}: {w.driver} {e.operations.driverName||e.operations.driver_id||'—'} · {w.crew} {e.operations.crewName||e.operations.assistant_id||'—'} · {w.vehicle} {e.operations.plate||e.operations.vehicle_id}<br/>{w.completed}: {e.operations.completedStops}/{e.operations.totalStops} · {w.time}: {e.operations.started_at||'—'}</p>}
 {e.photoUrl&&<a href={e.photoUrl} target="_blank" rel="noreferrer">{w.view}<img src={e.photoUrl} alt={w.title} style={{display:'block',maxWidth:'100%',maxHeight:320}}/></a>}
 </>}</section>
}
