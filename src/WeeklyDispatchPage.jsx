import { useCallback, useEffect, useMemo, useState } from 'react'
import './Planner.css'

const localDate=(date=new Date())=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`
const addDays=(date,count)=>{const d=new Date(`${date}T00:00:00`);d.setDate(d.getDate()+count);return localDate(d)}
const labels={draft:'草稿',pending_approval:'等待批准',approved:'已批准',published:'已发布',in_progress:'进行中',completed:'已完成',reapproval_required:'修改后需重新批准'}
const request=async(url,options={})=>{const response=await fetch(url,{headers:{'Content-Type':'application/json'},...options});const data=await response.json();if(!response.ok)throw new Error(data.error||'操作失败');return data}

export default function WeeklyDispatchPage({onOpenSpecial}){
  const[startDate,setStartDate]=useState(localDate()),[data,setData]=useState(null),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false)
  const load=useCallback(async()=>{setError('');try{setData(await request(`/api/dispatch/week?startDate=${startDate}`))}catch(e){setError(e.message)}},[startDate])
  useEffect(()=>{load()},[load])
  const generate=async()=>{setBusy(true);setMessage('');try{await request('/api/dispatch/generate-week',{method:'POST',body:JSON.stringify({startDate,generatedBy:'Supervisor'})});setMessage('未来 7 天草稿已更新；相同排程不会重复加入。');await load()}catch(e){setError(e.message)}finally{setBusy(false)}}
  const act=async(date,action)=>{setBusy(true);setMessage('');try{if(action==='approve-publish'){await request(`/api/dispatch/day/${date}/approve`,{method:'POST',body:JSON.stringify({approvedBy:'Supervisor'})});await request(`/api/dispatch/day/${date}/publish`,{method:'POST',body:JSON.stringify({publishedBy:'Supervisor'})})}else await request(`/api/dispatch/day/${date}/${action}`,{method:'POST',body:JSON.stringify({[action==='approve'?'approvedBy':'reopenedBy']:'Supervisor'})});setMessage(`${date} 已完成${action==='approve-publish'?'批准并发布':action==='approve'?'批准':'重新打开'}。`);await load()}catch(e){setError(e.message);await load()}finally{setBusy(false)}}
  const patchTrip=async(id,body)=>{try{await request(`/api/dispatch/trips/${id}`,{method:'PATCH',body:JSON.stringify({...body,changedBy:'Supervisor'})});await load()}catch(e){setError(e.message)}}
  const addTrip=async(date)=>{try{await request('/api/dispatch/trips',{method:'POST',body:JSON.stringify({date,changedBy:'Supervisor'})});await load()}catch(e){setError(e.message)}}
  const patchStop=async(id,body)=>{try{await request(`/api/dispatch/stops/${id}`,{method:'PATCH',body:JSON.stringify({...body,changedBy:'Supervisor'})});await load()}catch(e){setError(e.message)}}
  const moveStop=async(event,trip,date,sequence)=>{event.preventDefault();const id=event.dataTransfer.getData('text/stop-id');if(!id)return;try{await request(`/api/dispatch/stops/${id}`,{method:'PATCH',body:JSON.stringify({tripId:trip.id,date,stopSequence:sequence,changedBy:'Supervisor drag-and-drop'})});await load()}catch(e){setError(e.message)}}
  const shortcuts=[['今天',localDate()],['明天',addDays(localDate(),1)],['后天',addDays(localDate(),2)]]
  return <div className="page planner-page"><div className="planner-title"><div><em>WEEKLY DISPATCH PLANNER</em><h1>主管一周派车总览</h1><p>每一天独立批准；只有已发布的当天路线会出现在司机端。</p></div><button onClick={onOpenSpecial}>＋ 临时收货请求</button></div>
    <div className="planner-toolbar"><div>{shortcuts.map(([label,date])=><button key={label} className={startDate===date?'active':''} onClick={()=>setStartDate(date)}>{label}</button>)}<button onClick={()=>setStartDate(localDate())}>未来 7 天</button></div><label>开始日期 <input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)}/></label><button className="primary" disabled={busy} onClick={generate}>{busy?'处理中…':'根据排程产生／更新草稿'}</button></div>
    {message&&<div className="planner-message">✓ {message}</div>}{error&&<div className="data-error">{error}</div>}
    {!data?<div className="data-loading">周计划载入中…</div>:<div className="week-board">{data.days.length===0?<div className="empty-week"><h2>这一周尚未产生草稿</h2><p>按“根据排程产生／更新草稿”从 BranchSchedule 建立未来七天。</p></div>:data.days.map(day=><DayColumn key={day.id} day={day} data={data} busy={busy} act={act} addTrip={addTrip} patchTrip={patchTrip} patchStop={patchStop} moveStop={moveStop}/>)}</div>}
  </div>
}

function DayColumn({day,data,busy,act,addTrip,patchTrip,patchStop,moveStop}){
  const date=new Date(`${day.dispatch_date}T00:00:00`),title=date.toLocaleDateString('zh-MY',{month:'numeric',day:'numeric',weekday:'short'})
  return <section className={`day-column ${day.status}`}><header><div><small>{day.dispatch_date}</small><h2>{title}</h2></div><span>{labels[day.status]||day.status}</span></header><div className="day-metrics"><b>{day.stops.length+day.specialRequests.length}</b> 客户 <b>{day.warningCount}</b> 警告 <b>v{day.revision}</b></div>
    <div className="day-actions"><button disabled={busy||day.status==='published'} onClick={()=>act(day.dispatch_date,'approve')}>批准</button><button className="publish" disabled={busy||day.status==='published'} onClick={()=>act(day.dispatch_date,'approve-publish')}>批准并发布</button>{day.status==='published'&&<button onClick={()=>act(day.dispatch_date,'reopen')}>重新打开</button>}</div>
    {day.trips.map(trip=><TripCard key={trip.id} trip={trip} day={day} data={data} patchTrip={patchTrip} patchStop={patchStop} moveStop={moveStop}/>) }
    <button className="add-trip" onClick={()=>addTrip(day.dispatch_date)}>＋ 增加 Trip</button>
    {day.specialRequests.filter(x=>x.requestType==='potential_new').map(r=><div className={`special-route ${r.promisedToCustomer?'promised':''}`} key={r.id}><b>{r.promisedToCustomer?'客户承诺 · ':''}{r.customerName}</b><small>潜在新客户 · Trip {r.tripNumber||'—'}</small>{(!r.customerId||!r.branchId||r.occPrice==null||!r.paymentType)&&<span>账号资料未齐，禁止发布</span>}</div>)}
  </section>
}

function TripCard({trip,day,data,patchTrip,patchStop,moveStop}){
  const stops=useMemo(()=>day.stops.filter(x=>x.tripId===trip.id),[day.stops,trip.id])
  const weight=stops.reduce((sum,stop)=>sum+Number(stop.estimatedWeightKg||0),0)
  return <article className="trip-card" onDragOver={e=>e.preventDefault()} onDrop={e=>moveStop(e,trip,day.dispatch_date,stops.length+1)}><div className="trip-head"><strong>Trip {trip.tripNumber}</strong><span>{trip.area||'跨区／未分区'} · {stops.length} 客户 · {weight||trip.estimatedWeightKg||'—'} kg</span></div><div className="trip-resources"><select aria-label="车辆" value={trip.vehicleId||''} onChange={e=>patchTrip(trip.id,{vehicleId:Number(e.target.value)||null})}><option value="">未分配车辆</option>{data.vehicles.map(x=><option key={x.id} value={x.id}>{x.vehicle}</option>)}</select><select aria-label="司机" value={trip.driverId||''} onChange={e=>patchTrip(trip.id,{driverId:Number(e.target.value)||null})}><option value="">未分配司机</option>{data.employees.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select><select aria-label="跟车员" value={trip.assistantId||''} onChange={e=>patchTrip(trip.id,{assistantId:Number(e.target.value)||null})}><option value="">未分配跟车员</option>{data.employees.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select><select aria-label="出发地点" value="" onChange={e=>patchTrip(trip.id,{startLocationId:Number(e.target.value)||null})}><option value="">{trip.startLocation||'选择出发地点'}</option>{data.locations.filter(x=>x.canStart).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select><select aria-label="结束地点" value="" onChange={e=>patchTrip(trip.id,{endLocationId:Number(e.target.value)||null})}><option value="">{trip.endLocation||'选择结束地点'}</option>{data.locations.filter(x=>x.canEnd).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
    <div className="trip-stops">{stops.map((stop,index)=><div className="route-stop" key={stop.id} draggable={!stop.sequenceLocked} onDragStart={e=>e.dataTransfer.setData('text/stop-id',String(stop.id))} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.stopPropagation();moveStop(e,trip,day.dispatch_date,index+1)}}><i>{stop.stopSequence}</i><span><b>{stop.branchName||stop.branchId}</b><small>{stop.customerName} · {stop.area||'未分区'}</small></span><button title="锁定顺序" className={stop.sequenceLocked?'locked':''} onClick={()=>patchStop(stop.id,{sequenceLocked:!stop.sequenceLocked})}>{stop.sequenceLocked?'🔒':'○'}</button></div>)}{stops.length===0&&<p className="drop-hint">拖放客户到这辆车／趟次</p>}</div>
  </article>
}
