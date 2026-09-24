import CollectionHistoryPage from './CollectionHistoryPage.jsx'
import {collectionHistoryWord} from '../shared/collectionHistoryWords.js'
import RecordActionIcon from './RecordActionIcon.jsx'
import './RecordIcons.css'
import {useUi} from './i18n.jsx'
import {useEffect,useState} from 'react'
import WeeklyDispatchPage from './WeeklyDispatchPage.jsx'
import MasterDataPage from './MasterDataPage.jsx'
import ResourcePage from './ResourcePage.jsx'
import GpsZoneRecommendationPage from './GpsZoneRecommendationPage.jsx'
import GpsMigrationPage from './GpsMigrationPage.jsx'
import {RouteTemplatePage} from './ZoneGroupManager.jsx'
import BranchLifecycleReviewPage from './BranchLifecycleReviewPage.jsx'
import AddressAnalysisPage from './AddressAnalysisPage.jsx'
import {useI18n} from './i18n.jsx'
import BackButton from './BackButton.jsx'
import './WorkspaceHub.css'

function Hub({tabs,validTabs=tabs,initialTab,onTabChange,children,tools,backControl,className=''}){
  const ui=useUi()

  const defaultTab=tabs[0][0],requestedTab=validTabs.some(([id])=>id===initialTab)?initialTab:defaultTab,[tab,setTab]=useState(requestedTab)
  useEffect(()=>setTab(requestedTab),[requestedTab])
  const choose=value=>{setTab(value);onTabChange?.(value)}
  return <div className={`page workspace-hub ${className}${backControl?' workspace-hub--pinned':''}`}><nav className={`workspace-tabs${backControl?' workspace-tabs--sticky':''}`} aria-label={ui("Workspace sections")}>{backControl}{tabs.map(([id,label])=><button key={id} className={tab===id?'active':''} onClick={()=>choose(id)}>{label}</button>)}{tools}</nav>{children(tab,choose)}</div>
}
export function DispatchScheduleHub({currentUser,onBack,onOpenSpecial,onOpenRoute,onCloseRoute,routeZoneId,initialTab,onTabChange}){const{t,language}=useI18n(),tabs=[['weekly',t('hub.weekly')],['area-zone',t('hub.areaZone')],['change-records',collectionHistoryWord(language,'title')]];if(initialTab==='route-template')return <RouteTemplatePage zoneId={routeZoneId} onBack={onCloseRoute}/>;return <Hub tabs={tabs} initialTab={['area-zone','address-analysis','recommendations','legacy-gps'].includes(initialTab)?'area-zone':initialTab} onTabChange={onTabChange} backControl={<BackButton className="workspace-back" fallback={onBack} iconOnly/>}>{tab=>tab==='change-records'?<CollectionHistoryPage/>:tab==='weekly'?<WeeklyDispatchPage onOpenSpecial={onOpenSpecial} currentUser={currentUser}/>:<LocationGpsZoneHub currentUser={currentUser} initialTab={initialTab} onTabChange={onTabChange} onOpenRoute={onOpenRoute}/>}</Hub>}
export function CustomerBranchHub({currentUser,initialTab,onTabChange,onBack}){const{t,language}=useI18n(),tabs=[['customers',t('master.customer')],['branches',language==='zh'?'客户分店':language==='ms'?'Cawangan pelanggan':'Customer branches'],['branch-review',t('branchLifecycle.reviewTitle')]],validTabs=tabs,branchParam=new URLSearchParams(window.location.search).get('branch')||'';const open=(tab,branch='',source='')=>{onTabChange?.(tab);const url=new URL(window.location.href);if(branch)url.searchParams.set('branch',formatForUrl(branch));else url.searchParams.delete('branch');window.history.replaceState({kcsPage:'customers',branchEditorFrom:source||undefined},'',url)};const closeBranch=()=>{const source=window.history.state?.branchEditorFrom,target=source==='branch-review'?'branch-review':'branches';onTabChange?.(target);const url=new URL(window.location.href);url.searchParams.delete('branch');window.history.replaceState({kcsPage:'customers'},'',url)};return <Hub tabs={tabs} validTabs={validTabs} initialTab={initialTab} onTabChange={tab=>open(tab)} className="unified-customers">{tab=>tab==='branch-review'?<BranchLifecycleReviewPage initialBranchId={branchParam} currentUser={currentUser} onOpenBranch={branch=>open('branches',branch,'branch-review')}/>:<MasterDataPage key={`${tab}:${branchParam}`} embedded currentUser={currentUser} initialTab={tab} allowedTabs={[tab]} initialBranchId={tab==='branches'?branchParam:''} onCloseBranch={closeBranch} onOpenBranchReview={branch=>open('branch-review',branch)}/>}</Hub>}
const formatForUrl=value=>String(value).replace(/^B/i,'')
export function StaffAccountHub({currentUser,account,onBack}){return <ResourcePage embedded fixedTab initialTab="employees" currentUser={currentUser} account={account} onBack={onBack}/>}
export function LocationGpsZoneHub({currentUser,initialTab,onTabChange,onOpenRoute}){const{t}=useI18n(),[active,setActive]=useState(['area-zone','address-analysis','recommendations','legacy-gps'].includes(initialTab)?initialTab:'area-zone'),tabs=[['area-zone',t('hub.areaZone')],['address-analysis',t('hub.addressAnalysis')],['recommendations',t('hub.gpsRecommendations')]];useEffect(()=>setActive(['area-zone','address-analysis','recommendations','legacy-gps'].includes(initialTab)?initialTab:'area-zone'),[initialTab]);const allowed=['admin','supervisor'].includes(currentUser.role);return <Hub tabs={tabs} initialTab={active} validTabs={[...tabs,['legacy-gps',t('nav.gpsMigration')]]} onTabChange={value=>{setActive(value);onTabChange?.(value)}} tools={allowed&&<div className="workspace-tools"><button type="button" className="workspace-tool-icon record-icon-button" aria-label={t('nav.gpsMigration')} title={t('nav.gpsMigration')} onClick={()=>{setActive('legacy-gps');onTabChange?.('legacy-gps')}}><RecordActionIcon kind="upload"/></button></div>}>{(tab,choose)=>tab==='area-zone'?<ResourcePage embedded fixedTab initialTab="zones" currentUser={currentUser} onOpenRoute={onOpenRoute}/>:tab==='legacy-gps'?<GpsMigrationPage/>:tab==='address-analysis'?<AddressAnalysisPage onOpenRecommendations={()=>choose('recommendations')}/>:<GpsZoneRecommendationPage currentUser={currentUser}/>}</Hub>}
