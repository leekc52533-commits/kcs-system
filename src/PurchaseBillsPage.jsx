import {useEffect,useMemo,useState} from 'react'
import {apiRequest} from './apiClient.js'
import './PurchaseBillsPage.css'

const currentMonth=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kuching',year:'numeric',month:'2-digit'}).format(new Date())
const money=cents=>`RM ${(Number(cents||0)/100).toFixed(2)}`

export default function PurchaseBillsPage(){
  const[filters,setFilters]=useState({month:currentMonth(),search:'',paymentMethod:'',employeeId:''}),[data,setData]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(false),[open,setOpen]=useState(null)
  const query=useMemo(()=>new URLSearchParams(Object.entries(filters).filter(([,value])=>value)).toString(),[filters])
  useEffect(()=>{let active=true;setLoading(true);setError('');apiRequest(`/api/purchase-bills?${query}`).then(result=>active&&setData(result)).catch(item=>active&&setError(item.message)).finally(()=>active&&setLoading(false));return()=>{active=false}},[query])
  const download=path=>{window.location.href=`${path}?${query}`}
  return <div className="page purchase-archive">
    <div className="archive-heading"><div><small>ACCOUNT SUPPORTING DOCUMENTS</small><h1>Monthly Purchase Bill Records</h1><p>Electronic Purchase Bills are permanent records. Cash payment proofs are kept with their Bills.</p></div><div className="archive-actions"><button onClick={()=>download('/api/purchase-bills/export.xlsx')}>Download Monthly Excel</button><button className="secondary" onClick={()=>download('/api/purchase-bills/payment-proofs.zip')}>Download Payment Proofs ZIP</button></div></div>
    <section className="archive-filters">
      <label>Month<input type="month" value={filters.month} onChange={event=>setFilters({...filters,month:event.target.value})}/></label>
      <label>Search<input placeholder="PO No., Customer, Branch or Branch ID" value={filters.search} onChange={event=>setFilters({...filters,search:event.target.value})}/></label>
      <label>Payment Method<select value={filters.paymentMethod} onChange={event=>setFilters({...filters,paymentMethod:event.target.value})}><option value="">All</option><option>Cash</option><option>Credit</option></select></label>
      <label>Issued By<select value={filters.employeeId} onChange={event=>setFilters({...filters,employeeId:event.target.value})}><option value="">All employees</option>{(data?.employees||[]).map(item=><option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
    </section>
    {data&&<section className="archive-summary"><article><span>Bills</span><strong>{data.summary.billCount}</strong></article><article><span>Total Amount</span><strong>{money(data.summary.totalCents)}</strong></article><article><span>Cash</span><strong>{data.summary.cashCount}</strong></article><article><span>Credit</span><strong>{data.summary.creditCount}</strong></article></section>}
    {error&&<div className="data-error">{error}</div>}{loading&&!data&&<div className="data-loading">Loading Purchase Bills…</div>}
    <div className="archive-table"><table><thead><tr><th>Date</th><th>PO No.</th><th>Total</th><th>Payment Method</th><th>Customer Name</th><th>Branch</th><th>Issued By</th><th>Payment Proof</th><th>Status</th></tr></thead><tbody>{(data?.items||[]).map(bill=><BillRow key={bill.id} bill={bill} expanded={open===bill.id} toggle={()=>setOpen(open===bill.id?null:bill.id)}/>)}</tbody></table>{!loading&&data&&!data.items.length&&<div className="archive-empty">No Purchase Bills found for this selection.</div>}</div>
  </div>
}

function BillRow({bill,expanded,toggle}){return <><tr className="bill-row" onClick={toggle}><td>{bill.serviceDate}</td><td><button className="bill-number" onClick={event=>{event.stopPropagation();toggle()}}>{bill.billNumber}</button></td><td>{money(bill.totalCents)}</td><td><span className={`payment ${bill.paymentMethod.toLowerCase()}`}>{bill.paymentMethod}</span></td><td>{bill.customerName}</td><td>{bill.branchName}</td><td>{bill.issuedBy}<small>{bill.registrationNumber||bill.vehicleCode}</small></td><td>{bill.proofId?<a href={`/api/purchase-bills/proofs/${bill.proofId}`} target="_blank" rel="noreferrer" onClick={event=>event.stopPropagation()}>View proof</a>:bill.paymentMethod==='Credit'?'—':'Missing'}</td><td>{bill.status==='voided'?<span className="voided">Voided</span>:<span className="issued">Issued</span>}</td></tr>{expanded&&<tr className="bill-detail"><td colSpan="9"><div><b>Bill Items</b><table><thead><tr><th>Item</th><th>Quantity</th><th>Unit</th><th>Price</th><th>Item Total</th></tr></thead><tbody>{bill.items.map((item,index)=><tr key={index}><td>{item.shortForm||item.item}</td><td>{item.quantity}</td><td>{item.unit||'—'}</td><td>{money(item.unitPriceCents)}</td><td>{money(item.itemTotalCents)}</td></tr>)}</tbody></table><small>Issued at {bill.issuedAt} · Electronic records cannot be deleted.</small></div></td></tr>}</>}
