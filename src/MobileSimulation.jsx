import SimulationDateReview from './SimulationDateReview.jsx'
import {customerDateWords} from '../shared/customerDatePromise.js'
import {formatDateDisplay} from './dateDisplay.js'
import {useEffect,useRef,useState} from 'react'
import {I18nProvider,LanguageSelector} from './i18n.jsx'
import SimulationPhone from './SimulationPhone.jsx'
import {setSimulationRequest} from './apiClient.js'
import {createMobileSimulation,simulationLabel} from './mobileSimulationState.js'
import CenteredNotice from './CenteredNotice.jsx'
import './MobileSimulation.css'

export default function MobileSimulation(){
 const[language,setLanguage]=useState('zh'),[access,setAccess]=useState(null),[model,setModel]=useState(null),[data,setData]=useState(null),[error,setError]=useState(''),[payment,setPayment]=useState('Credit'),[generation,setGeneration]=useState(0)
 const languageRef=useRef(language);languageRef.current=language
 const w=key=>simulationLabel(language,key)
 useEffect(()=>{
  let alive=true,restore=null
  // This sole server request is read-only and checks the current manager session.
  fetch('/api/acting-collector/simulation-access').then(async r=>{const result=await r.json();if(!r.ok||!result.allowed)throw Error('denied');if(!alive)return
   const originalFetch=window.fetch,originalOpen=XMLHttpRequest.prototype.open
   window.fetch=()=>Promise.reject(new Error(simulationLabel(languageRef.current,'blocked')))
   XMLHttpRequest.prototype.open=function(){throw new Error(simulationLabel(languageRef.current,'blocked'))}
   restore=()=>{window.fetch=originalFetch;XMLHttpRequest.prototype.open=originalOpen}
   setAccess(result)
  }).catch(()=>{if(alive)setError('denied')})
  return()=>{alive=false;setSimulationRequest(null);restore?.()}
 },[])
 const reset=(config=access)=>{
  if(!config)return
  const next=createMobileSimulation({date:config.date,paymentMethod:payment,language:()=>languageRef.current})
  setSimulationRequest(async(...args)=>{const result=await next.request(...args);setData(next.view());return result});setModel(next);setData(next.view());setError('');setGeneration(n=>n+1)
 }
 useEffect(()=>{if(access)reset(access)},[access])
 const review=(id,decision,details)=>{try{setData(model.review(id,decision,details));setGeneration(n=>n+1);setError('')}catch(e){setError(e.message)}}
 const approve=()=>{try{setData(model.approve());setGeneration(n=>n+1);setError('')}catch(e){setError(e.message)}}
 const exit=()=>{if(window.parent!==window)window.parent.postMessage({type:'KCS_SIMULATION_EXIT'},window.location.origin);else window.location.assign('/')}
 const guard=e=>{if(e.target.closest('a')){e.preventDefault();e.stopPropagation();setError('blocked')}}
 return <I18nProvider language={language} setLanguage={setLanguage}><main className="simulation-app" onClickCapture={guard} onAuxClickCapture={guard}>
  <div className="simulation-banner"><strong>{w('title')}</strong><LanguageSelector compact/><button onClick={exit}>{w('exit')}</button></div>
  {error&&<CenteredNotice onClose={()=>setError('')}>{simulationLabel(language,error)||error}</CenteredNotice>}
  {!access&&!error&&<p>{w('loading')}</p>}
  {model&&data&&<><div className="simulation-toolbar"><label>{w('cash')}<select value={payment} onChange={e=>setPayment(e.target.value)}><option value="Credit">Credit</option><option value="Cash">Cash</option></select></label><button onClick={()=>reset()}>{w('reset')}</button>{!data.approved&&<button onClick={approve}>{w('approve')}</button>}</div><div className="simulation-reviews">{(data.pending||[]).map(r=><div key={r.id}><b>{w(r.kind==='order'?'orderRequest':r.kind)} · {r.branchName}</b><p>{r.reason} {formatDateDisplay(r.targetDate||'')}</p>{r.kind==='date'&&r.reasonCode==='customer'?<SimulationDateReview request={r} onReview={review}/>:['approved','rejected'].map(decision=><button key={decision} onClick={()=>{try{setData(model.review(r.id,decision));setGeneration(n=>n+1)}catch(e){setError(e.message)}}}>{w(decision)}</button>)}</div>)}</div>{(data.promisedDates||[]).map(date=><button key={date} disabled={Boolean(data.pending?.length)} onClick={()=>{try{setData(model.openPromisedDate(date));setGeneration(n=>n+1);setError('')}catch(e){setError(e.message)}}}>{(customerDateWords[language]||customerDateWords.en).view}: {formatDateDisplay(date)}</button>)}<SimulationPhone key={model.instanceKey} generation={generation} data={data}/></>}
 </main></I18nProvider>
}
