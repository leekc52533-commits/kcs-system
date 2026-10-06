// Stateful training adapters. No fetch, browser storage, GPS, camera or live IDs.
// When extending the shared mobile router, add its API contract here and a test.
export function createSimulationExtras({date,getBills,queue,fail}){
 const now=()=>new Date().toISOString(),stamp=date+'T08:00:00+08:00'
 const demoProofData='data:image/svg+xml;charset=utf-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="180"><rect width="400" height="180" fill="#e8f5f0"/><text x="30" y="90" font-size="24">TEST PHOTO ONLY</text></svg>')
 const sample={id:9000,billNumber:'TEST-DEMO-001',serviceDate:date,status:'issued',customerName:'TEST Customer',branchName:'TEST Branch',branchCode:'TEST-B',driverName:'TEST DRIVER',registrationNumber:'TEST VEHICLE',paymentMethod:'Credit',totalCents:2000,items:[{productId:1,productName:'OCC (TEST)',shortForm:'OCC (TEST)',unit:'kg',quantity:100,unitPrice:0.2,lineTotalCents:2000}]}
 const voids=new Map(),replacements=new Map(),leaves=[],gps=[1,2].map(id=>({internalId:1000+id,branchId:'TEST-GPS-'+id,branchName:'TEST GPS Branch '+id,customerName:'TEST Customer',customerId:'TEST-C',area:'TEST',zoneGroup:'TEST',address:'TEST ONLY',latitude:null,longitude:null}))
 const notice={id:1,title:'TEST — Training notice',body:'Training only. No live records are saved.',priority:'normal',publisherName:'TEST SUPERVISOR',createdAt:stamp,readAt:stamp,photos:[],translations:{zh:{title:'TEST — 教学通告',body:'先检查明天路线，再提交主管。本通告只用于模拟教学，不保存正式记录。'},ms:{title:'TEST — Notis latihan',body:'Semak laluan esok, kemudian hantar kepada penyelia. Latihan sahaja; tiada rekod sebenar disimpan.'},en:{title:'TEST — Training notice',body:'Check tomorrow’s route, then submit to the supervisor. Training only; no live records are saved.'}}}
 let guideRead=stamp
 const allBills=()=>[sample,...getBills(),...replacements.values()].map(b=>({...b,status:voids.get(b.id)?.some(r=>r.status==='approved')?'voided':b.status||'issued',customerName:b.customerName||'TEST Customer',hasProof:!!b.paymentProofUploaded,demoProofData}))
 const billById=id=>allBills().find(b=>String(b.id)===String(id))
 function review(r,decision){
  if(r.kind==='void'){const req=voids.get(r.billId)?.find(v=>v.id===r.id);if(!req)fail('blocked');req.status=decision;req.reviewed_at=now();req.reviewed_name='TEST SUPERVISOR';return true}
  if(r.kind==='gps'){const branch=gps.find(b=>b.branchId===r.branchId);if(!branch)fail('blocked');branch.pending=false;if(decision==='approved'){branch.latitude=r.latitude;branch.longitude=r.longitude}return true}
  if(r.kind==='leave'){const item=leaves.find(l=>l.id===r.id);if(!item)fail('blocked');item.status=decision;return true}
  return false
 }
 function request(url,{method,payload}){
  const path=url.split('?')[0],q=new URLSearchParams(url.split('?')[1]||'')
  if(method==='GET'&&path==='/api/mobile/notices')return{items:[notice]}
  if(method==='POST'&&path==='/api/mobile/notices/1/read'){notice.readAt=now();return{readAt:notice.readAt}}
  if(method==='GET'&&path==='/api/mobile/guide')return{active:true,version:'TEST',readAt:guideRead}
  if(method==='POST'&&path==='/api/mobile/guide/read'){guideRead=now();return{active:true,version:'TEST',readAt:guideRead}}
  if(method==='GET'&&path==='/api/mobile/income-notifications')return{unread:0,items:[]}
  if(method==='POST'&&path==='/api/mobile/income-notifications/read')return{ok:true}
  if(path==='/api/mobile/leave'){
   if(method==='POST'){if(!payload.reason?.trim()||!/^\d{4}-\d{2}-\d{2}$/.test(payload.startDate)||payload.endDate<payload.startDate)fail('order');const r=queue({kind:'leave',branchName:'TEST DRIVER',reason:payload.reason});leaves.unshift({id:r.id,start_date:payload.startDate,end_date:payload.endDate,reason:payload.reason,status:'pending'})}
   if(['GET','POST'].includes(method))return{items:leaves}
  }
  if(method==='GET'&&path==='/api/mobile/my-bills'){
   const term=(q.get('search')||'').toLowerCase(),rows=allBills().filter(b=>(!q.get('from')||b.serviceDate>=q.get('from'))&&(!q.get('to')||b.serviceDate<=q.get('to'))&&[b.billNumber,b.customerName,b.branchName].join(' ').toLowerCase().includes(term)),page=Math.max(0,Number(q.get('page'))||0)
   return{items:rows.slice(page*30,(page+1)*30).map(b=>({...b,issuedBy:'TEST DRIVER',issuedAt:stamp,items:b.items.map(i=>({...i,itemTotalCents:i.lineTotalCents}))})),hasMore:rows.length>(page+1)*30}
  }
  if(method==='GET'&&path==='/api/bill-voids')return{items:allBills().map(b=>{const requests=voids.get(b.id)||[];return{id:b.id,bill_number:b.billNumber,service_date:b.serviceDate,customer_name_snapshot:b.customerName,branch_code_snapshot:b.branchCode||'TEST',branch_name_snapshot:b.branchName,driver_name_snapshot:'TEST DRIVER',registration_number_snapshot:'TEST VEHICLE',total_cents:b.totalCents,payment_method:b.paymentMethod,status:b.status,proofId:null,requests,canRequest:b.status==='issued'&&!requests.some(r=>r.status==='pending'),canReissue:b.status==='voided'&&!replacements.has(b.id),canViewReplacement:replacements.has(b.id),items:b.items.map(i=>({product_name_snapshot:i.productName,quantity:i.quantity,unit_snapshot:i.unit,line_total_cents:i.lineTotalCents}))}})}
  const match=path.match(/^\/api\/bill-voids\/(\d+)\/(request|replacement|replacement-proof)$/)
  if(match){const id=Number(match[1]),action=match[2],b=billById(id);if(!b)fail('bill')
   if(method==='POST'&&action==='request'){
    if(!payload.reason?.trim()||b.status!=='issued'||voids.get(id)?.some(r=>r.status==='pending'))fail('bill')
    const r=queue({kind:'void',billId:id,branchName:b.billNumber,reason:payload.reason});voids.set(id,[{id:r.id,status:'pending',reason:payload.reason,requested_at:now(),requested_name:'TEST DRIVER',documentNumber:'TEST-VOID-'+r.id},...(voids.get(id)||[])]);return{ok:true}
   }
   if(action==='replacement'){
    if(b.status!=='voided')fail('bill')
    if(method==='GET')return{stop:{paymentMethod:b.paymentMethod},temporary:false,readOnly:!!replacements.get(id)&& (b.paymentMethod!=='Cash'||replacements.get(id).paymentProofUploaded),bill:replacements.get(id)||null,products:[{productId:1,fullName:'OCC (TEST)',unit:'kg',currentPrice:0.2}]}
    if(method==='POST'){
     if(replacements.has(id))return replacements.get(id)
     if(!payload.items?.length||payload.items.some(i=>Number(i.productId)!==1||!Number.isFinite(Number(i.quantity))||Number(i.quantity)<=0))fail('bill')
     const items=payload.items.map(i=>({productId:1,productName:'OCC (TEST)',shortForm:'OCC (TEST)',unit:'kg',quantity:Number(i.quantity),unitPrice:0.2,lineTotalCents:Math.round(Number(i.quantity)*20)})),replacement={...b,id:10000+id,billNumber:'TEST-REISSUE-'+id,status:'issued',paymentProofUploaded:false,items,totalCents:items.reduce((n,i)=>n+i.lineTotalCents,0)};replacements.set(id,replacement);voids.get(id)[0].replacement_bill_id=replacement.id;return replacement
    }
   }
   if(method==='POST'&&action==='replacement-proof'){if(!replacements.has(id)||!payload.photo?.dataUrl)fail('bill');replacements.get(id).paymentProofUploaded=true;return{ok:true}}
  }
  if(method==='GET'&&path==='/api/gps-collection/branches'){const term=(q.get('search')||'').toLowerCase();return{items:gps.filter(b=>b.latitude==null&&!b.pending&&[b.branchId,b.branchName,b.customerName].join(' ').toLowerCase().includes(term)),summary:{totalActiveBranches:gps.length,officialGps:gps.filter(b=>b.latitude!=null).length,pendingApproval:gps.filter(b=>b.pending).length,remainingToCollect:gps.filter(b=>b.latitude==null&&!b.pending).length}}}
  if(method==='GET'&&path==='/api/gps-collection/reverse-geocode')return{address:'TEST ONLY',state:'Sarawak',city:'Kuching',street:'TEST STREET',streetNumber:'1',postalCode:'93000',provider:'TEST'}
  if(method==='GET'&&path==='/api/gps-collection/geocode')return{candidates:[{id:'TEST-PLACE',name:'TEST '+q.get('address'),address:'TEST ONLY',latitude:1.55,longitude:110.35}]}
  if(method==='POST'&&path.startsWith('/api/gps-collector/branch/')){
   const b=gps.find(b=>b.branchId===decodeURIComponent(path.split('/').at(-1)));if(!b||b.pending||!payload.photo?.dataUrl||!Number.isFinite(Number(payload.latitude))||!Number.isFinite(Number(payload.longitude)))fail('bill')
   b.pending=true;queue({kind:'gps',branchId:b.branchId,branchName:b.branchName,latitude:Number(payload.latitude),longitude:Number(payload.longitude),reason:payload.remark||'TEST GPS'});return{initialCapture:false}
  }
  return undefined
 }
 return{request,review}
}
