import {legacySalesRows} from './legacySalesEarnings.mjs'
import {createHash} from 'node:crypto'
import {kuchingDate} from '../shared/kuchingTime.js'
export const defaultEarningsRules={driver:[{from:0,rate:0.03},{from:25000,rate:0.04},{from:27500.01,rate:0.043},{from:30000,rate:0.045},{from:34500.01,rate:0.047},{from:40000,rate:0.05}],crewRate:0.03}
const fail=(code,statusCode=400)=>Object.assign(Error(code),{code,statusCode})
const kg=n=>Math.round(n*1000)/1000
const precision=(n,d)=>Number.isFinite(n)&&Math.abs(n*Math.pow(10,d)-Math.round(n*Math.pow(10,d)))<0.00001
const key=s=>String(s||'').trim().toUpperCase()
function owner(ctx){if(ctx.role!=='owner_admin')throw fail('EARN_ACCESS',403)}
function atomic(db,fn){db.exec('BEGIN IMMEDIATE');try{const x=fn();db.exec('COMMIT');return x}catch(e){db.exec('ROLLBACK');throw e}}
export function earningsPeriod(date=kuchingDate()){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T00:00:00Z'))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)throw fail('EARN_DATE')
 const [y,m,d]=date.split('-').map(Number),ym=date.slice(0,7),start=ym+(d<=15?'-01':'-16'),end=ym+(d<=15?'-15':'-'+new Date(Date.UTC(y,m,0)).getUTCDate()),due=d<=15?ym+'-20':new Date(Date.UTC(y,m,5)).toISOString().slice(0,10)
 return {start,end,due}
}
export function earningsAmount(driverKg,crewKg,rules=defaultEarningsRules){const rate=[...rules.driver].reverse().find(t=>driverKg>=t.from)?.rate||0;return{driverKg:kg(driverKg),crewKg:kg(crewKg),rate,crewRate:rules.crewRate,amount:Number((BigInt(Math.round(driverKg*1000))*BigInt(Math.round(rate*1e6))+BigInt(Math.round(crewKg*1000))*BigInt(Math.round(rules.crewRate*1e6))+5000000n)/10000000n)/100}}
function currentRule(db,start){const r=db.prepare('SELECT * FROM earnings_rules WHERE effective_start<=? ORDER BY effective_start DESC,id DESC LIMIT 1').get(start);return{version:r?.id||0,...(r?JSON.parse(r.rules_json):defaultEarningsRules)}}
export function earningsSettings(db,ctx){owner(ctx);return{revision:db.prepare('SELECT COALESCE(MAX(id),0) id FROM earnings_rules').get().id,versions:db.prepare('SELECT id,effective_start effectiveStart,rules_json rules,created_at createdAt FROM earnings_rules ORDER BY effective_start DESC,id DESC').all().map(r=>({...r,rules:JSON.parse(r.rules)})),defaults:defaultEarningsRules}}
export function saveEarningsSettings(db,ctx,p){owner(ctx);const period=earningsPeriod(p.effectiveStart);if(period.start!==p.effectiveStart||period.start<earningsPeriod(ctx.today||kuchingDate()).start)throw fail('EARN_DATE');const rules=p.rules;
 if(!rules||!Array.isArray(rules.driver)||!rules.driver.length||rules.driver.length>20||rules.driver[0].from!==0||!precision(rules.crewRate,3)||rules.crewRate<0||rules.crewRate>10||rules.driver.some((r,i)=>!r||!precision(r.from,2)||r.from<0||r.from>1e9||!precision(r.rate,3)||r.rate<0||r.rate>10||(i>0&&(r.from<=rules.driver[i-1].from||r.rate<rules.driver[i-1].rate))))throw fail('EARN_RULE')
 return atomic(db,()=>{if(Number(p.revision)!==earningsSettings(db,ctx).revision)throw fail('EARN_STALE',409);if(db.prepare('SELECT 1 FROM earnings_payments WHERE period_start>=?').get(period.start))throw fail('EARN_LOCKED',409);db.prepare('INSERT INTO earnings_rules(effective_start,rules_json,actor_id) VALUES(?,?,?)').run(period.start,JSON.stringify(rules),ctx.employeeId);return earningsSettings(db,ctx)})
}
// A slip is used only when vehicle, ticket and delivery date match uniquely in BOTH sources.
export function earningsReport(db,ctx,date,{personal=false}={}){
 if(!personal)owner(ctx);else if(!ctx.employeeId)throw fail('EARN_ACCESS',403)
 const period=earningsPeriod(date||ctx.today||kuchingDate()),rules=currentRule(db,period.start)
 const sales=new Map();for(const s of db.prepare('SELECT id,vehicle_id,lines_json,revision FROM sales_settlements').all())for(const [i,l] of JSON.parse(s.lines_json).entries()){const k=[s.vehicle_id,key(l.slipNumber),l.deliveryDate].join('|');const list=sales.get(k)||[];list.push({id:s.id,index:i,weight:Number(l.weightKg),revision:s.revision});sales.set(k,list)}
 const all=db.prepare(`SELECT u.record_id recordId,u.ticket_number ticket,b.id batchId,b.code batch,b.collection_date collectionDate,b.vehicle_id batchVehicle,b.plate_snapshot plate,w.vehicle_id vehicleId,w.service_date deliveryDate,w.confirmed_weight_kg weight,w.status FROM cargo_batch_unloads u JOIN cargo_batches b ON b.id=u.batch_id JOIN unloading_weight_records w ON w.id=u.record_id WHERE w.status='confirmed'`).all()
 const counts=new Map();for(const r of all){const k=[r.vehicleId,key(r.ticket),r.deliveryDate].join('|');counts.set(k,(counts.get(k)||0)+1)}
 const members=db.prepare('SELECT batch_id batchId,employee_id employeeId,name_snapshot name,role FROM cargo_batch_members').all(),byBatch=new Map();for(const m of members){if(!byBatch.has(m.batchId))byBatch.set(m.batchId,[]);byBatch.get(m.batchId).push(m)}
 const staff=new Map();const add=(id,name)=>{if(!staff.has(id))staff.set(id,{employeeId:id,name,driverKg:0,crewKg:0,pendingKg:0,pendingCount:0,details:[]});return staff.get(id)}
 for(const e of db.prepare("SELECT DISTINCT e.id,e.name FROM employees e LEFT JOIN employee_job_roles j ON j.employee_id=e.id WHERE e.is_active=1 AND e.employment_status='active' AND (lower(e.job_role) IN ('driver','crew','assistant','attendant') OR j.role IN ('Driver','Attendant / Crew'))").all())if(!personal||e.id===Number(ctx.employeeId))add(e.id,e.name)
 let companyKg=0,pendingCompanyKg=0
 for(const r of all.filter(r=>r.collectionDate>=period.start&&r.collectionDate<=period.end)){
 const k=[r.vehicleId,key(r.ticket),r.deliveryDate].join('|'),candidates=sales.get(k)||[],matched=r.vehicleId===r.batchVehicle&&counts.get(k)===1&&candidates.length===1&&Number.isFinite(candidates[0].weight)&&candidates[0].weight>0,s=matched?candidates[0]:null;
 if(matched)companyKg+=s.weight;else pendingCompanyKg+=Number(r.weight||0)
 for(const m of byBatch.get(r.batchId)||[]){if(personal&&m.employeeId!==Number(ctx.employeeId))continue;const e=add(m.employeeId,m.name);if(matched)e[m.role==='driver'?'driverKg':'crewKg']+=s.weight;else{e.pendingKg+=Number(r.weight||0);e.pendingCount++}e.details.push({...r,role:m.role,matched,settledKg:s?.weight??null,settlementId:s?.id??null,settlementRevision:s?.revision??null})}
 }
 for(const a of legacySalesRows(db,all).filter(a=>a.date>=period.start&&a.date<=period.end)){
 if(a.valid)companyKg+=a.weight;else pendingCompanyKg+=a.weight
 if(personal&&a.employee_id!==Number(ctx.employeeId))continue
 const e=add(a.employee_id,a.employee_name)
 if(a.valid)e.driverKg+=a.weight;else{e.pendingKg+=a.weight;e.pendingCount++}
 e.details.push({recordId:`legacy-sale-${a.settlement_id}-${a.line_index}`,collectionDate:a.date,deliveryDate:a.date,role:'driver',plate:a.plate,batch:'—',ticket:a.ticket,weight:a.weight,settledKg:a.valid?a.weight:null,matched:a.valid,settlementId:a.settlement_id})
 }
 let items=[...staff.values()].map(e=>{const base={...e,...earningsAmount(kg(e.driverKg),kg(e.crewKg),rules),pendingKg:kg(e.pendingKg)};const revision=createHash('sha256').update(JSON.stringify({period,rules,base})).digest('hex');const paid=db.prepare('SELECT snapshot_json,paid_at FROM earnings_payments WHERE period_start=? AND employee_id=?').get(period.start,e.employeeId);return paid?{...JSON.parse(paid.snapshot_json),paidAt:paid.paid_at,changed:JSON.parse(paid.snapshot_json).revision!==revision}:{...base,revision,paidAt:null,changed:false}})
 // Paid former employees remain visible even when no longer in the active directory.
 for(const p of db.prepare('SELECT employee_id,snapshot_json,paid_at FROM earnings_payments WHERE period_start=?').all(period.start))if((!personal||p.employee_id===Number(ctx.employeeId))&&!items.some(e=>e.employeeId===p.employee_id))items.push({...JSON.parse(p.snapshot_json),paidAt:p.paid_at,changed:false})
 items.sort((a,b)=>a.name.localeCompare(b.name));return{period,rules,items,...(!personal?{companyKg:kg(companyKg),pendingCompanyKg:kg(pendingCompanyKg),unlinkedCount:db.prepare("SELECT COUNT(*) n FROM unloading_weight_records w WHERE w.status='confirmed' AND w.service_date BETWEEN ? AND ? AND NOT EXISTS(SELECT 1 FROM cargo_batch_unloads u WHERE u.record_id=w.id)").get(period.start,period.end).n}:{}),asOf:new Date().toISOString()}
}
export function recordEarningsPayment(db,ctx,p){owner(ctx);return atomic(db,()=>{const report=earningsReport(db,ctx,p.periodStart);if(report.period.start!==p.periodStart||report.period.end>=(ctx.today||kuchingDate()))throw fail('EARN_OPEN');const e=report.items.find(x=>x.employeeId===Number(p.employeeId));if(!e)throw fail('EARN_ACCESS',403);if(e.paidAt)return{ok:true};if(report.unlinkedCount||e.pendingCount||!e.details.length||e.amount<=0)throw fail('EARN_PENDING');if(e.revision!==p.revision)throw fail('EARN_STALE',409);db.prepare('INSERT INTO earnings_payments(period_start,employee_id,snapshot_json,actor_id) VALUES(?,?,?,?)').run(report.period.start,e.employeeId,JSON.stringify({...e,rules:report.rules,period:report.period}),ctx.employeeId);return{ok:true}})}
