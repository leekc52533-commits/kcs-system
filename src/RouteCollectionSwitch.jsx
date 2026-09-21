import './RouteCollectionSwitch.css'
import {useEffect,useState,useCallback} from 'react'
import {apiRequest} from './apiClient.js'
import {useI18n} from './i18n.jsx'
import {routeCollectionWords} from '../shared/routeCollectionWords.js'
export function useRouteCollectionAccess(){
 const[data,setData]=useState(null),[error,setError]=useState('')
 const refresh=useCallback(()=>apiRequest('/api/route-collection-access').then(d=>{setData(d);setError('')}),[])
 useEffect(()=>{let active=true;const reload=()=>apiRequest('/api/route-collection-access').then(d=>{if(active){setData(d);setError('')}}).catch(e=>active&&setError(e.message));reload();const timer=setInterval(reload,15000);window.addEventListener('kcs-route-access',reload);return()=>{active=false;clearInterval(timer);window.removeEventListener('kcs-route-access',reload)}},[])
 return {data,error,refresh}
}
export default function RouteCollectionSwitch({routeNumber,access}){
 const{language}=useI18n(),m=routeCollectionWords[language]||routeCollectionWords.en,[busy,setBusy]=useState(false),[error,setError]=useState('')
 const item=access.data?.items.find(r=>r.id===routeNumber)
 if(!item||!access.data.canEdit)return null
 const toggle=async e=>{e.preventDefault();e.stopPropagation();setBusy(true);setError('');try{await apiRequest(`/api/route-collection-access/${routeNumber}`,{method:'PATCH',body:JSON.stringify({isOpen:!item.isOpen,revision:item.revision})});await access.refresh();window.dispatchEvent(new Event('kcs-route-access'))}catch(e){setError(e.message);await access.refresh().catch(()=>{})}finally{setBusy(false)}}
 return <span className="route-collection-control" onClick={e=>e.stopPropagation()}><button type="button" role="switch" aria-checked={Boolean(item.isOpen)} aria-label={`${item.name} · ${m.enable}`} title={m.help} disabled={busy} onClick={toggle}>{item.isOpen?m.open:m.closed} · {item.isOpen?m.close:m.enable}</button>{error&&<small role="alert">{error}</small>}</span>
}
