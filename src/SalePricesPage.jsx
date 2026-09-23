import {useEffect,useState} from 'react'
import {useI18n} from './i18n.jsx'
import {apiRequest} from './apiClient.js'
import BackButton from './BackButton.jsx'
import {canonicalSaleMaterial} from '../shared/sales.js'
import './SalePricesPage.css'

function PriceActionIcon({kind}){
 return kind==='edit'
  ?<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-7"/><path d="m10 14 8.6-8.6a2 2 0 0 1 2.8 2.8L12.8 16.8 9 17z"/></svg>
  :<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h16M10 4h4M6 7l1 13h10l1-13M10 11v6M14 11v6"/></svg>
}

export default function SalePricesPage({onBack}){
 const{t}=useI18n(),[data,setData]=useState({items:[],productNames:[]}),[draft,setDraft]=useState({description:'',unitPrice:''}),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('')
 const load=async()=>{try{setData(await apiRequest('/api/sales/prices'))}catch(e){setError(e.message)}}
 useEffect(()=>{load()},[])
 const save=async e=>{e.preventDefault();setBusy(true);setError('');setMessage('');try{await apiRequest('/api/sales/prices',{method:'POST',body:JSON.stringify(draft)});setDraft({description:'',unitPrice:''});await load();setMessage(t('salePrices.saved'))}catch(e){setError(e.message)}finally{setBusy(false)}}
 const remove=async id=>{setBusy(true);setError('');setMessage('');try{await apiRequest('/api/sales/prices/'+id,{method:'DELETE'});await load()}catch(e){setError(e.message)}finally{setBusy(false)}}
 return <div className="page sale-prices-page"><div className="sale-prices-header"><BackButton iconOnly fallback={onBack}/><h1>{t('salePrices.title')}</h1></div>
 <form className="sale-prices-form" onSubmit={save}><label>{t('sales.description')}<input required maxLength="300" list="sale-price-products" value={draft.description} onChange={e=>setDraft({...draft,description:e.target.value})} onBlur={e=>setDraft(previous=>({...previous,description:canonicalSaleMaterial(e.target.value)}))}/><datalist id="sale-price-products">{[...new Set([...data.productNames,...data.items.map(item=>item.description)].map(canonicalSaleMaterial))].map(name=><option key={name} value={name}/>)}</datalist></label><label>{t('sales.unitPrice')}<input required type="number" min="0.000001" step="0.000001" value={draft.unitPrice} onChange={e=>setDraft({...draft,unitPrice:e.target.value})}/></label><button disabled={busy}>{draft.id?t('salePrices.updatePrice'):t('salePrices.savePrice')}</button>{draft.id&&<button type="button" disabled={busy} onClick={()=>setDraft({description:'',unitPrice:''})}>{t('sales.cancel')}</button>}</form>
 {error&&<p role="alert" className="data-error">{error}</p>}{message&&<p role="status" className="planner-message">{message}</p>}
 <div className="sale-prices-filter"><span>{data.items.length} {t('salePrices.items')}</span></div>
 <div className="sale-prices-table"><table><thead><tr><th>{t('sales.description')}</th><th>{t('sales.unitPrice')}</th><th>{t('salePrices.updated')}</th><th>{t('salePrices.action')}</th></tr></thead><tbody>{data.items.map(item=><tr key={item.id}><td>{item.description}</td><td>RM {item.unitPrice}/kg</td><td>{item.updatedAt}</td><td><button className="sale-price-action" type="button" aria-label={t('salePrices.edit')} title={t('salePrices.edit')} disabled={busy} onClick={()=>{setDraft({id:item.id,description:item.description,unitPrice:item.unitPrice});window.scrollTo({top:0,behavior:'smooth'})}}><PriceActionIcon kind="edit"/></button><button className="sale-price-action" type="button" aria-label={t('salePrices.remove')} title={t('salePrices.remove')} disabled={busy} onClick={()=>{if(window.confirm(t('salePrices.confirmRemove')))remove(item.id)}}><PriceActionIcon kind="remove"/></button></td></tr>)}</tbody></table>{!data.items.length&&<p>{t('salePrices.empty')}</p>}</div>
 </div>
}
