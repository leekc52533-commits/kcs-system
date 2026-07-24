import { Component, useEffect, useState } from 'react'
import './App.css'
import ImportPage from './ImportPage.jsx'
import WeeklyDispatchPage from './WeeklyDispatchPage.jsx'
import SpecialRequestsPage from './SpecialRequestsPage.jsx'
import ResourcePage from './ResourcePage.jsx'
import GpsZoneRecommendationPage from './GpsZoneRecommendationPage.jsx'
import MasterDataPage from './MasterDataPage.jsx'
import { DataQualityPage, SchedulesPage } from './DataPages.jsx'
import {ChangePasswordPage,LoginPage,MobileApp} from './AuthPages.jsx'
import GpsMigrationPage from './GpsMigrationPage.jsx'
import {kuchingDateLabel} from '../shared/kuchingTime.js'
import {I18nProvider,LanguageSelector,useI18n} from './i18n.jsx'
import BackButton from './BackButton.jsx'
import {confirmNavigation,hasUnsavedNavigation} from './navigation.js'
import AccountManagementPage from './AccountManagementPage.jsx'

const navigation=[['dashboard','⌂','nav.dashboard'],['dispatch','↗','nav.dispatch'],['special','＋','nav.special'],['customers','◎','nav.customers'],['schedule','▷','nav.schedule'],['data','⌖','nav.data'],['gps-zone','◉','nav.gpsZone'],['resources','◇','nav.resources'],['accounts','♙','nav.accounts'],['gps-migration','⇄','nav.gpsMigration'],['sync','↻','nav.sync']]
const modules=[['dispatch','↗','一周派车','按日期、车辆和趟次安排路线，每天独立批准并发布。','打开周计划','green'],['special','＋','临时收货请求','登记老客户临时加收或潜在新客户，并保护客户承诺。','建立请求','rose'],['customers','◎','客户与分店','查询真实客户、分店、付款方式、价格、GPS 与排程。','查看客户资料','blue'],['schedule','▷','收货排程','按星期、Frequency、BranchID 和 Area 查询所有排程。','管理排程','orange'],['data','⌖','GPS 与资料完整度','分组追踪缺少 GPS、排程或关联主档的资料。','检查资料','violet'],['gps-zone','◉','GPS Zone 建议','绘制 Zone 边界，并由主管确认 official GPS 的 Area 与 Zone 建议。','检查建议','green'],['resources','◇','员工、车辆、地点与区域','管理资源主档、动态 Zone Group 和详细 Area 归属。','管理资源','cyan'],['sync','↻','Jodoo 资料同步','预览并正式导入最新五类 Jodoo Excel。','准备导入','rose']]
class AppErrorBoundary extends Component {
  state={error:null}
  static getDerivedStateFromError(error){return{error}}
  componentDidCatch(error,info){console.error('KCS UI error',error,info)}
  render(){if(this.state.error)return <main className="auth-page"><section className="auth-card"><div className="auth-logo">!</div><h1>KCS 页面发生错误</h1><p>系统没有继续显示空白画面。请重新载入；若问题持续，请关闭启动窗口后再打开系统。</p><div className="auth-error">{this.state.error.message||'未知页面错误'}</div><button onClick={()=>window.location.reload()}>重新载入</button></section></main>;return this.props.children}
}

function AppContent(){
  const[account,setAccount]=useState(undefined),[changing,setChanging]=useState(false),[startupError,setStartupError]=useState('')
  const[guestLanguage,setGuestLanguage]=useState(()=>localStorage.getItem('kcs_language')||'en')
  const refresh=async()=>{try{const response=await fetch('/api/auth/session'),data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||`Auth API response ${response.status}`);setStartupError('');setAccount(data.account||null)}catch(error){setStartupError(error.message);setAccount(null)}}
  useEffect(()=>{void refresh()},[])
  const logout=()=>fetch('/api/auth/logout',{method:'POST'}).finally(()=>setAccount(null))
  const selectedLanguage=account?.preferredLanguage||guestLanguage
  const setLanguage=async value=>{localStorage.setItem('kcs_language',value);setGuestLanguage(value);if(account){try{const response=await fetch('/api/auth/preferences',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({preferredLanguage:value})}),data=await response.json();if(response.ok)setAccount(data.account)}catch{ /* next session refresh will retry */ }}}
  let content
  if(account===undefined)content=<LoadingScreen/>
  else if(!account)content=<LoginPage onLogin={setAccount} startupError={startupError?`Login service: ${startupError}`:''}/>
  else if(account.mustChangePassword||changing)content=<ChangePasswordPage account={account} onDone={()=>{setChanging(false);void refresh()}} onLogout={logout}/>
  else if(['driver','crew'].includes(account.role))content=<MobileApp account={account} onLogout={logout} onChangePassword={()=>setChanging(true)}/>
  else content=<DesktopApp account={account} onLogout={logout} onChangePassword={()=>setChanging(true)}/>
  return <I18nProvider language={selectedLanguage} setLanguage={setLanguage}>{content}</I18nProvider>
}

