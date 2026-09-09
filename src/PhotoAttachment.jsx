import {useMemo,useState} from 'react'
import ProofPhotoPicker from './ProofPhotoPicker.jsx'
import {useI18n,useUi} from './i18n.jsx'

// Adapt the shared camera to existing APIs that accept a File. PDFs stay PDFs.
export function PhotoFilePicker({value,onChange,onBusyChange,disabled=false,allowPdf=false,label}){
  const {t}=useI18n(),ui=useUi(),[processing,setProcessing]=useState(false)
  const photo=useMemo(()=>value&&value.type!=='application/pdf'?{blob:value,name:value.name}:null,[value])
  return <div className="photo-attachment">{label&&<b>{ui(label)}</b>}
    <ProofPhotoPicker value={photo} disabled={disabled} onBusyChange={active=>{setProcessing(active);onBusyChange?.(active)}} onChange={proof=>onChange(proof?new File([proof.blob],proof.name,{type:proof.type||'image/jpeg'}):null)}/>
    {allowPdf&&<label className="secondary-mobile proof-input-action">{t('photo.choosePdf')}<input aria-label={t('photo.choosePdf')} type="file" accept="application/pdf,.pdf" disabled={disabled||processing} onChange={event=>{const file=event.currentTarget.files?.[0];if(file)onChange(new File([file],file.name,{type:'application/pdf'}));event.currentTarget.value=''}}/></label>}
    {value?.type==='application/pdf'&&<p><span data-i18n-raw>{value.name}</span><button type="button" disabled={disabled||processing} onClick={()=>onChange(null)}>{t('photo.removeFile')}</button></p>}
  </div>
}

// Existing immediate-upload controls now require preview followed by confirmation.
export function PhotoUpload({label,save,disabled=false,allowPdf=false}){
  const {t}=useI18n(),ui=useUi(),[file,setFile]=useState(null),[processing,setProcessing]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const upload=async()=>{if(!file||busy||processing)return;setBusy(true);setError('');try{if(await save(file)!==false)setFile(null)}catch(item){setError(item.message||t('photo.uploadFailed'))}finally{setBusy(false)}}
  return <div className="photo-upload"><PhotoFilePicker label={label} value={file} onChange={setFile} onBusyChange={setProcessing} disabled={disabled||busy} allowPdf={allowPdf}/>{error&&<p role="alert">{ui(error)}</p>}<button type="button" disabled={disabled||busy||processing||!file} onClick={upload}>{t(busy?'common.saving':'photo.confirmUpload')}</button></div>
}
