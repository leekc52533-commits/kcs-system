import {useEffect,useState} from 'react'
import {apiRequest} from './apiClient.js'
import {useI18n,useUi} from './i18n.jsx'
import {formatDateDisplay} from './dateDisplay.js'
import DataExportButton from './DataExportButton.jsx'
import CenteredNotice from './CenteredNotice.jsx'

const fields=[['serviceDate','Date'],['documentNumber','Expense No.'],['category','Category'],['description','Description'],['amount','Amount'],['employeeName','Employee / Admin'],['referenceNumber','Invoice / Reference Number'],['odometerKm','Odometer (km)'],['companyName','Company Name'],['tinNumber','TIN Number'],['remarks','Remarks'],['paymentMethod','Payment Method'],['createdBy','Entered By']]
export default function VehicleExpenses({vehicleId}){
 const{language}=useI18n(),ui=useUi(),[data,setData]=useState(null),[error,setError]=useState('')
 const title=language==='zh'?'车辆费用':language==='ms'?'Perbelanjaan Kenderaan':'Vehicle Expenses'
 useEffect(()=>{let active=true;apiRequest(`/api/expenses?vehicleId=${vehicleId}`).then(result=>{if(active)setData(result)}).catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[vehicleId])
 const rows=(data?.items||[]).map(r=>({...r,amount:r.amountCents/100,documentNumber:r.documentNumber||r.recordKey}))
 const number=n=>Number(n).toLocaleString('en-MY',{minimumFractionDigits:2,maximumFractionDigits:2})
 return <section className="vehicle-record-section" id="vehicle-expenses"><header><h2>{title}</h2>{data&&<b>RM {number(data.totalCents/100)}</b>}</header>
 {error&&<CenteredNotice>{error}</CenteredNotice>}
 {data&&<DataExportButton name={`${title}-${vehicleId}`} rows={rows} columns={fields.map(([key,label])=>({key,label}))}/>}
 {!data&&!error?<p>{ui('Loading Expense Records…')}</p>:<div className="vehicle-table"><table><thead><tr>{fields.map(([key,label])=><th key={key}>{ui(label)}</th>)}<th>{ui('Receipt')}</th></tr></thead><tbody>{rows.map(r=><tr key={r.recordKey}>{fields.map(([key])=><td key={key} data-numeric={['amount','odometerKm'].includes(key)||undefined}>{key==='serviceDate'?formatDateDisplay(r[key]):key==='amount'?`RM ${number(r.amount)}`:['category','paymentMethod'].includes(key)?ui(r[key]||'—'):r[key]??'—'}</td>)}<td>{r.hasProof?<a href={`/api/expenses/${r.recordKey}/receipt`} target="_blank" rel="noreferrer">{ui('View receipt')}</a>:'—'}</td></tr>)}{!rows.length&&<tr><td colSpan={fields.length+1}>{ui('No matching data.')}</td></tr>}</tbody></table></div>}
 </section>
}
