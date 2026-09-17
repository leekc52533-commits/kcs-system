import {useState} from 'react'
import {useI18n} from './i18n.jsx'
const words={zh:{edit:'修改名称',name:'小区名称',reason:'修改原因',save:'保存',cancel:'取消',failed:'保存失败，请检查名称是否重复，或重新打开明细后再试。'},en:{edit:'Rename area',name:'Area name',reason:'Reason for change',save:'Save',cancel:'Cancel',failed:'Could not save. Check for duplicate names or reopen the details and retry.'},ms:{edit:'Ubah nama kawasan',name:'Nama kawasan',reason:'Sebab perubahan',save:'Simpan',cancel:'Batal',failed:'Gagal menyimpan. Semak nama pendua atau buka semula butiran dan cuba lagi.'}}
export default function AreaRenameEntry({area,save}){
 const{language}=useI18n(),w=words[language]||words.en
 const[open,setOpen]=useState(false),[name,setName]=useState(area.name),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const submit=async e=>{e.preventDefault();if(busy)return;setBusy(true);setError('');try{if(await save(`/api/areas/${area.id}/name`,'PATCH',{name,reason,expectedName:area.name}))setOpen(false);else setError(w.failed)}catch{setError(w.failed)}finally{setBusy(false)}}
 if(!open)return <button type="button" onClick={()=>{setName(area.name);setReason('');setError('');setOpen(true)}}>{w.edit}</button>
 return <form className="branch-area-editor" onSubmit={submit}><label>{w.name}<input autoFocus required maxLength={120} value={name} disabled={busy} onChange={e=>setName(e.target.value)}/></label><label>{w.reason}<input required value={reason} disabled={busy} onChange={e=>setReason(e.target.value)}/></label>{error&&<p role="alert">{error}</p>}<div><button type="button" disabled={busy} onClick={()=>setOpen(false)}>{w.cancel}</button><button disabled={busy||!name.trim()||name.trim()===area.name||!reason.trim()}>{w.save}</button></div></form>
}
