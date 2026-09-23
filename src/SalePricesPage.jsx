import {useEffect,useState} from 'react'
import {useI18n} from './i18n.jsx'
import {apiRequest} from './apiClient.js'
import BackButton from './BackButton.jsx'
import './SalePricesPage.css'

export default function SalePricesPage({onBack}){
 const{t}=useI18n(),[data,setData]=useState({items:[],productNames:[]}),[draft,setDraft]=useState({description:'',unitPrice:''}),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('')
 const load=async()=>{try{setData(await apiRequest('/api/sales/prices'))}catch(e){setError(e.message)}}
 useEffect(()=>{load()},[])
 const save=async e=>{e.preventDefault();setBusy(true);setError('');setMessage('');try{await apiRequest('/api/sales/prices',{method:'POST',body:JSON.stringify(draft)});setDraft({description:'',unitPrice:''});await load();setMessage(t('salePrices.saved'))}catch(e){setError(e.message)}finally{setBusy(false)}}
 const remove=async id=>{setBusy(true);setError('');setMessage('');try{await apiRequest('/api/sales/prices/'+id,{method:'DELETE'});await load()}catch(e){setError(e.message)}finally{setBusy(false)}}
 return <div className="page sale-prices-page"><div className="sale-prices-header"><BackButton iconOnly fallback={onBack}/><div><h1>{t('salePrices.title')}</h1><p>{t('salePrices.help')}</p></div></div>
 <form className="sale-prices-form" onSubmit={save}><label>{t('sales.description')}<input required maxLength="300" list="sale-price-products" value={draft.description} onChange={e=>setDraft({...draft,description:e.target.value})}/><datalist id="sale-price-products">{[...new Set([...data.productNames,...data.items.map(item=>item.description)])].map(name=><option key={name} value={name}/>)}</datalist></label><label>{t('sales.unitPrice')}<input required type="number" min="0.000001" step="0.000001" value={draft.unitPrice} onChange={e=>setDraft({...draft,unitPrice:e.target.value})}/></label><button disabled={busy}>{draft.id?t('salePrices.updatePrice'):t('salePrices.savePrice')}</button>{draft.id&&<button type="button" disabled={busy} onClick={()=>setDraft({description:'',unitPrice:''})}>{t('sales.cancel')}</button>}</form>
 {error&&<p role="alert" className="data-error">{error}</p>}{message&&<p role="status" className="planner-message">{message}</p>}
 <div className="sale-prices-filter"><span>{data.items.length} {t('salePrices.items')}</span></div>
 <div className="sale-prices-table"><table><thead><tr><th>{t('sales.description')}</th><th>{t('sales.unitPrice')}</th><th>{t('salePrices.updated')}</th><th>{t('salePrices.action')}</th></tr></thead><tbody>{data.items.map(item=><tr key={item.id}><td>{item.description}</td><td>RM {item.unitPrice}/kg</td><td>{item.updatedAt}</td><td><button type="button" disabled={busy} onClick={()=>{setDraft({id:item.id,description:item.description,unitPrice:item.unitPrice});window.scrollTo({top:0,behavior:'smooth'})}}>{t('salePrices.edit')}</button><button type="button" disabled={busy} onClick={()=>{if(window.confirm(t('salePrices.confirmRemove')))remove(item.id)}}>{t('salePrices.remove')}</button></td></tr>)}</tbody></table>{!data.items.length&&<p>{t('salePrices.empty')}</p>}</div>
 </div>
}
