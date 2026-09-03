import {useEffect,useMemo,useState} from 'react'
import {apiRequest} from './apiClient.js'
import './PurchaseBillsPage.css'

const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kuching',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
const firstOfMonth=()=>`${today().slice(0,7)}-01`
const money=cents=>`RM ${(Number(cents||0)/100).toFixed(2)}`
const columns=[['serviceDate','Date'],['billNumber','PO No.'],['totalLabel','Total'],['paymentMethod','Payment Method'],['customerName','Customer Name'],['branchName','Branch'],['issuedBy','Issued By'],['proofLabel','Payment Proof'],['statusLabel','Status']]

export default function PurchaseBillsPage(){
  const[filters,setFilters]=useState({from:firstOfMonth(),to:today(),search:'',paymentMethod:'',employeeId:''}),[columnFilters,setColumnFilters]=useState({}),[data,setData]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(false),[open,setOpen]=useState(null)
  const query=useMemo(()=>new URLSearchParams(Object.entries(filters).filter(([,value])=>value)).toString(),[filters])
  useEffect(()=>{let active=true;setLoading(true);setError('');setColumnFilters({});apiRequest(`/api/purchase-bills?${query}`).then(result=>active&&setData(result)).catch(item=>active&&setError(item.message)).finally(()=>active&&setLoading(false));return()=>{active=false}},[query])
  const rows=useMemo(()=>(data?.items||[]).map(bill=>({...bill,totalLabel:money(bill.totalCents),proofLabel:bill.proofId?'Uploaded':bill.paymentMethod==='Credit'?'Not required':'Missing',statusLabel:bill.status==='voided'?'Voided':'Issued'})),[data])
  const displayed=useMemo(()=>rows.filter(row=>Object.entries(columnFilters).every(([key,value])=>!value||String(row[key]??'')===value)),[rows,columnFilters])
  const setColumn=(key,value)=>setColumnFilters(current=>({...current,[key]:value}))
  return <div className="page purchase-archive">
    <div className="archive-heading"><div><small>ACCOUNT SUPPORTING DOCUMENTS</small><h1>Purchase Bill Records</h1><p>Select any payroll or accounting period. Payment Proof images are included inside the Excel file.</p></div><div className="archive-actions"><button onClick={()=>{window.location.href=`/api/purchase-bills/export.xlsx?${query}`}}>Download Excel with Payment Proofs</button></div></div>
    <section className="archive-filters">
      <label>From Date<input type="date" value={filters.from} max={filters.to} onChange={event=>setFilters({...filters,from:event.target.value})}/></label>
      <label>To Date<input type="date" value={filters.to} min={filters.from} onChange={event=>setFilters({...filters,to:event.target.value})}/></label>
      <label>Search<input placeholder="PO No., Customer, Branch or Branch ID" value={filters.search} onChange={event=>setFilters({...filters,search:event.target.value})}/></label>
      <label>Payment Method<select value={filters.paymentMethod} onChange={event=>setFilters({...filters,paymentMethod:event.target.value})}><option value="">All</option><option>Cash</option><option>Credit</option></select></label>
      <label>Issued By<select value={filters.employeeId} onChange={event=>setFilters({...filters,employeeId:event.target.value})}><option value="">All employees</option>{(data?.employees||[]).map(item=><option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
    </section>
    {error&&<div className="data-error">{error}</div>}{loading&&!data&&<div className="data-loading">Loading Purchase Bills…</div>}
    <div className="archive-table"><table><thead><tr>{columns.map(([key,label])=><FilterHeader key={key} label={label} value={columnFilters[key]||''} values={[...new Set(rows.map(row=>String(row[key]??'')).filter(Boolean))]} onChange={value=>setColumn(key,value)}/>)}</tr></thead><tbody>{displayed.map(bill=><BillRow key={bill.id} bill={bill} expanded={open===bill.id} toggle={()=>setOpen(open===bill.id?null:bill.id)}/>)}</tbody></table>{!loading&&data&&!displayed.length&&<div className="archive-empty">No Purchase Bills found for this selection.</div>}</div>
  </div>
}

function FilterHeader({label,value,values,onChange}){return <th><span>{label}</span><select aria-label={`Filter ${label}`} value={value} onChange={event=>onChange(event.target.value)}><option value="">All</option>{values.sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})).map(item=><option key={item} value={item}>{item}</option>)}</select></th>}

function BillRow({bill,expanded,toggle}){return <><tr className="bill-row" onClick={toggle}><td>{bill.serviceDate}</td><td><button className="bill-number" onClick={event=>{event.stopPropagation();toggle()}}>{bill.billNumber}</button></td><td>{bill.totalLabel}</td><td><span className={`payment ${bill.paymentMethod.toLowerCase()}`}>{bill.paymentMethod}</span></td><td>{bill.customerName}</td><td>{bill.branchName}</td><td>{bill.issuedBy}<small>{bill.registrationNumber||bill.vehicleCode}</small></td><td>{bill.proofId?<a href={`/api/purchase-bills/proofs/${bill.proofId}`} target="_blank" rel="noreferrer" onClick={event=>event.stopPropagation()}>View proof</a>:bill.paymentMethod==='Credit'?'—':'Missing'}</td><td>{bill.status==='voided'?<span className="voided">Voided</span>:<span className="issued">Issued</span>}</td></tr>{expanded&&<tr className="bill-detail"><td colSpan="9"><div><b>Bill Items</b><table><thead><tr><th>Item</th><th>Quantity</th><th>Unit</th><th>Price</th><th>Item Total</th></tr></thead><tbody>{bill.items.map((item,index)=><tr key={index}><td>{item.shortForm||item.item}</td><td>{item.quantity}</td><td>{item.unit||'—'}</td><td>{money(item.unitPriceCents)}</td><td>{money(item.itemTotalCents)}</td></tr>)}</tbody></table><small>Issued at {bill.issuedAt} · Electronic records cannot be deleted.</small></div></td></tr>}</>}
