import {addCalendarDays} from '../shared/kuchingTime.js'
export const simulationWords={
 zh:{entry:'模拟测试',title:'模拟测试 · 不保存正式记录',help:'复用实际司机页面。客户、价格、GPS 和单据均为演示数据；不会影响正式路线、库存、工资或统计。关闭或重置后清除。',plan:'明天：编排路线',approve:'模拟主管批准并进入收货',reset:'重置测试',exit:'退出测试',scope:'测试范围：调整顺序 → 提交检查 → 模拟批准 → 出发 → 模拟到达 → 开单 → 完成。其他业务不开放；不验证真实 GPS 或服务器审批。',blocked:'此操作不在模拟测试范围内，未发送到服务器。',check:'请先按「已检查，提交主管」。',order:'请先完成上一站，或重新检查当前安排。',bill:'请先到达客户并填写有效重量。现金单须附付款凭证才能完成。',cash:'付款方式（重置测试后生效）',loading:'正在验证测试权限…',denied:'无法进入模拟测试，请使用主管以上账号登录后重试。'},
 ms:{entry:'Ujian simulasi',title:'Ujian simulasi · Tiada rekod sebenar disimpan',help:'Menggunakan halaman pemandu sebenar. Pelanggan, harga, GPS dan bil ialah data demo; laluan, stok, gaji dan statistik sebenar tidak terjejas. Data dipadam apabila ditutup atau ditetapkan semula.',plan:'Esok: susun laluan',approve:'Simulasi kelulusan penyelia & mula kutipan',reset:'Tetapkan semula',exit:'Keluar ujian',scope:'Skop: susun → hantar semakan → simulasi kelulusan → mula → simulasi tiba → bil → selesai. Urusan lain tidak tersedia; GPS sebenar dan kelulusan pelayan tidak diuji.',blocked:'Operasi ini di luar skop simulasi. Tiada permintaan dihantar ke pelayan.',check:'Tekan “Sudah semak, hantar kepada penyelia” dahulu.',order:'Selesaikan hentian sebelumnya atau semak semula aturan terkini.',bill:'Tiba di pelanggan dan isi berat yang sah dahulu. Bil tunai memerlukan bukti bayaran sebelum selesai.',cash:'Kaedah bayaran (berkuat kuasa selepas tetapan semula)',loading:'Mengesahkan akses ujian…',denied:'Tidak dapat membuka simulasi. Log masuk dengan akaun penyelia atau lebih tinggi dan cuba lagi.'},
 en:{entry:'Simulation test',title:'Simulation · No live records saved',help:'Uses the actual driver screens. Customers, prices, GPS and bills are demo data; live routes, stock, wages and statistics are unaffected. Closing or resetting clears the test.',plan:'Tomorrow: arrange route',approve:'Simulate supervisor approval & collect',reset:'Reset test',exit:'Exit test',scope:'Scope: order → submit check → simulated approval → start → simulated arrival → bill → complete. Other operations are unavailable; real GPS and server approval are not tested.',blocked:'This operation is outside the simulation. Nothing was sent to the server.',check:'Press “Checked, submit to supervisor” first.',order:'Finish the preceding stop or check the current arrangement again.',bill:'Arrive and enter a valid weight first. Cash bills require payment proof before completion.',cash:'Payment method (applies after reset)',loading:'Checking simulation access…',denied:'Simulation access failed. Sign in with a supervisor or higher account and retry.'}
}
export const simulationLabel=(language,key)=>(simulationWords[language]||simulationWords.en)[key]
const copy=value=>structuredClone(value)
export function createMobileSimulation({date,paymentMethod='Credit',language=()=> 'en'}={}){
 let revision=1,checked=false,checkedAt=null,approved=false,execution='not_started',sequence=0
 const stops=[1,2,3].map(n=>({id:n,branchId:'TEST-B'+n,branchName:'TEST Branch '+n,customerName:'TEST Customer',routeNumber:1,stopSequence:n,status:'locked',gpsAvailable:true,latitude:1.55,longitude:110.35,address:'TEST ONLY',area:'TEST',zoneGroup:'TEST',timeRestriction:'—',arrivedAt:null,billCreated:false,paymentProofUploaded:false,arrangementRequests:[],rescheduleHistory:null,deferred:false}))
 const bills=new Map(),products=[{productId:1,productCode:'OCC',fullName:'OCC (TEST)',shortForm:'OCC (TEST)',unit:'kg',currentPrice:0.2}]
 const fail=key=>{throw new Error(simulationLabel(language(),key))}
 function view(){
  const current=execution==='in_progress'?stops.find(s=>s.status!=='completed'):null
  const trip={id:1,tripNumber:1,registrationNumber:'TEST VEHICLE',vehicleCode:'TEST',vehicleId:1,executionStatus:execution,approved,canPlan:!approved,canStart:approved&&execution==='not_started',canAttemptComplete:execution==='in_progress',canComplete:execution==='in_progress'&&stops.every(s=>s.status==='completed'),currentStopId:current?.id||null,totalCount:stops.length,completedCount:stops.filter(s=>s.status==='completed').length,noGoodsCount:0,driverPlan:{tripId:1,tripNumber:1,driverName:'TEST DRIVER',signature:String(revision),checked,checkedBy:checked?'TEST DRIVER':null,checkedAt},stops:stops.map(s=>({...s,canArrive:current===s&&!s.arrivedAt,canFinish:current===s&&Boolean(s.arrivedAt),canReportNoGoods:false,billPaymentMethod:paymentMethod}))}
  return copy({date:approved?date:addCalendarDays(date,1),weekday:new Date((approved?date:addCalendarDays(date,1))+'T00:00:00Z').toLocaleDateString('en-US',{weekday:'long',timeZone:'UTC'}),routeAvailable:true,approved,status:approved?'approved':'draft',trips:[trip],systemReviewNotices:[],driverApprovalRequired:false,trialOrderEnabled:false})
 }
 const approve=()=>{if(!checked)fail('check');approved=true;return view()}
 async function request(url,options={}){
  const method=String(options.method||'GET').toUpperCase(),payload=options.body?JSON.parse(options.body):{},parts=String(url).split('/')
  if(method==='GET'&&['/api/mobile/today','/api/mobile/tomorrow'].includes(url))return view()
  if(method==='GET'&&url==='/api/mobile/cash-float')return{configured:false}
  if(method==='POST'&&/^\/api\/mobile\/trips\/1\/tomorrow-plan\/(order|check)$/.test(url)){
   if(approved||payload.expectedSignature!==String(revision))fail('order')
   if(parts[6]==='check'){checked=true;checkedAt=new Date().toISOString()}
   else{const index=stops.findIndex(s=>s.id===payload.stopId),other=index+(payload.direction==='up'?-1:1);if(!['up','down'].includes(payload.direction)||index<0||other<0||other>=stops.length)fail('order');[stops[index],stops[other]]=[stops[other],stops[index]];stops.forEach((s,i)=>s.stopSequence=i+1);revision++;checked=false;checkedAt=null}
   return view().trips[0].driverPlan
  }
  if(method==='POST'&&url==='/api/mobile/trips/1/start'){if(!approved||execution!=='not_started')fail('order');execution='in_progress';return{ok:true}}
  if(method==='POST'&&url==='/api/mobile/trips/1/complete'){if(execution!=='in_progress'||stops.some(s=>s.status!=='completed'))fail('order');execution='completed';return{ok:true}}
  if(/^\/api\/mobile\/stops\/\d+\/(billing|arrive|bills|payment-proof|complete)$/.test(url)){
   const stop=stops.find(s=>s.id===Number(parts[4])),action=parts[5];if(!stop)fail('blocked')
   if(method==='GET'&&action==='billing')return copy({stop:{...stop,paymentMethod},products,bill:bills.get(stop.id)||null,temporary:false})
   if(method!=='POST'||execution!=='in_progress'||view().trips[0].currentStopId!==stop.id)fail('order')
   if(action==='arrive'){if(stop.arrivedAt)return{ok:true};stop.arrivedAt=new Date().toISOString();stop.status='active';return{ok:true}}
   if(!stop.arrivedAt)fail('bill')
   if(action==='bills'){
    if(bills.has(stop.id))return copy(bills.get(stop.id))
    if(!Array.isArray(payload.items)||payload.items.length!==1||payload.items[0].productId!==1||!Number.isFinite(payload.items[0].quantity)||payload.items[0].quantity<=0)fail('bill')
    const items=payload.items.map(item=>({...products[0],...item,productName:products[0].fullName,lineTotalCents:Math.round(Math.round(item.quantity*100)*200/1000)})),bill={id:++sequence,billNumber:'TEST-'+String(sequence).padStart(4,'0'),serviceDate:date,branchName:stop.branchName,registrationNumber:'TEST VEHICLE',paymentMethod,printChoice:'no_print',items,totalCents:items.reduce((n,i)=>n+i.lineTotalCents,0),paymentProofUploaded:false}
    bills.set(stop.id,bill);stop.billCreated=true;return copy(bill)
   }
   if(action==='payment-proof'){if(!bills.has(stop.id)||!payload.photo?.dataUrl)fail('bill');stop.paymentProofUploaded=true;bills.get(stop.id).paymentProofUploaded=true;return{ok:true}}
   if(action==='complete'){if(!stop.billCreated||paymentMethod==='Cash'&&!stop.paymentProofUploaded)fail('bill');stop.status='completed';return{ok:true}}
  }
  fail('blocked')
 }
 return{view,approve,request}
}
