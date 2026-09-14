import {useEffect,useRef,useState} from 'react'
import {createPortal} from 'react-dom'
import {useI18n} from './i18n.jsx'
import {apiErrorMessage,previewReadPath} from './apiClient.js'
import './ProofViewer.css'

export default function ProofViewer({url,children}){
 const [open,setOpen]=useState(false)
 return <><button type="button" className="proof-view-link" data-preview-safe onClick={e=>{e.stopPropagation();setOpen(true)}}>{children}</button>{open&&createPortal(<ProofDialog url={url} label={children} close={()=>setOpen(false)}/>,document.body)}</>
}
function ProofDialog({url,label,close}){
 const {t}=useI18n(),ref=useRef(null),[src,setSrc]=useState(''),[error,setError]=useState('')
 useEffect(()=>{ref.current.showModal()},[])
 useEffect(()=>{
  const controller=new AbortController();let objectUrl='',active=true
  async function load(){
   try{
    const target=new URL(previewReadPath(url),window.location.origin)
    if(target.origin!==window.location.origin)throw new Error(t('apiError.permission_denied'))
    const response=await fetch(target.pathname+target.search,{credentials:'same-origin',cache:'no-store',signal:controller.signal})
    if(!response.ok){const payload=await response.json().catch(()=>({}));throw new Error(response.status===401?t('apiError.auth_required'):apiErrorMessage(payload))}
    const blob=await response.blob()
    if(!['image/png','image/jpeg','image/webp'].includes(blob.type))throw new Error(t('apiError.invalid_file'))
    if(!active)return
    objectUrl=URL.createObjectURL(blob);setSrc(objectUrl)
   }catch(e){if(active&&e.name!=='AbortError')setError(e.message)}
  }
  void load()
  return()=>{active=false;controller.abort();if(objectUrl)URL.revokeObjectURL(objectUrl)}
 },[url,t])
 return <dialog ref={ref} className="proof-view-dialog" onCancel={e=>{e.preventDefault();close()}} onClick={e=>{e.stopPropagation();if(e.target===e.currentTarget){const r=e.currentTarget.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close()}}}>
 <header><strong>{label}</strong><button type="button" data-preview-safe title={t('common.back')} aria-label={t('common.back')} onClick={e=>{e.stopPropagation();close()}}>×</button></header>
 {error?<p role="alert">{error}</p>:src?<img src={src} alt={typeof label==='string'?label:''}/>:<p role="status">{t('void.loading')}</p>}
 </dialog>
}
