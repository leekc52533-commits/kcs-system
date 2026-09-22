import {useEffect,useRef,useState} from 'react'
import {apiRequest as api} from './apiClient.js'
import {useI18n} from './i18n.jsx'
export const locationWords={
 en:{title:'Address & Area check',check:'Check address & Area',checking:'Checking…',hint:'Review the suggested address and Area, then save them with the customer. Zone follows Area.',current:'Current',suggested:'Suggested / editable',address:'Address',area:'Area',zone:'Zone',use:'Include with customer save',keep:'Keep current details',included:'Included in your next customer save.',pending:'Address / Area awaiting supervisor review',approve:'Approve',reject:'Reject',reason:'Review reason',missing:'No GPS available. Capture GPS or choose an Area manually.',unavailable:'Address lookup is unavailable. Your address has been kept.',caution:'This suggestion needs manual checking; it is not an automatic assignment.',review:'Supervisor confirmation is required for address / Area suggestions.',gps:'First GPS becomes official when saved. Later changes require supervisor approval.',request:'Request GPS change',initialSaved:'First GPS saved as official.',changePending:'GPS change submitted for supervisor approval.',failed:'Unable to check or save. Refresh and try again.',confidence:'Confidence',high:'High',medium:'Medium',low:'Low',none:'None'},
 ms:{title:'Semakan alamat & Area',check:'Semak alamat & Area',checking:'Sedang menyemak…',hint:'Semak cadangan alamat dan Area, kemudian simpan bersama pelanggan. Zone mengikut Area.',current:'Semasa',suggested:'Cadangan / boleh diubah',address:'Address',area:'Area',zone:'Zone',use:'Sertakan semasa simpan pelanggan',keep:'Kekalkan maklumat semasa',included:'Disertakan dalam simpanan pelanggan seterusnya.',pending:'Alamat / Area menunggu semakan penyelia',approve:'Luluskan',reject:'Tolak',reason:'Sebab semakan',missing:'Tiada GPS. Ambil GPS atau pilih Area secara manual.',unavailable:'Carian alamat tidak tersedia. Alamat anda dikekalkan.',caution:'Cadangan perlu disemak secara manual; tiada penetapan automatik.',review:'Cadangan alamat / Area memerlukan pengesahan penyelia.',gps:'GPS pertama menjadi rasmi apabila disimpan. Perubahan kemudian memerlukan kelulusan penyelia.',request:'Mohon perubahan GPS',initialSaved:'GPS pertama disimpan sebagai GPS rasmi.',changePending:'Perubahan GPS dihantar untuk kelulusan penyelia.',failed:'Tidak dapat menyemak atau menyimpan. Muat semula dan cuba lagi.',confidence:'Keyakinan',high:'Tinggi',medium:'Sederhana',low:'Rendah',none:'Tiada'},
 zh:{title:'地址与归区检查',check:'检查地址与归区',checking:'正在检查…',hint:'核对地址和 Area 建议，随客户资料一起保存。分区由 Area 决定。',current:'当前资料',suggested:'建议资料／可修改',address:'Address',area:'Area',zone:'Zone',use:'随客户资料一起提交',keep:'保留当前资料',included:'已加入本次客户保存内容。',pending:'地址／归区等待主管审核',approve:'批准',reject:'拒绝',reason:'审核原因',missing:'尚无 GPS，请先采集或手动选择 Area。',unavailable:'暂时无法查询地址，已保留你填写的地址。',caution:'这项建议需要人工核对，不会自动更改归属。',review:'地址／归区建议需要主管确认。',gps:'首次 GPS 保存后直接生效；以后修改需要主管批准。',request:'申请修改 GPS',initialSaved:'首次 GPS 已保存为正式 GPS。',changePending:'GPS 修改已提交，等待主管批准。',failed:'无法检查或保存，请刷新后重试。',confidence:'可信度',high:'高',medium:'中',low:'低',none:'无'}
}
const compactWords={
 en:{title:'Address & Area',check:'Check address',suggested:'Suggestion',adopt:'Use suggestion'},
 ms:{title:'Alamat & Area',check:'Semak alamat',suggested:'Cadangan',adopt:'Gunakan cadangan'},
 zh:{title:'地址与区域',check:'检查地址',suggested:'建议',adopt:'采用建议'}
}
export default function CustomerLocationCheck({payload,data,onChange,onBranchChange,value,busy,onReview}){
 const {language}=useI18n(),w={...(locationWords[language]||locationWords.en),...(compactWords[language]||compactWords.en)}
 const [preview,setPreview]=useState(null),[loading,setLoading]=useState(false),[error,setError]=useState('')
 const key=JSON.stringify([payload.branchId,payload.customerId,payload.revision,payload.branch?.address,payload.branch?.areaId,payload.branch?.branchName,payload.gps?.latitude,payload.gps?.longitude]),latest=useRef(key);latest.current=key
 useEffect(()=>{setPreview(null);setError('');onChange(null)},[key])
 const check=async()=>{const source=key;setLoading(true);setError('');try{const r=await api('/api/customer-workspace/check-location',{method:'POST',body:JSON.stringify(payload)});if(latest.current!==source)return;setPreview(r)}catch{if(latest.current===source)setError(w.failed)}finally{setLoading(false)}}
 const address=value?.address??payload.branch.address??'',areaId=value?.areaId??payload.branch.areaId??''
 const areas=data.areas,area=areas.find(a=>String(a.areaId)===String(areaId))
 const proposedAddress=preview?.address||payload.branch.address||'',proposedAreaId=preview?.areaId||payload.branch.areaId||''
 const suggestedArea=areas.find(a=>String(a.areaId)===String(proposedAreaId))
 const differs=preview&&(proposedAddress!==address||String(proposedAreaId)!==String(areaId))
 const edit=(key,next)=>{if(value)onChange({...value,[key]:next});else onBranchChange(key,next)}
 return <section className="customer-location-check"><h3>{w.title}</h3>
 <div className="editor-fields"><label>{w.address}<input disabled={busy} value={address} onChange={e=>edit('address',e.target.value)}/></label><label>{w.area}<select disabled={busy} value={areaId} onChange={e=>edit('areaId',e.target.value)}><option value="">—</option>{areas.map(a=><option key={a.areaId} value={a.areaId}>{a.name}</option>)}</select></label></div>
 <p>Zone: <span data-i18n-raw>{area?.zone||'—'}</span></p>
 <button className="primary" type="button" disabled={busy||loading||Boolean(value)} onClick={check}>{loading?w.checking:w.check}</button>
 {preview?.gpsSource==='missing'&&<p>{w.missing}</p>}{preview?.addressUnavailable&&<p role="status">{w.unavailable}</p>}
 {differs&&preview.gpsSource!=='missing'&&<div className="location-suggestion"><strong>{w.suggested}</strong><p data-i18n-raw>{proposedAddress} · Area: {suggestedArea?.name||'—'} · Zone: {suggestedArea?.zone||'—'}</p><button className="primary" type="button" disabled={busy} onClick={()=>onChange({token:preview.token,address:proposedAddress,areaId:proposedAreaId})}>{w.adopt}</button></div>}
 {(data.locationReviews||[]).map(r=><div key={r.id}><strong>{w.pending}</strong><p>{r.address} · Area: {data.areas.find(a=>String(a.areaId)===r.areaId)?.name||r.areaId||'—'}</p><p>{r.requestedBy}: {r.reason}</p>{data.canReviewGps&&<><button type="button" disabled={busy||value!=null} onClick={()=>onReview(r.id,'approve')}>{w.approve}</button><button type="button" disabled={busy||value!=null} onClick={()=>onReview(r.id,'reject')}>{w.reject}</button></>}</div>)}
 {error&&<p role="alert">{error}</p>}</section>
}
