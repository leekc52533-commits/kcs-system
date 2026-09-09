import {useEffect,useState} from 'react'
import {createPortal} from 'react-dom'
import BranchEditor from './BranchEditor.jsx'
import {branchFields} from './MasterDataPage.jsx'
import {apiRequest} from './apiClient.js'
import {useI18n} from './i18n.jsx'
import './MasterDataPage.css'

// Keep the planner mounted so its date, vehicle, expanded rows and scroll survive.
export default function RouteBranchEditor({branchId,onClose}){
  const{t}=useI18n(),[branch,setBranch]=useState(null),[error,setError]=useState(''),[saving,setSaving]=useState(false)
  const endpoint=`/api/master/branches/${encodeURIComponent(String(branchId).replace(/^B/i,''))}`
  useEffect(()=>{
    let active=true
    apiRequest(endpoint).then(value=>{if(active)setBranch(value)}).catch(e=>{if(active)setError(e.message)})
    return()=>{active=false}
  },[endpoint])
  useEffect(()=>{
    const focus=document.activeElement,overflow=document.body.style.overflow,x=window.scrollX,y=window.scrollY
    document.body.style.overflow='hidden'
    return()=>{document.body.style.overflow=overflow;focus?.focus?.({preventScroll:true});window.scrollTo(x,y)}
  },[])
  const save=async form=>{
    setSaving(true)
    try{
      const item=await apiRequest(endpoint,{method:'PATCH',body:JSON.stringify({...form,reason:form.reason||'Customer Master supervisor update'})})
      window.dispatchEvent(new Event('kcs-handover-saved'))
      return{ok:true,item}
    }catch(e){return{ok:false,error:e.message}}
    finally{setSaving(false)}
  }
  return createPortal(branch?<BranchEditor fields={branchFields} initial={branch} lockId onClose={onClose} onSave={save} saving={saving}/>:<div className="master-modal" role="dialog" aria-modal="true"><div><p role={error?'alert':undefined}>{error||t('common.loadingData')}</p><button type="button" onClick={onClose}>{t('common.cancel')}</button></div></div>,document.body)
}
