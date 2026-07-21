import { useMemo, useState } from 'react'
import { canCompleteStop, completedStepCount, firstAvailableStopIndex, isStopDeferred, isStopFinished, isStopUnlocked, requiredStepsForStop } from './dispatchWorkflow.js'

const emptySteps = () => ({ gps: false, jodooSync: false, invoicePhoto: false, sitePhoto: false, paymentProof: false, noCollectionDetails: false, noCollectionEvidence: false })
const emptyFiles = () => ({ invoicePhoto: '', sitePhoto: '', paymentProof: '' })
const emptySync = () => ({ invoicePhoto: 'empty', sitePhoto: 'empty', paymentProof: 'empty' })
const whatsappOptions = [
  { id: 'invoicePhoto', label: '单据照片' },
  { id: 'sitePhoto', label: '现场照片' },
  { id: 'paymentProof', label: '付款证明' },
]
const initialStops = [
  { id: '10408', customer: 'DIY SJC', area: 'Serian', paymentType: 'Credit', status: 'active', outcome: 'collection', noCollectionTiming: 'at_site', noCollectionReason: '', noCollectionEvidenceName: '', steps: emptySteps(), files: emptyFiles(), proofSync: emptySync(), whatsappStatus: 'waiting', jodooRecord: null },
  { id: '10389', customer: 'DIY TEBEDU', area: 'Tebedu', paymentType: 'Credit', status: 'locked', outcome: 'collection', noCollectionTiming: 'at_site', noCollectionReason: '', noCollectionEvidenceName: '', steps: emptySteps(), files: emptyFiles(), proofSync: emptySync(), whatsappStatus: 'waiting', jodooRecord: null },
  { id: '10275', customer: 'SIN JOON MIAW', area: 'Siburan', paymentType: 'Cash', status: 'locked', outcome: 'collection', noCollectionTiming: 'at_site', noCollectionReason: '', noCollectionEvidenceName: '', steps: emptySteps(), files: emptyFiles(), proofSync: emptySync(), whatsappStatus: 'waiting', jodooRecord: null },
]

