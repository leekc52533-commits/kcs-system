import {useEffect,useState} from 'react'
import {apiRequest as api} from './apiClient.js'
import {useI18n} from './i18n.jsx'

export default function ActingCollectorPage({onEnterMobile}){
  const{t}=useI18n(),[data,setData]=useState(null),[open,setOpen]=useState(null),[busy,setBusy]=useState(null),[error,setError]=useState('')
  const load=()=>api('/api/acting-collector/today').then(setData).catch(item=>setError(item.message))
  useEffect(()=>{load()},[])
  const claim=async vehicle=>{if(!window.confirm(t('acting.confirm',{plate:vehicle.registrationNumber||vehicle.vehicleCode})))return;setBusy(vehicle.vehicleId);setError('');try{await api(`/api/acting-collector/vehicle/${vehicle.vehicleId}`,{method:'POST',body:'{}'});onEnterMobile()}catch(item){setError(item.message)}finally{setBusy(null)}}
  return <div className="page acting-collector-page"><div className="heading"><div><h2>{t('acting.title')}</h2><p>{t('acting.help')}</p></div></div>{error&&<div className="data-error" role="alert">{error}</div>}{!data?<div className="data-loading">{t('common.loadingData')}</div>:!data.vehicles.length?<section className="empty-state"><p>{t('acting.noRoutes')}</p></section>:<section className="acting-vehicle-list">{data.vehicles.map(vehicle=><article key={vehicle.vehicleId} className={vehicle.assignedToMe?'assigned-to-me':''}><header><div><strong>{vehicle.registrationNumber||vehicle.vehicleCode}</strong><span>{vehicle.totalStops} {t('mobile.stops')}</span></div><small>{t('acting.currentDriver')}: {vehicle.driverName||t('mobile.notSet')}</small></header><div className="acting-actions"><button className="secondary" type="button" onClick={()=>setOpen(open===vehicle.vehicleId?null:vehicle.vehicleId)}>{open===vehicle.vehicleId?t('acting.hideRoute'):t('acting.inspectRoute')}</button><button type="button" disabled={busy!==null||vehicle.assignedToMe} onClick={()=>claim(vehicle)}>{vehicle.assignedToMe?t('acting.assignedToMe'):busy===vehicle.vehicleId?t('common.saving'):t('acting.takeOver')}</button></div>{open===vehicle.vehicleId&&<ol>{vehicle.stops.map(stop=><li key={stop.id}><b>{stop.branchId}</b> — {stop.customerName||stop.branchName}</li>)}</ol>}</article>)}</section>}</div>
}