function LoadingScreen(){const{t}=useI18n();return <main className="auth-page"><div className="auth-card">{t('app.loading')}</div></main>}

export default function App(){return <AppErrorBoundary><AppContent/></AppErrorBoundary>}

function DesktopApp({account,onLogout,onChangePassword}){
  const{t,language}=useI18n()
  const[page,setPage]=useState(()=>window.history.state?.kcsPage||'dashboard'),[menuOpen,setMenuOpen]=useState(false)
  const[systemStatus,setSystemStatus]=useState({connected:false,label:t('system.connecting')})
  useEffect(()=>{let active=true;fetch('/api/system/status').then(r=>{if(!r.ok)throw new Error();return r.json()}).then(s=>active&&setSystemStatus({connected:s.database==='connected',label:t('system.database',{version:s.schemaVersion,jodoo:t(s.integrations?.jodoo?.configured?'system.configured':'system.awaiting')})})).catch(()=>active&&setSystemStatus({connected:false,label:t('system.offline')}));return()=>{active=false}},[t])
  useEffect(()=>{
    if(!window.history.state?.kcsPage)window.history.replaceState({kcsPage:'dashboard'},'')
    const onPop=event=>{if(hasUnsavedNavigation()&&!confirmNavigation(t('common.unsaved'))){window.history.pushState({kcsPage:page},'');return}setPage(event.state?.kcsPage||'dashboard')}
    window.addEventListener('popstate',onPop)
    return()=>window.removeEventListener('popstate',onPop)
  },[page,t])
  const go=id=>{if(id===page){setMenuOpen(false);return}if(!confirmNavigation(t('common.unsaved')))return;window.history.pushState({kcsPage:id},'');setPage(id);setMenuOpen(false)}
  const title=t(navigation.find(x=>x[0]===page)?.[2]||'nav.dashboard'),currentUser={name:account.employeeName,role:account.role==='owner_admin'?'admin':account.role==='operations_admin'?'supervisor':account.role,systemRole:account.role}
  const dateLabel=kuchingDateLabel(new Date(),language==='zh'?'zh-MY':language==='ms'?'ms-MY':'en-MY')
  return <div className="shell"><aside className={menuOpen?'sidebar open':'sidebar'}><div className="brand"><b>K</b><div><strong>KCS Dispatch</strong><span>LEE SAI KER ENTERPRISE</span></div></div><nav><small>{t('nav.workspace')}</small>{navigation.filter(item=>item[0]!=='accounts'||['owner_admin','operations_admin'].includes(account.role)).map(x=><button key={x[0]} className={page===x[0]?'active':''} onClick={()=>go(x[0])}><i>{x[1]}</i>{t(x[2])}</button>)}</nav><footer><div><i className={systemStatus.connected?'':'offline'}/><span><strong>{t(systemStatus.connected?'system.running':'system.waiting')}</strong><small>{systemStatus.label}</small></span></div><p>LEE SAI KER ENTERPRISE</p></footer></aside>{menuOpen&&<button className="shade" aria-label="Close menu" onClick={()=>setMenuOpen(false)}/>}<main><header className="topbar"><button className="menu" aria-label="Menu" onClick={()=>setMenuOpen(true)}>☰</button><div><small>KCS DISPATCH SYSTEM</small><strong>{title}</strong></div><span>{dateLabel}</span><LanguageSelector compact/><button className="user-menu" onClick={onChangePassword}>{account.employeeName}</button><button className="logout-button" onClick={onLogout}>{t('common.logout')}</button></header>{page!=='dashboard'&&<BackButton fallback={()=>go('dashboard')}/>} {page==='dashboard'?<Dashboard go={go}/>:page==='sync'?<ImportPage onBack={()=>go('dashboard')}/>:page==='gps-migration'?<GpsMigrationPage/>:page==='dispatch'?<WeeklyDispatchPage onOpenSpecial={()=>go('special')} currentUser={currentUser}/>:page==='special'?<SpecialRequestsPage onOpenPlanner={()=>go('dispatch')} currentUser={currentUser}/>:page==='customers'?<MasterDataPage currentUser={currentUser}/>:page==='schedule'?<SchedulesPage/>:page==='data'?<DataQualityPage/>:page==='gps-zone'?<GpsZoneRecommendationPage currentUser={currentUser}/>:page==='resources'?<ResourcePage currentUser={currentUser}/>:page==='accounts'?<AccountManagementPage account={account}/>:<Placeholder page={page} go={go}/>}</main></div>
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
