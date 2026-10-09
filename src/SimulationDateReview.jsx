import {useState} from 'react'
import {useI18n} from './i18n.jsx'
import {customerDateWords} from '../shared/customerDatePromise.js'
export default function SimulationDateReview({request,onReview}){
 const {language}=useI18n(),w=customerDateWords[language]||customerDateWords.en
 const [scope,setScope]=useState(''),[confirmed,setConfirmed]=useState(false)
 return <section><p role="alert">{w.warning}</p><label>{w.scope}<select value={scope} onChange={e=>{setScope(e.target.value);setConfirmed(false)}}><option value="">—</option><option value="once">{w.once}</option><option value="permanent">{w.permanent}</option></select></label>{scope==='permanent'&&<p>{w.permanentHelp}</p>}<label><input type="checkbox" disabled={!scope} checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>{w.scopeChecked}</label><button disabled={!scope||!confirmed} onClick={()=>onReview(request.id,'approved',{scope,customerPromiseConfirmed:confirmed})}>{{zh:'模拟批准',ms:'Simulasi lulus',en:'Simulate approval'}[language]}</button><button onClick={()=>onReview(request.id,'rejected')}>{{zh:'模拟拒绝',ms:'Simulasi tolak',en:'Simulate rejection'}[language]}</button></section>
}
