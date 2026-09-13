import {useEffect,useRef,useState} from 'react'
import {useI18n} from './i18n.jsx'
import './DriverGuide.css'
export function DriverGuide({popup=false}){
 const{t}=useI18n()
 return <section className="driver-guide"><h2 id={popup?'driver-guide-title':undefined}>{t(popup?'guide.welcome':'guide.title')}</h2><p className="driver-guide-location">{t('guide.where')}</p><p>{t('guide.effective')}</p><h3>{t('guide.workflow')}</h3><ol>{['route','start','arrive','bill','proof','finish'].map(key=><li key={key}><strong>{t('guide.step.'+key)}</strong><p>{t('guide.step.'+key+'.help')}</p></li>)}</ol><h3>{t('guide.rules')}</h3>{['order','advance','onsite','temporary','transfer','return'].map(key=><article key={key}><strong>{t('guide.rule.'+key)}</strong><p>{t('guide.rule.'+key+'.help')}</p></article>)}<h3>{t('guide.blocked')}</h3><ul>{['noRoute','noTrip','gps','waiting','role'].map(key=><li key={key}>{t('guide.help.'+key)}</li>)}</ul><p className="driver-guide-location">{t('guide.where')}</p></section>
}
export function DriverGuidePopup({onRead}){
 const{t}=useI18n(),ref=useRef(null),heading=useRef(null),[busy,setBusy]=useState(false),[error,setError]=useState('')
 useEffect(()=>{const d=ref.current,previous=document.activeElement;if(d.showModal)d.showModal();else d.setAttribute('open','');heading.current?.focus();d.scrollTop=0;return()=>{if(d.close)d.close();previous?.focus?.()}},[])
 const read=async()=>{setBusy(true);setError('');try{await onRead()}catch(e){setError(e.message);setBusy(false)}}
 return <dialog ref={ref} className="notice-popup driver-guide-popup" aria-labelledby="driver-guide-title" onCancel={e=>e.preventDefault()}><div ref={heading} tabIndex={-1}><DriverGuide popup/></div>{error&&<p role="alert">{error}</p>}<button className="notice-primary" disabled={busy} onClick={read}>{t(busy?'common.processing':'guide.understood')}</button></dialog>
}
export function DriverNextStep({trip,preview=false}){
 const{t}=useI18n();if(preview)return <p className="driver-next-step">{t('guide.next.preview')}</p>
 const stop=trip.stops.find(s=>s.id===trip.currentStopId),pending=trip.stops.some(s=>s.deferApprovalStatus==='pending')
 const key=trip.executionStatus==='completed'?'done':trip.approved===false?'approval':pending?'waiting':trip.canStart?'start':trip.executionStatus==='not_started'?'earlier':trip.canComplete?'finishTrip':!stop?'refresh':!stop.arrivedAt?'arrive':!stop.billCreated?'bill':stop.billPaymentMethod==='Cash'&&!stop.paymentProofUploaded?'proof':'finish'
 return <p className="driver-next-step"><strong>{t('guide.next')}</strong> {t('guide.next.'+key)}{stop&&['arrive','bill','proof','finish'].includes(key)&&<> · <span data-i18n-raw>{stop.branchName}</span></>}</p>
}
