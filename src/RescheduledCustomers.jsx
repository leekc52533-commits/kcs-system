import {useEffect,useRef,useState} from 'react'
import {useI18n} from './i18n.jsx'
import {apiRequest} from './apiClient.js'
import {FilterHeader} from './ExpenseRecordsPage.jsx'
import TableBottomScroll from './TableBottomScroll.jsx'
import CenteredNotice from './CenteredNotice.jsx'
import './RescheduledCustomers.css'
const copy={
 zh:{title:'曾改期客户',total:'曾改期客户总数',branchName:'分店',route:'路线',count:'改期次数',empty:'没有符合条件的曾改期客户',loading:'正在读取客户…',retry:'刷新',blocked:'此客户当天已有任务，当前不能转给支援车。'},
 en:{title:'Rescheduled customers',total:'Total rescheduled customers',branchName:'Branch',route:'Route',count:'Date changes',empty:'No matching rescheduled customers',loading:'Loading customers…',retry:'Refresh',blocked:'This customer already has work on this date and cannot currently be transferred.'},
 ms:{title:'Pelanggan pernah tukar tarikh',total:'Jumlah pelanggan pernah tukar tarikh',branchName:'Cawangan',route:'Laluan',count:'Bilangan tukar tarikh',empty:'Tiada pelanggan sepadan yang pernah tukar tarikh',loading:'Memuatkan pelanggan…',retry:'Muat semula',blocked:'Pelanggan ini sudah mempunyai tugasan pada tarikh ini dan belum boleh dipindahkan.'}
}
const keys=['branchName','route','count'],natural=new Intl.Collator(undefined,{numeric:true,sensitivity:'base'})
export default function RescheduledCustomers({date,selection,disabled=false}){
 const{language}=useI18n(),m=copy[language]||copy.en,scrollRef=useRef(null)
 const[data,setData]=useState({priority:[],items:[],routes:[]}),[loading,setLoading]=useState(true),[error,setError]=useState(''),[reload,setReload]=useState(0),[filters,setFilters]=useState({}),[sort,setSort]=useState({key:'count',direction:'desc'}),[open,setOpen]=useState(null)
 useEffect(()=>{let active=true;setLoading(true);setError('');apiRequest(`/api/dispatch/day/${date}/support-customers`).then(r=>{if(active)setData(r)}).catch(e=>{if(active)setError(e.message)}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[date,reload])
 const rows=(data.priority||[]).map(b=>({...b,route:b.routeNumbers.map(n=>selection?.routes.find(r=>r.routeNumber===n)?.name||data.routes.find(r=>r.routeNumber===n)?.name||String(n)).join(' / ')}))
 const compare=(key,a,b)=>key==='count'?Number(a)-Number(b):natural.compare(a,b)
 const shown=rows.filter(b=>Object.entries(filters).every(([key,values])=>values==null||values.includes(String(b[key]??'')))).sort((a,b)=>sort.key?compare(sort.key,a[sort.key],b[sort.key])*(sort.direction==='desc'?-1:1)||natural.compare(a.branchName,b.branchName):0)
 const choice=b=>{const stop=selection?.routes.flatMap(r=>r.stops).find(s=>s.id===b.stopId),extra=data.items.find(s=>s.id===b.id);return{stop,extra,allowed:b.stopId?Boolean(stop&&['locked','available'].includes(stop.status)&&!stop.hasBill&&!stop.arrivedAt&&!stop.completedAt):Boolean(extra)}}
 const toggle=(b,checked)=>{const{extra}=choice(b);if(b.stopId)selection.setStops(ids=>checked?[...new Set([...ids,b.stopId])]:ids.filter(id=>id!==b.stopId));else selection.setOtherCustomers(items=>checked?items.some(s=>s.id===b.id)?items:[...items,extra]:items.filter(s=>s.id!==b.id))}
 return <section className="rescheduled-customers"><header><strong>{m.total}{language==='zh'?'：':': '}{loading?'…':shown.length.toLocaleString('en-MY')}</strong><button type="button" disabled={loading||disabled} onClick={()=>setReload(n=>n+1)}>{m.retry}</button></header>{error&&<CenteredNotice>{error}</CenteredNotice>}{loading?<p role="status">{m.loading}</p>:<><div className="archive-table" ref={scrollRef}><table><thead><tr>{keys.map(key=><FilterHeader key={key} label={m[key]} numeric={key==='count'} value={filters[key]??null} options={['',...new Set(rows.map(b=>String(b[key]??'')).filter(Boolean))].sort((a,b)=>compare(key,a,b)).map(value=>({value,label:value}))} onChange={value=>setFilters(v=>({...v,[key]:value}))} sortDirection={sort.key===key?sort.direction:null} onSort={direction=>setSort(direction?{key,direction}:{})} open={open===key} onOpen={()=>setOpen(key)} onClose={()=>setOpen(null)}/>)}</tr></thead><tbody>{shown.map(b=><tr key={b.id}><td>{selection?<label className="support-option" title={choice(b).allowed?'':m.blocked}><input type="checkbox" disabled={disabled||!choice(b).allowed} checked={b.stopId?selection.stops.includes(b.stopId):selection.otherCustomers.some(s=>s.id===b.id)} onChange={e=>toggle(b,e.target.checked)}/><span data-i18n-raw>{b.branchName||b.branchCode}</span></label>:<span data-i18n-raw>{b.branchName||b.branchCode}</span>}</td><td data-i18n-raw>{b.route||'—'}</td><td data-numeric>{b.count}</td></tr>)}</tbody></table>{!shown.length&&<p>{m.empty}</p>}</div><TableBottomScroll scrollRef={scrollRef}/></>}</section>
}
