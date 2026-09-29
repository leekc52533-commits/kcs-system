import {upcomingLeave,leaveDaysUntil} from '../shared/upcomingLeave.js'
import {useRef} from 'react'
import {FilterHeader} from './ExpenseRecordsPage.jsx'
import TableBottomScroll from './TableBottomScroll.jsx'
import DataExportButton from './DataExportButton.jsx'
import {useEffect,useState} from 'react'
import {apiRequest,isEmployeePreview} from './apiClient.js'
import {useI18n} from './i18n.jsx'
import DateInput from './DateInput.jsx'
import CenteredNotice from './CenteredNotice.jsx'
import {formatDateDisplay} from './dateDisplay.js'
import {kuchingDate} from '../shared/kuchingTime.js'
import './LeaveRequests.css'
const words={
 zh:{title:'申请请假',history:'请假记录',start:'开始日期',end:'结束日期',reason:'请假原因',submit:'提交',cancel:'取消',pending:'待批准',approved:'已批准',rejected:'已拒绝',approve:'批准',reject:'拒绝',heading:'请假待批准',empty:'暂无记录',loading:'加载中…',retry:'刷新',dispatch:'批准后请安排替班，派车安排不会自动更改。',failed:'操作未完成，请重试。',LEAVE_INVALID:'请填写有效的起止日期和原因（最多1000字）。',LEAVE_OVERLAP:'这些日期已有待批准或已批准的请假申请。',LEAVE_DENIED:'没有权限执行此操作。',LEAVE_STALE:'申请已处理，请刷新。'},
 en:{title:'Request leave',history:'Leave history',start:'Start date',end:'End date',reason:'Reason',submit:'Submit',cancel:'Cancel',pending:'Pending',approved:'Approved',rejected:'Rejected',approve:'Approve',reject:'Reject',heading:'Leave requests',empty:'No records',loading:'Loading…',retry:'Refresh',dispatch:'Arrange cover after approval. Dispatch assignments are not changed automatically.',failed:'Could not complete. Please retry.',LEAVE_INVALID:'Enter valid dates and a reason (up to 1000 characters).',LEAVE_OVERLAP:'These dates overlap a pending or approved leave request.',LEAVE_DENIED:'You do not have permission.',LEAVE_STALE:'Request already processed. Please refresh.'},
 ms:{title:'Mohon cuti',history:'Rekod cuti',start:'Tarikh mula',end:'Tarikh akhir',reason:'Sebab',submit:'Hantar',cancel:'Batal',pending:'Menunggu kelulusan',approved:'Diluluskan',rejected:'Ditolak',approve:'Luluskan',reject:'Tolak',heading:'Permohonan cuti',empty:'Tiada rekod',loading:'Memuatkan…',retry:'Muat semula',dispatch:'Atur pengganti selepas kelulusan. Tugasan tidak diubah secara automatik.',failed:'Tidak berjaya. Cuba lagi.',LEAVE_INVALID:'Isi tarikh yang sah dan sebab (maksimum 1000 aksara).',LEAVE_OVERLAP:'Tarikh bertindih dengan permohonan yang menunggu atau telah diluluskan.',LEAVE_DENIED:'Tiada kebenaran.',LEAVE_STALE:'Permohonan sudah diproses. Muat semula.'}
}
export function MobileLeave(){
 const{language}=useI18n(),w=words[language]||words.en,[open,setOpen]=useState(false),[data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[draft,setDraft]=useState({startDate:kuchingDate(),endDate:kuchingDate(),reason:''})
 const load=()=>apiRequest('/api/mobile/leave').then(setData).catch(e=>setError(e.code||'failed'))
 useEffect(()=>{let alive=true;const poll=()=>apiRequest('/api/mobile/leave').then(r=>{if(alive)setData(r)}).catch(e=>{if(alive)setError(e.code||'failed')});poll();const timer=setInterval(poll,30000);return()=>{alive=false;clearInterval(timer)}},[])
 const save=async e=>{e.preventDefault();setBusy(true);setError('');try{setData(await apiRequest('/api/mobile/leave',{method:'POST',body:JSON.stringify(draft)}));setDraft({...draft,reason:''});setOpen(false)}catch(e){setError(e.code||'failed')}finally{setBusy(false)}}
 return <section className="leave-panel"><button data-preview-safe type="button" className="leave-primary" onClick={()=>setOpen(true)}>{w.title}</button>{open&&<form onSubmit={save}><fieldset disabled={busy||isEmployeePreview()}><label>{w.start}<DateInput type="date" required value={draft.startDate} onChange={e=>setDraft({...draft,startDate:e.target.value})}/></label><label>{w.end}<DateInput type="date" required value={draft.endDate} onChange={e=>setDraft({...draft,endDate:e.target.value})}/></label><label>{w.reason}<textarea required maxLength={1000} value={draft.reason} onChange={e=>setDraft({...draft,reason:e.target.value})}/></label><button className="leave-primary" disabled={busy}>{w.submit}</button></fieldset><button data-preview-safe type="button" disabled={busy} onClick={()=>setOpen(false)}>{w.cancel}</button></form>}<details><summary>{w.history}</summary><button data-preview-safe type="button" onClick={load}>{w.retry}</button>{!data?<p>{w.loading}</p>:!data.items.length?<p>{w.empty}</p>:data.items.map(r=><article key={r.id}><b>{formatDateDisplay(r.start_date)} ～ {formatDateDisplay(r.end_date)}</b><p>{w[r.status]}</p><p data-i18n-raw>{r.reason}</p></article>)}</details>{error&&<CenteredNotice onClose={()=>setError('')}>{w[error]||w.failed}</CenteredNotice>}</section>
}
export function LeaveApprovals({account}){
 const{language}=useI18n(),w=words[language]||words.en,[items,setItems]=useState([]),[error,setError]=useState(''),[busy,setBusy]=useState(false),allowed=['owner_admin','operations_admin','supervisor'].includes(account?.role)
 useEffect(()=>{if(!allowed)return;let alive=true;const load=()=>apiRequest('/api/leave/requests').then(r=>{if(alive)setItems(r.items)}).catch(e=>{if(alive)setError(e.code||'failed')});load();const timer=setInterval(load,30000);return()=>{alive=false;clearInterval(timer)}},[account?.id,allowed])
 const decide=async(id,decision)=>{setBusy(true);setError('');try{await apiRequest(`/api/leave/requests/${id}`,{method:'POST',body:JSON.stringify({decision})});setItems((await apiRequest('/api/leave/requests')).items);window.dispatchEvent(new Event('kcs-leave-updated'))}catch(e){setError(e.code||'failed')}finally{setBusy(false)}}
 if(!allowed||(!items.length&&!error))return null
 return <section className="leave-panel"><h2>{w.heading}</h2><p>{w.dispatch}</p>{items.map(r=><article key={r.id}><b data-i18n-raw>{r.name}</b><p>{formatDateDisplay(r.start_date)} ～ {formatDateDisplay(r.end_date)}</p><p data-i18n-raw>{r.reason}</p><button disabled={busy||r.account_id===account.id||r.employee_id===account.employeeId} onClick={()=>decide(r.id,'approved')}>{w.approve}</button><button disabled={busy||r.account_id===account.id||r.employee_id===account.employeeId} onClick={()=>decide(r.id,'rejected')}>{w.reject}</button></article>)}{error&&<CenteredNotice onClose={()=>setError('')}>{w[error]||w.failed}</CenteredNotice>}</section>
}

export function LeaveRecords(){
 const{language}=useI18n(),w=words[language]||words.en,ref=useRef(null),[items,setItems]=useState([]),[error,setError]=useState(''),[filters,setFilters]=useState({}),[menu,setMenu]=useState(null),[sort,setSort]=useState(null)
 const labels=({zh:['申请日期','员工','状态','审批日期'],en:['Requested','Employee','Status','Reviewed'],ms:['Tarikh permohonan','Pekerja','Status','Tarikh semakan']})[language]||[]
 useEffect(()=>{let active=true;const load=()=>apiRequest('/api/leave/requests?scope=all').then(r=>{if(active)setItems(r.items)}).catch(e=>{if(active)setError(e.code||'failed')});load();const timer=setInterval(load,30000);return()=>{active=false;clearInterval(timer)}},[])
 const date=v=>v?new Date(v).toLocaleDateString('en-GB',{timeZone:'Asia/Kuching'}):'—'
 const columns=[['requested_at',labels[0]],['name',labels[1]],['start_date',w.start],['end_date',w.end],['reason',w.reason],['status',labels[2]],['reviewed_at',labels[3]]]
 const value=(r,k)=>k==='status'?w[r.status]:k.endsWith('_at')?date(r[k]):k.endsWith('_date')?formatDateDisplay(r[k]):r[k]||'—'
 const visible=items.filter(r=>Object.entries(filters).every(([k,v])=>v==null||v.includes(String(r[k]||''))))
 if(sort)visible.sort((a,b)=>String(a[sort.key]||'').localeCompare(String(b[sort.key]||''),undefined,{numeric:true})*(sort.direction==='desc'?-1:1))
 return <section className="page"><DataExportButton name={w.history} rows={visible} columns={columns.map(([key,label])=>({key,label,value:r=>value(r,key)}))}/><div className="attendance-table-scroll" ref={ref}><table className="attendance-table"><thead><tr>{columns.map(([key,label])=><FilterHeader key={key} label={label} value={filters[key]??null} options={[...new Set(items.map(r=>String(r[key]||'')))].sort().map(v=>({value:v,label:value({[key]:v},key)}))} onChange={v=>setFilters(f=>({...f,[key]:v}))} open={menu===key} onOpen={()=>setMenu(key)} onClose={()=>setMenu(null)} sortDirection={sort?.key===key?sort.direction:null} onSort={direction=>setSort(direction?{key,direction}:null)}/>)}</tr></thead><tbody>{visible.map(r=><tr key={r.id}>{columns.map(([key])=><td key={key} data-i18n-raw>{value(r,key)}</td>)}</tr>)}</tbody></table></div><TableBottomScroll scrollRef={ref}/>{!visible.length&&<p>{w.empty}</p>}{error&&<CenteredNotice onClose={()=>setError('')}>{w[error]||w.failed}</CenteredNotice>}</section>
}

export function UpcomingLeaveCard({account,onOpen}){
 const{language}=useI18n(),w=words[language]||words.en,[data,setData]=useState(null),[failed,setFailed]=useState(false),[now,setNow]=useState(()=>new Date()),allowed=['owner_admin','operations_admin','supervisor'].includes(account?.role)
 const label=({zh:{title:'七天内请假',empty:'七天内暂无请假',failed:'请假提醒暂时无法加载'},en:{title:'Leave within 7 days',empty:'No leave within 7 days',failed:'Leave reminder unavailable'},ms:{title:'Cuti dalam 7 hari',empty:'Tiada cuti dalam 7 hari',failed:'Peringatan cuti tidak tersedia'}})[language]||{}
 useEffect(()=>{if(!allowed)return;let active=true;const load=()=>{setNow(new Date());apiRequest('/api/leave/requests?scope=all').then(r=>{if(active){setData(r.items);setFailed(false)}}).catch(()=>{if(active)setFailed(true)})};load();const timer=setInterval(load,30000);window.addEventListener('focus',load);window.addEventListener('kcs-leave-updated',load);return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',load);window.removeEventListener('kcs-leave-updated',load)}},[account?.id,allowed])
 if(!allowed)return null
 const countdown=r=>{const days=leaveDaysUntil(r.start_date,now);return language==='zh'?(days>0?`还有 ${days} 天`:days===0?'今天开始':'请假中'):language==='ms'?(days>0?`${days} hari lagi`:days===0?'Bermula hari ini':'Sedang bercuti'):(days>0?`In ${days} day${days===1?'':'s'}`:days===0?'Starts today':'On leave')}
 const rows=upcomingLeave(data||[],now)
 return <button type="button" className={'upcoming-leave-card'+(rows.length?' has-leave':'')} onClick={onOpen}><strong>{label.title}{data&&!failed?' · '+rows.length:''}</strong>{failed?<span>{label.failed}</span>:data===null?<span>{w.loading}</span>:!rows.length?<span>{label.empty}</span>:rows.map(r=><span className="upcoming-leave-row" key={r.id}><span data-i18n-raw>{r.name}</span><span>{formatDateDisplay(r.start_date)} ～ {formatDateDisplay(r.end_date)} · {w[r.status]} · <strong>{countdown(r)}</strong></span></span>)}</button>
}
