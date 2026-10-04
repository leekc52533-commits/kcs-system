import {useRef,useState} from 'react'
import {useI18n} from './i18n.jsx'
import {formatCustomerId} from '../shared/typedIds.js'
import {groupNumber} from './numberDisplay.js'
import {FilterHeader} from './ExpenseRecordsPage.jsx'
import ExpenseColumnOrder,{expenseColumnWords,normalizeExpenseOrder} from './ExpenseColumnOrder.jsx'
import DataExportButton from './DataExportButton.jsx'
import TableBottomScroll from './TableBottomScroll.jsx'
import './ExpenseRecordsPage.css'

const columns=[['customerId','list.customerId'],['customerName','list.customerName'],['status','list.status'],['branchCount','list.branchCount']]
const columnWidths={customerId:120,customerName:240,status:140,branchCount:120}
const keys=columns.map(([key])=>key)
const natural=new Intl.Collator(undefined,{numeric:true,sensitivity:'base'})
const raw=(row,key)=>key==='branchCount'?String(row[key]??0):String(row[key]??'')

export default function CustomerMasterTable({items,loading,onOpen,preferenceId}){
 const{t,language}=useI18n(),scrollRef=useRef(null),[filters,setFilters]=useState({}),[sort,setSort]=useState({}),[open,setOpen]=useState(null),[showOrder,setShowOrder]=useState(false)
 const storageKey=`kcs.customer-master.columns.${preferenceId||'default'}`
 const[order,setOrder]=useState(()=>{try{return normalizeExpenseOrder(JSON.parse(localStorage.getItem(storageKey)),keys)}catch{return keys}})
 const w=expenseColumnWords[language]||expenseColumnWords.en
 const label=(key,value)=>value===''?t('notice.blank'):key==='customerId'?formatCustomerId(value):key==='status'?t('common.'+value):key==='branchCount'?groupNumber(value):value
 const compare=(key,a,b)=>key==='branchCount'?Number(a)-Number(b):natural.compare(label(key,a),label(key,b))
 const displayed=items.filter(row=>Object.entries(filters).every(([key,values])=>values==null||values.includes(raw(row,key)))).sort((a,b)=>sort.key?compare(sort.key,raw(a,sort.key),raw(b,sort.key))*(sort.direction==='desc'?-1:1):0)
 return <>
  <DataExportButton name={t('list.customerMasterTitle')} disabled={loading} rows={displayed} columns={order.map(key=>({key,label:t(columns.find(c=>c[0]===key)[1]),value:row=>key==='branchCount'?Number(row[key]??0):label(key,raw(row,key))}))}/>
  <div className="customer-table-tools"><button type="button" className="expense-column-toggle" title={w.title} aria-label={w.title} onClick={()=>setShowOrder(true)}>☷</button></div>
  {showOrder&&<ExpenseColumnOrder order={order} columns={columns.map(([key,title])=>[key,t(title)])} w={w} storageKey={storageKey} onSave={setOrder} onClose={()=>setShowOrder(false)}/>}
  <div className="customer-master-table archive-table" ref={scrollRef} aria-busy={loading}>
   {loading?<div className="data-loading">{t('common.loadingData')}</div>:<table><colgroup>{order.map(key=><col key={key} style={{width:columnWidths[key]}}/>)}</colgroup><thead><tr>{order.map(key=>{
    const values=[...new Set(items.map(row=>raw(row,key)))].filter(Boolean).sort((a,b)=>compare(key,a,b))
    return <FilterHeader key={key} numeric={key==='branchCount'} label={t(columns.find(c=>c[0]===key)[1])} value={filters[key]??null} options={['',...values].map(value=>({value,label:label(key,value)}))} onChange={value=>setFilters(current=>({...current,[key]:value}))} sortDirection={sort.key===key?sort.direction:null} onSort={direction=>setSort(direction?{key,direction}:{})} open={open===key} onOpen={()=>setOpen(key)} onClose={()=>setOpen(null)}/>
   })}</tr></thead><tbody>{displayed.map(item=><tr key={item.customerId}>{order.map(key=><td key={key} data-numeric={key==='branchCount'||undefined}>{key==='customerName'?<button type="button" className="entity-name-link" onClick={()=>onOpen(item)} data-i18n-raw>{item.customerName}</button>:key==='status'?<span className={`master-status ${item.status}`}>{label(key,raw(item,key))}</span>:<span data-i18n-raw>{label(key,raw(item,key))}</span>}</td>)}</tr>)}</tbody></table>}
   {!loading&&!displayed.length&&<p className="archive-empty">{t('list.noResults')}</p>}
  </div><TableBottomScroll scrollRef={scrollRef}/>
 </>
}
