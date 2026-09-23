import {isNumericColumn} from './numericColumns.js'
import {Fragment,useRef,useState} from 'react'
import {useI18n} from './i18n.jsx'
import {FilterHeader} from './ExpenseRecordsPage.jsx'
import TableBottomScroll from './TableBottomScroll.jsx'
import './ExpenseRecordsPage.css'
const columns=[['createdAt','notice.date'],['title','notice.heading'],['priority','notice.priority'],['publisherName','notice.publisher'],['recipientCount','notice.recipientCount'],['readCount','notice.readCount'],['unreadCount','notice.unreadCount']]
const numeric=new Set(['recipientCount','readCount','unreadCount'])
const natural=new Intl.Collator(undefined,{numeric:true,sensitivity:'base'})
const dateLabel=value=>new Date(value).toLocaleString('en-GB',{timeZone:'Asia/Kuching',day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'})
export default function NoticeArchive({items,renderDetail}){
 const{t}=useI18n(),[filters,setFilters]=useState({}),[sort,setSort]=useState({}),[openFilter,setOpenFilter]=useState(null),[expanded,setExpanded]=useState(null),scrollRef=useRef(null)
 const rows=items.map(i=>({...i,unreadCount:Number(i.recipientCount)-Number(i.readCount)}))
 const label=(key,value)=>value===''?t('notice.blank'):key==='createdAt'?dateLabel(value):key==='priority'?t('notice.'+value):String(value)
 const compare=(key,a,b)=>key==='createdAt'?Date.parse(a)-Date.parse(b):numeric.has(key)?Number(a)-Number(b):natural.compare(label(key,a),label(key,b))
 const displayed=rows.filter(r=>Object.entries(filters).every(([key,values])=>values==null||values.includes(String(r[key]??'')))).sort((a,b)=>sort.key?(compare(sort.key,a[sort.key],b[sort.key])*(sort.direction==='desc'?-1:1)||b.id-a.id):b.id-a.id)
 return <div className="notice-archive"><div className="archive-table" ref={scrollRef}><table><thead><tr>{columns.map(([key,title])=>{const values=[...new Set(rows.map(r=>String(r[key]??'')))].filter(Boolean).sort((a,b)=>compare(key,a,b));return <FilterHeader numeric={isNumericColumn(key)} key={key} label={t(title)} value={filters[key]??null} options={['',...values].map(value=>({value,label:label(key,value)}))} onChange={value=>setFilters(f=>({...f,[key]:value}))} sortDirection={sort.key===key?sort.direction:null} onSort={direction=>setSort(direction?{key,direction}:{})} open={openFilter===key} onOpen={()=>setOpenFilter(key)} onClose={()=>setOpenFilter(null)}/>})}</tr></thead><tbody>{displayed.map(item=><Fragment key={item.id}><tr><td>{dateLabel(item.createdAt)}</td><td><button type="button" className="notice-title-link" aria-expanded={expanded===item.id} onClick={()=>setExpanded(expanded===item.id?null:item.id)} data-i18n-raw>{item.title}</button></td><td><span className={'notice-priority '+item.priority}>{t('notice.'+item.priority)}</span></td><td data-i18n-raw>{item.publisherName}</td><td data-numeric>{item.recipientCount}</td><td data-numeric>{item.readCount}</td><td data-numeric>{item.unreadCount}</td></tr>{expanded===item.id&&<tr><td colSpan={columns.length} className="notice-expanded">{renderDetail(item)}</td></tr>}</Fragment>)}</tbody></table>{!displayed.length&&<p className="archive-empty">{t('notice.noMatches')}</p>}</div><TableBottomScroll scrollRef={scrollRef}/></div>
}
