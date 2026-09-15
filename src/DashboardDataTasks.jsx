import {useCallback,useEffect,useRef,useState} from 'react'
import {apiRequest as api} from './apiClient.js'
import {useI18n} from './i18n.jsx'
import CustomerWorkspaceEditor from './CustomerWorkspaceEditor.jsx'
import {formatBranchId} from '../shared/typedIds.js'
import './DashboardDataTasks.css'

const words={
 zh:{title:'资料待完成',help:'未完成项目会持续显示，资料补齐后自动移除。',empty:'目前没有待补齐资料。',loading:'检查中…',error:'检查失败，请重试；未完成项目不会因此被清除。',refresh:'刷新',process:'处理',review:'处理 / 审批',details:'查看异常',close:'关闭',previous:'上一页',next:'下一页',count:'笔待处理',scheduledMissingGps:'已有排程但缺 GPS',missingGps:'缺 GPS',missingSchedule:'缺收货排程',invalidGps:'GPS 异常或不完整',missingArea:'缺有效区域',pendingGps:'GPS 待主管审批',unmatchedSchedule:'排程找不到对应分店',orphanHelp:'这笔排程没有关联分店。请核对原分店编号和收货安排，再修复关联；查看本提示不会清除异常。',source:'原分店编号',schedule:'排程编号',customers:'打开客户管理'},
 en:{title:'Incomplete records',help:'Items remain here until the underlying records are completed.',empty:'No incomplete records.',loading:'Checking…',error:'Check failed. Retry; unresolved items have not been cleared.',refresh:'Refresh',process:'Resolve',review:'Resolve / Review',details:'View issue',close:'Close',previous:'Previous',next:'Next',count:'pending records',scheduledMissingGps:'Scheduled but GPS missing',missingGps:'GPS missing',missingSchedule:'Collection schedule missing',invalidGps:'Invalid or incomplete GPS',missingArea:'Valid Area missing',pendingGps:'GPS awaiting supervisor approval',unmatchedSchedule:'Schedule has no matching Branch',orphanHelp:'This schedule has no linked Branch. Check the source Branch ID and collection arrangement before repairing the link. Viewing this notice does not resolve it.',source:'Source Branch ID',schedule:'Schedule ID',customers:'Open Customers'},
 ms:{title:'Maklumat belum lengkap',help:'Item kekal dipaparkan sehingga maklumat sebenar dilengkapkan.',empty:'Tiada maklumat yang belum lengkap.',loading:'Menyemak…',error:'Semakan gagal. Cuba lagi; item belum selesai tidak dipadam.',refresh:'Muat semula',process:'Lengkapkan',review:'Lengkapkan / Semak',details:'Lihat isu',close:'Tutup',previous:'Sebelumnya',next:'Seterusnya',count:'rekod belum selesai',scheduledMissingGps:'Sudah dijadualkan tetapi tiada GPS',missingGps:'Tiada GPS',missingSchedule:'Tiada jadual kutipan',invalidGps:'GPS tidak sah atau tidak lengkap',missingArea:'Tiada Area yang sah',pendingGps:'GPS menunggu kelulusan penyelia',unmatchedSchedule:'Jadual tiada cawangan sepadan',orphanHelp:'Jadual ini tiada cawangan yang dipautkan. Semak ID cawangan asal dan aturan kutipan sebelum membetulkan pautan. Melihat notis ini tidak menyelesaikan isu.',source:'ID cawangan asal',schedule:'ID jadual',customers:'Buka Pelanggan'}
}

export default function DashboardDataTasks(){
 const{language}=useI18n(),w=words[language]||words.en
 const[data,setData]=useState(null),[error,setError]=useState(false),[editing,setEditing]=useState(null),[detail,setDetail]=useState(null),[page,setPage]=useState(0)
 const mounted=useRef(false),inFlight=useRef(false)
 const load=useCallback(async()=>{if(inFlight.current)return;inFlight.current=true;try{const result=await api('/api/dashboard/data-tasks');if(mounted.current){setData(result);setError(false)}}catch{if(mounted.current)setError(true)}finally{inFlight.current=false}},[])
 useEffect(()=>{mounted.current=true;void load();const timer=setInterval(()=>{if(document.visibilityState!=='hidden')void load()},30000);const focus=()=>void load();window.addEventListener('focus',focus);document.addEventListener('visibilitychange',focus);return()=>{mounted.current=false;clearInterval(timer);window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',focus)}},[load])
 const items=data?.items||[],pages=Math.max(1,Math.ceil(items.length/15)),current=Math.min(page,pages-1)
 return <section className="dashboard-data-tasks" aria-label={w.title}>
  <header><h2>{w.title}{data&&<> · {items.length} {w.count}</>}</h2><button type="button" onClick={()=>void load()}>{w.refresh}</button></header><p>{w.help}</p>
  {error&&<p className="data-error" role="alert">{w.error}</p>}{!data&&!error&&<p>{w.loading}</p>}{data&&!items.length&&!error&&<p>{w.empty}</p>}
  {items.slice(current*15,current*15+15).map(item=><article key={item.key}><div><b data-i18n-raw>{item.kind==='branch'?`${formatBranchId(item.branchId)} · ${item.branchName||item.customerName||'—'}`:item.scheduleId}</b><div className="data-task-issues">{item.issues.map(issue=><span key={issue}>{w[issue]}</span>)}</div></div><button type="button" onClick={()=>item.kind==='branch'?setEditing(item.branchId):setDetail(item)}>{item.kind==='schedule'?w.details:item.issues.includes('pendingGps')?w.review:w.process}</button></article>)}
  {pages>1&&<footer><button disabled={current===0} onClick={()=>setPage(current-1)}>{w.previous}</button><span>{current+1} / {pages}</span><button disabled={current===pages-1} onClick={()=>setPage(current+1)}>{w.next}</button></footer>}
  {editing&&<CustomerWorkspaceEditor branchId={editing} onClose={()=>{setEditing(null);void load()}} onSaved={()=>void load()}/>}
  {detail&&<div className="master-modal"><section className="customer-workspace-result" role="dialog" aria-modal="true" aria-label={w.unmatchedSchedule}><h2>{w.unmatchedSchedule}</h2><p>{w.orphanHelp}</p><p>{w.schedule}: <span data-i18n-raw>{detail.scheduleId}</span></p><p>{w.source}: <span data-i18n-raw>{detail.sourceBranchId}</span></p><p data-i18n-raw>{detail.frequency} · {detail.weekdays||'—'}</p><a href="?page=customers">{w.customers}</a><button type="button" onClick={()=>{setDetail(null);void load()}}>{w.close}</button></section></div>}
 </section>
}
