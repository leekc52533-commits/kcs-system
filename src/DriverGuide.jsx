import CenteredNotice from './CenteredNotice.jsx'
import {useEffect,useRef,useState} from 'react'
import {useI18n} from './i18n.jsx'
import './DriverGuide.css'
const tomorrowGuide={
  "zh": {
    "title": "明天行程：司机先排，主管后批",
    "steps": [
      "进入「明天行程」，检查自己负责的客户名单。",
      "主管批准前，使用客户旁的「↑ 上移／↓ 下移」调整先后顺序，可以反复调整，无需每次申请批准。",
      "排好后按「已检查，提交主管」。即使顺序不用改，也请按此按钮。",
      "提交后再改动，检查状态会失效；请核对后重新按「已检查，提交主管」。",
      "主管查看司机的检查状态、姓名、时间及客户顺序，核对后批准，作为正式执行顺序。"
    ],
    "scope": "此功能只调整本人明天行程内的客户先后顺序，不修改客户 GPS、收货日期、车辆、人员或客户名单。跟车员及只读预览不能代替司机提交检查。",
    "order": "已批准行程：修改顺序须申请",
    "orderHelp": "主管批准后，不能在明天行程直接改顺序。请联系主管处理；执行时需要调整顺序，应提交顺序修改申请和原因，批准前仍按原顺序执行。「已检查」不代表已批准。"
  },
  "ms": {
    "title": "Perjalanan esok: pemandu susun, penyelia luluskan",
    "steps": [
      "Buka perjalanan esok dan semak senarai pelanggan yang ditugaskan kepada anda.",
      "Sebelum penyelia meluluskan, gunakan “↑ Naik / ↓ Turun” di sebelah pelanggan untuk menyusun turutan. Boleh ubah beberapa kali tanpa memohon kelulusan setiap kali.",
      "Selepas semak, tekan “Sudah semak, hantar kepada penyelia”. Tekan juga jika turutan sedia ada sudah betul.",
      "Jika turutan diubah selepas dihantar, status semakan terbatal. Semak semula dan tekan “Sudah semak, hantar kepada penyelia” sekali lagi.",
      "Penyelia menyemak status, nama pemandu, masa semakan dan turutan pelanggan sebelum meluluskan turutan untuk dilaksanakan."
    ],
    "scope": "Fungsi ini hanya menyusun turutan pelanggan dalam perjalanan anda esok. GPS pelanggan, tarikh kutipan, kenderaan, kakitangan dan senarai pelanggan tidak berubah. Kelindan dan pratonton baca sahaja tidak boleh menghantar semakan bagi pihak pemandu.",
    "order": "Perjalanan diluluskan: mohon untuk ubah turutan",
    "orderHelp": "Selepas kelulusan, turutan tidak boleh diubah terus dalam perjalanan esok. Hubungi penyelia; untuk perubahan semasa pelaksanaan, hantar permohonan turutan beserta sebab dan ikut turutan asal sehingga diluluskan. “Sudah semak” bukan kelulusan."
  },
  "en": {
    "title": "Tomorrow’s trip: driver plans, supervisor approves",
    "steps": [
      "Open tomorrow’s trips and check your assigned customer list.",
      "Before supervisor approval, use “↑ Move up / ↓ Move down” beside a customer to arrange the order. You can make repeated changes without requesting approval each time.",
      "When ready, press “Checked, submit to supervisor”. Submit a check even if no order changes are needed.",
      "Editing after submission invalidates your check. Review the plan and press “Checked, submit to supervisor” again.",
      "The supervisor reviews the checked status, driver name, check time and customer order, then approves the order for execution."
    ],
    "scope": "This only changes customer order within your own tomorrow trip. It does not change customer GPS, collection dates, vehicles, staff or the customer list. Crew and read-only previews cannot submit a check on behalf of the driver.",
    "order": "Approved trips: request order changes",
    "orderHelp": "After approval, tomorrow’s order cannot be edited directly. Contact your supervisor; during execution, submit an order-change request with a reason and follow the original order until approved. “Checked” does not mean approved."
  }
}
export function DriverGuide({popup=false}){
 const{t,language}=useI18n(),plan=tomorrowGuide[language]||tomorrowGuide.en
 return <section className="driver-guide"><h2 id={popup?'driver-guide-title':undefined}>{t(popup?'guide.welcome':'guide.title')}</h2><p className="driver-guide-location">{t('guide.where')}</p><p>{t('guide.effective')}</p><section data-i18n-raw><h3>{plan.title}</h3><ol>{plan.steps.map(step=><li key={step}>{step}</li>)}</ol><p>{plan.scope}</p></section><h3>{t('guide.workflow')}</h3><ol>{['route','start','arrive','bill','proof','finish'].map(key=><li key={key}><strong>{t('guide.step.'+key)}</strong><p>{t('guide.step.'+key+'.help')}</p></li>)}</ol><h3>{t('guide.rules')}</h3>{['order','advance','onsite','temporary','transfer','return'].map(key=><article key={key}><strong>{key==='order'?plan.order:t('guide.rule.'+key)}</strong><p>{key==='order'?plan.orderHelp:t('guide.rule.'+key+'.help')}</p></article>)}<h3>{t('guide.blocked')}</h3><ul>{['noRoute','noTrip','gps','waiting','role'].map(key=><li key={key}>{t('guide.help.'+key)}</li>)}</ul><p className="driver-guide-location">{t('guide.where')}</p></section>
}
export function DriverGuidePopup({onRead,onDismiss}){
 const{t}=useI18n(),ref=useRef(null),heading=useRef(null),[busy,setBusy]=useState(false),[error,setError]=useState('')
 useEffect(()=>{const d=ref.current,previous=document.activeElement;if(d.showModal)d.showModal();else d.setAttribute('open','');heading.current?.focus();d.scrollTop=0;return()=>{if(d.close)d.close();previous?.focus?.()}},[])
 const read=async()=>{setBusy(true);setError('');try{await onRead()}catch(e){setError(e.message);setBusy(false)}}
 return <dialog ref={ref} className="notice-popup driver-guide-popup" aria-labelledby="driver-guide-title" onCancel={e=>e.preventDefault()}><div ref={heading} tabIndex={-1}><DriverGuide popup/></div>{error&&<CenteredNotice>{error}</CenteredNotice>}<button data-preview-safe={onDismiss?true:undefined} className="notice-primary" disabled={busy} onClick={onDismiss||read}>{t(onDismiss?'preview.dismiss':busy?'common.processing':'guide.understood')}</button></dialog>
}
export function DriverNextStep({trip,preview=false}){
 const{t}=useI18n();if(preview)return <p className="driver-next-step">{t('guide.next.preview')}</p>
 const stop=trip.stops.find(s=>s.id===trip.currentStopId),pending=trip.stops.some(s=>s.deferApprovalStatus==='pending')
 const key=trip.executionStatus==='completed'?'done':trip.approved===false?'approval':pending?'waiting':trip.canStart?'start':trip.executionStatus==='not_started'?'earlier':trip.canComplete?'finishTrip':!stop?'refresh':!stop.arrivedAt?'arrive':!stop.billCreated?'bill':stop.billPaymentMethod==='Cash'&&!stop.paymentProofUploaded?'proof':'finish'
 return <p className="driver-next-step"><strong>{t('guide.next')}</strong> {t('guide.next.'+key)}{stop&&['arrive','bill','proof','finish'].includes(key)&&<> · <span data-i18n-raw>{stop.branchName}</span></>}</p>
}
