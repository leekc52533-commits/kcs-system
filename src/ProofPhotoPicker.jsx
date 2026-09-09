import {useEffect,useRef,useState} from 'react'
import {useI18n,useUi} from './i18n.jsx'
import {processPaymentProof} from './paymentProofImage.js'

// Keep the camera inside the page so launching another Android activity cannot
// discard the pending stop/bill. A native camera input remains an explicit fallback.
export default function ProofPhotoPicker({value,onChange,onBusyChange,disabled=false}){
  const {t}=useI18n(),ui=useUi()
  const [camera,setCamera]=useState(false),[ready,setReady]=useState(false),[processing,setProcessing]=useState(false),[fallback,setFallback]=useState(false),[error,setError]=useState(''),[preview,setPreview]=useState('')
  const video=useRef(null),stream=useRef(null),generation=useRef(0),busyCallback=useRef(onBusyChange),occupied=useRef(false)
  useEffect(()=>{busyCallback.current=onBusyChange},[onBusyChange])
  const markBusy=active=>{occupied.current=active;busyCallback.current?.(active)}
  const stopStream=()=>{stream.current?.getTracks().forEach(track=>track.stop());stream.current=null}
  useEffect(()=>()=>{generation.current++;stopStream();if(occupied.current)busyCallback.current?.(false)},[])
  useEffect(()=>{if(!value){setPreview('');return}const url=URL.createObjectURL(value.blob);setPreview(url);return()=>URL.revokeObjectURL(url)},[value])
  const closeCamera=()=>{generation.current++;stopStream();setCamera(false);setReady(false);setProcessing(false);markBusy(false)}
  useEffect(()=>{if(!camera)return;const onHidden=()=>{if(document.hidden)closeCamera()};document.addEventListener('visibilitychange',onHidden);return()=>document.removeEventListener('visibilitychange',onHidden)},[camera]) // eslint-disable-line react-hooks/exhaustive-deps
  const openCamera=async()=>{
    const request=++generation.current;setError('');setCamera(true);setReady(false);markBusy(true)
    try{
      if(!navigator.mediaDevices?.getUserMedia)throw new Error('unavailable')
      const media=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080}}})
      if(request!==generation.current){media.getTracks().forEach(track=>track.stop());return}
      stream.current=media
      if(!video.current)throw new Error('unavailable')
      video.current.srcObject=media
      await video.current.play()
    }catch{if(request===generation.current){closeCamera();setFallback(true);setError('photo.cameraUnavailable')}}
  }
  const prepare=async(file,request)=>{
    setProcessing(true);setError('');markBusy(true)
    try{const photo=await processPaymentProof(file);if(request===generation.current){onChange(photo);closeCamera()}}
    catch(item){if(request===generation.current)setError(item.message||'purchase.proofProcessFailed')}
    finally{if(request===generation.current){setProcessing(false);markBusy(camera)}}
  }
  const choose=async event=>{
    const input=event.currentTarget,file=input.files?.[0];if(!file)return
    // Do not clear the native input until decoding has produced an owned Blob.
    const request=++generation.current
    await prepare(file,request)
    input.value=''
  }
  const capture=async()=>{
    if(!video.current?.videoWidth||!video.current?.videoHeight)return
    const request=generation.current,canvas=document.createElement('canvas'),scale=Math.min(1,2200/Math.max(video.current.videoWidth,video.current.videoHeight))
    canvas.width=Math.round(video.current.videoWidth*scale);canvas.height=Math.round(video.current.videoHeight*scale)
    setProcessing(true);setError('')
    try{
      const context=canvas.getContext('2d');if(!context)throw new Error('capture')
      context.drawImage(video.current,0,0,canvas.width,canvas.height)
      const blob=await new Promise((resolve,reject)=>canvas.toBlob(result=>result?resolve(result):reject(new Error('capture')),'image/jpeg',.9))
      if(request===generation.current)await prepare(new File([blob],'camera.jpg',{type:'image/jpeg'}),request)
    }catch{if(request===generation.current){setError('photo.captureFailed');setProcessing(false)}}
  }
  return <div className="proof-photo-picker">
    {error&&<p className="auth-error" role="alert">{ui(t(error))}</p>}
    {!camera&&<div className="proof-source-actions">
      <button type="button" className="secondary-mobile" disabled={disabled||processing} onClick={openCamera}>{t(value?'purchase.retakePhoto':'purchase.takePhoto')}</button>
      <label className="secondary-mobile proof-input-action">{t(value?'purchase.replaceFromGallery':'purchase.chooseGallery')}<input aria-label={t('purchase.chooseGallery')} type="file" accept="image/*" disabled={disabled||processing} onChange={choose}/></label>
    </div>}
    {fallback&&!camera&&<label className="secondary-mobile proof-input-action">{t('photo.systemCamera')}<input aria-label={t('photo.systemCamera')} type="file" accept="image/*" capture="environment" disabled={disabled||processing} onChange={choose}/></label>}
    {camera&&<div className="proof-camera" role="group" aria-label={t('purchase.takePhoto')}>
      <video ref={video} autoPlay muted playsInline onLoadedData={()=>setReady(true)} aria-label={t('photo.cameraPreview')}/>
      {!ready&&<p role="status">{t('photo.opening')}</p>}
      <button type="button" className="primary-mobile" disabled={!ready||processing||disabled} onClick={capture}>{t('photo.capture')}</button>
      <button type="button" className="secondary-mobile" onClick={closeCamera}>{t('photo.cancel')}</button>
    </div>}
    {processing&&<p role="status">{t('purchase.proofProcessing')}</p>}
    {preview&&<img className="payment-proof-preview" src={preview} alt={t('photo.preview')}/>}
    {value&&<><p className="proof-selected">✓ {t('purchase.proofSelected')} · {(value.blob.size/1024/1024).toFixed(1)} MB</p><button type="button" className="secondary-mobile proof-remove" disabled={disabled||processing||camera} onClick={()=>{onChange(null);setError('')}}>{t('purchase.removePhoto')}</button></>}
  </div>
}
