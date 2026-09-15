import {useState} from 'react'
import {useI18n} from './i18n.jsx'
import {areaCreateWords} from '../shared/areaCreateWords.js'
export default function CreateArea({groups,save,pageError,onSaved}){
 const {language}=useI18n(),w=areaCreateWords[language]||areaCreateWords.en
 const [open,setOpen]=useState(false),[name,setName]=useState(''),[zone,setZone]=useState(''),[busy,setBusy]=useState(false),[failed,setFailed]=useState(false)
 const submit=async e=>{e.preventDefault();if(busy)return;setBusy(true);setFailed(false);try{if(await save('/api/areas','POST',{name,zoneGroupId:Number(zone),successMessage:w.saved})){setOpen(false);setName('');setZone('');onSaved()}else setFailed(true)}finally{setBusy(false)}}
 return <><button type="button" onClick={()=>{setFailed(false);setOpen(true)}}>＋ {w.title}</button>{open&&<div className="zone-rename-backdrop" onClick={e=>{if(e.target===e.currentTarget&&!busy)setOpen(false)}}><section className="zone-rename-modal" role="dialog" aria-modal="true" aria-label={w.title}><form onSubmit={submit}><header><h3>{w.title}</h3><button type="button" disabled={busy} onClick={()=>setOpen(false)}>{w.close}</button></header><label>{w.name}<input autoFocus required maxLength={120} value={name} disabled={busy} onChange={e=>setName(e.target.value)}/></label><label>{w.number}<input readOnly value={w.auto}/></label><label>{w.zone}<select required disabled={busy} value={zone} onChange={e=>setZone(e.target.value)}><option value="">—</option>{groups.filter(g=>g.isActive).map(g=><option data-i18n-raw key={g.id} value={g.id}>{g.name}</option>)}</select></label>{failed&&<p role="alert">{w[pageError?.replace('areaCreate.','')]||w.failed}</p>}<button className="primary" disabled={busy||!name.trim()||!zone}>{w.save}</button></form></section></div>}</>
}
