import { Component, useEffect, useState } from 'react'
import './App.css'
import ImportPage from './ImportPage.jsx'
import SpecialRequestsPage from './SpecialRequestsPage.jsx'
import ResourcePage from './ResourcePage.jsx'
import MasterDataPage from './MasterDataPage.jsx'
import {ChangePasswordPage,LoginPage,MobileApp} from './AuthPages.jsx'
import {kuchingDateLabel} from '../shared/kuchingTime.js'
import {I18nProvider,useI18n} from './i18n.jsx'
import BackButton from './BackButton.jsx'
import {confirmNavigation,hasUnsavedNavigation} from './navigation.js'
import AccountProfileMenu from './AccountProfileMenu.jsx'
import {apiErrorMessage,apiRequest} from './apiClient.js'
import {translate} from './translations.js'
import {CustomerBranchHub,DispatchScheduleHub,LocationGpsZoneHub,StaffAccountHub} from './WorkspaceHub.jsx'

const navigation=[['dashboard','⌂','nav.dashboard'],['operations','↗','nav.dispatchSchedule'],['special','＋','nav.special'],['customers','◎','nav.customers'],['location-zone','⌖','nav.locationGpsZone'],['vehicles','◇','nav.vehicles'],['materials','▦','nav.materials'],['staff','♙','nav.staffAccounts']]
const modules=[['operations','↗','','','','green'],['special','＋','','','','rose'],['customers','◎','','','','blue'],['location-zone','⌖','','','','violet'],['vehicles','◇','','','','cyan'],['materials','▦','','','','orange'],['staff','♙','','','','green']]
const legacyPages={dispatch:['operations','weekly'],schedule:['operations','schedules'],data:['location-zone','data-quality'],'gps-zone':['location-zone','recommendations'],resources:['vehicles','vehicles'],accounts:['staff','accounts'],'gps-migration':['location-zone','legacy-gps']}
class AppErrorBoundary extends Component {
  state={error:null}
  static getDerivedStateFromError(error){return{error}}
  componentDidCatch(error,info){console.error('KCS UI error',error,info)}
  render(){const language=localStorage.getItem('kcs_language')||'en';if(this.state.error)return <main className="auth-page"><section className="auth-card"><div className="auth-logo">!</div><h1>{translate(language,'app.pageError')}</h1><p>{translate(language,'app.pageErrorHelp')}</p><div className="auth-error">{translate(language,'app.unknownPageError')}</div><button onClick={()=>window.location.reload()}>{translate(language,'app.reload')}</button></section></main>;return this.props.children}
}

function AppContent(){
  const[account,setAccount]=useState(undefined),[changing,setChanging]=useState(false),[startupError,setStartupError]=useState('')
  const[guestLanguage,setGuestLanguage]=useState(()=>localStorage.getItem('kcs_language')||'en')
  const applyAccount=next=>{setAccount(next);if(next?.preferredLanguage){localStorage.setItem('kcs_language',next.preferredLanguage);setGuestLanguage(next.preferredLanguage)}}
  const refresh=async()=>{try{const response=await fetch('/api/auth/session'),data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(apiErrorMessage(data));setStartupError('');applyAccount(data.account||null)}catch(error){setStartupError(error.message);setAccount(null)}}
  useEffect(()=>{void refresh()},[])
  const logout=()=>fetch('/api/auth/logout',{method:'POST'}).finally(()=>{setChanging(false);setAccount(null)})
  const selectedLanguage=guestLanguage
  const setLanguage=async value=>{const previous=guestLanguage;localStorage.setItem('kcs_language',value);setGuestLanguage(value);if(account){try{setAccount((await apiRequest('/api/auth/preferences',{method:'PATCH',body:JSON.stringify({preferredLanguage:value})})).account)}catch{localStorage.setItem('kcs_language',previous);setGuestLanguage(previous)}}}
  let content
  if(account===undefined)content=<LoadingScreen/>
  else if(!account)content=<LoginPage onLogin={applyAccount} startupError={startupError?`Login service: ${startupError}`:''}/>
  else if(account.mustChangePassword||changing)content=<ChangePasswordPage account={account} forced={account.mustChangePassword} onDone={updated=>{setChanging(false);setAccount(updated)}} onCancel={()=>setChanging(false)} onLogout={logout}/>
  else if(['driver','crew'].includes(account.role))content=<MobileApp account={account} onLogout={logout} onChangePassword={()=>setChanging(true)}/>
  else content=<DesktopApp account={account} onLogout={logout} onChangePassword={()=>setChanging(true)}/>
  return <I18nProvider language={selectedLanguage} setLanguage={setLanguage}>{content}</I18nProvider>
}

