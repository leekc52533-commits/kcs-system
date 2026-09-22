import {useEffect,useState} from 'react'
import WeeklyDispatchPage from './WeeklyDispatchPage.jsx'
import {apiRequest} from './apiClient.js'
import {useI18n} from './i18n.jsx'
import {dateSystemWords} from './dateSystemReviewWords.js'
export default function DateRequestPlanner({date,onClose,onSaved}){
 const {t,language}=useI18n(),w=dateSystemWords[language]||dateSystemWords.en
 const [account,setAccount]=useState(null),[revision,setRevision]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 useEffect(()=>{let active=true;sessionStorage.setItem('kcs-review-planner-date',date);Promise.all([apiRequest('/api/auth/session'),apiRequest('/api/dispatch/date-requests/options?date='+date)]).then(([a,p])=>{if(active){setAccount(a.account);setRevision(p.revision)}}).catch(e=>active&&setError(e.message));return()=>{active=false}},[date])
 const done=async()=>{setBusy(true);try{const p=await apiRequest('/api/dispatch/date-requests/options?date='+date);if(p.revision===revision){setError(w.stale);return}onSaved(revision)}catch(e){setError(e.message)}finally{setBusy(false)}}
 return <div className="master-modal"><section style={{background:'white',borderRadius:20,width:'95vw',maxHeight:'90vh',overflow:'auto',padding:20}}><h2>{w.planner}</h2><button disabled={busy} onClick={onClose}>{w.cancel}</button><button disabled={busy||revision==null} onClick={done}>{w.plannerDone}</button>{error&&<p role="alert">{error}</p>}{account?<WeeklyDispatchPage currentUser={{...account,systemRole:account.role,name:account.employeeName||account.username}}/>:<p>{t('common.loadingData')}</p>}</section></div>
}
