import {formatWeight,formatUnitPrice} from '../shared/measurePrecision.js'
import RecordDownloadIcon from './RecordDownloadIcon.jsx'
import CustomerReceipt,{customerReceiptLabels} from './CustomerReceipt.jsx'
import ProofViewer from './ProofViewer.jsx'
import UnloadingArchivePage from './UnloadingArchivePage.jsx'
import BackButton from './BackButton.jsx'
import TableBottomScroll from './TableBottomScroll.jsx'
import {FilterHeader} from './ExpenseRecordsPage.jsx'
import {useUi,useI18n} from './i18n.jsx'
import './ExpenseRecordsPage.css'
import {useEffect,useMemo,useRef,useState} from 'react'
import {apiRequest} from './apiClient.js'
import './PurchaseBillsPage.css'
import './WeightRecords.css'

const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kuching',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
const firstOfMonth=()=>`${today().slice(0,7)}-01`
const money=cents=>`RM ${(Number(cents||0)/100).toFixed(2)}`
const displayDate=value=>{const match=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(value||''));return match?`${match[3]}-${match[2]}-${match[1].slice(-2)}`:String(value||'')}
const displayDateTime=value=>{const date=displayDate(value),time=String(value||'').match(/T(\d{2}:\d{2})/)?.[1];return time?`${date} ${time}`:date}
const columns=[['serviceDateLabel','Date'],['billNumber','PO No.'],['paymentMethod','Payment Method'],['customerName','Customer Name'],['branchName','Branch'],['issuedBy','Issued By'],['crew','Crew'],['car','Car'],['totalLabel','Total'],['proofLabel','Payment Proof'],['customerReceipt','Customer receipt'],['statusLabel','Status']]

export default function PurchaseBillsPage({onBack}){
  const {language}=useI18n(),ui=useUi(),tableRef=useRef(null),[openFilter,setOpenFilter]=useState(null)
  const[filters,setFilters]=useState({from:firstOfMonth(),to:today(),search:'',paymentMethod:'',employeeId:''}),[columnFilters,setColumnFilters]=useState({}),[sort,setSort]=useState({}),[data,setData]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(false),[open,setOpen]=useState(null),[showWeights,setShowWeights]=useState(false)
  const query=useMemo(()=>new URLSearchParams(Object.entries({...filters,columns:JSON.stringify(columnFilters),sortKey:sort.key,sortDirection:sort.direction}).filter(([,value])=>value)).toString(),[filters,columnFilters,sort])
  useEffect(()=>{let active=true;setLoading(true);setError('');apiRequest(`/api/purchase-bills?${query}`).then(result=>active&&setData(result)).catch(item=>active&&setError(item.message)).finally(()=>active&&setLoading(false));return()=>{active=false}},[query])
  const rows=useMemo(()=>(data?.items||[]).map(bill=>({...bill,serviceDateLabel:displayDate(bill.serviceDate),car:bill.registrationNumber||bill.vehicleCode||'',totalLabel:money(bill.totalCents),proofLabel:bill.proofId?'Uploaded':bill.paymentMethod==='Credit'?'Not required':'Missing',statusLabel:bill.status==='voided'?'Voided':'Issued'})),[data])
  const displayed=rows
  const setColumn=(key,value)=>setColumnFilters(current=>({...current,[key]:value}))
  if(showWeights)return <UnloadingArchivePage onBack={()=>setShowWeights(false)}/>
  return <div className="page purchase-archive expense-records">
    <div className="expense-toolbar"><BackButton fallback={onBack} iconOnly className="secondary"/><button type="button" onClick={()=>{setOpenFilter(null);setShowWeights(true)}}>{ui('Unloading Weight Records')}</button>
      <label>{ui('From Date')}<input aria-label={ui('From Date')} type="date" value={filters.from} max={filters.to} onChange={event=>setFilters({...filters,from:event.target.value})}/></label>
      <label>{ui('To Date')}<input aria-label={ui('To Date')} type="date" value={filters.to} min={filters.from} onChange={event=>setFilters({...filters,to:event.target.value})}/></label>
      <button type="button" className="record-icon-button" title={ui('Download Excel with Payment Proofs')} aria-label={ui('Download Excel with Payment Proofs')} onClick={()=>{window.location.href=`/api/purchase-bills/export.xlsx?${query}`}}><RecordDownloadIcon/></button></div>
    {error&&<div className="data-error">{error}</div>}{loading&&!data&&<div className="data-loading">{ui('Loading Purchase Bills…')}</div>}
    <div className="archive-table" ref={tableRef}><table><thead><tr>{columns.map(([key,label])=>{
 const translated=['expenseTypeLabel','category','paymentMethod','receiptLabel','proofLabel','statusLabel']
 const options=(data?.filterOptions?.[key]||['',...new Set(rows.map(row=>String(row[key]??'')).filter(Boolean))]).map(value=>({value,label:value===''?ui('Blank'):translated.includes(key)?ui(value):value}))
 return <FilterHeader key={key} label={key==='customerReceipt'?(customerReceiptLabels[language]||customerReceiptLabels.en).title:ui(label)} value={columnFilters[key]??null} sortDirection={sort.key===key?sort.direction:null} onSort={direction=>setSort(direction?{key,direction}:{})} options={options} open={openFilter===key} onOpen={()=>setOpenFilter(key)} onClose={()=>setOpenFilter(null)} search={['billNumber','customerName','branchName'].includes(key)?filters.search:undefined} onSearch={['billNumber','customerName','branchName'].includes(key)?value=>setFilters(current=>({...current,search:value})):undefined} searchLabel="Search purchase bills" searchPlaceholder="PO No., Customer, Branch or Branch ID" onChange={value=>setColumn(key,value)}/>
 })}</tr></thead><tbody>{displayed.map(bill=><BillRow key={bill.id} bill={bill} expanded={open===bill.id} toggle={()=>setOpen(open===bill.id?null:bill.id)}/>)}</tbody></table>{!loading&&data&&!displayed.length&&<div className="archive-empty">{ui('No Purchase Bills found for this selection.')}</div>}</div>
    <TableBottomScroll scrollRef={tableRef}/>
  </div>
}


