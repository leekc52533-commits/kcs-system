import { useRef, useState } from 'react'
import readXlsxFile from 'read-excel-file/browser'
import { analyzeRelationships, identifyFile, validateRows } from './importRules.js'

export default function ImportPage({ onBack }) {
  const inputRef = useRef(null)
  const [files, setFiles] = useState([])
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)

  const processFiles = async (fileList) => {
    setBusy(true)
    const parsed = []
    for (const file of [...fileList]) {
      try {
        if (!/\.xlsx$/i.test(file.name)) throw new Error('只接受 .xlsx 文件')
        const parsedWorkbook = await readXlsxFile(file)
        const matrix = Array.isArray(parsedWorkbook[0]?.data) ? parsedWorkbook[0].data : parsedWorkbook
        const headers = (matrix[0] ?? []).map((value) => String(value ?? '').trim())
        const rows = matrix.slice(1).filter((row) => row.some((value) => value !== null && value !== '')).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ''])))
        const type = identifyFile(headers)
        if (!type) throw new Error('无法识别文件类型，或缺少必要栏位')
        const audit = validateRows(rows, type)
        parsed.push({ id: `${file.name}-${file.lastModified}`, name: file.name, type, rowCount: rows.length, headers, data: rows, ...audit })
      } catch (error) {
        parsed.push({ id: `${file.name}-${file.lastModified}`, name: file.name, error: error.message })
      }
    }
    setFiles(parsed)
    setBusy(false)
  }

  const totals = files.reduce((sum, file) => ({ rows: sum.rows + (file.rowCount ?? 0), valid: sum.valid + (file.valid ?? 0), warnings: sum.warnings + (file.warnings ?? 0), errors: sum.errors + (file.errors ?? 0) }), { rows: 0, valid: 0, warnings: 0, errors: 0 })
  const relationshipReport = files.length ? analyzeRelationships(files) : null

  return <div className="page import-page">
    <button type="button" className="import-back" onClick={onBack}>← 返回总览</button>
    <div className="import-title"><div><em>JODOO DATA SYNC</em><h1>Excel 导入预览</h1><p>先检查文件和资料变化；这个步骤不会修改源文件，也不会写入数据库。</p></div><span className="safe-badge">只读检查模式</span></div>

    <section className={dragging ? 'drop-zone dragging' : 'drop-zone'} onDragOver={(event) => { event.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); processFiles(event.dataTransfer.files) }}>
      <span className="upload-icon">⇧</span><h2>拖入 Jodoo 导出的 Excel</h2><p>可以一次选择 Customer List、Customer Branch、BranchSchedule、AreaInfo 和 Customer Location Update。</p>
      <button type="button" onClick={() => inputRef.current?.click()} disabled={busy}>{busy ? '正在检查…' : '选择 Excel 文件'}</button>
      <input ref={inputRef} type="file" accept=".xlsx" multiple hidden onChange={(event) => processFiles(event.target.files)}/><small>支持 .xlsx · 文件只在当前浏览器中读取</small>
    </section>

    {files.length > 0 && <>
      <section className="import-summary"><article><span>检查记录</span><strong>{totals.rows}</strong></article><article className="ok"><span>可接受</span><strong>{totals.valid}</strong></article><article className="warn"><span>需要注意</span><strong>{totals.warnings}</strong></article><article className="bad"><span>阻止导入</span><strong>{totals.errors}</strong></article></section>
      <section className="file-results"><div className="result-heading"><div><em>检查结果</em><h2>已选择文件</h2></div><button type="button" onClick={() => { setFiles([]); if (inputRef.current) inputRef.current.value = '' }}>清除全部</button></div>
        {files.map((file) => <FileResult key={file.id} file={file}/>)}</section>
      {relationshipReport && <RelationshipReport report={relationshipReport}/>} 
    </>}
  </div>
}

