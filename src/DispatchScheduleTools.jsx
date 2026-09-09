import {useUi} from './i18n.jsx'
import {useState} from 'react'
import {ScheduleEditor} from './DataPages.jsx'
import {useI18n} from './i18n.jsx'
import {apiRequest} from './apiClient.js'
import {formatBranchId} from '../shared/typedIds.js'
import {kuchingDate} from '../shared/kuchingTime.js'
const refresh=()=>window.dispatchEvent(new Event('kcs-handover-saved'))
export function DispatchScheduleTools({stop,day,days,routeNumber,notice=false}){
  const ui=useUi()

 const{t}=useI18n(),[editing,setEditing]=useState(null),[error,setError]=useState(''),[extra,setExtra]=useState(false),[date,setDate]=useState(days.find(d=>d.dispatch_date>day.dispatch_date)?.dispatch_date||day.dispatch_date),[reason,setReason]=useState(''),[busy,setBusy]=useState(false)
 const settings=async()=>{setError('');try{setEditing(await apiRequest(`/api/branches/${encodeURIComponent(formatBranchId(stop.branchId))}/collection-schedule`))}catch(e){setError(e.message)}}
 const add=async()=>{setBusy(true);setError('');try{await apiRequest(`/api/dispatch/stops/${stop.id}/extra-collection`,{method:'POST',body:JSON.stringify({date,reason,targetRevision:days.find(d=>d.dispatch_date===date)?.revision})});setExtra(false);setReason('');refresh()}catch(e){setError(e.message)}finally{setBusy(false)}}
 const noGoods=async()=>{const explanation=prompt(ui("客户通知无货、无需到店：请填写通知内容及原因。"));if(!explanation?.trim())return;setBusy(true);setError('');try{await apiRequest(`/api/dispatch/stops/${stop.id}/customer-no-goods`,{method:'POST',body:JSON.stringify({reason:explanation,expectedRevision:day.revision})});refresh()}catch(e){setError(e.message)}finally{setBusy(false)}}
 return <div className="dispatch-schedule-tools"><button type="button" onClick={settings} disabled={busy}>{ui("固定收货排程")}</button><button type="button" onClick={()=>setExtra(v=>!v)} disabled={busy}>{ui("＋ 临时增加收货")}</button>{!notice&&day.dispatch_date===kuchingDate()&&!stop.arrivedAt&&!stop.completedAt&&!stop.hasBill&&<button type="button" onClick={noGoods} disabled={busy}>{ui("客户通知无货（无需到店）")}</button>}{error&&<p role="alert">{ui(error)}</p>}
 {extra&&<fieldset disabled={busy}><legend>{ui("只增加一次，保留原收货记录")}</legend><label>{ui("日期")}<select value={date} onChange={e=>setDate(e.target.value)}>{days.map(d=><option key={d.id} value={d.dispatch_date}>{d.dispatch_date}</option>)}</select></label><label>{ui("原因")}<input value={reason} onChange={e=>setReason(e.target.value)}/></label><button type="button" disabled={!reason.trim()} onClick={add}>{ui("确认增加")}</button><button type="button" onClick={()=>setExtra(false)}>{ui("取消")}</button></fieldset>}
 {editing&&<ScheduleEditor item={editing} t={t} routeNumber={routeNumber} onClose={()=>setEditing(null)} onSaved={()=>{setEditing(null);refresh()}}/>}</div>
}
export function DispatchPlanningReview({data}){
  const ui=useUi()

 const{t}=useI18n(),[editing,setEditing]=useState(null),[error,setError]=useState(''),[route,setRoute]=useState('')
 const open=async item=>{setError('');try{const current=await apiRequest(`/api/branches/${encodeURIComponent(formatBranchId(item.branchId))}/collection-schedule`);setRoute(String(item.routeNumber||''));setEditing({...current,...item.proposal})}catch(e){setError(e.message)}}
 const confirmMissing=async date=>{setError('');try{await apiRequest(`/api/dispatch/day/${date}/confirm-missing`,{method:'POST',body:JSON.stringify({expectedRevision:data.days.find(d=>d.dispatch_date===date)?.revision})});refresh()}catch(e){setError(e.message)}}
 const items=data.planningReview||[],gaps=data.scheduleReview||[]
 if(!items.length&&!gaps.length)return null
 return <details className="schedule-review"><summary>{ui("收货排程需要确认（")}{items.length+gaps.length}）</summary>{gaps.map((g,i)=><p key={`gap-${i}`}>{g.date} · {formatBranchId(g.branchId)} <span data-i18n-raw>{g.branchName}</span>：{ui(g.message)}</p>)}{[...new Set(gaps.filter(g=>g.kind==='missing').map(g=>g.date))].map(date=><button type="button" key={date} onClick={()=>confirmMissing(date)}>{ui("确认补入")}{date}{ui("上述应收客户")}</button>)}{items.map(item=><article key={item.branchId} className="schedule-review-item"><p><b>{formatBranchId(item.branchId)} <span data-i18n-raw>{item.branchName}</span></b> · {ui(item.issue)||ui("按上传路线表同步固定收货星期")}</p>
 {item.proposal&&<div><p>{ui("建议收货星期：")}{item.proposal.weekdays.map(day=>ui(day)).join(', ')}{item.routeNumber?ui("· ROUTE {0}", {0: item.routeNumber}):''}{item.routeSource==='same_area_suggestion'?ui("（依据同一 Area 建议，需确认）"):''}</p>{item.proposal.anchorDate&&<p>{ui("周期起算日期：")}{item.proposal.anchorDate} · {item.basedOn==='last_collection'?ui("依据上次实际收货"):item.basedOn==='proposed_first_date'?ui("系统建议，尚未确认"):ui("依据原排程")}</p>}{item.nextCollectionDate&&<p><b>{ui("建议下次收货日期：")}{item.nextCollectionDate}</b>{ui("（确认后生效）")}</p>}</div>}
 {item.dateWarnings?.map((warning,i)=><p key={i} role="note">{ui(warning)}</p>)}
 {item.routeEvidence?.uploaded?.map(source=><p key={source.source}>{ui("来源：")}{source.source} · {source.rows.map(r=>`${['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][r.weekday]} / ROUTE ${r.routeNumber}`).join('；')}</p>)}
 {item.routeEvidence?.recorded?.length>0&&<p>{ui("已有派车记录：")}{item.routeEvidence.recorded.map(r=>`${r.date} / ROUTE ${r.routeNumber}`).join('；')}</p>}
 {item.scheduleEvidence?.map(row=><p key={row.scheduleId}>{ui("排程")}{row.scheduleId}：{ui(row.frequency)} · {row.weekdays.map(day=>ui(day)).join(', ')}{ui("· 起算")}{row.anchorDate||ui("未设置")}</p>)}
 {!item.blocked&&<button type="button" onClick={()=>open(item)}>{ui("核对排程")}</button>}</article>)}{error&&<p role="alert">{ui(error)}</p>}{editing&&<><ScheduleEditor routeOptions={data.days[0]?.routeBoards||[]} item={editing} t={t} routeNumber={route?Number(route):undefined} onClose={()=>setEditing(null)} onSaved={()=>{setEditing(null);refresh()}}/></>}</details>
}
