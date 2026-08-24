import {useEffect,useState} from 'react'
import WeeklyDispatchPage from './WeeklyDispatchPage.jsx'
import {DataQualityPage,SchedulesPage} from './DataPages.jsx'
import MasterDataPage from './MasterDataPage.jsx'
import ResourcePage from './ResourcePage.jsx'
import AccountManagementPage from './AccountManagementPage.jsx'
import GpsZoneRecommendationPage from './GpsZoneRecommendationPage.jsx'
import GpsMigrationPage from './GpsMigrationPage.jsx'
import {RouteTemplatePage} from './ZoneGroupManager.jsx'
import BranchLifecycleReviewPage from './BranchLifecycleReviewPage.jsx'
import AddressAnalysisPage from './AddressAnalysisPage.jsx'
import {useI18n} from './i18n.jsx'
import './WorkspaceHub.css'

function Hub({tabs,validTabs=tabs,initialTab,onTabChange,children,tools}){
  const defaultTab=tabs[0][0],requestedTab=validTabs.some(([id])=>id===initialTab)?initialTab:defaultTab,[tab,setTab]=useState(requestedTab)
  useEffect(()=>setTab(requestedTab),[requestedTab])
  const choose=value=>{setTab(value);onTabChange?.(value)}
  return <div className="page workspace-hub"><nav className="workspace-tabs" aria-label="Workspace sections">{tabs.map(([id,label])=><button key={id} className={tab===id?'active':''} onClick={()=>choose(id)}>{label}</button>)}{tools}</nav>{children(tab,choose)}</div>
}
export function DispatchScheduleHub({currentUser,onOpenSpecial,onOpenRoute,onCloseRoute,routeZoneId,initialTab,onTabChange}){const{t}=useI18n(),tabs=[['weekly',t('hub.weekly')],['schedules',t('hub.schedules')],['area-zone',t('hub.areaZone')]];if(initialTab==='route-template')return <RouteTemplatePage zoneId={routeZoneId} onBack={onCloseRoute}/>;return <Hub tabs={tabs} initialTab={initialTab} onTabChange={onTabChange}>{tab=>tab==='weekly'?<WeeklyDispatchPage onOpenSpecial={onOpenSpecial} currentUser={currentUser}/>:tab==='schedules'?<SchedulesPage/>:<ResourcePage embedded fixedTab initialTab="zones" currentUser={currentUser} onOpenRoute={onOpenRoute}/>}</Hub>}
export function CustomerBranchHub({currentUser,initialTab,onTabChange}){const{t}=useI18n(),tabs=[['customers',t('master.customer')],['branch-review',t('branchLifecycle.reviewTitle')]],validTabs=[...tabs,['branches',t('master.branch')]],branchParam=new URLSearchParams(window.location.search).get('branch')||'';const open=(tab,branch='',source='')=>{onTabChange?.(tab);const url=new URL(window.location.href);if(branch)url.searchParams.set('branch',formatForUrl(branch));else url.searchParams.delete('branch');window.history.replaceState({kcsPage:'customers',branchEditorFrom:source||undefined},'',url)};const closeBranch=()=>{const source=window.history.state?.branchEditorFrom,target=source==='branch-review'?'branch-review':'branches';onTabChange?.(target);const url=new URL(window.location.href);url.searchParams.delete('branch');window.history.replaceState({kcsPage:'customers'},'',url)};return <Hub tabs={tabs} validTabs={validTabs} initialTab={initialTab} onTabChange={onTabChange}>{tab=>tab==='branch-review'?<BranchLifecycleReviewPage initialBranchId={branchParam} currentUser={currentUser} onOpenBranch={branch=>open('branches',branch,'branch-review')}/>:<MasterDataPage key={`${tab}:${branchParam}`} embedded currentUser={currentUser} initialTab={tab} allowedTabs={[tab]} initialBranchId={tab==='branches'?branchParam:''} onCloseBranch={closeBranch} onOpenBranchReview={branch=>open('branch-review',branch)}/>}</Hub>}
const formatForUrl=value=>String(value).replace(/^B/i,'')
export function StaffAccountHub({currentUser,account,initialTab,onTabChange}){const{t}=useI18n(),tabs=[['employees',t('hub.employeeRecords')],['accounts',t('hub.systemAccounts')]];return <Hub tabs={tabs} initialTab={initialTab} onTabChange={onTabChange}>{tab=>tab==='employees'?<ResourcePage embedded fixedTab initialTab="employees" currentUser={currentUser}/>:<AccountManagementPage account={account}/>}</Hub>}
export function LocationGpsZoneHub({currentUser,initialTab,onTabChange}){const{t}=useI18n(),tabs=[['locations',t('hub.locationsGps')],['data-quality',t('nav.data')],['address-analysis',t('hub.addressAnalysis')],['recommendations',t('hub.gpsRecommendations')]];const allowed=['admin','supervisor'].includes(currentUser.role);return <Hub tabs={tabs} initialTab={initialTab} onTabChange={onTabChange} tools={allowed&&<div className="workspace-tools"><button type="button" className="workspace-tool-icon" aria-label={t('nav.gpsMigration')} title={t('nav.gpsMigration')} onClick={()=>onTabChange?.('legacy-gps')}>⇧</button></div>}>{(tab,choose)=>tab==='legacy-gps'?<GpsMigrationPage/>:tab==='locations'?<MasterDataPage key="locations" embedded currentUser={currentUser} initialTab="gps" allowedTabs={['gps','locations']}/>:tab==='data-quality'?<DataQualityPage/>:tab==='address-analysis'?<AddressAnalysisPage onOpenRecommendations={()=>choose('recommendations')}/>:<GpsZoneRecommendationPage currentUser={currentUser}/>}</Hub>}
