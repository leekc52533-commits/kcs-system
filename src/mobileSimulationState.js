import {dateRequestReasonChoices,customerDateWords} from '../shared/customerDatePromise.js'
import {evidenceProblem} from '../shared/dateRequestEvidence.js'
import {createSimulationExtras} from './mobileSimulationExtras.js'
import {addCalendarDays} from '../shared/kuchingTime.js'
export const simulationWords={
 zh:{void:'作废申请',gps:'GPS 申请',leave:'请假申请',orderRequest:'顺序申请',date:'改期申请',no_goods:'无货申请',defer:'稍后返回申请',approved:'模拟批准',rejected:'模拟拒绝',entry:'模拟测试',title:'模拟测试 · 不保存正式记录',help:'复用实际司机页面。客户、价格、GPS 和单据均为演示数据；不会影响正式路线、库存、工资或统计。关闭或重置后清除。',plan:'明天：编排路线',approve:'模拟主管批准并进入收货',reset:'重置测试',exit:'退出测试',scope:'测试范围：调整顺序 → 提交检查 → 模拟批准 → 出发 → 模拟到达 → 开单 → 完成。包含提前／延后、改期、无货、新客户、重量及收入练习。GPS、照片与审批均为模拟。',blocked:'此操作不在模拟测试范围内，未发送到服务器。',check:'请先按「已检查，提交主管」。',order:'请先完成上一站，或重新检查当前安排。',bill:'请先到达客户并填写有效重量。现金单须附付款凭证才能完成。',cash:'付款方式（重置测试后生效）',loading:'正在验证测试权限…',denied:'无法进入模拟测试，请使用主管以上账号登录后重试。'},
 ms:{void:'Permohonan pembatalan',gps:'Permohonan GPS',leave:'Permohonan cuti',orderRequest:'Permohonan aturan',date:'Permohonan tarikh',no_goods:'Permohonan tiada barang',defer:'Permohonan kembali kemudian',approved:'Simulasi lulus',rejected:'Simulasi tolak',entry:'Ujian simulasi',title:'Ujian simulasi · Tiada rekod sebenar disimpan',help:'Menggunakan halaman pemandu sebenar. Pelanggan, harga, GPS dan bil ialah data demo; laluan, stok, gaji dan statistik sebenar tidak terjejas. Data dipadam apabila ditutup atau ditetapkan semula.',plan:'Esok: susun laluan',approve:'Simulasi kelulusan penyelia & mula kutipan',reset:'Tetapkan semula',exit:'Keluar ujian',scope:'Skop: susun → hantar semakan → simulasi kelulusan → mula → simulasi tiba → bil → selesai. Termasuk tukar aturan/tarikh, tiada barang, pelanggan baharu, berat dan pendapatan. GPS, foto dan kelulusan disimulasikan.',blocked:'Operasi ini di luar skop simulasi. Tiada permintaan dihantar ke pelayan.',check:'Tekan “Sudah semak, hantar kepada penyelia” dahulu.',order:'Selesaikan hentian sebelumnya atau semak semula aturan terkini.',bill:'Tiba di pelanggan dan isi berat yang sah dahulu. Bil tunai memerlukan bukti bayaran sebelum selesai.',cash:'Kaedah bayaran (berkuat kuasa selepas tetapan semula)',loading:'Mengesahkan akses ujian…',denied:'Tidak dapat membuka simulasi. Log masuk dengan akaun penyelia atau lebih tinggi dan cuba lagi.'},
 en:{void:'Void request',gps:'GPS request',leave:'Leave request',orderRequest:'Order request',date:'Date request',no_goods:'No goods request',defer:'Return later request',approved:'Simulate approval',rejected:'Simulate rejection',entry:'Simulation test',title:'Simulation · No live records saved',help:'Uses the actual driver screens. Customers, prices, GPS and bills are demo data; live routes, stock, wages and statistics are unaffected. Closing or resetting clears the test.',plan:'Tomorrow: arrange route',approve:'Simulate supervisor approval & collect',reset:'Reset test',exit:'Exit test',scope:'Scope: order → submit check → simulated approval → start → simulated arrival → bill → complete. Includes order/date requests, no goods, new customers, weight and income. GPS, photos and approvals are simulated.',blocked:'This operation is outside the simulation. Nothing was sent to the server.',check:'Press “Checked, submit to supervisor” first.',order:'Finish the preceding stop or check the current arrangement again.',bill:'Arrive and enter a valid weight first. Cash bills require payment proof before completion.',cash:'Payment method (applies after reset)',loading:'Checking simulation access…',denied:'Simulation access failed. Sign in with a supervisor or higher account and retry.'}
}
export const simulationLabel=(language,key)=>(simulationWords[language]||simulationWords.en)[key]
const copy=value=>structuredClone(value)
export function createMobileSimulation({date,paymentMethod='Credit',language=()=> 'en'}={}){
 let revision=1,checked=false,checkedAt=null,approved=false,execution='not_started',sequence=0
 const stops=[1,2,3].map(n=>({id:n,branchId:'TEST-B'+n,branchName:'TEST Branch '+n,nextScheduledDate:n===3?null:addCalendarDays(date,n+2),customerName:'TEST Customer',routeNumber:1,stopSequence:n,status:'locked',gpsAvailable:true,latitude:1.55,longitude:110.35,address:'TEST ONLY',area:'TEST',zoneGroup:'TEST',timeRestriction:'—',arrivedAt:null,billCreated:false,paymentProofUploaded:false,arrangementRequests:[],rescheduleHistory:null,deferred:false}))
 const promisedStops=[]
 const pending=[],intakes=[],unloading=[],cargo=[];let requestSequence=0
 const bills=new Map(),products=[{productId:1,productCode:'OCC',fullName:'OCC (TEST)',shortForm:'OCC (TEST)',unit:'kg',currentPrice:0.2}]
 const fail=key=>{throw new Error(simulationLabel(language(),key))}
 const queue=r=>{const item={...r,id:++requestSequence,status:'pending'};pending.push(item);return item}
 const extras=createSimulationExtras({date,getBills:()=>[...bills.values()],queue,fail})
 function view(){
  const current=execution==='in_progress'?stops.find(s=>!['completed','cancelled'].includes(s.status)):null
  const trip={id:1,tripNumber:1,registrationNumber:'TEST VEHICLE',vehicleCode:'TEST',vehicleId:1,executionStatus:execution,approved,canPlan:!approved,canStart:approved&&execution==='not_started',canAttemptComplete:execution==='in_progress',canComplete:execution==='in_progress'&&stops.every(s=>['completed','cancelled'].includes(s.status)),currentStopId:current?.id||null,totalCount:stops.length,completedCount:stops.filter(s=>s.status==='completed').length,noGoodsCount:stops.filter(s=>s.completionOutcome==='no_goods_notice').length,driverPlan:{tripId:1,tripNumber:1,driverName:'TEST DRIVER',signature:String(revision),checked,checkedBy:checked?'TEST DRIVER':null,checkedAt},stops:stops.filter(s=>s.status!=='cancelled').map(s=>({...s,canArrive:current===s&&!s.arrivedAt,canFinish:current===s&&Boolean(s.arrivedAt),canReportNoGoods:approved&&!s.billCreated&&!['completed','cancelled'].includes(s.status),verifiedArrival:Boolean(s.arrivedAt),noGoodsApprovalRequired:!s.arrivedAt,billPaymentMethod:paymentMethod}))}
  return copy({date:approved?date:addCalendarDays(date,1),weekday:new Date((approved?date:addCalendarDays(date,1))+'T00:00:00Z').toLocaleDateString('en-US',{weekday:'long',timeZone:'UTC'}),routeAvailable:true,approved,status:approved?'approved':'draft',trips:[trip],pending,promisedDates:[...new Set(promisedStops.map(s=>s.customerDatePromise.date))],systemReviewNotices:[],driverApprovalRequired:true,trialOrderEnabled:false})
 }
 const approve=()=>{if(!checked)fail('check');approved=true;return view()}
 function review(id,decision,details={}){
  const index=pending.findIndex(r=>r.id===id);if(index<0||!['approved','rejected'].includes(decision))fail('blocked')
  const r=pending[index],stop=stops.find(s=>s.id===r.stopId)
  if(extras.review(r,decision)){pending.splice(index,1);return view()}
  if(!stop||stop.billCreated||stop.status==='completed')fail('order')
  if(decision==='approved'){
   if(r.kind==='order'){const i=stops.indexOf(stop),j=i+(r.direction==='up'?-1:1);if(!stops[j]||stops[j].arrivedAt||stop.arrivedAt)fail('order');[stops[i],stops[j]]=[stops[j],stops[i]];stops.forEach((s,n)=>s.stopSequence=n+1)}
   if(r.kind==='date'){
    if(r.reasonCode==='customer'){
     if(!['once','permanent'].includes(details.scope)||details.customerPromiseConfirmed!==true)throw new Error((customerDateWords[language()]||customerDateWords.en).scope)
     const promised={...copy(stop),id:1000+r.id,status:'locked',dateRequest:null,arrangementRequests:[],customerDatePromise:{date:r.targetDate,scope:details.scope},nextScheduledDate:null}
     if(details.scope==='permanent')promised.fixedSchedule={weekday:new Date(r.targetDate+'T00:00:00Z').getUTCDay(),anchorDate:r.targetDate}
     promisedStops.push(promised)
    }
    stop.status='cancelled';stop.dateRequest={status:decision,targetDate:r.targetDate}
   }
   if(r.kind==='no_goods'){stop.status='completed';stop.completionOutcome='no_goods_notice'}
   if(r.kind==='defer'){stop.deferred=true;stop.deferApprovalStatus='approved';stops.splice(stops.indexOf(stop),1);stops.push(stop)}
  }
  if(r.kind==='date')stop.dateRequest={status:decision,targetDate:r.targetDate}
  if(r.kind==='defer')stop.deferApprovalStatus=decision
  for(const item of stop.arrangementRequests||[])if(item.id===id)item.status=decision
  pending.splice(index,1);return view()
 }
 const intakeView=()=>intakes.map(i=>{const stop=stops.find(s=>s.id===i.stopId),bill=bills.get(i.stopId);return{...i,serviceDate:date,plate:'TEST VEHICLE',latitude:1.55,longitude:110.35,arrivedAt:stop.arrivedAt,stopStatus:stop.status,status:bill?'pending':'draft',billId:bill?.id,billNumber:bill?.billNumber,paymentMethod,paymentProofUploaded:stop.paymentProofUploaded}})
 async function request(url,options={}){
  const method=String(options.method||'GET').toUpperCase(),payload=options.body?JSON.parse(options.body):{},parts=String(url).split('/')
  const extra=extras.request(String(url),{method,payload});if(extra!==undefined)return copy(extra)
  if(method==='GET'&&['/api/mobile/today','/api/mobile/tomorrow'].includes(url))return view()
  if(method==='GET'&&url==='/api/mobile/customer-intakes')return{items:intakeView(),trips:execution==='in_progress'?[{id:1,plate:'TEST VEHICLE',tripNumber:1}]:[],transfers:[]}
  if(method==='GET'&&url.startsWith('/api/mobile/customer-pickup-search?'))return{items:[]}
  if(method==='POST'&&url==='/api/mobile/customer-intakes'){
   if(execution!=='in_progress'||!payload.name?.trim()||!payload.newConfirmed||payload.customerType!=='new'||payload.searchCheckedName!==payload.name.trim()||payload.searchMatchCount!==0||payload.latitude==null)fail('order')
   const id=100+intakes.length,stop={...copy(stops[0]),id,branchId:'TEST-NEW-'+id,branchName:payload.name,nextScheduledDate:null,customerName:'TEST',status:'locked',arrivedAt:null,billCreated:false,paymentProofUploaded:false,completionOutcome:null,arrangementRequests:[],dateRequest:null,deferred:false,temporary:true}
   const current=stops.findIndex(s=>!['completed','cancelled'].includes(s.status));if(current>=0&&stops[current].arrivedAt)fail('order')
   stops.splice(current<0?stops.length:current,0,stop);stops.forEach((s,n)=>s.stopSequence=n+1);intakes.push({id,stopId:id,name:payload.name});return{id,stopId:id,arrived:false,completed:false}
  }
  if(method==='POST'&&url==='/api/mobile/temporary-customers')return{ok:true}
  if(method==='POST'&&/^\/api\/mobile\/customer-intakes\/\d+\/cancel$/.test(url)){const item=intakes.find(i=>i.id===Number(parts[4]));if(!item||bills.has(item.stopId))fail('bill');stops.find(s=>s.id===item.stopId).status='cancelled';intakes.splice(intakes.indexOf(item),1);return{ok:true}}
  if(method==='GET'&&url==='/api/mobile/unloading-weights/context')return{available:execution==='in_progress',trip:{tripId:1,vehicleId:1,vehicleCode:'TEST',registrationNumber:'TEST VEHICLE',driverName:'TEST DRIVER',serviceDate:date,locationName:'TEST FACTORY',estimatedWeightKg:100},recent:unloading}
  if(method==='GET'&&url==='/api/mobile/cargo-batches')return copy({items:cargo,trips:execution==='in_progress'?[{tripId:1,vehicleId:1,plate:'TEST VEHICLE'}]:[],notifications:[]})
  if(method==='POST'&&url==='/api/mobile/cargo-batches/start'){
   if(execution!=='in_progress')fail('order')
   let b=cargo.find(b=>b.status==='prepared');if(b){b.status='active';b.collectionDate=date}
   else if(!cargo.some(b=>b.status==='active'))cargo.push({id:cargo.length+1,vehicleId:1,status:'active',code:'TEST-CARGO-'+(cargo.length+1),plate:'TEST VEHICLE',driverName:'TEST DRIVER',collectionDate:date,members:[{employeeId:1,name:'TEST DRIVER',role:'driver'}],unloads:[]})
   return{ok:true}
  }
  if(method==='POST'&&url==='/api/mobile/unloading-weights/recognize'){if(execution!=='in_progress'||!payload.photo?.dataUrl)fail('bill');return{id:unloading.length+1,code:'TEST-WEIGHT-'+(unloading.length+1),recognizedWeightKg:100,ocrStatus:'recognized'}}
  if(method==='POST'&&/^\/api\/mobile\/unloading-weights\/\d+\/confirm$/.test(url)){
   const b=cargo.find(b=>String(b.id)===String(payload.batchId))
   if(!b||!Number.isFinite(Number(payload.weightKg))||!(payload.weightKg>0)||!payload.ticketNumber?.trim()||!['full','partial','supplement'].includes(payload.unloadMode)||b.unloads.some(u=>u.ticketNumber===payload.ticketNumber.trim())||b.status==='prepared'||(b.status==='closed')!==(payload.unloadMode==='supplement'))fail('bill')
   const id=unloading.length+1;unloading.push({id,code:'TEST-WEIGHT-'+id,registrationNumber:'TEST VEHICLE',confirmedWeightKg:Number(payload.weightKg),weightKg:Number(payload.weightKg),createdAt:new Date().toISOString(),status:'confirmed',serviceDate:date});b.unloads.push({recordId:id,ticketNumber:payload.ticketNumber.trim()})
   if(payload.unloadMode==='full'){b.status='closed';cargo.push({id:cargo.length+1,vehicleId:1,status:'prepared',code:'TEST-CARGO-'+(cargo.length+1),plate:'TEST VEHICLE',driverName:'TEST DRIVER',collectionDate:date,members:[{employeeId:1,name:'TEST DRIVER',role:'driver'}],unloads:[]})}
   return{ok:true}
  }
  if(method==='GET'&&url.startsWith('/api/mobile/earnings?'))return{period:{start:date.slice(0,7)+'-01',end:date.slice(0,7)+'-15'},unlinkedCount:0,items:[{employeeId:1,name:'TEST DRIVER',driverKg:100,crewKg:0,pendingKg:0,rate:0.03,crewRate:0,amount:3,paidAt:null,details:[]}]}
  if(method==='POST'&&/^\/api\/mobile\/stops\/\d+\/(trial-reorder|request-date|no-goods-notice|defer)$/.test(url)){
   const stop=stops.find(s=>s.id===Number(parts[4])),action=parts[5]
   if(!approved||!stop||stop.billCreated||['completed','cancelled'].includes(stop.status)||!payload.reason?.trim()||pending.some(r=>r.stopId===stop.id))fail('order')
   const kind={'trial-reorder':'order','request-date':'date','no-goods-notice':'no_goods',defer:'defer'}[action]
   if(kind==='date'){
    if(stop.customerDatePromise)throw new Error((customerDateWords[language()]||customerDateWords.en).warning)
    if(!dateRequestReasonChoices.some(r=>r.id===payload.reasonCode)||evidenceProblem(payload.reasonCode,payload.evidence)||!/^\d{4}-\d{2}-\d{2}$/.test(payload.targetDate||'')||!Number.isFinite(Date.parse(payload.targetDate+'T00:00:00Z'))||new Date(payload.targetDate+'T00:00:00Z').toISOString().slice(0,10)!==payload.targetDate||payload.targetDate<=date)fail('order')
   }
   if(kind==='order'&&!['up','down'].includes(payload.direction))fail('order')
   if(kind==='no_goods'&&!payload.photo?.dataUrl)fail('bill')
   if(kind==='no_goods'&&stop.arrivedAt){stop.status='completed';stop.completionOutcome='no_goods_notice';return{ok:true}}
   const r={...payload,id:++requestSequence,kind,stopId:stop.id,branchName:stop.branchName,status:'pending'};pending.push(r)
   if(kind==='date')stop.dateRequest={status:'pending',targetDate:payload.targetDate}
   else if(kind==='defer')stop.deferApprovalStatus='pending'
   else stop.arrangementRequests.push(copy(r))
   return{ok:true,pending:true}
  }
  if(method==='GET'&&url==='/api/mobile/cash-float')return{configured:false}
  if(method==='POST'&&/^\/api\/mobile\/trips\/1\/tomorrow-plan\/(order|check)$/.test(url)){
   if(approved||payload.expectedSignature!==String(revision))fail('order')
   if(parts[6]==='check'){checked=true;checkedAt=new Date().toISOString()}
   else{const index=stops.findIndex(s=>s.id===payload.stopId),other=index+(payload.direction==='up'?-1:1);if(!['up','down'].includes(payload.direction)||index<0||other<0||other>=stops.length)fail('order');[stops[index],stops[other]]=[stops[other],stops[index]];stops.forEach((s,i)=>s.stopSequence=i+1);revision++;checked=false;checkedAt=null}
   return view().trips[0].driverPlan
  }
  if(method==='POST'&&url==='/api/mobile/trips/1/start'){if(!approved||execution!=='not_started')fail('order');execution='in_progress';return{ok:true}}
  if(method==='POST'&&url==='/api/mobile/trips/1/complete'){if(execution!=='in_progress'||stops.some(s=>!['completed','cancelled'].includes(s.status)))fail('order');execution='completed';return{ok:true}}
  if(/^\/api\/mobile\/stops\/\d+\/(billing|arrive|bills|payment-proof|complete)$/.test(url)){
   const stop=stops.find(s=>s.id===Number(parts[4])),action=parts[5];if(!stop)fail('blocked')
   if(method==='GET'&&action==='billing')return copy({stop:{...stop,paymentMethod},products,bill:bills.get(stop.id)||null,temporary:Boolean(stop.temporary)})
   if(method!=='POST'||execution!=='in_progress'||view().trips[0].currentStopId!==stop.id||pending.some(r=>r.stopId===stop.id))fail('order')
   if(action==='arrive'){if(pending.some(r=>r.stopId===stop.id))fail('order');if(stop.arrivedAt)return{ok:true};stop.arrivedAt=new Date().toISOString();stop.status='active';return{ok:true}}
   if(!stop.arrivedAt)fail('bill')
   if(action==='bills'){
    if(bills.has(stop.id))return copy(bills.get(stop.id))
    if(!Array.isArray(payload.items)||payload.items.length!==1||payload.items[0].productId!==1||!Number.isFinite(payload.items[0].quantity)||payload.items[0].quantity<=0)fail('bill')
    if(stop.temporary&&payload.items.some(item=>item.unitPrice==null||!Number.isFinite(Number(item.unitPrice))||Number(item.unitPrice)<0))fail('bill')
    const items=payload.items.map(item=>({...products[0],...item,productName:products[0].fullName,unitPrice:stop.temporary?Number(item.unitPrice):0.2,lineTotalCents:Math.round(Math.round(item.quantity*100)*Math.round((stop.temporary?Number(item.unitPrice):0.2)*1000)/1000)})),bill={id:++sequence,billNumber:'TEST-'+String(sequence).padStart(4,'0'),serviceDate:date,branchName:stop.branchName,registrationNumber:'TEST VEHICLE',paymentMethod,printChoice:'no_print',items,totalCents:items.reduce((n,i)=>n+i.lineTotalCents,0),paymentProofUploaded:false}
    bills.set(stop.id,bill);stop.billCreated=true;return copy(bill)
   }
   if(action==='payment-proof'){if(!bills.has(stop.id)||!payload.photo?.dataUrl)fail('bill');stop.paymentProofUploaded=true;bills.get(stop.id).paymentProofUploaded=true;return{ok:true}}
   if(action==='complete'){if(!stop.billCreated||paymentMethod==='Cash'&&!stop.paymentProofUploaded)fail('bill');stop.status='completed';return{ok:true}}
  }
  fail('blocked')
 }
 function openPromisedDate(target){
  const selected=promisedStops.filter(s=>s.customerDatePromise.date===target)
  if(!selected.length||pending.length)fail('order')
  stops.splice(0,stops.length,...copy(selected));date=target;execution='not_started';approved=true;checked=true
  return view()
 }
 return{view,approve,request,review,openPromisedDate,instanceKey:Math.random().toString(36)}
}
