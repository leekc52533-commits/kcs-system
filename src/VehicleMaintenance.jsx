import {useState} from 'react'
import {useI18n} from './i18n.jsx'
import DateInput from './DateInput.jsx'
import {formatDateDisplay} from './dateDisplay.js'
import DataExportButton from './DataExportButton.jsx'
export default function VehicleMaintenance({records=[],disabled,save}){
 const{language}=useI18n(),w=({zh:['维修保养','日期','里程（km）','维修／换轮／保养内容','更换零件／轮胎位置','维修店','下次跟进日期','提交','搜索维修资料','暂无记录','故障说明'],ms:['Penyelenggaraan','Tarikh','Perbatuan (km)','Butiran pembaikan / tayar / servis','Alat ganti / kedudukan tayar','Bengkel','Tarikh susulan','Hantar','Cari rekod','Tiada rekod','Masalah'],en:['Maintenance','Date','Mileage (km)','Repair / tyre / service details','Parts / tyre position','Workshop','Follow-up date','Submit','Search records','No records','Fault description']})[language]||[]
 const empty={date:'',mileage:'',repairWork:'',partsReplaced:'',workshop:'',followUpDate:'',faultDescription:''},[form,setForm]=useState(empty),[search,setSearch]=useState('')
 const rows=records.filter(r=>[r.maintenanceDate,r.mileage,r.repairWork,r.partsReplaced,r.workshop,r.faultDescription].some(v=>String(v??'').toLowerCase().includes(search.toLowerCase())))
 const fields=[['date',1,'date'],['mileage',2,'number'],['repairWork',3,'text'],['partsReplaced',4,'text'],['workshop',5,'text'],['followUpDate',6,'date'],['faultDescription',10,'text']]
 return <section className="vehicle-record-section"><header><h2>{w[0]}</h2></header>{!disabled&&<form className="vehicle-basic-grid" onSubmit={async e=>{e.preventDefault();if(await save(form)!==false)setForm(empty)}}>{fields.map(([key,i,type])=><label key={key}>{w[i]}{type==='date'?<DateInput required={key==='date'} value={form[key]} onChange={e=>setForm({...form,[key]:e.target.value})}/>:<input required={key==='repairWork'} type={type} min={type==='number'?0:undefined} value={form[key]} onChange={e=>setForm({...form,[key]:e.target.value})}/>}</label>)}<button disabled={disabled}>{w[7]}</button></form>}
 <div className="record-inline"><input aria-label={w[8]} placeholder={w[8]} value={search} onChange={e=>setSearch(e.target.value)}/><DataExportButton inline name={w[0]} rows={rows} columns={['maintenanceDate','mileage','repairWork','partsReplaced','workshop','followUpDate','faultDescription'].map((key,i)=>({key,label:w[[1,2,3,4,5,6,10][i]]}))}/></div>
 <div className="vehicle-table"><table><thead><tr>{[1,2,3,4,5,6,10].map(i=><th key={i}>{w[i]}</th>)}</tr></thead><tbody>{rows.map(r=><tr key={r.id}>{['maintenanceDate','mileage','repairWork','partsReplaced','workshop','followUpDate','faultDescription'].map(k=><td key={k}>{k.endsWith('Date')?formatDateDisplay(r[k]):r[k]??'—'}</td>)}</tr>)}{!rows.length&&<tr><td colSpan="7">{w[9]}</td></tr>}</tbody></table></div></section>
}
