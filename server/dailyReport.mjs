import {validSalesDate} from '../shared/sales.js'
const management=['owner_admin','operations_admin','supervisor','office']
export const reportPermissions=['daily_report_full','daily_report_finance']
export function reportAccess(db,account){
 const owner=Boolean(account?.id&&Number(db.prepare('SELECT owner_account_id FROM company_menu WHERE id=1').get()?.owner_account_id)===Number(account.id))
 const permissions=account?.id?db.prepare('SELECT permission FROM auth_account_permissions WHERE account_id=?').all(account.id).map(r=>r.permission):[]
 const allowed=management.includes(account?.role),full=allowed&&(owner||permissions.includes('daily_report_full'))
 return{allowed,owner,full,finance:full||(allowed&&permissions.includes('daily_report_finance')),operations:allowed}
}
export function assertReportGrantChange(db,actor,previous,next){next=next.map(v=>String(v??'').trim());if(reportPermissions.some(k=>previous.includes(k)!==next.includes(k))&&!reportAccess(db,actor).owner)throw Object.assign(Error('DAILY_REPORT_OWNER_ONLY'),{statusCode:403})}
const sum=(rows,key)=>rows.reduce((n,r)=>n+(Number(r[key])||0),0)
const unique=(rows,key)=>new Set(rows.map(r=>r[key]).filter(v=>v!=null)).size
const json=value=>{try{return JSON.parse(value)}catch{return value}}
// Business history only. Never serialize employee identity/payroll, auth secrets or evidence storage paths.
const privateKey=/password|token|secret|storage|photo|base64|national.?id|bank.?account|salary|payroll|epf|socso|tin.?number/i
export function safeDetails(value){if(Array.isArray(value))return value.map(safeDetails);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k])=>!privateKey.test(k)).map(([k,v])=>[k,safeDetails(v)]));return value}
const histories={employee_change_history:'changed_at',employee_role_history:'changed_at',auth_account_change_history:'changed_at',audit_logs:'created_at',dispatch_change_logs:'created_at',master_change_history:'changed_at',branch_gps_history:'created_at',material_price_history:'changed_at',branch_material_price_history:'changed_at',customer_material_pricing_history:'changed_at',branch_material_price_selection_history:'changed_at',branch_occ_price_assignment_history:'changed_at',material_product_category_history:'changed_at',branch_product_price_assignment_history:'changed_at',product_price_group_history:'changed_at',material_master_audit:'changed_at',sales_settlement_audit:'created_at',expense_amount_corrections:'created_at',unloading_corrections:'created_at',temporary_customer_intake_events:'created_at',company_menu_audit:'created_at',vehicle_status_history:'changed_at'}
const requests={driver_date_requests:['requested_at','reviewed_at'],driver_defer_requests:['requested_at','reviewed_at'],driver_arrangement_requests:['created_at','reviewed_at'],customer_transfer_requests:['requested_at','reviewed_at'],purchase_bill_void_requests:['requested_at','reviewed_at'],expense_correction_requests:['created_at','reviewed_at'],unloading_correction_requests:['created_at','reviewed_at'],temporary_customer_intakes:['created_at','reviewed_at']}
export function dailyReport(db,account,date){
 const access=reportAccess(db,account)
 if(!access.allowed)throw Object.assign(Error('DAILY_REPORT_ACCESS'),{statusCode:403})
 if(!validSalesDate(date))throw Object.assign(Error('DAILY_REPORT_DATE'),{statusCode:400})
 db.exec('BEGIN')
 try{const result=buildReport(db,access,date);db.exec('COMMIT');return result}catch(e){db.exec('ROLLBACK');throw e}
}
function buildReport(db,access,date){
 const tables=new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r=>r.name))
 const columns=table=>new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(r=>r.name))
 const missing=[]
 const onDay=(table,field)=>{if(!tables.has(table)){missing.push(table);return []}return db.prepare(`SELECT * FROM ${table} WHERE date(${field},'+8 hours')=? ORDER BY ${field},id`).all(date)}
 const all=table=>tables.has(table)?db.prepare(`SELECT * FROM ${table}`).all():[]
 const byDay=(table,field)=>db.prepare(`SELECT * FROM ${table} WHERE ${field}=? ORDER BY id`).all(date)
 const employees=new Map(db.prepare('SELECT id,name FROM employees').all().map(r=>[r.id,r.name]))
 const branches=new Map(db.prepare('SELECT id,branch_name,jodoo_branch_id,customer_id FROM branches').all().map(r=>[r.id,r]))
 const vehicles=new Map(db.prepare('SELECT id,registration_number,vehicle_code FROM vehicles').all().map(r=>[r.id,r.registration_number||r.vehicle_code]))
 const stops=db.prepare(`SELECT s.*,d.vehicle_id,d.driver_id,b.branch_name,b.jodoo_branch_id FROM dispatch_stops s JOIN dispatches d ON d.id=s.dispatch_id JOIN branches b ON b.id=s.branch_id WHERE COALESCE(s.service_date,d.dispatch_date)=? ORDER BY s.id`).all(date)
 const trips=db.prepare(`SELECT t.*,d.vehicle_id,d.driver_id FROM dispatch_trips t JOIN dispatch_days day ON day.id=t.dispatch_day_id JOIN dispatches d ON d.id=t.dispatch_id WHERE day.dispatch_date=? ORDER BY t.id`).all(date)
 const bills=byDay('purchase_bills','service_date'),issued=bills.filter(r=>r.status==='issued')
 const items=db.prepare(`SELECT i.*,b.vehicle_id FROM purchase_bill_items i JOIN purchase_bills b ON b.id=i.purchase_bill_id WHERE b.service_date=? AND b.status='issued' ORDER BY i.id`).all(date)
 const kg=items.filter(r=>String(r.unit_snapshot).toLowerCase()==='kg')
 const activeTrips=trips.filter(r=>r.started_at||['in_progress','completed'].includes(r.execution_status))
 const runVehicleIds=new Set([...activeTrips.map(r=>r.vehicle_id),...issued.map(r=>r.vehicle_id)].filter(Boolean))
 const collected=new Set(issued.map(r=>r.branch_id))
 const noGoods=stops.filter(r=>['no_goods','no_goods_notice'].includes(r.completion_outcome))
 if(!columns('dispatch_stops').has('completion_outcome'))missing.push('completion_outcome')
 const currentStops=stops.filter(r=>!r.superseded_by_stop_id&&r.status!=='cancelled')
 const pendingStops=currentStops.filter(r=>r.status!=='completed')
 const row=(id,name,kind,status,quantity=null,amountCents=null,actor='',time='',detail={})=>({id:String(id),name,kind,status,quantity,amountCents,actor,time,detail:safeDetails(detail)})
 const sections={}
 sections.vehicles=[...new Set([...trips.map(r=>r.vehicle_id),...issued.map(r=>r.vehicle_id)].filter(Boolean))].map(id=>row(id,vehicles.get(id),'vehicle',runVehicleIds.has(id)?'running':'not_started',sum(kg.filter(r=>r.vehicle_id===id),'quantity'),null,'','',{trips:activeTrips.filter(t=>t.vehicle_id===id).length,collectedBranches:unique(issued.filter(b=>b.vehicle_id===id),'branch_id'),plannedBranches:unique(currentStops.filter(s=>s.vehicle_id===id),'branch_id'),pendingBranches:unique(pendingStops.filter(s=>s.vehicle_id===id),'branch_id'),targetKg:null,achievement:null}))
 sections.stops=stops.map(s=>row(s.id,s.branch_name,'branch',s.superseded_by_stop_id?'superseded':s.status==='completed'&&['no_goods','no_goods_notice'].includes(s.completion_outcome)?'no_goods':s.status,null,null,employees.get(s.driver_id)||'',s.completed_at||s.arrived_at||'',{branchCode:s.jodoo_branch_id,vehicle:vehicles.get(s.vehicle_id),tripId:s.dispatch_trip_id,serviceDate:date,reason:s.override_reason||s.superseded_reason||(tables.has('driver_no_goods_proofs')?db.prepare('SELECT reason FROM driver_no_goods_proofs WHERE dispatch_stop_id=?').get(s.id)?.reason:null)||(tables.has('no_goods_notices')?db.prepare('SELECT reason FROM no_goods_notices WHERE dispatch_stop_id=? AND restored_at IS NULL').get(s.id)?.reason:null)||'',hasIssuedBill:issued.some(b=>b.dispatch_stop_id===s.id)}))
 const productGroups=new Map()
 for(const i of items){const key=`${i.product_id}:${i.unit_snapshot}`,group=productGroups.get(key)||{name:i.product_name_snapshot,unit:i.unit_snapshot,quantity:0,amount:0};group.quantity+=i.quantity;group.amount+=i.line_total_cents;productGroups.set(key,group)}
 sections.goods=[...productGroups].map(([id,g])=>row(id,g.name,g.unit,'issued',g.quantity,access.finance?g.amount:null))
 const temp=onDay('temporary_customer_intakes','created_at'),intakes=all('temporary_customer_intakes'),tempBranches=new Set(intakes.map(r=>r.branch_id)),tempCustomerIds=new Set(intakes.map(r=>branches.get(r.branch_id)?.customer_id))
 sections.customers=onDay('customers','created_at').filter(r=>!tempCustomerIds.has(r.id)).map(r=>row(`customer-${r.id}`,r.name,'customer',r.status,null,null,r.created_by||'',r.created_at,{customerId:r.jodoo_customer_id}))
 sections.branches=onDay('branches','created_at').filter(r=>!tempBranches.has(r.id)).map(r=>row(r.id,r.branch_name,'branch',r.status,null,null,r.created_by||'',r.created_at,{branchCode:r.jodoo_branch_id,customerId:r.customer_id}))
 sections.temporary=temp.map(r=>row(r.id,branches.get(r.branch_id)?.branch_name,'temporary',r.status,null,null,employees.get(r.employee_id)||'',r.created_at,{reviewedBy:r.reviewed_by,reviewedAt:r.reviewed_at,reason:r.review_reason}))
 for(const r of onDay('temporary_customer_intakes','reviewed_at').filter(r=>r.status==='formal')){const branch=branches.get(r.branch_id);sections.customers.push(row(`formal-${r.id}`,branch?.branch_name,'formal',r.status,null,null,r.reviewed_by,r.reviewed_at,{customerId:branch?.customer_id,reason:r.review_reason,requestedAt:r.created_at}));sections.branches.push(row(`formal-${r.id}`,branch?.branch_name,'formal',r.status,null,null,r.reviewed_by,r.reviewed_at,{branchCode:branch?.jodoo_branch_id,reason:r.review_reason}))}
 const report={date,generatedAt:new Date().toISOString(),access,summary:{weightKg:sum(kg,'quantity'),vehicles:runVehicleIds.size,trips:activeTrips.length,plannedBranches:unique(currentStops,'branch_id'),collectedBranches:collected.size,noGoodsBranches:unique(noGoods,'branch_id'),pendingBranches:unique(pendingStops,'branch_id'),cancelledBranches:unique(stops.filter(s=>s.status==='cancelled'),'branch_id'),customers:sections.customers.length,branches:sections.branches.length,temporary:temp.length},sections,missingSources:missing}
 if(access.finance){
 sections.bills=bills.map(r=>row(r.id,r.branch_name_snapshot,'purchase',r.status,null,r.total_cents,r.driver_name_snapshot,r.issued_at,{number:r.bill_number,payment:r.payment_method,vehicle:r.registration_number_snapshot,serviceDate:r.service_date}))
 const cash=byDay('cash_float_transactions','service_date'),admin=byDay('admin_expense_records','service_date'),details=all('expense_details')
 const expense=(r,kind)=>{const d=details.find(d=>kind==='employee'?d.employee_transaction_id===r.id:d.admin_expense_id===r.id)||{};return row(`${kind}-${r.id}`,d.company_name||r.description,d.category||r.category||r.description,r.voided_at?'voided':'recorded',null,kind==='employee'?-r.amount_cents:r.amount_cents,employees.get(r.employee_id)||r.created_by_name_snapshot,r.created_at,{reference:r.reference_number,vehicle:d.vehicle_plate,remarks:d.remarks,serviceDate:r.service_date})}
 sections.expenses=[...cash.filter(r=>r.transaction_type==='expense').map(r=>expense(r,'employee')),...admin.map(r=>expense(r,'admin'))]
 sections.topups=cash.filter(r=>r.transaction_type==='top_up').map(r=>row(r.id,employees.get(r.employee_id),'top_up',r.voided_at?'voided':'recorded',null,r.amount_cents,r.created_by_name_snapshot,r.created_at,{reference:r.reference_number,description:r.description}))
 const categories=new Map();for(const e of sections.expenses.filter(r=>r.status!=='voided')){categories.set(e.kind,(categories.get(e.kind)||0)+e.amountCents)};sections.expenseCategories=[...categories].map(([kind,amount])=>row(kind,kind,kind,'recorded',null,amount))
 const sales=byDay('sales_settlements','settlement_date')
 sections.sales=sales.map(r=>row(r.id,r.buyer_name,'sale','settlement_recorded',sum(json(r.lines_json)||[],'weightKg'),r.total_cents,r.created_by,r.created_at,{number:r.bill_number,settlementDate:r.settlement_date,vehicle:r.vehicle_plate,lines:json(r.lines_json),paymentStatus:'not_recorded'}))
 sections.deliveries=[];for(const sale of db.prepare("SELECT * FROM sales_settlements WHERE EXISTS(SELECT 1 FROM json_each(lines_json) WHERE json_extract(value,'$.deliveryDate')=?)").all(date)){for(const [i,line] of (json(sale.lines_json)||[]).entries()){if(line.deliveryDate===date)sections.deliveries.push(row(`${sale.id}-${i}`,sale.buyer_name,'sale','settlement_recorded',Number(line.weightKg)||0,Math.round(Number(line.weightKg)*Number(line.unitPrice)*100),sale.created_by,sale.created_at,{...line,settlementDate:sale.settlement_date,vehicle:sale.vehicle_plate,paymentStatus:'not_recorded'}))}}
 Object.assign(report.summary,{cashCents:sum(issued.filter(r=>r.payment_method==='Cash'),'total_cents'),creditCents:sum(issued.filter(r=>r.payment_method==='Credit'),'total_cents'),purchaseCents:sum(issued,'total_cents'),voidCents:sum(bills.filter(r=>r.status==='voided'),'total_cents'),expenseCents:sum(sections.expenses.filter(r=>r.status!=='voided'),'amountCents'),topupCents:sum(sections.topups.filter(r=>r.status!=='voided'),'amountCents'),salesCents:sum(sales,'total_cents'),deliveredKg:sum(sections.deliveries,'quantity')})
 }
 sections.approvals=[]
 for(const [table,[created,reviewed]] of Object.entries(requests)){
  if(!access.full&&['purchase_bill_void_requests','expense_correction_requests','unloading_correction_requests'].includes(table))continue
  if(!tables.has(table)){missing.push(table);continue}
  const records=db.prepare(`SELECT * FROM ${table} WHERE date(${created},'+8 hours')=? OR date(${reviewed},'+8 hours')=? OR (status='pending' AND date(${created},'+8 hours')<=?) ORDER BY id`).all(date,date,date)
  for(const r of records){if(table==='driver_date_requests'&&tables.has('driver_date_reviews')){r.dateReview=db.prepare('SELECT approved_date,route_number,scope FROM driver_date_reviews WHERE request_id=?').get(r.id)}const stop=r.dispatch_stop_id?db.prepare('SELECT branch_id FROM dispatch_stops WHERE id=?').get(r.dispatch_stop_id):null;const branch=r.branch_id||stop?.branch_id;sections.approvals.push(row(`${table}-${r.id}`,branches.get(branch)?.branch_name||String(r.record_key||r.purchase_bill_id||r.record_id||r.id),table,r.status,null,null,r.reviewed_name||r.reviewer_name||r.reviewed_by_name_snapshot||employees.get(Number(r.reviewed_by))||String(r.reviewed_by||r.reviewed_by_employee_id||''),r[reviewed]||r[created],{branchId:branch,requestedAt:r[created],reviewedAt:r[reviewed],sourceDate:r.source_date||r.service_date,targetDate:r.target_date,approvedDate:r.dateReview?.approved_date,route:r.dateReview?.route_number,scope:r.dateReview?.scope,kind:r.kind,reason:r.reason,reviewReason:r.review_reason||r.review_note,requester:employees.get(r.employee_id||r.requester_employee_id||r.driver_employee_id)||r.requester_name, ...(access.full?{before:json(r.before_json),after:json(r.after_json)}:{})}))}
 }
 for(const r of db.prepare("SELECT * FROM temporary_locations WHERE date(captured_at,'+8 hours')=? OR date(COALESCE(reviewed_at,adopted_at),'+8 hours')=? OR (verification_status='pending_supervisor' AND date(captured_at,'+8 hours')<=?)").all(date,date,date))sections.approvals.push(row(`gps-${r.id}`,branches.get(r.branch_id)?.branch_name||String(r.id),'gps',r.verification_status==='pending_supervisor'?'pending':r.review_decision||r.verification_status,null,null,r.reviewed_by||r.adopted_by||'',r.reviewed_at||r.adopted_at||r.captured_at,{branchId:r.branch_id,requestedAt:r.captured_at,reviewedAt:r.reviewed_at||r.adopted_at,reason:r.review_reason,requester:r.captured_by}))
 sections.changes=[]
 for(const [table,time] of Object.entries(histories)){
  if(!access.full&&table!=='dispatch_change_logs')continue
  for(const r of onDay(table,time)){
   // Only Owner/delegated full viewers receive complete business audit payloads.
   if(table==='audit_logs'&&/employee|auth|account|sensitive/.test(r.entity_type))continue
   const parsed=Object.fromEntries(Object.entries(r).map(([k,v])=>[k,k.endsWith('_json')?json(v):v]));
   if(!access.full){delete parsed.before_json;delete parsed.after_json}
   if((privateKey.test(r.field_name||'')||/^(home_|bank_)/.test(r.field_name||''))){parsed.old_value='protected';parsed.new_value='protected'}
   const branch=r.branch_id||(r.entity_type==='branch'?Number(r.entity_id):r.entity_type==='dispatch_stop'?db.prepare('SELECT branch_id FROM dispatch_stops WHERE id=?').get(Number(r.entity_id))?.branch_id:null)
   const affectedDate=r.dispatch_day_id?db.prepare('SELECT dispatch_date FROM dispatch_days WHERE id=?').get(r.dispatch_day_id)?.dispatch_date:null
   parsed.serviceDate=affectedDate
   if(table==='dispatch_change_logs'&&['route_approved','route_approval_withdrawn','day_approved','approval_withdrawn'].includes(r.change_type))sections.approvals.push(row(`decision-${r.id}`,String(r.entity_id),r.change_type,r.change_type.includes('withdraw')?'withdrawn':'approved',null,null,r.actor,r[time],{serviceDate:affectedDate,reviewedAt:r[time],reason:json(r.after_json)?.reason}))
   sections.changes.push(row(`${table}-${r.id}`,branches.get(branch)?.branch_name||String(r.entity_id||r.settlement_id||r.record_id||r.id),table,'changed',null,null,r.actor_name||employees.get(Number(r.actor))||r.actor||r.changed_by||'',r[time],{source:table,...parsed}))
  }
 }
 sections.reschedules=onDay('schedule_exceptions','created_at').filter(r=>r.target_date&&r.original_date&&r.target_date!==r.original_date).map(r=>row(`exception-${r.id}`,branches.get(r.branch_id)?.branch_name||String(r.branch_id),'reschedule','changed',null,null,r.created_by,r.created_at,{branchId:r.branch_id,sourceDate:r.original_date,targetDate:r.target_date,reason:r.reason,scope:r.permanent?'permanent':'once'}))
 for(const r of sections.approvals.filter(r=>r.kind==='driver_date_requests'&&r.status==='approved'&&r.detail.sourceDate!==(r.detail.approvedDate||r.detail.targetDate)&&r.detail.reviewedAt&&db.prepare("SELECT date(?,'+8 hours') d").get(r.detail.reviewedAt).d===date))sections.reschedules.push({...r,id:`reschedule-${r.id}`})
 report.summary.rescheduledBranches=unique(sections.reschedules.map(r=>r.detail),'branchId')
 report.summary.changes=sections.changes.length
 report.summary.changedBranches=new Set(sections.changes.map(r=>r.detail.branch_id||(r.detail.entity_type==='branch'?r.detail.entity_id:r.detail.entity_type==='dispatch_stop'?db.prepare('SELECT branch_id FROM dispatch_stops WHERE id=?').get(Number(r.detail.entity_id))?.branch_id:null)).filter(Boolean).map(String)).size
 report.summary.approvals=sections.approvals.filter(r=>r.detail.reviewedAt&&db.prepare("SELECT date(?,'+8 hours') d").get(r.detail.reviewedAt).d===date).length
 report.summary.pendingApprovals=sections.approvals.filter(r=>r.status==='pending').length
 return report
}