function BillRow({bill,expanded,toggle}){const ui=useUi();return <><tr className="bill-row" onClick={toggle}><td>{bill.serviceDateLabel}</td><td><button className="bill-number" onClick={event=>{event.stopPropagation();toggle()}}>{bill.billNumber}</button></td><td><span className={`payment ${bill.paymentMethod.toLowerCase()}`}>{ui(bill.paymentMethod)}</span></td><td data-i18n-raw>{bill.customerName}</td><td data-i18n-raw>{bill.branchName}</td><td data-i18n-raw>{bill.issuedBy}</td><td>{bill.crew||'—'}</td><td data-i18n-raw>{bill.car}</td><td>{bill.totalLabel}</td><td>{bill.proofId?<ProofViewer url={`/api/purchase-bills/proofs/${bill.proofId}`}>{ui('View proof')}</ProofViewer>:bill.paymentMethod==='Credit'?'—' :ui('Missing')}</td><td><CustomerReceipt bill={bill}/></td><td>{bill.status==='voided'?<span className="voided">{ui('Voided')}</span>:<span className="issued">{ui('Issued')}</span>}</td></tr>{expanded&&<tr className="bill-detail"><td colSpan="12"><div><b>{ui('Bill Items')}</b><table><thead><tr><th>{ui('Item')}</th><th>{ui('Quantity')}</th><th>{ui('Unit')}</th><th>{ui('Price')}</th><th>{ui('Item Total')}</th></tr></thead><tbody>{bill.items.map((item,index)=><tr key={index}><td>{item.shortForm||item.item}</td><td>{/kg|kilogram/i.test(item.unit)?formatWeight(item.quantity):item.quantity}</td><td>{item.unit||'—'}</td><td>RM {formatUnitPrice(item.unitPrice??item.unitPriceCents/100)}</td><td>{money(item.itemTotalCents)}</td></tr>)}</tbody></table><small>{ui('Issued at')} {displayDateTime(bill.issuedAt)} · {ui('Electronic records cannot be deleted.')}</small></div></td></tr>}</>}
