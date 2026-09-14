import {useEffect,useState} from 'react'
import {useI18n} from './i18n.jsx'
import {receiptImage,shareReceiptFile} from './receiptImage.js'
const messages={
 en:{share:'Send receipt (optional)',save:'Save image',preparing:'Preparing receipt image…',failed:'Unable to prepare or send the image. Please try again.',unsupported:'Sharing is unavailable in this browser. Save the image and attach it in WhatsApp.',retry:'Retry',help:'Send only if needed. Cancelling does not change the saved bill.'},
 ms:{share:'Hantar resit (pilihan)',save:'Simpan gambar',preparing:'Menyediakan gambar resit…',failed:'Gagal menyediakan atau menghantar gambar. Sila cuba lagi.',unsupported:'Pelayar ini tidak menyokong perkongsian. Simpan gambar dan lampirkan dalam WhatsApp.',retry:'Cuba lagi',help:'Hantar jika perlu sahaja. Membatalkan tidak mengubah bil yang disimpan.'},
 zh:{share:'发送收据（可选）',save:'保存图片',preparing:'正在准备收据图片…',failed:'无法生成或发送图片，请重试。',unsupported:'此浏览器不支持直接分享，请保存图片后在 WhatsApp 中发送。',retry:'重试',help:'有需要才发送；取消发送不会影响已保存的单据。'}
}
export default function ReceiptShare({bill}){
 const {language}=useI18n(),l=messages[language]||messages.en,[file,setFile]=useState(null),[error,setError]=useState(false),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[retry,setRetry]=useState(0),snapshot=JSON.stringify(bill)
 useEffect(()=>{let active=true;setFile(null);setError(false);setNotice('');receiptImage(JSON.parse(snapshot)).then(blob=>{if(active)setFile(new File([blob],bill.billNumber.replace(/[^a-zA-Z0-9_-]/g,'_')+'.png',{type:'image/png'}))}).catch(()=>{if(active)setError(true)});return()=>{active=false}},[snapshot,retry])
 const share=async()=>{if(!file||busy)return;setBusy(true);setNotice('');try{const result=await shareReceiptFile(file);if(result==='unsupported')setNotice('unsupported')}catch{setNotice('failed')}finally{setBusy(false)}}
 const save=()=>{if(!file)return;const url=URL.createObjectURL(file),a=document.createElement('a');a.href=url;a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
 return <div className="receipt-share"><p>{l.help}</p><button type="button" className="secondary-mobile" disabled={!file||busy} onClick={share}>{l.share}</button><button type="button" className="secondary-mobile" disabled={!file||busy} onClick={save}>{l.save}</button>{!file&&!error&&<p role="status">{l.preparing}</p>}{(error||notice)&&<p role="status">{l[notice||'failed']}</p>}{error&&<button type="button" onClick={()=>setRetry(n=>n+1)}>{l.retry}</button>}</div>
}
