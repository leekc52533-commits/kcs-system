import {useState} from 'react'
import {useI18n} from './i18n.jsx'
import {TodayView,PurchaseBillPanel,WeightView} from './AuthPages.jsx'
import {TemporaryCustomerMobile} from './TemporaryCustomerIntakes.jsx'
import EmployeeEarnings from './EmployeeEarnings.jsx'
import {earningsWords} from '../shared/earningsWords.js'

export default function SimulationPhone({data,generation}){
 const{t,language}=useI18n(),[tab,setTab]=useState('today')
 const tabs=[['today',t('mobile.today')],['weight',t('mobile.weight')],['more',t('mobile.more')],['earnings',(earningsWords[language]||earningsWords.en).income]]
 return <main className="mobile-app simulation-phone"><header><div><small>KCS MOBILE</small><strong>{tab==='intake'?t('intake.title'):tabs.find(x=>x[0]===tab)?.[1]}</strong></div><strong data-i18n-raw>TEST DRIVER</strong></header>
 <nav>{tabs.map(([id,label])=><button key={id} className={tab===id||id==='more'&&tab==='intake'?'active':''} onClick={()=>setTab(id)}>{label}</button>)}</nav>
 <div className="simulation-phone-content">{tab==='today'&&<TodayView key={generation} data={data} preview={!data.approved}/>}
 {tab==='more'&&<section className="mobile-more"><h1>{t('mobile.more')}</h1><button type="button" onClick={()=>setTab('intake')}><b>{t('intake.title')}</b><span>{t('intake.help')}</span></button></section>}
 {tab==='intake'&&<TemporaryCustomerMobile key={generation} account={{id:'TEST',employeeId:'TEST',role:'driver'}} BillingPanel={PurchaseBillPanel}/>}
 {tab==='weight'&&<WeightView key={generation}/>}
 {tab==='earnings'&&<EmployeeEarnings personal/>}
 </div></main>
}
