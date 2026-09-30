import {FilterHeader} from './ExpenseRecordsPage.jsx'
import {useEffect,useState} from 'react'
import {apiRequest} from './apiClient.js'
import {useI18n,useUi} from './i18n.jsx'
import {formatDateDisplay} from './dateDisplay.js'
import DataExportButton from './DataExportButton.jsx'
import CenteredNotice from './CenteredNotice.jsx'

const fields=[['serviceDate','Date'],['documentNumber','Expense No.'],['category','Category'],['description','Description'],['amount','Amount'],['employeeName','Employee / Admin'],['referenceNumber','Invoice / Reference Number'],['odometerKm','Odometer (km)'],['companyName','Company Name'],['tinNumber','TIN Number'],['remarks','Remarks'],['paymentMethod','Payment Method'],['createdBy','Entered By'],['receiptLabel','Receipt']]
export default function VehicleExpenses({vehicleId}){
 const[filters,setFilters]=useState({}),[sort,setSort]=useState({}),[open,setOpen]=useState(null)
 const{language}=useI18n(),ui=useUi(),[data,setData]=useState(null),[error,setError]=useState('')
 const title=language==='zh'?'车辆费用':language==='ms'?'Perbelanjaan Kenderaan':'Vehicle Expenses'
 useEffect(()=>{let active=true;apiRequest(`/api/expenses?vehicleId=${vehicleId}`).then(result=>{if(active)setData(result)}).catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[vehicleId])
 const allRows=(data?.items||[]).map(r=>({...r,receiptLabel:ui(r.hasProof?'Uploaded':'Missing'),amount:r.amountCents/100,documentNumber:r.documentNumber||r.recordKey}))
 const rows=allRows.filter(r=>Object.entries(filters).every(([k,v])=>v==null||v.includes(String(r[k]??'')))).sort((a,b)=>{if(!sort.key)return 0;const av=a[sort.key]??'',bv=b[sort.key]??'';const result=['amount','odometerKm'].includes(sort.key)?Number(av)-Number(bv):String(av).localeCompare(String(bv),undefined,{numeric:true});return sort.direction==='desc'?-result:result})
 const number=n=>Number(n).toLocaleString('en-MY',{minimumFractionDigits:2,maximumFractionDigits:2})
 return <section className="vehicle-record-section" id="vehicle-expenses"><header><h2>{title}</h2>{data&&<b>RM {number(rows.reduce((n,r)=>n+r.amount,0))}</b>}</header>
 {error&&<CenteredNotice>{error}</CenteredNotice>}
 {data&&<DataExportButton name={`${title}-${vehicleId}`} rows={rows} columns={fields.map(([key,label])=>({key,label}))}/>}
 {!data&&!error?<p>{ui('Loading Expense Records…')}</p>:<div className="vehicle-table"><table><thead><tr>{fields.map(([key,label])=><FilterHeader key={key} label={ui(label)} open={open===key} onOpen={()=>setOpen(key)} onClose={()=>setOpen(null)} value={filters[key]??null} onChange={v=>setFilters(f=>({...f,[key]:v}))} sortDirection={sort.key===key?sort.direction:null} onSort={direction=>setSort(direction?{key,direction}:{})} options={[...new Set(allRows.map(r=>String(r[key]??'')))].map(value=>({value,label:value===''?ui('Blank'):key==='serviceDate'?formatDateDisplay(value):value}))}/>)}</tr></thead><tbody>{rows.map(r=><tr key={r.recordKey}>{fields.map(([key])=><td key={key} data-numeric={['amount','odometerKm'].includes(key)||undefined}>{key==='receiptLabel'?(r.hasProof?<a href={`/api/expenses/${r.recordKey}/receipt`} target="_blank" rel="noreferrer">{ui('View receipt')}</a>:'—'):key==='serviceDate'?formatDateDisplay(r[key]):key==='amount'?`RM ${number(r.amount)}`:['category','paymentMethod'].includes(key)?ui(r[key]||'—'):r[key]??'—'}</td>)}</tr>)}{!rows.length&&<tr><td colSpan={fields.length}>{ui('No matching data.')}</td></tr>}</tbody></table></div>}
 </section>
}
