import {isNumericColumn} from './numericColumns.js'
import RecordActionIcon from './RecordActionIcon.jsx'
import './RecordIcons.css'
import {createPortal} from 'react-dom'
import {useEffect,useMemo,useRef,useState} from 'react'
import {apiRequest} from './apiClient.js'
import {useI18n} from './i18n.jsx'
import {kuchingDate} from '../shared/kuchingTime.js'
import {reportWord} from '../shared/dailyReportWords.js'
import {FilterHeader} from './ExpenseRecordsPage.jsx'
import ExpenseColumnOrder,{expenseColumnWords,normalizeExpenseOrder} from './ExpenseColumnOrder.jsx'
import TableBottomScroll from './TableBottomScroll.jsx'
import './ExpenseRecordsPage.css'
import './DailyReport.css'
const keys=['name','kind','status','quantity','amountCents','actor','time']
export function reportTime(value){if(!value)return '—';const d=new Date(/[zZ]|[+-]\d\d:\d\d$/.test(value)?value:String(value).replace(' ','T')+'Z');return Number.isNaN(+d)?String(value):new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Kuching',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(d)}
const metricSections={weightKg:'goods',trips:'vehicles',plannedBranches:'stops',collectedBranches:'stops',noGoodsBranches:'stops',pendingBranches:'stops',cancelledBranches:'stops',cashCents:'bills',creditCents:'bills',purchaseCents:'bills',voidCents:'bills',expenseCents:'expenses',topupCents:'topups',salesCents:'sales',deliveredKg:'deliveries',pendingApprovals:'approvals',changedBranches:'changes',rescheduledBranches:'reschedules'}
export function reportSelection(data,key,metric=true){
 const section=metric?(metricSections[key]||key):key
 let rows=data.sections[section]||[]
 if(metric){
  if(key==='noGoodsBranches')rows=rows.filter(r=>r.status==='no_goods')
  if(key==='pendingBranches')rows=rows.filter(r=>!['completed','no_goods','cancelled','superseded'].includes(r.status))
  if(key==='cancelledBranches')rows=rows.filter(r=>r.status==='cancelled')
  if(key==='plannedBranches')rows=rows.filter(r=>!['cancelled','superseded'].includes(r.status))
  if(key==='collectedBranches')rows=rows.filter(r=>r.detail?.hasIssuedBill)
  if(['cashCents','creditCents','purchaseCents'].includes(key))rows=rows.filter(r=>r.status==='issued'&&(key==='purchaseCents'||r.detail?.payment===(key==='cashCents'?'Cash':'Credit')))
  if(key==='voidCents')rows=rows.filter(r=>r.status==='voided')
  if(['expenseCents','topupCents'].includes(key))rows=rows.filter(r=>r.status!=='voided')
  if(key==='pendingApprovals')rows=rows.filter(r=>r.status==='pending')
  if(key==='approvals')rows=rows.filter(r=>reportTime(r.detail?.reviewedAt).slice(0,10)===data.date)
  if(['vehicles','trips'].includes(key))rows=rows.filter(r=>r.status==='running')
 }
 return{section,rows}
}
const vehicleMetrics=['vehicles','plannedBranches','collectedBranches','noGoodsBranches','pendingBranches','cancelledBranches','weightKg','trips']
export default function DailyReport({account}){
 const {language}=useI18n(),w=k=>reportWord(language,k),[open,setOpen]=useState(false),[date,setDate]=useState(kuchingDate),[data,setData]=useState(null),[error,setError]=useState(''),[refresh,setRefresh]=useState(0),[selection,setSelection]=useState(null),[target,setTarget]=useState(2000),[columnToolbar,setColumnToolbar]=useState(null)
 const reportRef=useRef(null),openRef=useRef(null)
 useEffect(()=>{
  if(!open)return
  let start=null
  const nested=()=>document.querySelector('.daily-report-overlay,.expense-column-modal,.expense-filter-menu,[aria-modal="true"]')
  const down=e=>{start=e.button===0?{x:e.clientX,y:e.clientY,target:e.target}:null}
  const up=e=>{
   const first=start;start=null
   if(!first||Math.hypot(e.clientX-first.x,e.clientY-first.y)>6||nested()||window.getSelection()?.toString())return
   if(reportRef.current?.contains(first.target)||reportRef.current?.contains(e.target))return
   if(e.target.closest('button,a,input,select,textarea,label,[role="button"],[role="menu"],[role="dialog"]'))return
   if(e.target.matches('div,section,main,header,footer,aside,body'))setOpen(false)
  }
  const key=e=>{if(e.key==='Escape'&&!nested()){setOpen(false);setTimeout(()=>openRef.current?.focus({preventScroll:true}),0)}}
  const cancel=()=>{start=null}
  document.addEventListener('pointerdown',down);document.addEventListener('pointerup',up);document.addEventListener('pointercancel',cancel);document.addEventListener('scroll',cancel,true);document.addEventListener('keydown',key)
  return()=>{document.removeEventListener('pointerdown',down);document.removeEventListener('pointerup',up);document.removeEventListener('pointercancel',cancel);document.removeEventListener('scroll',cancel,true);document.removeEventListener('keydown',key)}
 },[open])
 useEffect(()=>{setSelection(null);if(!open)return;let active=true;setData(null);setError('');apiRequest('/api/daily-report?date='+encodeURIComponent(date)).then(r=>{if(active)setData(r)}).catch(()=>{if(active)setError(w('failed'))});return()=>{active=false}},[open,date,refresh,language])
 let chosen=data&&selection?reportSelection(data,selection.key,selection.metric):null
 if(chosen&&selection.vehicleId!=null){const id=String(selection.vehicleId);chosen=['vehicles','weightKg','trips'].includes(selection.key)?{section:'vehicles',rows:data.sections.vehicles.filter(r=>r.id===id)}:{...chosen,rows:chosen.rows.filter(r=>String(r.detail?.vehicleId)===id)}}
 const metricTargets=new Set(Object.keys(data?.summary||{}).map(k=>metricSections[k]||k))
 return <section className="daily-report" ref={reportRef}>
  <header><h2>{w('title')}</h2>{open?<div className="daily-report-actions"><span className="daily-report-column-slot" ref={setColumnToolbar}/><button type="button" className="record-icon-button daily-report-refresh" title={w('refresh')} aria-label={w('refresh')} onClick={()=>setRefresh(v=>v+1)}><RecordActionIcon kind="refresh-single"/></button></div>:<button ref={openRef} onClick={()=>setOpen(true)} aria-expanded={false}>{w('open')}</button>}</header>
  {open&&<><div className="daily-report-controls"><label>{w('date')}<input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><label>{w('target')}<input type="number" min="1" step="100" value={target} onChange={e=>setTarget(e.target.value)}/></label></div>
   {error?<p role="alert">{error}</p>:!data||data.date!==date?<p role="status">{w('loading')}</p>:<>
    <p>{w(data.access.full?'full':data.access.finance?'finance':'operations')} · {w('saved')}: {reportTime(data.generatedAt)}</p>
    <VehicleMatrix toolbarTarget={columnToolbar} data={data} w={w} language={language} account={account} onSelect={setSelection}/>
    <dl className="daily-report-summary daily-report-unified" aria-label={w('title')}>
     {Object.entries(data.summary).filter(([k])=>!vehicleMetrics.includes(k)).map(([k,v])=><div key={k}><dt>{w(k)}</dt><dd><button aria-label={w(k)+' · '+w('details')} aria-haspopup="dialog" onClick={()=>setSelection({key:k,metric:true})}><strong>{k.endsWith('Cents')?'RM '+(v/100).toFixed(2):Number(v).toLocaleString(undefined,{minimumFractionDigits:k.toLowerCase().includes('weight')?2:0,maximumFractionDigits:2})}</strong></button></dd></div>)}
     {Object.keys(data.sections).filter(k=>!metricTargets.has(k)&&k!=='vehicles').map(k=><div key={'section-'+k}><dt>{w(k)}</dt><dd><button aria-label={w(k)+' · '+w('details')} aria-haspopup="dialog" onClick={()=>setSelection({key:k,metric:false})}><strong>{data.sections[k].length}</strong></button></dd></div>)}
    </dl>
    <p>{w('pendingHint')}</p>{data.access.finance&&<p>{w('salesHint')}</p>}
    <p>{w('coverage')}</p>{data.missingSources.length>0&&<p role="status">{w('missing')}: {data.missingSources.join(', ')}</p>}
    {chosen&&<ReportDialog title={w(selection.key)} date={date} w={w} onClose={()=>setSelection(null)}>{dockRef=><ReportTable dockRef={dockRef} key={`${date}-${selection.key}`} rows={chosen.rows} section={chosen.section} finance={data.access.finance} w={w} language={language} target={Number(target)} account={account}/>}</ReportDialog>}
   </>}
  </>}
 </section>
}
function VehicleMatrix({data,w,language,account,onSelect,toolbarTarget}){
 const vehicles=data.sections.vehicles||[],ids=vehicles.map(r=>r.id),storage=`kcs.daily-report.vehicle-columns.${account?.id}`
 const [saved,setSaved]=useState(()=>{try{return JSON.parse(localStorage.getItem(storage))}catch{return []}}),[arrange,setArrange]=useState(false),[menu,setMenu]=useState(null),[filters,setFilters]=useState({}),[sort,setSort]=useState({}),ref=useRef(null)
 const order=normalizeExpenseOrder(saved,ids),columns=['metric',...order,'total'],format=v=>v==null?'—':Number(v).toLocaleString(undefined,{minimumFractionDigits:k.toLowerCase().includes('weight')?2:0,maximumFractionDigits:2})
 const value=(key,column)=>{if(column==='metric')return w(key==='vehicles'?'departureStatus':key);if(column==='total')return format(data.summary[key]);const v=vehicles.find(v=>v.id===column);return key==='vehicles'?w(v.status):format(key==='weightKg'?v.quantity:v.detail?.[key])}
 const rows=vehicleMetrics.filter(key=>columns.every(c=>filters[c]==null||filters[c].includes(value(key,c))))
 if(sort.key)rows.sort((a,b)=>value(a,sort.key).localeCompare(value(b,sort.key),undefined,{numeric:true})*(sort.direction==='desc'?-1:1))
 const heading=c=>c==='metric'?w('metric'):c==='total'?w('total'):vehicles.find(v=>v.id===c)?.name
 return <div className="daily-report-matrix">
  {toolbarTarget&&createPortal(<button type="button" className="record-icon-button" title={expenseColumnWords[language]?.title||expenseColumnWords.en.title} aria-label={expenseColumnWords[language]?.title||expenseColumnWords.en.title} onClick={()=>setArrange(true)}><RecordActionIcon kind="columns"/></button>,toolbarTarget)}
  {arrange&&<ExpenseColumnOrder order={order} columns={ids.map(id=>[id,heading(id)])} w={expenseColumnWords[language]||expenseColumnWords.en} storageKey={storage} onSave={setSaved} onClose={()=>setArrange(false)}/>}
  <div className="archive-table" ref={ref}><table aria-label={w('title')}><thead><tr>{columns.map(c=><FilterHeader numeric={c!=='metric'} key={c} label={heading(c)} open={menu===c} onOpen={()=>setMenu(c)} onClose={()=>setMenu(null)} value={filters[c]??null} options={[...new Set(vehicleMetrics.map(k=>value(k,c)))].map(v=>({value:v,label:v}))} onChange={v=>setFilters(f=>({...f,[c]:v}))} sortDirection={sort.key===c?sort.direction:null} onSort={direction=>setSort(direction?{key:c,direction}:{})}/>)}</tr></thead><tbody>{rows.map(key=><tr key={key} data-metric={key}><th scope="row">{value(key,'metric')}</th>{[...order,'total'].map(c=><td data-numeric key={c} className={c==='total'?'daily-report-total':undefined}><button aria-label={`${heading(c)} · ${w(key)} · ${w('details')}`} aria-haspopup="dialog" onClick={()=>onSelect({key,metric:true,...(c==='total'?{}:{vehicleId:c})})}>{value(key,c)}</button></td>)}</tr>)}</tbody></table></div><TableBottomScroll scrollRef={ref}/><p>{w('vehicleTotalHint')}</p>
 </div>
}
function ReportDialog({title,date,w,onClose,children}){
 const ref=useRef(null),dockRef=useRef(null),closeRef=useRef(onClose);closeRef.current=onClose
 useEffect(()=>{
  const previous=document.activeElement,overflow=document.body.style.overflow
  document.body.style.overflow='hidden';ref.current.querySelector('button')?.focus()
  const key=e=>{
   if(document.querySelector('.expense-filter-menu,.expense-column-modal'))return
   if(e.key==='Escape'){e.preventDefault();closeRef.current();return}
   if(e.key==='Tab'){
    const nodes=[...ref.current.querySelectorAll('button:not(:disabled),input:not(:disabled),select,a[href],[tabindex="0"]')],first=nodes[0],last=nodes.at(-1)
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}
   }
  }
  document.addEventListener('keydown',key)
  return()=>{document.removeEventListener('keydown',key);document.body.style.overflow=overflow;previous?.focus?.({preventScroll:true})}
 },[])
 return createPortal(<div className="daily-report-overlay" onClick={e=>{if(e.target===e.currentTarget)onClose()}}><section className="daily-report daily-report-dialog" role="dialog" aria-modal="true" aria-labelledby="daily-report-detail-title" ref={ref}><header><h2 id="daily-report-detail-title">{title} · {date}</h2><button onClick={onClose}>{w('close')}</button></header><div className="daily-report-dialog-content">{children(dockRef)}</div><footer className="daily-report-scroll-dock" ref={dockRef}/></section></div>,document.body)
}

