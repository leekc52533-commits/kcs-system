import { useRef, useState } from 'react'
import readXlsxFile from 'read-excel-file/browser'
import { identifyFile } from './importRules.js'
import {apiRequest} from './apiClient.js'
import {useI18n} from './i18n.jsx'

export default function ImportPage({ onBack }) {
  const{t}=useI18n()
  const inputRef = useRef(null)
  const [files,setFiles]=useState([]), [preview,setPreview]=useState(null), [busy,setBusy]=useState(false), [message,setMessage]=useState('')
  const processFiles = async (fileList) => {
    setBusy(true); setMessage(''); setPreview(null)
    try {
      const parsed=[]
      for (const file of [...fileList]) {
        if (!/\.xlsx$/i.test(file.name)) throw new Error(t('import.notXlsx',{file:file.name}))
        const sheets=await readXlsxFile(file)
        const candidates=Array.isArray(sheets[0]?.data)?sheets:[{sheet:'',data:sheets}]
        const matched=candidates.map((sheet)=>{
          const headers=(sheet.data?.[0]??[]).map((v)=>String(v??'').trim())
          return {sheet,headers,type:identifyFile(headers,sheet.sheet)}
        }).find((x)=>x.type)
        if(!matched) throw new Error(t('import.unrecognized',{file:file.name}))
        const rows=(matched.sheet.data??[]).slice(1).filter((row)=>row.some((v)=>v!==null&&v!=='')).map((row)=>Object.fromEntries(matched.headers.map((h,i)=>[h,row[i] instanceof Date?row[i].toISOString():row[i]??''])))
        parsed.push({name:file.name,sheetName:matched.sheet.sheet,headers:matched.headers,rows,type:matched.type})
      }
      setFiles(parsed)
      const result=await apiRequest('/api/import/preview',{method:'POST',body:JSON.stringify({files:parsed.map(({type:_type,...file})=>file)})})
      setPreview(result)
    } catch(error){setFiles([]);setMessage(error.message)} finally {setBusy(false)}
  }
  const commit=async()=>{
    setBusy(true);setMessage('')
    try{const result=await apiRequest('/api/import/commit',{method:'POST',body:JSON.stringify({batchId:preview.batchId})});setMessage(t('import.completed',{newCount:result.summary.new,updated:result.summary.update,unchanged:result.summary.unchanged,unmatched:result.summary.unmatched}));setPreview({...preview,committed:true})}catch(error){setMessage(error.message)}finally{setBusy(false)}
  }
  return <div className="page import-page">
    <button className="import-back" onClick={onBack}>← {t('common.back')}</button>
    <div className="import-title import-safety-mode"><span className="safe-badge">{t('import.previewOnly')}</span></div>
    <section className="drop-zone" onDragOver={(e)=>e.preventDefault()} onDrop={(e)=>{e.preventDefault();processFiles(e.dataTransfer.files)}}><span className="upload-icon">⇧</span><h2>{t('import.choose')}</h2><p>{t('import.systemRecognition')}</p><button onClick={()=>inputRef.current?.click()} disabled={busy}>{busy?t('common.processing'):t('import.selectFile')}</button><input ref={inputRef} hidden multiple type="file" accept=".xlsx" onChange={(e)=>processFiles(e.target.files)}/></section>
    {message&&<div className="import-message">{message}</div>}
    {preview&&<><section className="import-summary">{[['import.total','total'],['import.new','new'],['import.updated','update'],['import.unchanged','unchanged'],['import.errors','error'],['import.unmatched','unmatched']].map(([labelKey,key])=><article key={key}><span>{t(labelKey)}</span><strong>{preview.summary[key]}</strong></article>)}</section>
      <section className="file-results"><div className="result-heading"><div><em>{t('import.preview')}</em><h2>{t('import.detected')}</h2></div></div>{files.map((file)=><article className="file-card" key={file.name}><div className="file-row"><div className="file-mark">XL</div><div><strong data-i18n-raw>{file.name}</strong><p><span data-i18n-raw>{file.type.label}</span> · {t('import.worksheet')} <span data-i18n-raw>{file.sheetName}</span> · {t('import.rows',{count:file.rows.length})}</p></div></div><div className="preview-grid"><b data-i18n-raw>{file.headers.slice(0,6).join(' · ')}</b><small>{t('import.compare')}</small></div></article>)}</section>
      {preview.errors.length>0&&<section className="relationship-report"><em>{t('import.issues')}</em><h2>{t('import.issueCount',{count:preview.errors.length})}</h2><div className="relation-items">{preview.errors.slice(0,50).map((e,i)=><div key={`${e.code}-${i}`}><b data-i18n-raw>{e.externalId||e.file||'—'}</b><span>{e.message}<small>{t('import.row',{row:e.rowNumber||'—'})} · <span data-i18n-raw>{e.code}</span></small></span></div>)}</div></section>}
      <div className="commit-bar"><span>{t(preview.canCommit?'import.ready':'import.blocked')}</span><button onClick={commit} disabled={busy||!preview.canCommit||preview.committed}>{t(preview.committed?'import.imported':'import.confirm')}</button></div></>}
  </div>
}