function LoadingScreen(){const{t}=useI18n();return <main className="auth-page"><div className="auth-card">{t('app.loading')}</div></main>}

export default function App(){return <AppErrorBoundary><AppContent/></AppErrorBoundary>}

function DesktopApp({account,onLogout,onChangePassword}){
  const{t,language}=useI18n()
  const initial=()=>{const query=new URLSearchParams(window.location.search),raw=query.get('page')||window.history.state?.kcsPage||'dashboard',mapped=legacyPages[raw];return{page:mapped?.[0]||raw,tab:query.get('tab')||mapped?.[1]||''}}
  const start=initial(),[page,setPage]=useState(start.page),[pageTab,setPageTab]=useState(start.tab),[menuOpen,setMenuOpen]=useState(false)
  const[systemStatus,setSystemStatus]=useState({connected:false,label:t('system.connecting')})
  useEffect(()=>{let active=true;fetch('/api/system/status').then(r=>{if(!r.ok)throw new Error();return r.json()}).then(s=>active&&setSystemStatus({connected:s.database==='connected',label:t('system.database',{version:s.schemaVersion,jodoo:t(s.integrations?.jodoo?.configured?'system.configured':'system.awaiting')})})).catch(()=>active&&setSystemStatus({connected:false,label:t('system.offline')}));return()=>{active=false}},[t])
  useEffect(()=>{
    if(!window.history.state?.kcsPage)window.history.replaceState({kcsPage:page},'',`?page=${page}${pageTab?`&tab=${pageTab}`:''}`)
    const onPop=event=>{if(hasUnsavedNavigation()&&!confirmNavigation(t('common.unsaved'))){window.history.pushState({kcsPage:page},'',`?page=${page}${pageTab?`&tab=${pageTab}`:''}`);return}const query=new URLSearchParams(window.location.search),raw=query.get('page')||event.state?.kcsPage||'dashboard',mapped=legacyPages[raw];setPage(mapped?.[0]||raw);setPageTab(query.get('tab')||mapped?.[1]||'')}
    window.addEventListener('popstate',onPop)
    return()=>window.removeEventListener('popstate',onPop)
  },[page,pageTab,t])
  const go=(id,tab='')=>{const mapped=legacyPages[id],next=mapped?.[0]||id,nextTab=tab||mapped?.[1]||'';if(next===page&&nextTab===pageTab){setMenuOpen(false);return}if(!confirmNavigation(t('common.unsaved')))return;window.history.pushState({kcsPage:next},'',`?page=${next}${nextTab?`&tab=${nextTab}`:''}`);setPage(next);setPageTab(nextTab);setMenuOpen(false)}
  const changeTab=tab=>{window.history.replaceState({kcsPage:page},'',`?page=${page}&tab=${tab}`);setPageTab(tab)}
  const title=t(navigation.find(x=>x[0]===page)?.[2]||'nav.dashboard'),currentUser={name:account.employeeName,role:account.role==='owner_admin'?'admin':account.role==='operations_admin'?'supervisor':account.role,systemRole:account.role}
  const dateLabel=kuchingDateLabel(new Date(),language==='zh'?'zh-MY':language==='ms'?'ms-MY':'en-MY')
  return <div className="shell"><aside className={menuOpen?'sidebar open':'sidebar'}><div className="brand"><b>K</b><div><strong>KCS Dispatch</strong><span>LEE SAI KER ENTERPRISE</span></div></div><nav><small>{t('nav.workspace')}</small>{navigation.map(x=><button key={x[0]} className={page===x[0]?'active':''} onClick={()=>go(x[0])}><i>{x[1]}</i>{t(x[2])}</button>)}</nav><footer><div><i className={systemStatus.connected?'':'offline'}/><span><strong>{t(systemStatus.connected?'system.running':'system.waiting')}</strong><small>{systemStatus.label}</small></span></div><p>LEE SAI KER ENTERPRISE</p></footer></aside>{menuOpen&&<button className="shade" aria-label="Close menu" onClick={()=>setMenuOpen(false)}/>}<main><header className="topbar"><button className="menu" aria-label="Menu" onClick={()=>setMenuOpen(true)}>☰</button><div><small>KCS DISPATCH SYSTEM</small><strong>{title}</strong></div><span>{dateLabel}</span><AccountProfileMenu account={account} onChangePassword={onChangePassword} onAccountManagement={()=>go('staff','accounts')} onLogout={onLogout}/></header>{page!=='dashboard'&&page!=='materials'&&<BackButton fallback={()=>go('dashboard')}/>} {page==='dashboard'?<Dashboard go={go}/>:page==='special'?<SpecialRequestsPage onOpenPlanner={()=>go('operations','weekly')} currentUser={currentUser}/>:page==='operations'?<DispatchScheduleHub initialTab={pageTab||'weekly'} onTabChange={changeTab} onOpenSpecial={()=>go('special')} currentUser={currentUser}/>:page==='customers'?<CustomerBranchHub initialTab={pageTab||'customers'} onTabChange={changeTab} currentUser={currentUser}/>:page==='location-zone'?<LocationGpsZoneHub initialTab={pageTab||'locations'} onTabChange={changeTab} currentUser={currentUser}/>:page==='vehicles'?<ResourcePage fixedTab initialTab="vehicles" currentUser={currentUser}/>:page==='materials'?<MasterDataPage currentUser={currentUser} initialTab="materials" allowedTabs={['materials']}/>:page==='staff'?<StaffAccountHub initialTab={pageTab||'employees'} onTabChange={changeTab} currentUser={currentUser} account={account}/>:page==='sync'?<ImportPage onBack={()=>go('dashboard')}/>:<Placeholder page={page} go={go}/>}</main></div>
}

