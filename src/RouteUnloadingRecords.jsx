import {useEffect,useState} from 'react'
import {apiRequest} from './apiClient.js'
import './RouteUnloadingRecords.css'

export default function RouteUnloadingRecords({date,routeNumber,revision}){
  const[open,setOpen]=useState(false),[data,setData]=useState(null),[error,setError]=useState(''),[refresh,setRefresh]=useState(0)
  useEffect(()=>{
    if(!open)return
    let active=true
    setData(null);setError('')
    apiRequest(`/api/dispatch/day/${date}/route/${routeNumber}/unloading`).then(result=>{if(active)setData(result)}).catch(e=>{if(active)setError(e.message)})
    return()=>{active=false}
  },[open,date,routeNumber,revision,refresh])
  return <details className="route-unloading" onToggle={e=>setOpen(e.currentTarget.open)}>
    <summary>卸货记录</summary>
    {open&&<div><button type="button" onClick={()=>setRefresh(value=>value+1)}>刷新记录</button>
      {error?<p role="alert">{error}</p>:!data?<p>载入中…</p>:<>
        {data.items.length===0&&<p>当天这条 ROUTE 暂无卸货记录。</p>}
        {data.items.map(item=><article key={item.id}>
          <strong>{item.code}</strong><span>{item.status==='confirmed'?'已确认':'等待员工确认重量'}</span>
          <span>{item.weighedAt.replace('T',' ').replace('+08:00','')} · {item.registrationNumber||item.vehicleCode}</span>
          <b>{item.confirmedWeightKg==null?'重量待确认':`${item.confirmedWeightKg} kg`}</b>
          <span>卸货提交司机：{item.driverName}</span><span>当时 Attendant：{item.crew||'未记录'}</span>
          {item.locationName&&<span>{item.locationName}</span>}
          {item.routes.length>1&&<small>这车货关联 ROUTE {item.routes.join(' / ')}，同一卸货编号只计算一次。</small>}
          {item.legacyAssociation&&<small>历史记录：路线根据现有趟次关联，人员按原始记录显示。</small>}
          <a href={item.photoUrl} target="_blank" rel="noreferrer">查看卸货照片</a>
        </article>)}
        {data.handovers.length>0&&<><h4>当天交接记录</h4><p>交接前后人员供核对；卸货重量尚未分配为个人薪酬。</p>{data.handovers.map(log=><article key={log.id}><span>{log.occurredAt} UTC</span><span>{log.fromVehicle} → {log.toVehicle}</span><span>{log.fromDrivers.join(', ')} → {log.toDriver}</span><span>{log.actor}：{log.reason}</span></article>)}</>}
      </>}
    </div>}
  </details>
}
