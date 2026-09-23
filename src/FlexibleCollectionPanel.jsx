import {routeCollectionWords} from '../shared/routeCollectionWords.js'
import {useEffect,useState} from 'react'
import {apiRequest as api} from './apiClient.js'
import {useI18n} from './i18n.jsx'
import OutsideCloseDetails from './OutsideCloseDetails.jsx'
import './FlexibleCollectionPanel.css'
export default function FlexibleCollectionPanel({routeNumber,date,isOpen=false,disabled=false}){
 const {t,language}=useI18n(),m=routeCollectionWords[language]||routeCollectionWords.en
 const [expanded,setExpanded]=useState(false),[options,setOptions]=useState({branches:[],trips:[]}),[branch,setBranch]=useState(''),[trip,setTrip]=useState(''),[search,setSearch]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState(false),[version,setVersion]=useState(0)
 useEffect(()=>{let active=true;setOptions({branches:[],trips:[]});setBranch('');setTrip('');setError('');if(!expanded||!isOpen)return
  setLoading(true);api(`/api/route-collection-access/${routeNumber}/dispatch`).then(d=>{if(active&&d.serviceDate===date)setOptions(d)}).catch(e=>{if(active)setError(e.message)}).finally(()=>{if(active)setLoading(false)})
  return()=>{active=false}
 },[routeNumber,date,isOpen,expanded,version])
 const selected=options.branches.find(b=>String(b.id)===branch)
 const dispatch=async e=>{e.preventDefault();if(!selected||!isOpen||disabled)return;setBusy(true);setError('');setSuccess(false)
  try{await api('/api/route-collection-access/dispatch',{method:'POST',body:JSON.stringify({routeNumber:Number(routeNumber),serviceDate:date,branchId:Number(branch),tripId:Number(trip)})});setSuccess(true);setBranch('');setTrip('');setVersion(v=>v+1);window.dispatchEvent(new Event('kcs-customer-transferred'))}catch(e){setError(e.message)}finally{setBusy(false)}
 }
 return <OutsideCloseDetails className="flexible-collection route-customer-transfer" busy={busy} onToggle={e=>{if(e.target===e.currentTarget)setExpanded(e.currentTarget.open)}}><summary>{m.dispatch}</summary>{!isOpen?<p>{m.transferClosed}</p>:<form onSubmit={dispatch}><label>{t('flex.search')}<input disabled={busy||disabled} value={search} onChange={e=>setSearch(e.target.value)}/></label><label>{t('flex.customer')}<select required disabled={busy||loading||disabled} value={branch} onChange={e=>{setBranch(e.target.value);setTrip('');setSuccess(false)}}><option value="">—</option>{options.branches.filter(b=>`${b.company} ${b.name} ${b.branchCode||''}`.toLowerCase().includes(search.toLowerCase())).map(b=><option key={b.id} value={b.id} data-i18n-raw>{b.company} · {b.name}</option>)}</select></label>{!loading&&!options.branches.length&&<p>{m.noCustomers}</p>}{selected&&<><label>{t('flex.vehicle')}<select required disabled={busy||disabled} value={trip} onChange={e=>setTrip(e.target.value)}><option value="">—</option>{options.trips.filter(r=>r.id!==selected.tripId).map(r=><option key={r.id} value={r.id} data-i18n-raw>{r.plate} · {r.driverName} · {r.tripNumber}</option>)}</select></label>{!options.trips.some(r=>r.id!==selected.tripId)&&<p>{t('flex.noTrip')}</p>}<button disabled={busy||disabled||!trip}>{m.dispatch}</button></>}{success&&<p role="status">{m.transferred}</p>}</form>}{error&&<p role="alert">{error}</p>}</OutsideCloseDetails>
}