function RelationshipReport({ report }) {
  const [openGroup, setOpenGroup] = useState(null)
  if (!report.ready) return <section className="relationship-report incomplete"><em>跨表关联检查</em><h2>还需要其他资料文件</h2><p>加入以下文件后，系统才能检查五份资料之间的编号关系：</p><div>{report.missingTypes.map((type) => <span key={type}>{type}</span>)}</div></section>
  const issueCount = report.groups.reduce((total, group) => total + group.items.length, 0)
  const s = report.summary
  return <section className="relationship-report"><div className="report-title"><div><em>跨表关联检查</em><h2>准备导入报告</h2><p>以下结果由五份文件即时交叉核对产生。</p></div><span className={issueCount ? 'report-status attention' : 'report-status'}>{issueCount ? `${issueCount} 项需要核对` : '全部关联通过'}</span></div>
    <div className="relation-stats"><article><span>客户／分店</span><strong>{s.customers} / {s.branches}</strong></article><article><span>已有排程</span><strong>{s.schedules}</strong></article><article><span>有效 GPS</span><strong>{s.branchesWithCoordinates}</strong></article><article className="route-ready"><span>可测试路线</span><strong>{s.readyForRouting}</strong></article></div>
    <div className="readiness-grid"><div><span>已有排程但缺少 GPS</span><strong>{s.scheduledMissingGps}</strong><small>继续通过 Location Update 补充</small></div><div><span>尚未安排排程</span><strong>{s.branchesWithoutSchedule}</strong><small>可保留在主档，之后再安排</small></div><div><span>GPS 更新记录</span><strong>{s.gpsUpdates}</strong><small>全部参与 BranchID 关联检查</small></div><div><span>区域主档</span><strong>{s.areas}</strong><small>用于司机和区域分配</small></div></div>
    <div className="relation-groups">{report.groups.map((group, index) => <article key={group.title} className={group.level}><button type="button" onClick={() => setOpenGroup(openGroup === index ? null : index)}><span><i>{group.level === 'error' ? '!' : '?'}</i><b>{group.title}</b></span><span><strong>{group.items.length}</strong>{openGroup === index ? '⌃' : '⌄'}</span></button>{openGroup === index && <div className="relation-items">{group.items.length ? group.items.slice(0, 50).map((item, itemIndex) => <div key={`${item.id}-${itemIndex}`}><b>{item.id || '—'}</b><span>{item.name || '—'}<small>{item.detail}</small></span></div>) : <p>没有发现此类问题。</p>}</div>}</article>)}</div>
    <div className="report-note"><b>当前为只读预览</b><span>尚未建立数据库，因此页面不会出现“确认导入”按钮。先核对异常，再进入正式资料储存阶段。</span></div>
  </section>
}

function FileResult({ file }) {
  const [expanded, setExpanded] = useState(false)
  if (file.error) return <article className="file-row file-error"><div className="file-mark">!</div><div><strong>{file.name}</strong><p>{file.error}</p></div><span>无法读取</span></article>
  const exceptions = file.results.filter((row) => row.errors.length || row.warnings.length)
  return <article className="file-card"><button type="button" className="file-row" onClick={() => setExpanded(!expanded)}><div className="file-mark">XL</div><div><strong>{file.name}</strong><p>{file.type.label} · {file.rowCount} 笔记录 · {file.headers.length} 个栏位</p></div><div className="file-counts"><span className="ok">{file.valid} 正常</span><span className="warn">{file.warnings} 注意</span><span className="bad">{file.errors} 错误</span></div><b>{expanded ? '⌃' : '⌄'}</b></button>
    {expanded && <div className="file-detail">{file.correctedDays > 0 && <div className="auto-fix">系统识别到 {file.correctedDays} 笔含有 “Thurday”，确认导入时将自动标准化为 “Thursday”。</div>}{exceptions.length ? <div className="exception-table"><div className="exception-head"><span>Excel 行</span><span>编号／名称</span><span>检查结果</span></div>{exceptions.slice(0, 30).map((row) => <div key={row.rowNumber}><span>{row.rowNumber}</span><span><b>{row.key}</b><small>{row.name}</small></span><span>{row.errors.map((error) => <i className="error-tag" key={error}>{error}</i>)}{row.warnings.map((warning) => <i className="warning-tag" key={warning}>{warning}</i>)}</span></div>)}</div> : <p className="all-clear">所有记录均通过目前的文件内验证。</p>}{exceptions.length > 30 && <p className="more-issues">另外还有 {exceptions.length - 30} 笔异常未在预览中展开。</p>}</div>}
  </article>
}
