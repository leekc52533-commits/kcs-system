import {useEffect,useState} from 'react'
import {apiRequest as api,isEmployeePreview} from './apiClient.js'
import {useI18n} from './i18n.jsx'
import {earningsWords} from '../shared/earningsWords.js'
export function useIncomeUpdates(){
 const[data,setData]=useState({unread:0,items:[]}),[error,setError]=useState(null)
 useEffect(()=>{let alive=true,generation=0;const load=async()=>{if(isEmployeePreview())return;const token=++generation;try{const r=await api('/api/mobile/income-notifications');if(alive&&token===generation){setData(r);setError(null)}}catch(e){if(alive&&token===generation)setError(e)}};load();const timer=setInterval(load,30000);window.addEventListener('focus',load);window.addEventListener('online',load);window.addEventListener('income-read',load);return()=>{alive=false;clearInterval(timer);window.removeEventListener('focus',load);window.removeEventListener('online',load);window.removeEventListener('income-read',load)}},[])
 return{data,error}
}
export default function IncomeUpdates({data,error}){
 const{language}=useI18n(),w=earningsWords[language]||earningsWords.en,[busy,setBusy]=useState(null),[failure,setFailure]=useState(null)
 const read=async id=>{setBusy(id);setFailure(null);try{await api('/api/mobile/income-notifications/read',{method:'POST',body:JSON.stringify({id})});window.dispatchEvent(new Event('income-read'))}catch(e){setFailure(e)}finally{setBusy(null)}}
 return <section className="income-updates"><h2>{w.incomeUpdates}</h2><p>{w.midnight}</p>{(error||failure)&&<p role="alert">{w[(error||failure).code]||w.failed}</p>}{data.items.length>0&&<details open={data.unread>0}><summary>{w.incomeUpdates} ({data.unread})</summary>{data.items.map(n=><article key={n.id}><b>{n.updateDate} · {n.readAt?w.read:w.unread}</b><p>{w.period}: {n.summary.period.start} ～ {n.summary.period.end}</p><p>{w.amount}: <strong>RM {n.summary.amount.toFixed(2)}</strong> · {w.pendingKg}: {n.summary.pendingKg}</p><p>{w.generated}: {new Date(n.createdAt).toLocaleString(language==='zh'?'zh-MY':language==='ms'?'ms-MY':'en-GB',{timeZone:'Asia/Kuching'})}</p>{n.summary.changed&&<p>{w.changed}</p>}{!n.readAt&&<button disabled={busy!==null||isEmployeePreview()} onClick={()=>read(n.id)}>{w.markRead}</button>}</article>)}</details>}</section>
}
