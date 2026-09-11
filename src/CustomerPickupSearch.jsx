import {useEffect,useRef,useState} from 'react'
import {apiRequest as api} from './apiClient.js'
import {useI18n} from './i18n.jsx'

export function PickupAssignment({assignment}){
 const{t}=useI18n()
 return <span>{assignment?<>{t(assignment.own?'pickup.ownVehicle':'pickup.otherVehicle')} · <span data-i18n-raw>{assignment.plate}</span> · {t(`pickup.stop.${assignment.status}`)}{assignment.protected&&<> · {t('pickup.protected')}</>}</>:t('pickup.unscheduled')}</span>
}
export default function CustomerPickupSearch({draft,onChange,disabled}){
 const{t}=useI18n(),[matches,setMatches]=useState([]),[error,setError]=useState(''),[searching,setSearching]=useState(false),[searched,setSearched]=useState(false),generation=useRef(0)
 useEffect(()=>{
  const id=++generation.current;setMatches([]);setError('');setSearched(false);setSearching(false)
  if(draft.existingBranchId||!draft.name.trim())return
  setSearching(true)
  const timer=setTimeout(async()=>{try{const r=await api(`/api/mobile/customer-pickup-search?search=${encodeURIComponent(draft.name.trim())}`);if(generation.current===id){setMatches(r.items);setSearched(true)}}catch(e){if(generation.current===id)setError(e.message)}finally{if(generation.current===id)setSearching(false)}},250)
  return()=>{clearTimeout(timer);generation.current++}
 },[draft.name,draft.existingBranchId])
 useEffect(()=>{
  const id=draft.existingBranchId;if(!id)return
  let alive=true
  const refresh=async()=>{try{const b=await api(`/api/mobile/customer-pickup-details?branchId=${id}`);if(alive)onChange(d=>d.existingBranchId===id?{...d,name:b.name,phone:b.phone||'',contactPerson:b.contactPerson||'',whatsapp:b.whatsapp||'',address:b.address||'',latitude:b.latitude,longitude:b.longitude,existing:b}:d)}catch(e){if(alive)setError(e.message)}}
  void refresh();const timer=setInterval(refresh,10000);return()=>{alive=false;clearInterval(timer)}
 },[draft.existingBranchId,onChange])
 const choose=async item=>{const id=++generation.current;setSearching(true);setError('');try{const b=await api(`/api/mobile/customer-pickup-details?branchId=${item.id}`);if(generation.current===id){onChange({...draft,name:b.name,phone:b.phone||'',contactPerson:b.contactPerson||'',whatsapp:b.whatsapp||'',address:b.address||'',latitude:b.latitude,longitude:b.longitude,gpsReading:null,existingBranchId:b.id,existing:b,transferReason:''});setMatches([])}}catch(e){if(generation.current===id)setError(e.message)}finally{if(generation.current===id)setSearching(false)}}
 return <div className="pickup-search"><label>{t('intake.name')}<input required maxLength={200} autoComplete="off" disabled={disabled} value={draft.name} onChange={e=>{generation.current++;onChange(draft.existingBranchId?{name:e.target.value,phone:'',mode:draft.mode,requestKey:crypto.randomUUID()}:{...draft,name:e.target.value})}} aria-describedby="pickup-search-help"/></label><p id="pickup-search-help">{t('pickup.searchHelp')}</p>{searching&&<p role="status">{t('pickup.searching')}</p>}{error&&<p role="alert">{error}</p>}{!!matches.length&&<div className="pickup-matches" aria-label={t('pickup.matches')}>{matches.map(b=><button type="button" key={b.id} disabled={disabled||searching} onClick={()=>choose(b)}><b data-i18n-raw>{b.companyName} · {b.name}</b><small data-i18n-raw>{b.branchCode} · {b.address||b.phone}</small><PickupAssignment assignment={b.assignment}/></button>)}</div>}{searched&&!matches.length&&!draft.existingBranchId&&<p>{t('pickup.noMatch')}</p>}{draft.existingBranchId&&<article className="pickup-selected"><strong>{t('pickup.existing')}</strong><p data-i18n-raw>{draft.existing.companyName} · {draft.existing.branchCode}</p><PickupAssignment assignment={draft.existing.assignment}/><p>{t('pickup.masterDetails')}</p><p>{t(`pickup.payment.${String(draft.existing.paymentMethod).toLowerCase()}`)}</p>{draft.existing.products.map(p=><p key={p.productId}><span data-i18n-raw>{p.fullName||p.productCode}</span> · RM {Number(p.currentPrice).toFixed(2)} / <span data-i18n-raw>{p.unit}</span></p>)}{!draft.existing.products.length&&<p>{t('apiError.pickup_price')}</p>}{draft.latitude==null&&<p>{t('apiError.pickup_gps')}</p>}</article>}</div>
}
