import UnloadingCorrections from './UnloadingCorrections.jsx'
import {unloadingCorrectionWords} from '../shared/unloadingCorrectionWords.js'
import ExpenseColumnOrder,{expenseColumnWords,normalizeExpenseOrder} from './ExpenseColumnOrder.jsx'
import {useEffect,useRef,useState} from 'react'
import {useI18n} from './i18n.jsx'
import {apiRequest} from './apiClient.js'
import BackButton from './BackButton.jsx'
import TableBottomScroll from './TableBottomScroll.jsx'
import {FilterHeader} from './ExpenseRecordsPage.jsx'
import {unloadingColumns,unloadingLabels,unloadingStatus} from '../shared/unloadingArchive.js'
import './ExpenseRecordsPage.css'
import './PurchaseBillsPage.css'
import './UnloadingArchivePage.css'
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kuching',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
export default function UnloadingArchivePage({onBack}){
 const {t,language}=useI18n(),lang=unloadingLabels[language]?language:'en',ref=useRef(null)
 const w=unloadingCorrectionWords[lang],orderKey='kcs.unloading-column-order.v1'
 const[correction,setCorrection]=useState(null),[showOrder,setShowOrder]=useState(false),[order,setOrder]=useState(()=>{try{return normalizeExpenseOrder(JSON.parse(localStorage.getItem(orderKey)),unloadingColumns)}catch{return unloadingColumns}})
 const [range,setRange]=useState({from:'',to:''}),[filters,setFilters]=useState({}),[sort,setSort]=useState({}),[open,setOpen]=useState(null),[data,setData]=useState(null),[error,setError]=useState(''),[refresh,setRefresh]=useState(0),[download,setDownload]=useState(false),[exportRange,setExportRange]=useState({from:today(),to:today()})
 const query=new URLSearchParams({...range,columns:JSON.stringify(filters),sortKey:sort.key||'',sortDirection:sort.direction||''}).toString()
 useEffect(()=>{let active=true;setError('');setData(null);apiRequest('/api/unloading-archive?'+query).then(d=>{if(active)setData(d)}).catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[query,refresh])
 const display=(key,value)=>value==null||value===''?'—':key==='status'?unloadingStatus[lang][value]:key==='date'?value.slice(8)+'-'+value.slice(5,7)+'-'+value.slice(2,4):value
 return <div className="page purchase-archive expense-records unloading-archive">
 <div className="expense-toolbar"><BackButton iconOnly fallback={onBack}/><h2>{t('unloading.title')}</h2><button className="unloading-download" title={t('unloading.download')} aria-label={t('unloading.download')} aria-expanded={download} onClick={()=>{setExportRange({from:range.from||today(),to:range.to||today()});setDownload(!download);setOpen(null)}}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M4 15v6h16v-6"/></svg></button>{data?.canCorrect&&<button className="record-icon-button" title={w.title} aria-label={w.title} onClick={()=>setCorrection('')}>✎</button>}<button className="record-icon-button" title={expenseColumnWords[lang].title} aria-label={expenseColumnWords[lang].title} onClick={()=>setShowOrder(true)}>☷</button><button onClick={()=>setRefresh(n=>n+1)}>{t('void.refresh')}</button></div>
 {correction!==null&&<UnloadingCorrections initialCode={correction} onClose={()=>setCorrection(null)} onSaved={()=>setRefresh(n=>n+1)}/>}
 {showOrder&&<ExpenseColumnOrder storageKey={orderKey} order={order} columns={unloadingColumns.map((k,i)=>[k,unloadingLabels[lang][i]])} w={expenseColumnWords[lang]} onSave={setOrder} onClose={()=>setShowOrder(false)}/>}
 {download&&<form className="expense-toolbar" onSubmit={e=>{e.preventDefault();window.location.href='/api/unloading-archive/export.xlsx?'+new URLSearchParams({...exportRange,order:JSON.stringify(order),columns:JSON.stringify(filters),sortKey:sort.key||'',sortDirection:sort.direction||'',language:lang});setDownload(false)}}>{['from','to'].map(k=><label key={k}>{t('sales.'+k)}<input required type="date" value={exportRange[k]} min={k==='to'?exportRange.from:undefined} max={k==='from'?exportRange.to:undefined} onChange={e=>setExportRange({...exportRange,[k]:e.target.value})}/></label>)}<button>{t('cf.export')}</button><button type="button" onClick={()=>setDownload(false)}>{t('sales.cancel')}</button></form>}
 <div className="expense-toolbar">{['from','to'].map(k=><label key={k}>{t('sales.'+k)}<input type="date" value={range[k]} min={k==='to'?range.from:undefined} max={k==='from'?range.to:undefined} onChange={e=>setRange({...range,[k]:e.target.value})}/></label>)}<button onClick={()=>{setRange({from:'',to:''});setFilters({});setSort({});setOpen(null)}}>{t('unloading.reset')}</button></div>
 {error&&<p role="alert" className="data-error">{error}</p>}{!data&&!error&&<p>{t('void.loading')}</p>}
 <div className="archive-table" ref={ref}><table><thead><tr>{order.map(k=><FilterHeader key={k} label={unloadingLabels[lang][unloadingColumns.indexOf(k)]} open={open===k} onOpen={()=>setOpen(k)} onClose={()=>setOpen(null)} value={filters[k]??null} options={(data?.filterOptions[k]||['']).map(v=>({value:v,label:v===''?t('sales.blank'):display(k,v)}))} onChange={v=>setFilters({...filters,[k]:v})} sortDirection={sort.key===k?sort.direction:null} onSort={direction=>setSort(direction?{key:k,direction}:{})}/>)}</tr></thead><tbody>{data?.items.map(row=><tr key={row.id}>{order.map(k=><td key={k} data-i18n-raw>{k==='correctedCount'?row.correctedCount>0?<button title={w.history} onClick={()=>setCorrection(row.code)}>{w.marker} ({row.correctedCount})</button>:'—':k==='code'?<a href={row.photoUrl} title={t('unloading.photo')} target="_blank" rel="noreferrer">{row.code}</a>:display(k,row[k])}</td>)}</tr>)}</tbody></table>{data&&!data.items.length&&<p className="archive-empty">{t('unloading.empty')}</p>}</div><TableBottomScroll scrollRef={ref}/></div>
}