function Dashboard({go}){
  const{t}=useI18n(),[summary,setSummary]=useState(null),[error,setError]=useState('')
  useEffect(()=>{let active=true;fetch('/api/dashboard/summary').then(r=>r.json().then(x=>{if(!r.ok)throw new Error(x.error||'Dashboard unavailable');return x})).then(x=>active&&setSummary(x)).catch(e=>active&&setError(e.message));return()=>{active=false}},[])
  const stats=summary?[[summary.branchCount,'dashboard.branch','blue'],[summary.scheduledBranchCount,'dashboard.scheduled','green'],[summary.gpsBranchCount,'dashboard.gps','violet'],[summary.routeReadyCount,'dashboard.ready','orange']]:[]
  const dashboardModules=modules.map(module=>({...module,title:t(navigation.find(item=>item[0]===module[0])?.[2]||'nav.dashboard')}))
  return <div className="page"><section className="welcome"><div><em>{t('dashboard.eyebrow')}</em><h1>{t('dashboard.greeting')}</h1><p>{t('dashboard.truth')}</p></div><button onClick={()=>go('dispatch')}>{t('dashboard.create')}</button></section>{error?<div className="data-error">{t('dashboard.backendError',{message:error})}</div>:!summary?<div className="data-loading">{t('dashboard.loading')}</div>:<><section className="stats">{stats.map(item=><article className={item[2]} key={item[1]}><span>{t(item[1])}</span><strong>{item[0]}</strong></article>)}</section><section className="layout"><div><Heading label={t('dashboard.features')} title={t('dashboard.features')}/><div className="cards">{dashboardModules.map(module=><button className="card" key={module[0]} onClick={()=>go(module[0])}><i className={module[5]}>{module[1]}</i><span><strong>{module.title}</strong><b>{t('dashboard.viewAll')} →</b></span></button>)}</div></div><aside className="data"><Heading label={t('dashboard.dataState')} title={t('dashboard.needsAction')} action={()=>go('data')}/><div className="progress"><span><b>Route Ready</b><strong>{summary.routeReadyCount} / {summary.branchCount}</strong></span><div><i style={{width:`${summary.branchCount?summary.routeReadyCount/summary.branchCount*100:0}%`}}/></div></div><div className="issues"><button onClick={()=>go('data')}><strong>{summary.scheduledMissingGpsCount}</strong><span>Scheduled / GPS missing</span><b>›</b></button><button onClick={()=>go('data')}><strong>{summary.noScheduleCount}</strong><span>No schedule</span><b>›</b></button><button onClick={()=>go('data')}><strong>{summary.unmatchedScheduleCount}</strong><span>Unmatched BranchID</span><b>›</b></button></div></aside></section></>}</div>
}
function Heading({label,title,action}){const{t}=useI18n();return <div className="heading"><div><em>{label}</em><h2>{title}</h2></div>{action&&<button onClick={action}>{t('dashboard.viewAll')}</button>}</div>}
function Placeholder({page,go}){const{t}=useI18n(),m=modules.find(x=>x[0]===page);return <div className="page placeholder"><button onClick={()=>go('dashboard')}>← {t('common.back')}</button><section><i className={m[5]}>{m[1]}</i><h1>{t(navigation.find(item=>item[0]===page)?.[2]||'nav.dashboard')}</h1></section></div>}
