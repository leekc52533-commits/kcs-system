import {useEffect,useState} from 'react'
import {apiRequest} from './apiClient.js'
import {useI18n} from './i18n.jsx'
const words={
 zh:{edit:'修改分店区域',area:'区域',reason:'修改原因',save:'保存',cancel:'取消',loading:'加载中…',failed:'未能保存，请关闭后重新打开，检查最新资料再试。'},
 en:{edit:'Change branch area',area:'Area',reason:'Reason for change',save:'Save',cancel:'Cancel',loading:'Loading…',failed:'Could not save. Close and reopen to check the latest data before retrying.'},
 ms:{edit:'Ubah kawasan cawangan',area:'Kawasan',reason:'Sebab perubahan',save:'Simpan',cancel:'Batal',loading:'Memuatkan…',failed:'Gagal menyimpan. Tutup dan buka semula untuk menyemak data terkini sebelum mencuba lagi.'}
}
export default function BranchAreaEntry({item,save}){
 const{language}=useI18n(),w=words[language]||words.en
 const[open,setOpen]=useState(false),[data,setData]=useState(null),[area,setArea]=useState(''),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('')
 useEffect(()=>{if(!open)return;let alive=true;setData(null);setError('');setReason('');apiRequest('/api/customer-workspace?'+new URLSearchParams({branchId:item.branchId})).then(d=>{if(alive){setData(d);setArea(String(d.branch.areaId||''))}}).catch(e=>alive&&setError(e.message));return()=>{alive=false}},[open,item.branchId])
 const submit=async e=>{e.preventDefault();const target=data?.areas.find(a=>String(a.areaId)===area);if(!target||busy||!reason.trim())return;setBusy(true);setError('');try{const ok=await save({branchId:data.branch.branchId,revision:data.revision,areaId:target.areaId,zoneId:target.zoneId,reason:reason.trim()});if(ok)setOpen(false);else setError(w.failed)}catch{setError(w.failed)}finally{setBusy(false)}}
 if(!open)return <button type="button" className="branch-area-entry" title={w.edit} onClick={()=>setOpen(true)}><span data-i18n-raw>{item.areaName||'—'}</span> ✎</button>
 return <form className="branch-area-editor" onSubmit={submit}><strong>{w.edit}</strong><span data-i18n-raw>{item.branchName} · {item.branchId}</span>{!data&&!error&&<p>{w.loading}</p>}{data&&<><label>{w.area}<select autoFocus required value={area} disabled={busy} onChange={e=>setArea(e.target.value)}><option value="">—</option>{data.areas.map(a=><option key={a.id} value={a.areaId} data-i18n-raw>{a.name}{a.zone?` · ${a.zone}`:''}</option>)}</select></label><label>{w.reason}<input required value={reason} disabled={busy} onChange={e=>setReason(e.target.value)}/></label></>}{error&&<p role="alert">{error}</p>}<div><button type="button" disabled={busy} onClick={()=>setOpen(false)}>{w.cancel}</button><button type="submit" disabled={busy||!data||!area||area===String(data.branch.areaId||'')||!reason.trim()}>{w.save}</button></div></form>
}