export default function DispatchPage({ onBack }) {
  const [stops, setStops] = useState(initialStops)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [manualGpsOpen, setManualGpsOpen] = useState(false)
  const [manualGpsReason, setManualGpsReason] = useState('')
  const [overrideOpen, setOverrideOpen] = useState(false)
  const [overrideReason, setOverrideReason] = useState('')
  const [overrideNote, setOverrideNote] = useState('')
  const [deferOpen, setDeferOpen] = useState(false)
  const [deferReason, setDeferReason] = useState('')
  const [deferNote, setDeferNote] = useState('')
  const [whatsappPolicy, setWhatsappPolicy] = useState({ invoicePhoto: true, sitePhoto: false, paymentProof: true })
  const [policyOpen, setPolicyOpen] = useState(false)
  const [jodooLinkNotice, setJodooLinkNotice] = useState(false)
  const stop = stops[selectedIndex]
  const unlocked = isStopUnlocked(stops, selectedIndex)
  const finishedCount = stops.filter(isStopFinished).length
  const requiredSteps = requiredStepsForStop(stop)
  const whatsappPhotoKeys = whatsappOptions.filter((option) => whatsappPolicy[option.id]).map((option) => option.id)
  const whatsappReady = stop.outcome === 'collection' && whatsappPhotoKeys.every((key) => stop.steps[key] && stop.files[key])
  const jodooInvoiceFormUrl = import.meta.env.VITE_JODOO_INVOICE_FORM_URL

  const progress = useMemo(() => Math.round((finishedCount / stops.length) * 100), [finishedCount, stops.length])
  const updateStop = (patch) => setStops((current) => current.map((item, index) => index === selectedIndex ? { ...item, ...patch } : item))

  const verifyGps = (mode, note = '') => {
    updateStop({ steps: { ...stop.steps, gps: true }, gpsMode: mode, gpsNote: note, gpsVerifiedAt: new Date().toLocaleTimeString('zh-MY', { hour: '2-digit', minute: '2-digit' }) })
    setManualGpsOpen(false); setManualGpsReason('')
  }

  const setOutcome = (outcome) => {
    updateStop({ outcome })
  }

  const simulateJodooSync = () => {
    const jodooRecord = { dataId: `JD-${stop.id}-${new Date().getTime().toString().slice(-6)}`, collectionStatus: '收货流程已完成', weightKg: stop.id === '10275' ? 88.4 : 125.5, invoiceNumber: `INV-${stop.id}-01`, syncedAt: new Date().toLocaleString('zh-MY') }
    updateStop({ jodooRecord, steps: { ...stop.steps, jodooSync: true } })
  }

  const selectProof = (stepKey, file) => {
    const fileName = file?.name ?? ''
    updateStop({ files: { ...stop.files, [stepKey]: fileName }, proofSync: { ...stop.proofSync, [stepKey]: fileName ? 'queued' : 'empty' }, whatsappStatus: 'waiting', steps: { ...stop.steps, [stepKey]: Boolean(fileName) } })
  }

  const updateNoCollectionReason = (reason) => updateStop({ noCollectionReason: reason, steps: { ...stop.steps, noCollectionDetails: Boolean(reason) } })
  const selectNoCollectionEvidence = (file) => {
    const noCollectionEvidenceName = file?.name ?? ''
    updateStop({ noCollectionEvidenceName, noCollectionSyncStatus: noCollectionEvidenceName ? 'queued' : 'empty', steps: { ...stop.steps, noCollectionEvidence: Boolean(noCollectionEvidenceName) } })
  }

  const openJodooInvoiceForm = () => {
    if (!jodooInvoiceFormUrl) { setJodooLinkNotice(true); return }
    try {
      const url = new URL(jodooInvoiceFormUrl)
      url.searchParams.set('branch_id', stop.id)
      url.searchParams.set('customer_name', stop.customer)
      window.open(url.toString(), '_blank', 'noopener,noreferrer')
      setJodooLinkNotice(false)
    } catch { setJodooLinkNotice(true) }
  }

  const deferStop = () => {
    if (!stop.steps.gps || !deferReason || !deferNote.trim()) return
    const deferral = { reason: deferReason, note: deferNote.trim(), deferredAt: new Date().toLocaleString('zh-MY') }
    const nextStops = stops.map((item, index) => index === selectedIndex ? { ...item, status: 'deferred', deferrals: [...(item.deferrals || []), deferral] } : item)
    setStops(nextStops); setDeferOpen(false); setDeferReason(''); setDeferNote('')
    const nextIndex = firstAvailableStopIndex(nextStops)
    if (nextIndex !== selectedIndex) setSelectedIndex(nextIndex)
  }

  const resumeDeferredStop = () => updateStop({ status: 'active', resumedAt: new Date().toLocaleString('zh-MY') })

  const toggleWhatsappPolicy = (key) => {
    const selectedCount = Object.values(whatsappPolicy).filter(Boolean).length
    if (whatsappPolicy[key] && selectedCount === 1) return
    setWhatsappPolicy((current) => ({ ...current, [key]: !current[key] }))
    setStops((current) => current.map((item) => ({ ...item, whatsappStatus: 'waiting' })))
  }

  const simulateWhatsappSend = () => {
    if (!whatsappReady) return
    updateStop({ whatsappStatus: 'sent', whatsappSentAt: new Date().toLocaleString('zh-MY'), whatsappPhotoCount: whatsappPhotoKeys.length })
  }

  const completeStop = () => {
    if (!canCompleteStop(stop)) return
    const nextStops = stops.map((item, index) => index === selectedIndex ? { ...item, status: 'completed', completedAt: new Date().toLocaleTimeString('zh-MY', { hour: '2-digit', minute: '2-digit' }) } : item)
    setStops(nextStops)
    const nextIndex = firstAvailableStopIndex(nextStops)
    if (nextIndex !== selectedIndex) setSelectedIndex(nextIndex)
  }

  const overrideStop = () => {
    if (!overrideReason || !overrideNote.trim()) return
    const nextStops = stops.map((item, index) => index === selectedIndex ? { ...item, status: 'overridden', overrideReason, overrideNote: overrideNote.trim() } : item)
    setStops(nextStops); setOverrideOpen(false); setOverrideReason(''); setOverrideNote('')
    const nextIndex = firstAvailableStopIndex(nextStops)
    if (nextIndex !== selectedIndex) setSelectedIndex(nextIndex)
  }

  return <div className="page dispatch-page">
    <button type="button" className="dispatch-back" onClick={onBack}>← 返回总览</button>
    <div className="dispatch-title"><div><em>DRIVER WORKFLOW PROTOTYPE</em><h1>今日派车 · 测试路线</h1><p>Jodoo 开单资料进入 KCS 后，司机完成 KCS 要求即可前往下一家；照片由后台继续同步。</p></div><span>Jodoo 后台同步测试</span></div>
    <section className="route-summary"><div><span>测试车辆</span><strong>Lorry A — 未设置号码/车牌</strong></div><div><span>司机</span><strong>测试司机</strong></div><div><span>路线进度</span><strong>{finishedCount} / {stops.length}</strong></div><div className="route-progress"><span><i style={{ width: `${progress}%` }}/></span><small>{progress}% 完成</small></div></section>

    <div className="dispatch-layout"><aside className="stop-list"><div className="stop-list-title"><em>今日路线</em><h2>顾客顺序</h2></div>{stops.map((item, index) => {
      const available = isStopUnlocked(stops, index)
      return <button type="button" key={item.id} disabled={!available} className={`${selectedIndex === index ? 'selected ' : ''}${isStopFinished(item) ? item.status : isStopDeferred(item) ? 'deferred' : available ? 'available' : 'locked'}`} onClick={() => { setSelectedIndex(index); setOverrideOpen(false); setManualGpsOpen(false); setDeferOpen(false) }}><span className="stop-number">{isStopFinished(item) ? '✓' : isStopDeferred(item) ? '↩' : index + 1}</span><span><strong>{item.customer}</strong><small>{item.area} · Branch {item.id}</small></span><b>{item.status === 'completed' ? (item.outcome === 'no_collection' ? '无货完成' : '已完成') : item.status === 'overridden' ? '异常跳过' : isStopDeferred(item) ? '待返回' : available ? '进行中' : '未解锁'}</b></button>
    })}</aside>

      <section className="stop-workspace">{!unlocked ? <LockedStop stop={stop}/> : isStopFinished(stop) ? <FinishedStop stop={stop}/> : isStopDeferred(stop) ? <DeferredStop stop={stop} onResume={resumeDeferredStop}/> : <>
        <div className="stop-header"><div><em>第 {selectedIndex + 1} 站</em><h2>{stop.customer}</h2><p>{stop.area} · Branch ID {stop.id} · {stop.paymentType}</p></div><span>{completedStepCount(stop)} / {requiredSteps.length} 项完成</span></div>
        <div className="workflow-note"><strong>解锁原则</strong><span>Jodoo 开单资料进入 KCS 后，司机只需完成 KCS 要求；照片回传 Jodoo 和 WhatsApp 通知由后台继续处理，不必现场等待。</span></div>
        <div className="step-list">
          <WorkflowStep number="1" title="GPS 到达验证" done={stop.steps.gps} optional={stop.outcome === 'no_collection' && stop.noCollectionTiming === 'before_arrival'} statusText={stop.steps.gps ? `${stop.gpsMode === 'manual' ? '人工验证' : '自动验证'} · ${stop.gpsVerifiedAt}` : undefined}>
            <p>{stop.outcome === 'no_collection' && stop.noCollectionTiming === 'before_arrival' ? '顾客出发前已通知无货，此分支不强制司机到现场验证 GPS。' : '到达顾客地点时先自动检查 GPS；定位失败时可填写原因并人工验证。'}</p>
            <div className="step-actions"><button type="button" onClick={() => verifyGps('automatic')}>{stop.steps.gps ? '重新自动验证（测试）' : '自动验证 GPS（测试）'}</button><button type="button" className="secondary-action" onClick={() => setManualGpsOpen(!manualGpsOpen)}>无法定位，人工验证</button></div>
            {manualGpsOpen && <div className="manual-gps"><select value={manualGpsReason} onChange={(event) => setManualGpsReason(event.target.value)}><option value="">选择定位失败原因</option><option>手机 GPS 信号弱</option><option>顾客地址坐标不准确</option><option>现场位于建筑物内</option><option>其他</option></select><button type="button" disabled={!manualGpsReason} onClick={() => verifyGps('manual', manualGpsReason)}>记录原因并确认到达</button></div>}
          </WorkflowStep>

          <div className="defer-section"><button type="button" disabled={!stop.steps.gps} onClick={() => setDeferOpen(!deferOpen)}>暂时无法收货，稍后返回</button><p>{stop.steps.gps ? '记录现场情况后可先处理下一家，此顾客会保留为“待返回”。' : '完成 GPS 到达验证后才能暂缓此站。'}</p>{deferOpen && <div className="defer-form"><strong>暂缓此站并开放下一家</strong><select value={deferReason} onChange={(event) => setDeferReason(event.target.value)}><option value="">选择暂缓原因</option><option>现场没有停车位置</option><option>店员忙，要求稍后再来</option><option>顾客指定稍后收货</option><option>现场暂时无法卸货／装货</option><option>其他</option></select><textarea value={deferNote} placeholder="填写店员要求、预计返回时间或现场说明" onChange={(event) => setDeferNote(event.target.value)}/><button type="button" disabled={!deferReason || !deferNote.trim()} onClick={deferStop}>保留此顾客并前往下一家 →</button></div>}</div>

          <article className="outcome-card"><div><strong>第 2 步 · 本站结果</strong><small>必须选择</small></div><p>司机根据实际情况选择，选择后系统会显示对应流程。</p><div className="outcome-options"><button type="button" className={stop.outcome === 'collection' ? 'selected' : ''} onClick={() => setOutcome('collection')}><strong>有货可收</strong><span>等待 Jodoo 完成收货、重量和开单</span></button><button type="button" className={stop.outcome === 'no_collection' ? 'selected no-stock' : ''} onClick={() => setOutcome('no_collection')}><strong>没有货可收</strong><span>上传无货证据，不需要开单</span></button></div></article>

          {stop.outcome === 'collection' ? <>
            <WorkflowStep number="2A" title="从 Jodoo 取得开单资料" done={stop.steps.jodooSync} statusText={stop.jodooRecord ? `已收到 · ${stop.jodooRecord.syncedAt}` : undefined}>
              <p>直接从这里进入指定的 Jodoo 开单表单；提交后回到 KCS，开单资料会自动传入本站。</p>
              <div className="jodoo-launch"><button type="button" onClick={openJodooInvoiceForm}>前往 Jodoo 开单 ↗</button><span>直接进入此顾客的表单，不需要在 Jodoo 重新寻找顾客。</span></div>
              {jodooLinkNotice && <div className="jodoo-link-notice">尚未配置贵公司的 Jodoo 开单表单链接；取得正式链接后，此按钮会直接打开对应表单。</div>}
              {stop.jodooRecord && <div className="jodoo-record"><span><small>收货状态</small><strong>{stop.jodooRecord.collectionStatus}</strong></span><span><small>重量</small><strong>{stop.jodooRecord.weightKg} kg</strong></span><span><small>Invoice</small><strong>{stop.jodooRecord.invoiceNumber}</strong></span><span><small>Jodoo Data ID</small><strong>{stop.jodooRecord.dataId}</strong></span></div>}
              <button type="button" onClick={simulateJodooSync}>{stop.jodooRecord ? '从 Jodoo 重新读取（测试）' : '模拟已从 Jodoo 收到开单资料'}</button>
            </WorkflowStep>
            <ProofStep number="3" title="账单／单据照片" stepKey="invoicePhoto" stop={stop} onSelect={selectProof} description="照片交给 KCS 后立即算完成；KCS 会在后台回传 Jodoo。" />
            <ProofStep number="4" title="现场照片" stepKey="sitePhoto" stop={stop} onSelect={selectProof} description="上传完成收货后的现场照片，后台自动排队同步。" />
            <ProofStep number="5" title="付款证明" stepKey="paymentProof" stop={stop} onSelect={selectProof} description={stop.paymentType === 'Cash' ? '上传现金收款记录或其他付款证明；司机不需要等待 Jodoo。' : '上传 Credit 签收、转账或公司规定的付款证明；司机不需要等待 Jodoo。'} />
          </> : <NoCollectionFlow stop={stop} updateStop={updateStop} updateReason={updateNoCollectionReason} selectEvidence={selectNoCollectionEvidence}/>} 
        </div>

        <div className="channel-status"><div><span className={stop.outcome === 'no_collection' ? (stop.steps.noCollectionEvidence ? 'channel-ok' : 'channel-wait') : (stop.steps.jodooSync ? 'channel-ok' : 'channel-wait')}>J</span><p><strong>Jodoo 连接</strong><small>{stop.outcome === 'no_collection' ? (stop.steps.noCollectionEvidence ? '无收货资料已交给后台回传' : '等待司机提交无收货证据') : (stop.steps.jodooSync ? '开单资料已收到；照片由后台继续回传' : '等待开单资料进入 KCS')}</small></p></div><div><span className="channel-optional">W</span><p><strong>WhatsApp 公司群</strong><small>{stop.outcome === 'no_collection' ? '无收货通知可由后台按公司规定发送' : stop.whatsappStatus === 'sent' ? `已发送 ${stop.whatsappPhotoCount} 张 · ${stop.whatsappSentAt}` : `公司规定发送 ${whatsappPhotoKeys.length} 张；失败时后台重试，不阻挡路线`}</small></p></div></div>
        {stop.outcome === 'collection' && <section className="whatsapp-panel"><div className="whatsapp-panel-title"><div><em>COMPANY PHOTO POLICY</em><strong>WhatsApp 通知照片</strong></div><button type="button" onClick={() => setPolicyOpen(!policyOpen)}>公司设置（测试）</button></div><p>默认只发送单据照片和付款证明。KCS 使用司机已提交的同一份文件排队发送，不要求司机等待。</p><div className="whatsapp-photo-list">{whatsappOptions.map((option) => <span key={option.id} className={whatsappPolicy[option.id] ? 'included' : 'excluded'}><b>{whatsappPolicy[option.id] ? '✓' : '—'}</b>{option.label}<small>{whatsappPolicy[option.id] ? '发送' : '不发送'}</small></span>)}</div>{policyOpen && <div className="whatsapp-policy-editor"><strong>管理员可选择发送内容</strong>{whatsappOptions.map((option) => <label key={option.id}><input type="checkbox" checked={whatsappPolicy[option.id]} onChange={() => toggleWhatsappPolicy(option.id)}/>{option.label}</label>)}<small>至少保留一种照片；正式系统只有管理员可以修改。</small></div>}<button type="button" className="whatsapp-send" disabled={!whatsappReady || stop.whatsappStatus === 'sent'} onClick={simulateWhatsappSend}>{stop.whatsappStatus === 'sent' ? `✓ 已发送 ${stop.whatsappPhotoCount} 张（测试）` : whatsappReady ? `发送 ${whatsappPhotoKeys.length} 张到 WhatsApp（测试）` : '等待司机提交公司规定的照片'}</button></section>}
        <div className="completion-panel"><div><strong>{canCompleteStop(stop) ? 'KCS 要求已完成' : '下一站仍然锁定'}</strong><p>{canCompleteStop(stop) ? '立即开放下一位顾客；Jodoo 与 WhatsApp 由后台继续处理。' : `还需要完成 ${requiredSteps.length - completedStepCount(stop)} 个司机步骤。`}</p></div><button type="button" disabled={!canCompleteStop(stop)} onClick={completeStop}>完成此站并前往下一站 →</button></div>
        <div className="override-section"><button type="button" onClick={() => setOverrideOpen(!overrideOpen)}>主管异常处理</button>{overrideOpen && <div className="override-form"><strong>主管强制跳过（测试）</strong><p>正式系统会要求主管身份验证，并保存操作人、时间和原因。</p><select value={overrideReason} onChange={(event) => setOverrideReason(event.target.value)}><option value="">选择原因</option><option>顾客临时取消</option><option>Jodoo 同步故障</option><option>顾客无法签收</option><option>车辆紧急离开</option><option>其他</option></select><textarea value={overrideNote} placeholder="必须填写详细备注" onChange={(event) => setOverrideNote(event.target.value)}/><button type="button" disabled={!overrideReason || !overrideNote.trim()} onClick={overrideStop}>记录异常并解锁下一站</button></div>}</div>
      </>}</section>
    </div>
  </div>
}

