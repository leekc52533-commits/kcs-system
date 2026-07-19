import { useRef, useState } from 'react'
import readXlsxFile from 'read-excel-file/browser'
import { identifyFile } from './importRules.js'

export default function ImportPage({ onBack }) {
  const inputRef = useRef(null)
  const [files,setFiles]=useState([]), [preview,setPreview]=useState(null), [busy,setBusy]=useState(false), [message,setMessage]=useState('')
  const processFiles = async (fileList) => {
    setBusy(true); setMessage(''); setPreview(null)
    try {
      const parsed=[]
      for (const file of [...fileList]) {
        if (!/\.xlsx$/i.test(file.name)) throw new Error(`${file.name} 不是 .xlsx 文件`)
        const sheets=await readXlsxFile(file)
        const candidates=Array.isArray(sheets[0]?.data)?sheets:[{sheet:'',data:sheets}]
        const matched=candidates.map((sheet)=>{
          const headers=(sheet.data?.[0]??[]).map((v)=>String(v??'').trim())
          return {sheet,headers,type:identifyFile(headers,sheet.sheet)}
        }).find((x)=>x.type)
        if(!matched) throw new Error(`${file.name} 无法根据工作表与栏位识别`)
        const rows=(matched.sheet.data??[]).slice(1).filter((row)=>row.some((v)=>v!==null&&v!=='')).map((row)=>Object.fromEntries(matched.headers.map((h,i)=>[h,row[i] instanceof Date?row[i].toISOString():row[i]??''])))
        parsed.push({name:file.name,sheetName:matched.sheet.sheet,headers:matched.headers,rows,type:matched.type})
      }
      setFiles(parsed)
      const response=await fetch('/api/import/preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({files:parsed.map(({type:_type,...file})=>file)})})
      const result=await response.json(); if(!response.ok) throw new Error(result.error||'预览失败')
      setPreview(result)
    } catch(error){setFiles([]);setMessage(error.message)} finally {setBusy(false)}
  }
  const commit=async()=>{
    setBusy(true);setMessage('')
    try{const response=await fetch('/api/import/commit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({batchId:preview.batchId})});const result=await response.json();if(!response.ok)throw new Error(result.error||'导入失败');setMessage(`导入完成：新增 ${result.summary.new}，更新 ${result.summary.update}，无变化 ${result.summary.unchanged}，无法匹配 ${result.summary.unmatched}`);setPreview({...preview,committed:true})}catch(error){setMessage(error.message)}finally{setBusy(false)}
  }
  return <div className="page import-page">
    <button className="import-back" onClick={onBack}>← 返回总览</button>
    <div className="import-title"><div><em>JODOO DATA IMPORT</em><h1>Excel 正式导入</h1><p>先预览数据库变化；只有按下“确认导入”后，才会在单一 transaction 内更新主档。</p></div><span className="safe-badge">预览不修改主档</span></div>
    <section className="drop-zone" onDragOver={(e)=>e.preventDefault()} onDrop={(e)=>{e.preventDefault();processFiles(e.dataTransfer.files)}}><span className="upload-icon">⇧</span><h2>选择或拖入一份或多份 Jodoo Excel</h2><p>系统根据工作表名称和栏位识别 Customer List、Customer Branch、BranchSchedule、AreaInfo、Customer Location Update。</p><button onClick={()=>inputRef.current?.click()} disabled={busy}>{busy?'处理中…':'选择 Excel 文件'}</button><input ref={inputRef} hidden multiple type="file" accept=".xlsx" onChange={(e)=>processFiles(e.target.files)}/></section>
    {message&&<div className="import-message">{message}</div>}
    {preview&&<><section className="import-summary">{[['总笔数','total'],['新增','new'],['更新','update'],['没有变化','unchanged'],['错误','error'],['无法匹配','unmatched']].map(([label,key])=><article key={key}><span>{label}</span><strong>{preview.summary[key]}</strong></article>)}</section>
      <section className="file-results"><div className="result-heading"><div><em>预览结果</em><h2>识别到的资料</h2></div></div>{files.map((file)=><article className="file-card" key={file.name}><div className="file-row"><div className="file-mark">XL</div><div><strong>{file.name}</strong><p>{file.type.label} · 工作表 {file.sheetName} · {file.rows.length} 笔</p></div></div><div className="preview-grid"><b>{file.headers.slice(0,6).join(' · ')}</b><small>预览已送到后台与现有 SQLite 比对</small></div></article>)}</section>
      {preview.errors.length>0&&<section className="relationship-report"><em>导入问题</em><h2>{preview.errors.length} 项需要核对</h2><div className="relation-items">{preview.errors.slice(0,50).map((e,i)=><div key={`${e.code}-${i}`}><b>{e.externalId||e.file||'—'}</b><span>{e.message}<small>Excel 第 {e.rowNumber||'—'} 行 · {e.code}</small></span></div>)}</div></section>}
      <div className="commit-bar"><span>{preview.canCommit?'预览完成，可以确认写入 SQLite':'存在重要错误，请修正 Excel 后重新预览'}</span><button onClick={commit} disabled={busy||!preview.canCommit||preview.committed}>{preview.committed?'已导入':'确认导入'}</button></div></>}
  </div>
}
