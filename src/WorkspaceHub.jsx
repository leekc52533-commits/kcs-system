import {useEffect,useState} from 'react'
import WeeklyDispatchPage from './WeeklyDispatchPage.jsx'
import {DataQualityPage,SchedulesPage} from './DataPages.jsx'
import MasterDataPage from './MasterDataPage.jsx'
import ResourcePage from './ResourcePage.jsx'
import AccountManagementPage from './AccountManagementPage.jsx'
import GpsZoneRecommendationPage from './GpsZoneRecommendationPage.jsx'
import GpsMigrationPage from './GpsMigrationPage.jsx'
import {useI18n} from './i18n.jsx'
import './WorkspaceHub.css'

function Hub({title,tabs,initialTab,onTabChange,children,tools}){
  const defaultTab=tabs[0][0],[tab,setTab]=useState(initialTab||defaultTab)
  useEffect(()=>setTab(initialTab||defaultTab),[initialTab,defaultTab])
  const choose=value=>{setTab(value);onTabChange?.(value)}
  return <div className="page workspace-hub"><div className="data-title"><em>KCS WORKSPACE</em><h1>{title}</h1></div><nav className="workspace-tabs">{tabs.map(([id,label])=><button key={id} className={tab===id?'active':''} onClick={()=>choose(id)}>{label}</button>)}{tools}</nav>{children(tab,choose)}</div>
}
export function DispatchScheduleHub({currentUser,onOpenSpecial,initialTab,onTabChange}){const{t}=useI18n(),tabs=[['weekly',t('hub.weekly')],['schedules',t('hub.schedules')]];return <Hub title={t('nav.dispatchSchedule')} tabs={tabs} initialTab={initialTab} onTabChange={onTabChange}>{tab=>tab==='weekly'?<WeeklyDispatchPage onOpenSpecial={onOpenSpecial} currentUser={currentUser}/>:<SchedulesPage/>}</Hub>}
export function CustomerBranchHub({currentUser,initialTab,onTabChange}){const{t}=useI18n(),tabs=[['customers',t('master.customer')],['branches',t('master.branch')]];return <Hub title={t('nav.customers')} tabs={tabs} initialTab={initialTab} onTabChange={onTabChange}>{tab=><MasterDataPage key={tab} embedded currentUser={currentUser} initialTab={tab} allowedTabs={[tab]}/>}</Hub>}
export function StaffAccountHub({currentUser,account,initialTab,onTabChange}){const{t}=useI18n(),tabs=[['employees',t('hub.employeeRecords')],['accounts',t('hub.systemAccounts')]];return <Hub title={t('nav.staffAccounts')} tabs={tabs} initialTab={initialTab} onTabChange={onTabChange}>{tab=>tab==='employees'?<ResourcePage embedded fixedTab initialTab="employees" currentUser={currentUser}/>:<AccountManagementPage account={account}/>}</Hub>}
export function LocationGpsZoneHub({currentUser,initialTab,onTabChange}){const{t}=useI18n(),[toolsOpen,setToolsOpen]=useState(false),canAccessBuyer=['owner_admin','operations_admin','supervisor','office'].includes(currentUser.systemRole),tabs=[['locations',t('hub.locationsGps')],...(canAccessBuyer?[['buyers',t('hub.buyerMaster')]]:[]),['data-quality',t('nav.data')],['area-zone',t('hub.areaZone')],['recommendations',t('hub.gpsRecommendations')]];const allowed=['admin','supervisor'].includes(currentUser.role);return <Hub title={t('nav.locationGpsZone')} tabs={tabs} initialTab={initialTab} onTabChange={onTabChange} tools={allowed&&<div className="workspace-tools"><button onClick={()=>setToolsOpen(value=>!value)}>Data tools ⋯</button>{toolsOpen&&<button onClick={()=>onTabChange?.('legacy-gps')}>{t('nav.gpsMigration')}</button>}</div>}>{tab=>tab==='legacy-gps'?<GpsMigrationPage/>:tab==='locations'?<MasterDataPage embedded currentUser={currentUser} initialTab="gps" allowedTabs={['gps','locations']}/>:tab==='buyers'?<MasterDataPage embedded currentUser={currentUser} initialTab="buyers" allowedTabs={['buyers']}/>:tab==='data-quality'?<DataQualityPage/>:tab==='area-zone'?<ResourcePage embedded fixedTab initialTab="zones" currentUser={currentUser}/>:<GpsZoneRecommendationPage currentUser={currentUser}/>}</Hub>}
