import {useEffect,useRef,useState} from 'react'
import {createPortal} from 'react-dom'
import {useI18n} from './i18n.jsx'
import {customerReceiptHtml} from '../shared/customerReceipt.js'
import './ProofViewer.css'
const labels={en:{title:'Customer receipt',view:'View receipt',download:'Download receipt',print:'Print / Save PDF'},ms:{title:'Resit pelanggan',view:'Lihat resit',download:'Muat turun resit',print:'Cetak / Simpan PDF'},zh:{title:'客户收据',view:'查看收据',download:'下载收据',print:'打印 / 保存 PDF'}}
export const customerReceiptLabels=labels
export default function CustomerReceipt({bill}){
 const {language}=useI18n(),[open,setOpen]=useState(false),l=labels[language]||labels.en
 return <><button type="button" data-preview-safe className="proof-view-link" onClick={e=>{e.stopPropagation();setOpen(true)}}>{l.view}</button>{open&&createPortal(<ReceiptDialog bill={bill} close={()=>setOpen(false)}/>,document.body)}</>
}
function ReceiptDialog({bill,close}){
 const {language,t}=useI18n(),l=labels[language]||labels.en,dialog=useRef(null),frame=useRef(null),[ready,setReady]=useState(false),html=customerReceiptHtml(bill)
 useEffect(()=>{dialog.current.showModal()},[])
 const download=()=>{const url=URL.createObjectURL(new Blob([html],{type:'text/html;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=bill.billNumber.replace(/[^a-zA-Z0-9_-]/g,'_')+'.html';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
 return <dialog ref={dialog} className="proof-view-dialog" onCancel={e=>{e.preventDefault();close()}} onClick={e=>e.stopPropagation()}><header><strong>{l.title} · {bill.billNumber}</strong><button data-preview-safe title={t('common.back')} aria-label={t('common.back')} onClick={close}>×</button></header><div className="expense-toolbar"><button onClick={download} aria-label={l.download} title={l.download}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M4 15v6h16v-6"/></svg></button><button disabled={!ready} onClick={()=>{frame.current.contentWindow.focus();frame.current.contentWindow.print()}}>{l.print}</button></div><iframe ref={frame} title={l.title} sandbox="allow-same-origin allow-modals" srcDoc={html} onLoad={()=>setReady(true)} style={{width:'100%',height:'65vh',border:0,background:'#fff'}}/></dialog>
}
