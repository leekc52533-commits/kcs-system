import {useEffect,useState} from 'react'
import {apiRequest as api} from './apiClient.js'
import {useI18n} from './i18n.jsx'
import SharedGpsInput from './SharedGpsInput.jsx'
import FormActionBar from './FormActionBar.jsx'
import './MasterDataPage.css'

const words={
 en:{title:'Company locations',help:'Buyer locations are maintained under each Buyer in Buyer Management.',empty:'No company locations.',edit:'Edit',save:'Save',cancel:'Cancel',saving:'Saving…',saved:'Location saved.',loading:'Loading…',name:'Location Name',address:'Address',phone:'Phone',contact:'Contact',hours:'Operating hours',notes:'Notes',reason:'Reason for change',start:'Available as start location',end:'Available as end location',status:'Status',active:'Active',paused:'Paused',closed:'Closed',buyers:'Open Buyer Management'},
 ms:{title:'Lokasi syarikat',help:'Lokasi pembeli diurus di bawah setiap pembeli dalam Pengurusan Buyer.',empty:'Tiada lokasi syarikat.',edit:'Edit',save:'Simpan',cancel:'Batal',saving:'Menyimpan…',saved:'Lokasi disimpan.',loading:'Memuatkan…',name:'Nama Lokasi',address:'Alamat',phone:'Telefon',contact:'Pegawai untuk dihubungi',hours:'Waktu operasi',notes:'Catatan',reason:'Sebab perubahan',start:'Boleh menjadi lokasi mula',end:'Boleh menjadi lokasi akhir',status:'Status',active:'Aktif',paused:'Dijeda',closed:'Ditutup',buyers:'Buka Pengurusan Buyer'},
 zh:{title:'公司场地',help:'买家地点在「买家管理」的各个买家里面维护。',empty:'暂无公司场地。',edit:'修改',save:'保存',cancel:'取消',saving:'保存中…',saved:'场地资料已保存。',loading:'读取中…',name:'Location Name',address:'Address',phone:'电话',contact:'联系人',hours:'营业时间',notes:'备注',reason:'修改原因',start:'可作为行程起点',end:'可作为行程终点',status:'状态',active:'启用中',paused:'暂停',closed:'关闭',buyers:'打开买家管理'}
}

export default function CompanySettingsPage(){
 const{language}=useI18n(),w=words[language]||words.en
 const[items,setItems]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[message,setMessage]=useState(''),[draft,setDraft]=useState(null),[saving,setSaving]=useState(false)
 const load=async()=>{setLoading(true);try{const data=await api('/api/operational-locations');setItems((data.items||[]).filter(item=>item.buyerInternalId==null))}catch(e){setError(e.message)}finally{setLoading(false)}}
 useEffect(()=>{void load()},[])
 const set=(key,value)=>setDraft(d=>({...d,[key]:value}))
 const save=async event=>{
  event.preventDefault();if(saving)return;setSaving(true);setError('');setMessage('')
  // Submit only editable fields. Preserve the existing ID, type and all associations.
  const payload=Object.fromEntries(['name','address','phone','contactPerson','operatingHours','notes','status','latitude','longitude','canStart','canEnd','reason'].map(key=>[key,draft[key]]))
  try{await api(`/api/operational-locations/${draft.id}`,{method:'PATCH',body:JSON.stringify(payload)});setDraft(null);setMessage(w.saved);await load()}catch(e){setError(e.message)}finally{setSaving(false)}
 }
 return <div className="page master-data-page">
  <section className="master-workspace"><header><h2>{w.title}</h2></header><p>{w.help}</p><a href="?page=buyers">{w.buyers}</a>
   {message&&<p className="planner-message" role="status">{message}</p>}{error&&!draft&&<p className="data-error" role="alert">{error}</p>}
   {loading?<p>{w.loading}</p>:!items.length&&!error?<p>{w.empty}</p>:<div className="master-record-grid">{items.map(item=><article key={item.id} className="buyer-branch-card"><h3 data-i18n-raw>{item.name}</h3><p data-i18n-raw>{item.address||'—'}</p><p>{w[item.status]||item.status}</p><button type="button" onClick={()=>{setError('');setMessage('');setDraft({...item,canStart:Boolean(item.canStart),canEnd:Boolean(item.canEnd),reason:''})}}>{w.edit}</button></article>)}</div>}
  </section>
  {draft&&<div className="master-modal"><form onSubmit={save}><header><h2>{w.edit} · <span data-i18n-raw>{draft.name}</span></h2></header><fieldset disabled={saving} style={{border:0,padding:0,minWidth:0}}><div className="editor-fields">
   {[['name','name'],['address','address'],['contactPerson','contact'],['phone','phone'],['operatingHours','hours'],['notes','notes'],['reason','reason']].map(([key,label])=><label key={key}>{w[label]}<input required={key==='name'||key==='reason'} value={draft[key]||''} onChange={e=>set(key,e.target.value)}/></label>)}
   <label>{w.status}<select value={draft.status} onChange={e=>set('status',e.target.value)}>{['active','paused','closed'].map(status=><option key={status} value={status}>{w[status]}</option>)}</select></label>
   <label><input type="checkbox" checked={draft.canStart} onChange={e=>set('canStart',e.target.checked)}/>{w.start}</label><label><input type="checkbox" checked={draft.canEnd} onChange={e=>set('canEnd',e.target.checked)}/>{w.end}</label>
  </div><SharedGpsInput resetKey={`company-location:${draft.id}`} latitude={draft.latitude} longitude={draft.longitude} address={draft.address} onChange={change=>setDraft(d=>({...d,latitude:change.latitude,longitude:change.longitude,address:change.address??d.address}))}/></fieldset>
  {error&&<p className="data-error" role="alert">{error}</p>}<FormActionBar><button type="button" disabled={saving} onClick={()=>{setDraft(null);setError('')}}>{w.cancel}</button><button className="primary" disabled={saving}>{saving?w.saving:w.save}</button></FormActionBar></form></div>}
 </div>
}