function NoCollectionFlow({ stop, updateStop, updateReason, selectEvidence }) {
  return <div className="no-collection-flow"><WorkflowStep number="2B" title="记录无收货情况" done={stop.steps.noCollectionDetails} statusText={stop.steps.noCollectionDetails ? '原因已记录' : undefined}>
    <p>如果顾客提前来电，司机不必为了 GPS 特地前往现场；如果到场才发现无货，则保留 GPS 记录。</p>
    <div className="timing-options"><label><input type="radio" name={`timing-${stop.id}`} checked={stop.noCollectionTiming === 'at_site'} onChange={() => updateStop({ noCollectionTiming: 'at_site' })}/> 到现场才发现无货</label><label><input type="radio" name={`timing-${stop.id}`} checked={stop.noCollectionTiming === 'before_arrival'} onChange={() => updateStop({ noCollectionTiming: 'before_arrival' })}/> 顾客出发前来电通知</label></div>
    <select className="reason-select" value={stop.noCollectionReason} onChange={(event) => updateReason(event.target.value)}><option value="">选择无收货原因</option><option>顾客没有纸盒／没有货</option><option>顾客当天电话通知没有货</option><option>顾客关门或无人接待</option><option>顾客拒绝本次收货</option><option>其他</option></select>
  </WorkflowStep>
  <WorkflowStep number="3B" title="上传无收货证据" done={stop.steps.noCollectionEvidence} statusText={stop.noCollectionEvidenceName ? 'KCS 已接收 · 后台同步' : undefined}><p>可上传现场空货照片、顾客 WhatsApp／来电截图或其他公司认可的证明。提交 KCS 后即可继续，Jodoo 回传在后台完成。</p><label className="file-action">{stop.noCollectionEvidenceName ? `✓ ${stop.noCollectionEvidenceName}` : '拍照或选择证据'}<input type="file" accept="image/*,.pdf" hidden onChange={(event) => selectEvidence(event.target.files?.[0])}/></label></WorkflowStep></div>
}

