import {navigateWithinApp} from './navigation.js'
import {useUi} from './i18n.jsx'
import {DispatchScheduleTools} from './DispatchScheduleTools.jsx'
import {useState} from 'react'
import {apiRequest} from './apiClient.js'
import {formatBranchId} from '../shared/typedIds.js'
import './RouteCustomerList.css'

function collectionStatus(stop){
  if(stop.completionOutcome==='no_goods')return '已到店 · 无货'
  if(stop.status==='completed')return '已完成'
  if(stop.overrideNote==='driver_deferred'||stop.status==='overridden')return '需跟进'
  if(stop.arrivedAt||stop.status==='active')return '收货中'
  return '待收'
}

export default function RouteCustomerList({day,route,days,canEdit,onReorder,busy}){
  const editable=canEdit&&['draft','reapproval_required'].includes(day.status)
  return <ol className="route-customer-list">{route.stops.map((stop,index)=><CustomerRow key={stop.id} {...{stop,index,day,route,days,canEdit,editable,onReorder,busy}}/>)}</ol>
}

function CustomerRow({stop,index,day,route,days,canEdit,editable,onReorder,busy}){
  const ui=useUi()

  const[open,setOpen]=useState(false),[adjust,setAdjust]=useState(false),[date]=useState(day.dispatch_date),[targetRoute,setTargetRoute]=useState(String(route.routeNumber)),[reason,setReason]=useState(''),[saving,setSaving]=useState(false),[error,setError]=useState('')
  const targetDay=days.find(item=>item.dispatch_date===date)
  const protectedStop=Boolean(stop.hasBill||stop.arrivedAt||stop.completedAt||['active','completed','cancelled'].includes(stop.status))
  const gps=Number.isFinite(stop.latitude)&&Number.isFinite(stop.longitude)&&!(stop.latitude===0&&stop.longitude===0)
  const save=async()=>{
    setSaving(true);setError('')
    try{
      await apiRequest(`/api/dispatch/stops/${stop.id}/adjust-route`,{method:'POST',body:JSON.stringify({date,routeNumber:Number(targetRoute),reason,expectedRevision:day.revision,targetRevision:targetDay?.revision})})
      setAdjust(false);setReason('');window.dispatchEvent(new Event('kcs-handover-saved'))
    }catch(e){setError(e.message)}finally{setSaving(false)}
  }
  const reorder=async direction=>{setError('');try{await onReorder(day.dispatch_date,route.routeNumber,stop.id,direction)}catch(e){setError(e.message)}}
  return <li>
    <div className="route-customer-row"><button type="button" className="route-customer-name" aria-expanded={open} aria-controls={`route-customer-${day.id}-${stop.id}`} onClick={()=>setOpen(value=>!value)}><b>{index+1}. {formatBranchId(stop.branchId)} — <span data-i18n-raw>{stop.branchName||ui("Unnamed branch")}</span></b><small><span data-i18n-raw>{stop.zoneGroup}</span> · <span data-i18n-raw>{stop.area}</span></small></button><span className={`collection-status ${stop.status==='completed'?'done':''}`}>{ui(collectionStatus(stop))}</span>{canEdit&&<div className="route-customer-order"><button type="button" aria-label={ui("上移 {0}", {0: stop.branchName})} disabled={busy||saving||!editable||index===0} onClick={()=>reorder('up')}>↑</button><button type="button" aria-label={ui("下移 {0}", {0: stop.branchName})} disabled={busy||saving||!editable||index===route.stops.length-1} onClick={()=>reorder('down')}>↓</button></div>}</div>
    {error&&<p role="alert">{ui(error)}</p>}
    {open&&<div id={`route-customer-${day.id}-${stop.id}`} className="route-customer-detail">
      <p><b>{ui("Address：")}</b><span data-i18n-raw>{stop.address||ui("Not recorded")}</span></p>
      <p>{ui("联系人：")}<span data-i18n-raw>{stop.contactPerson||ui("未记录")}</span> · {stop.phone?<a href={`tel:${stop.phone.replace(/[^+0-9]/g,'')}`}><span data-i18n-raw>{stop.phone}</span></a>:ui("电话未记录")}</p>
      {stop.timeRestriction&&<p>{ui("约定时段：")}{stop.timeRestriction}</p>}
      {[['Parking',stop.parkingNote],['Truck access',stop.truckAccess],['GPS note',stop.gpsRemark],['跟进原因',stop.overrideReason]].filter(([,value])=>value).map(([label,value])=><p key={label}>{ui(label)}: <span data-i18n-raw>{value}</span></p>)}
      {canEdit&&<DispatchScheduleTools {...{stop,day,days}} routeNumber={route.routeNumber}/>}
      <div className="route-customer-links">{gps?<a href={`https://www.google.com/maps/dir/?api=1&destination=${stop.latitude},${stop.longitude}`} target="_blank" rel="noreferrer">{ui("导航")}</a>:<span>{ui("GPS 未记录")}</span>}<a href={`?page=customers&tab=branches&branch=${encodeURIComponent(formatBranchId(stop.branchId))}`} onClick={event=>{event.preventDefault();navigateWithinApp(event.currentTarget.href,ui("You have unsaved changes. Discard them?"))}}>{ui("客户主资料")}</a>{canEdit&&<button type="button" disabled={!editable||protectedStop||saving} onClick={()=>setAdjust(value=>!value)}>{ui("转到其他 ROUTE")}</button>}</div>
      {canEdit&&(!editable||protectedStop)&&<small>{protectedStop?ui("已有执行或单据，保留原始收货记录。"):ui("调整前请先撤回批准；执行中的日期不能移动客户。")}</small>}
      {adjust&&editable&&!protectedStop&&<fieldset disabled={saving}><legend>{ui("调整当天 ROUTE（收货日期不变）")}</legend>
        
        <label>{ui("ROUTE")}<select value={targetRoute} onChange={e=>setTargetRoute(e.target.value)}>{(targetDay?.routeBoards||[]).map(item=><option key={item.routeNumber} value={item.routeNumber} data-i18n-raw>{item.name}</option>)}</select></label>
        <label>{ui("原因")}<input value={reason} onChange={e=>setReason(e.target.value)}/></label>
        <button type="button" disabled={!reason.trim()||!targetDay||(date===day.dispatch_date&&Number(targetRoute)===route.routeNumber)} onClick={save}>{saving?ui("保存中…"):ui("确认调整")}</button><button type="button" onClick={()=>setAdjust(false)}>{ui("取消")}</button>
      </fieldset>}
    </div>}
  </li>
}
