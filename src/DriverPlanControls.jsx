import {useI18n} from './i18n.jsx'
import {apiRequest,isEmployeePreview} from './apiClient.js'
import {formatDateDisplay} from './dateDisplay.js'
const words={
 zh:{submit:'已检查，提交主管',checked:'司机已检查',pending:'司机未检查',help:'先调整明天的客户顺序；没有问题也可直接提交。主管批准前可以继续调整，改动后需要重新检查。',saved:'顺序已保存，请检查后提交主管。',sent:'已提交检查结果，等待主管批准。',up:'↑ 上移',down:'↓ 下移',trip:'趟次',locked:'已批准或已开始的行程不能在这里修改，请联系主管处理。',empty:'尚未分配司机'},
 ms:{submit:'Sudah semak, hantar kepada penyelia',checked:'Pemandu sudah semak',pending:'Pemandu belum semak',help:'Susun turutan pelanggan esok, atau terus hantar jika tiada perubahan. Boleh ubah sebelum kelulusan; semak semula selepas perubahan.',saved:'Turutan disimpan. Semak dan hantar kepada penyelia.',sent:'Semakan dihantar. Menunggu kelulusan penyelia.',up:'↑ Naik',down:'↓ Turun',trip:'Trip',locked:'Perjalanan yang diluluskan atau bermula tidak boleh diubah di sini. Hubungi penyelia.',empty:'Pemandu belum ditugaskan'},
 en:{submit:'Checked, submit to supervisor',checked:'Driver checked',pending:'Driver not checked',help:'Arrange tomorrow’s customer order, or submit unchanged if it is correct. You can edit before approval; changes require another check.',saved:'Order saved. Check and submit to the supervisor.',sent:'Check submitted. Waiting for supervisor approval.',up:'↑ Move up',down:'↓ Move down',trip:'Trip',locked:'Approved or started trips cannot be edited here. Contact your supervisor.',empty:'No driver assigned'}
}
export const driverPlanWords=language=>words[language]||words.en
function checkedTime(value){if(!value)return '';const date=new Date(value.includes('T')?value:value.replace(' ','T')+'Z');if(!Number.isFinite(+date))return '';const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kuching',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date).map(p=>[p.type,p.value]));return `${formatDateDisplay(`${parts.year}-${parts.month}-${parts.day}`)} ${parts.hour}:${parts.minute}`}
export function DriverCheckCount({items=[]}){
 const{language}=useI18n(),w=driverPlanWords(language)
 if(!items.length)return null
 return <small style={{display:'block'}}>{w.checked}: {items.filter(p=>p.checked).length}/{items.length} {w.trip}</small>
}
export function DriverCheckStatus({items=[]}){
 const{language}=useI18n(),w=driverPlanWords(language)
 return <div className="driver-check-status" aria-live="polite">{items.map(p=><p key={p.tripId}><b>{p.checked?'✓ '+w.checked:w.pending}</b> · <span data-i18n-raw>{p.driverName||w.empty}</span> · {w.trip} {p.tripNumber}{p.checked&&<> · <time>{checkedTime(p.checkedAt)}</time></>}</p>)}</div>
}
export function DriverPlanHeader({trip,busy,run}){
 const{language}=useI18n(),w=driverPlanWords(language),p=trip.driverPlan
 if(!p)return null
 return <div className="driver-plan-controls"><DriverCheckStatus items={[p]}/>{trip.canPlan&&!isEmployeePreview()?<><p>{w.help}</p><button type="button" className="primary-mobile" disabled={busy||p.checked} onClick={()=>run('plan-check-'+trip.id,()=>apiRequest(`/api/mobile/trips/${trip.id}/tomorrow-plan/check`,{method:'POST',body:JSON.stringify({expectedSignature:p.signature})}),w.sent)}>{p.checked?'✓ '+w.checked:w.submit}</button></>:trip.approved&&<p>{w.locked}</p>}</div>
}
export function DriverPlanOrder({trip,stop,busy,run}){
 const{language}=useI18n(),w=driverPlanWords(language)
 if(!trip.canPlan||isEmployeePreview())return null
 const index=trip.stops.findIndex(s=>s.id===stop.id)
 const move=direction=>run('plan-order-'+stop.id,()=>apiRequest(`/api/mobile/trips/${trip.id}/tomorrow-plan/order`,{method:'POST',body:JSON.stringify({stopId:stop.id,direction,expectedSignature:trip.driverPlan.signature})}),w.saved)
 return <div className="driver-route-tools"><button type="button" disabled={busy||index<=0||Boolean(stop.sequenceLocked)||Boolean(trip.stops[index-1]?.sequenceLocked)} onClick={()=>move('up')}>{w.up}</button><button type="button" disabled={busy||index===trip.stops.length-1||Boolean(stop.sequenceLocked)||Boolean(trip.stops[index+1]?.sequenceLocked)} onClick={()=>move('down')}>{w.down}</button></div>
}