function Detail({value,w,field}){if(value==null||value==='')return <span>—</span>;if(typeof value==='boolean')return <span>{w(value?'yes':'no')}</span>;if(typeof value!=='object')return <span data-i18n-raw>{/(At|_at)$/.test(field||'')?reportTime(value):['status','payment','paymentStatus','scope','kind','source','change_type','entity_type'].includes(field)||value==='protected'?w(String(value)):String(value)}</span>;return <dl className="daily-report-detail">{Object.entries(value).filter(([,v])=>v!=null&&v!=='').map(([k,v])=><div key={k}><dt>{w(k)}</dt><dd><Detail value={v} w={w} field={k}/></dd></div>)}</dl>}
function ReportTable({rows,section,finance,w,language,target,account,dockRef}){
 const available=finance?keys:keys.filter(k=>k!=='amountCents'),storage=`kcs.daily-report.columns.${account?.id}.${section}`,[order,setOrder]=useState(()=>{try{return normalizeExpenseOrder(JSON.parse(localStorage.getItem(storage)),available)}catch{return available}}),[arrange,setArrange]=useState(false),[filters,setFilters]=useState({}),[sort,setSort]=useState({}),[menu,setMenu]=useState(null),[expanded,setExpanded]=useState(null),ref=useRef(null)
 useEffect(()=>{
  if(expanded==null)return
  const dialog=ref.current?.closest('.daily-report-dialog')
  const collapse=e=>{
   if(e.target.closest('button,input,select,textarea,a,[role="button"],.expense-filter-menu,.expense-column-modal,.daily-report-scroll-dock'))return
   if(window.getSelection()?.toString())return
   if(e.target.matches('section,header,div,table,tbody,tr,td,dl,dd'))setExpanded(null)
  }
  dialog?.addEventListener('click',collapse)
  return()=>dialog?.removeEventListener('click',collapse)
 },[expanded])
 const value=(row,k)=>k==='time'?reportTime(row[k]):k==='amountCents'?row[k]==null?'':(row[k]/100).toFixed(2):k==='quantity'?row[k]==null?'':Number(row[k]).toFixed(2):['kind','status'].includes(k)?w(String(row[k]??'')):String(row[k]??'')
 const visible=useMemo(()=>{const result=rows.filter(r=>available.every(k=>filters[k]==null||filters[k].includes(value(r,k))));if(sort.key)result.sort((a,b)=>{const k=sort.key;return (['quantity','amountCents'].includes(k)?Number(a[k])-Number(b[k]):value(a,k).localeCompare(value(b,k),undefined,{numeric:true}))*(sort.direction==='desc'?-1:1)});return result},[rows,filters,sort,language])
 return <><button type="button" className="record-icon-button" title={expenseColumnWords[language]?.title||expenseColumnWords.en.title} aria-label={expenseColumnWords[language]?.title||expenseColumnWords.en.title} onClick={()=>setArrange(true)}><RecordActionIcon kind="columns"/></button>{arrange&&<ExpenseColumnOrder order={order} columns={available.map(k=>[k,w(k)])} w={expenseColumnWords[language]||expenseColumnWords.en} storageKey={storage} onSave={setOrder} onClose={()=>setArrange(false)}/>}<div className="archive-table" ref={ref}><table><thead><tr>{order.map(k=><FilterHeader numeric={isNumericColumn(k)} key={k} label={w(k)} open={menu===k} onOpen={()=>setMenu(k)} onClose={()=>setMenu(null)} value={filters[k]??null} options={[...new Set(rows.map(r=>value(r,k)))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})).map(v=>({value:v,label:v||'—'}))} onChange={v=>setFilters(f=>({...f,[k]:v}))} sortDirection={sort.key===k?sort.direction:null} onSort={direction=>setSort(direction?{key:k,direction}:{})}/>)}</tr></thead><tbody>{visible.map(r=><ReportRows key={r.id} row={r} order={order} value={value} expanded={expanded===r.id} toggle={()=>setExpanded(expanded===r.id?null:r.id)} w={w} section={section} target={target}/>)}</tbody></table>{!visible.length&&<p>{w('empty')}</p>}</div><TableBottomScroll scrollRef={ref} dockRef={dockRef}/></>
}
function ReportRows({row,order,value,expanded,toggle,w,section,target}){return <><tr>{order.map(k=><td data-numeric={isNumericColumn(k) || undefined} key={k}>{k==='name'?<><button className="daily-report-name" onClick={toggle} aria-expanded={expanded}>{value(row,k)||'—'} {expanded?'▴':'▾'}</button>{typeof row.detail?.reason==='string'&&row.detail.reason.trim()&&<div className="daily-report-row-reason"><strong>{w(row.detail.requestedAt?'requestReason':'reason')}: </strong><span data-i18n-raw>{row.detail.reason}</span></div>}{['reviewReason','sourceDate','approvedDate'].map(field=>row.detail?.[field]?<div className="daily-report-row-reason" key={field}><strong>{w(field)}: </strong><span data-i18n-raw>{row.detail[field]}</span></div>:null)}</>:value(row,k)||'—'}</td>)}</tr>{expanded&&<tr><td colSpan={order.length}>{section==='vehicles'&&target>0&&<p>{w('achievement')}: {(row.quantity/target*100).toFixed(1)}% · {w(row.quantity>=target?'met':'notMet')} ({target} kg)</p>}<Detail value={row.detail} w={w}/></td></tr>}</>}