function WorkflowStep({ number, title, done, optional, statusText, children }) { return <article className={done ? 'workflow-step done' : 'workflow-step'}><span className="step-number">{done ? '✓' : number}</span><div><div className="step-heading"><strong>{title}</strong><small>{statusText || (optional ? '此分支可选' : done ? '已完成' : '必须完成')}</small></div>{children}</div></article> }
function ProofStep({ number, title, stepKey, stop, onSelect, description }) { const fileName = stop.files[stepKey]; return <WorkflowStep number={number} title={title} done={stop.steps[stepKey]} statusText={fileName ? 'KCS 已接收 · 后台同步' : undefined}><p>{description}</p><label className="file-action">{fileName ? `✓ ${fileName}` : '拍照或选择图片／PDF'}<input type="file" accept="image/*,.pdf" hidden onChange={(event) => onSelect(stepKey, event.target.files?.[0])}/></label></WorkflowStep> }
function LockedStop({ stop }) { return <div className="locked-stop"><span>⌑</span><em>顺序流程锁定</em><h2>{stop.customer}</h2><p>必须先完成前一位顾客的全部流程，才能进入此站。</p></div> }
function DeferredStop({ stop, onResume }) { const latest = stop.deferrals?.at(-1); return <div className="locked-stop deferred-stop"><span>↩</span><em>此顾客保留 · 待返回</em><h2>{stop.customer}</h2><p><strong>{latest?.reason}</strong><br/>{latest?.note}<br/>暂缓时间：{latest?.deferredAt}</p><button type="button" onClick={onResume}>现在返回此顾客继续处理</button><small>已完成的 GPS 和其他资料会继续保留，不需要重复填写。</small></div> }
function FinishedStop({ stop }) { return <div className="locked-stop finished"><span>✓</span><em>{stop.status === 'overridden' ? '主管异常处理' : stop.outcome === 'no_collection' ? '无收货记录已完成' : '此站已完成'}</em><h2>{stop.customer}</h2><p>{stop.status === 'overridden' ? `${stop.overrideReason}：${stop.overrideNote}` : stop.outcome === 'no_collection' ? `无收货原因：${stop.noCollectionReason}。KCS 已接收证据，后台继续回传 Jodoo。` : `KCS 要求已完成。照片回传 Jodoo 与 WhatsApp 通知在后台继续处理。完成时间：${stop.completedAt}`}</p></div> }
