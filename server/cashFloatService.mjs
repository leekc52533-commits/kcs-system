import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import ExcelJS from 'exceljs'
import {db as defaultDb} from './database.mjs'
import {withImmediateTransaction} from './branchServiceDateGuard.mjs'
import {kuchingDate} from '../shared/kuchingTime.js'

const fail=(message,code='INVALID_CASH_FLOAT',statusCode=400)=>{const error=new Error(message);error.code=code;error.statusCode=statusCode;return error}
const nowKuching=(input=new Date())=>{const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kuching',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(input)).map(part=>[part.type,part.value]));return`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}+08:00`}
const cents=(value,label='Amount')=>{const amount=Number(value);if(!Number.isFinite(amount)||amount<0||amount>1000000)throw fail(`${label} must be between RM0 and RM1,000,000.`);return Math.round(amount*100)}
const positiveCents=(value,label='Amount')=>{const amount=cents(value,label);if(!amount)throw fail(`${label} must be more than RM0.`);return amount}
const validDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(String(value||''))?String(value):kuchingDate()
const accountRow=(database,employeeId)=>database.prepare(`SELECT a.employee_id employeeId,e.employee_code employeeCode,e.name employeeName,a.target_float_cents targetFloatCents,a.low_balance_threshold_cents lowBalanceThresholdCents,a.is_active isActive,
  COALESCE((SELECT SUM(t.amount_cents) FROM cash_float_transactions t WHERE t.employee_id=a.employee_id),0) balanceCents
  FROM cash_float_accounts a JOIN employees e ON e.id=a.employee_id WHERE a.employee_id=?`).get(Number(employeeId))

function serializeAccount(row,database,date=kuchingDate()){
  if(!row)return null
  const today=database.prepare(`SELECT COALESCE(SUM(CASE WHEN transaction_type='top_up' THEN amount_cents ELSE 0 END),0) topUpCents,
    COALESCE(-SUM(CASE WHEN transaction_type='cash_purchase' THEN amount_cents ELSE 0 END),0) purchaseCents,
    COALESCE(-SUM(CASE WHEN transaction_type='expense' THEN amount_cents ELSE 0 END),0) expenseCents
    FROM cash_float_transactions WHERE employee_id=? AND service_date=?`).get(row.employeeId,date)
  const balance=Number(row.balanceCents),target=Number(row.targetFloatCents),threshold=Number(row.lowBalanceThresholdCents)
  return{employeeId:Number(row.employeeId),employeeCode:row.employeeCode,employeeName:row.employeeName,targetFloatCents:target,lowBalanceThresholdCents:threshold,balanceCents:balance,suggestedTopUpCents:Math.max(0,target-balance),lowBalance:Boolean(row.isActive)&&balance<=threshold,isActive:Boolean(row.isActive),today:{topUpCents:Number(today.topUpCents),purchaseCents:Number(today.purchaseCents),expenseCents:Number(today.expenseCents)}}
}

function refreshAlert(database,employeeId,when=nowKuching()){
  const row=accountRow(database,employeeId)
  if(!row)return null
  const low=Boolean(row.isActive)&&Number(row.balanceCents)<=Number(row.lowBalanceThresholdCents),active=database.prepare("SELECT id FROM cash_float_alerts WHERE employee_id=? AND status='active'").get(Number(employeeId))
  if(low&&!active){const result=database.prepare(`INSERT INTO cash_float_alerts(employee_id,balance_cents,threshold_cents,target_float_cents,status,triggered_at,last_checked_at) VALUES(?,?,?,?,'active',?,?)`).run(employeeId,row.balanceCents,row.lowBalanceThresholdCents,row.targetFloatCents,when,when);return Number(result.lastInsertRowid)}
  if(low&&active){database.prepare('UPDATE cash_float_alerts SET balance_cents=?,threshold_cents=?,target_float_cents=?,last_checked_at=? WHERE id=?').run(row.balanceCents,row.lowBalanceThresholdCents,row.targetFloatCents,when,active.id);return Number(active.id)}
  if(!low&&active)database.prepare("UPDATE cash_float_alerts SET status='resolved',resolved_at=?,last_checked_at=? WHERE id=?").run(when,when,active.id)
  return null
}

const image=photo=>{if(!photo)return null;const match=/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(photo.dataUrl||''));if(!match)throw fail('A valid JPEG, PNG or WebP proof is required.','INVALID_PHOTO');const bytes=Buffer.from(match[2],'base64');if(!bytes.length||bytes.length>8*1024*1024)throw fail('Proof image must be no larger than 8 MB.','INVALID_PHOTO');const type=match[1],valid=type==='image/jpeg'&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff||type==='image/png'&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||type==='image/webp'&&bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP';if(!valid)throw fail('Proof content does not match its file type.','INVALID_PHOTO');return{bytes,type,extension:type.split('/')[1].replace('jpeg','jpg'),originalName:String(photo.name||'proof')}}
function saveImage(photo,uploadsRoot){const file=image(photo);if(!file)return{};if(!uploadsRoot)throw fail('Secure upload storage is unavailable.','UPLOAD_UNAVAILABLE',500);const folder=path.resolve(uploadsRoot,'cash-float-proofs'),name=`${crypto.randomUUID()}.${file.extension}`,absolute=path.resolve(folder,name);if(!absolute.startsWith(folder+path.sep))throw fail('Invalid upload path.','INVALID_PHOTO');fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(absolute,file.bytes,{flag:'wx'});return{absolute,storageKey:`cash-float-proofs/${name}`,originalName:file.originalName,contentType:file.type,sizeBytes:file.bytes.length}}

export function listCashFloatAccounts(filters={},database=defaultDb){
  const date=validDate(filters.date),rows=database.prepare(`SELECT e.id employeeId,e.employee_code employeeCode,e.name employeeName,a.target_float_cents targetFloatCents,a.low_balance_threshold_cents lowBalanceThresholdCents,COALESCE(a.is_active,0) isActive,
    COALESCE((SELECT SUM(t.amount_cents) FROM cash_float_transactions t WHERE t.employee_id=e.id),0) balanceCents
    FROM cash_float_members m JOIN employees e ON e.id=m.employee_id LEFT JOIN cash_float_accounts a ON a.employee_id=e.id
    WHERE m.is_selected=1 AND e.is_active=1 AND e.employment_status='active'
    ORDER BY CASE WHEN lower(COALESCE(e.job_role,''))='driver' THEN 0 ELSE 1 END,e.name`).all()
  return{date,items:rows.map(row=>row.targetFloatCents==null?{employeeId:Number(row.employeeId),employeeCode:row.employeeCode,employeeName:row.employeeName,configured:false}: {...serializeAccount(row,database,date),configured:true})}
}

export function listCashFloatEmployees(database=defaultDb){return{items:database.prepare(`SELECT e.id employeeId,e.employee_code employeeCode,e.name employeeName,e.job_role jobRole,
  CASE WHEN m.is_selected=1 THEN 1 ELSE 0 END selected,CASE WHEN a.employee_id IS NULL THEN 0 ELSE 1 END configured,
  COALESCE((SELECT SUM(t.amount_cents) FROM cash_float_transactions t WHERE t.employee_id=e.id),0) balanceCents
  FROM employees e LEFT JOIN cash_float_members m ON m.employee_id=e.id LEFT JOIN cash_float_accounts a ON a.employee_id=e.id
  WHERE e.is_active=1 AND e.employment_status='active'
  ORDER BY CASE WHEN lower(COALESCE(e.job_role,''))='driver' THEN 0 WHEN lower(COALESCE(e.job_role,'')) IN ('crew','assistant') THEN 1 ELSE 2 END,e.name`).all().map(item=>({...item,employeeId:Number(item.employeeId),selected:Boolean(item.selected),configured:Boolean(item.configured),balanceCents:Number(item.balanceCents)}))}}

export function setCashFloatEmployees(employeeIds=[],context={},database=defaultDb){
  if(!Array.isArray(employeeIds))throw fail('Employee selection must be a list.')
  const selected=[...new Set(employeeIds.map(Number).filter(Number.isInteger).filter(id=>id>0))],when=nowKuching(context.now),actorId=Number(context.employeeId)||null
  const valid=selected.length?database.prepare(`SELECT id FROM employees WHERE is_active=1 AND employment_status='active' AND id IN (${selected.map(()=>'?').join(',')})`).all(...selected).map(item=>Number(item.id)):[]
  if(valid.length!==selected.length)throw fail('One or more selected employees are not active.','INVALID_EMPLOYEE')
  return withImmediateTransaction(database,()=>{
    database.prepare('UPDATE cash_float_members SET is_selected=0,updated_by_employee_id=?,updated_at=? WHERE is_selected=1').run(actorId,when)
    const save=database.prepare(`INSERT INTO cash_float_members(employee_id,is_selected,updated_by_employee_id,updated_at) VALUES(?,1,?,?) ON CONFLICT(employee_id) DO UPDATE SET is_selected=1,updated_by_employee_id=excluded.updated_by_employee_id,updated_at=excluded.updated_at`)
    for(const employeeId of selected)save.run(employeeId,actorId,when)
    database.prepare('UPDATE cash_float_accounts SET is_active=CASE WHEN employee_id IN (SELECT employee_id FROM cash_float_members WHERE is_selected=1) THEN 1 ELSE 0 END,updated_at=?').run(when)
    database.prepare(`UPDATE cash_float_alerts SET status='resolved',resolved_at=?,last_checked_at=? WHERE status='active' AND employee_id NOT IN (SELECT employee_id FROM cash_float_members WHERE is_selected=1)`).run(when,when)
    for(const employeeId of selected)if(accountRow(database,employeeId))refreshAlert(database,employeeId,when)
    return listCashFloatEmployees(database)
  })
}

export function configureCashFloat(employeeId,payload={},context={},database=defaultDb){
  const employee=database.prepare("SELECT id,name FROM employees WHERE id=? AND is_active=1 AND employment_status='active'").get(Number(employeeId));if(!employee)throw fail('Active employee not found.','NOT_FOUND',404)
  const target=positiveCents(payload.targetFloat,'Target Float'),threshold=cents(payload.lowBalanceThreshold,'Low Balance Alert');if(threshold>=target)throw fail('Low Balance Alert must be lower than Target Float.')
  const existing=accountRow(database,employeeId),opening=existing?null:cents(payload.currentBalance,'Current Balance'),when=nowKuching(context.now),actorId=Number(context.employeeId)||null,actorName=String(context.employeeName||'Office')
  return withImmediateTransaction(database,()=>{database.prepare(`INSERT INTO cash_float_members(employee_id,is_selected,updated_by_employee_id,updated_at) VALUES(?,1,?,?) ON CONFLICT(employee_id) DO UPDATE SET is_selected=1,updated_by_employee_id=excluded.updated_by_employee_id,updated_at=excluded.updated_at`).run(employeeId,actorId,when);database.prepare(`INSERT INTO cash_float_accounts(employee_id,target_float_cents,low_balance_threshold_cents,is_active,updated_by_employee_id,updated_at) VALUES(?,?,?,1,?,?) ON CONFLICT(employee_id) DO UPDATE SET target_float_cents=excluded.target_float_cents,low_balance_threshold_cents=excluded.low_balance_threshold_cents,is_active=1,updated_by_employee_id=excluded.updated_by_employee_id,updated_at=excluded.updated_at`).run(employeeId,target,threshold,actorId,when);if(opening>0)database.prepare(`INSERT INTO cash_float_transactions(employee_id,transaction_type,amount_cents,service_date,payment_channel,description,created_by_employee_id,created_by_name_snapshot,created_at) VALUES(?,'opening_balance',?,?,'Adjustment','Opening balance when Cash Float was activated',?,?,?)`).run(employeeId,opening,validDate(payload.serviceDate),actorId,actorName,when);refreshAlert(database,employeeId,when);return serializeAccount(accountRow(database,employeeId),database)})
}

function addTransaction(employeeId,type,signedAmount,payload,context,database,uploadsRoot){
  const account=accountRow(database,employeeId);if(!account||!account.isActive)throw fail('Cash Float must be configured for this employee first.','CASH_FLOAT_NOT_CONFIGURED',409)
  const proof=saveImage(payload.proof,uploadsRoot),when=nowKuching(context.now),actorId=Number(context.employeeId)||null,actorName=String(context.employeeName||'Office'),description=String(payload.description||'').trim(),reference=String(payload.referenceNumber||'').trim()||null
  try{return withImmediateTransaction(database,()=>{const result=database.prepare(`INSERT INTO cash_float_transactions(employee_id,transaction_type,amount_cents,service_date,payment_channel,description,reference_number,proof_storage_key,proof_original_name,proof_content_type,proof_size_bytes,created_by_employee_id,created_by_name_snapshot,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(employeeId,type,signedAmount,validDate(payload.serviceDate),payload.paymentChannel||'System',description||null,reference,proof.storageKey||null,proof.originalName||null,proof.contentType||null,proof.sizeBytes||null,actorId,actorName,when);const alertId=refreshAlert(database,employeeId,when);return{transactionId:Number(result.lastInsertRowid),alertId,account:serializeAccount(accountRow(database,employeeId),database)}})}catch(error){if(proof.absolute&&fs.existsSync(proof.absolute))fs.unlinkSync(proof.absolute);throw error}
}

export function addCashFloatTopUp(employeeId,payload={},context={},database=defaultDb,options={}){const channel=String(payload.paymentChannel||'');if(!['Cash','TNG','Bank Transfer'].includes(channel))throw fail('Select Cash, TNG or Bank Transfer.');return addTransaction(employeeId,'top_up',positiveCents(payload.amount),{...payload,paymentChannel:channel},context,database,options.uploadsRoot)}
export function addCashFloatExpense(employeeId,payload={},context={},database=defaultDb,options={}){const description=String(payload.description||'').trim();if(!description)throw fail('Expense description is required.');return addTransaction(employeeId,'expense',-positiveCents(payload.amount),{...payload,description,paymentChannel:'System'},context,database,options.uploadsRoot)}

export function recordCashPurchase(purchaseBill,database=defaultDb,{now=new Date()}={}){
  if(String(purchaseBill.paymentMethod)!=='Cash')return null
  const account=accountRow(database,purchaseBill.driverEmployeeId);if(!account||!account.isActive)return null
  const existing=database.prepare('SELECT id FROM cash_float_transactions WHERE purchase_bill_id=?').get(Number(purchaseBill.id));if(existing)return Number(existing.id)
  const when=nowKuching(now),result=database.prepare(`INSERT INTO cash_float_transactions(employee_id,transaction_type,amount_cents,service_date,purchase_bill_id,payment_channel,description,created_by_employee_id,created_by_name_snapshot,created_at) VALUES(?,'cash_purchase',?,?,?,?,?,?,?,?)`).run(purchaseBill.driverEmployeeId,-Math.abs(Number(purchaseBill.totalCents)),purchaseBill.serviceDate,purchaseBill.id,'System',`Purchase ${purchaseBill.billNumber}`,purchaseBill.driverEmployeeId,purchaseBill.driverName||'Driver',when);refreshAlert(database,purchaseBill.driverEmployeeId,when);return Number(result.lastInsertRowid)
}

export function mobileCashFloat(employeeId,database=defaultDb){const row=accountRow(database,employeeId);if(!row||!row.isActive)return{configured:false};const account=serializeAccount(row,database),transactions=database.prepare(`SELECT id,transaction_type transactionType,amount_cents amountCents,service_date serviceDate,description,created_at createdAt FROM cash_float_transactions WHERE employee_id=? ORDER BY id DESC LIMIT 8`).all(Number(employeeId)).map(item=>({...item,id:Number(item.id),amountCents:Number(item.amountCents)}));return{configured:true,...account,transactions}}

export function listCashFloatTransactions(filters={},database=defaultDb){const clauses=['1=1'],params=[],from=String(filters.from||''),to=String(filters.to||'');if(/^\d{4}-\d{2}-\d{2}$/.test(from)){clauses.push('t.service_date>=?');params.push(from)}if(/^\d{4}-\d{2}-\d{2}$/.test(to)){clauses.push('t.service_date<=?');params.push(to)}const employeeId=Number(filters.employeeId);if(employeeId>0){clauses.push('t.employee_id=?');params.push(employeeId)}const items=database.prepare(`SELECT t.id,t.employee_id employeeId,e.name employeeName,t.transaction_type transactionType,t.amount_cents amountCents,t.service_date serviceDate,t.payment_channel paymentChannel,t.description,t.reference_number referenceNumber,t.proof_storage_key proofStorageKey,t.created_by_name_snapshot createdBy,t.created_at createdAt,t.voided_at voidedAt,pb.bill_number billNumber FROM cash_float_transactions t JOIN employees e ON e.id=t.employee_id LEFT JOIN purchase_bills pb ON pb.id=t.purchase_bill_id WHERE ${clauses.join(' AND ')} ORDER BY t.service_date DESC,t.id DESC LIMIT 2000`).all(...params);return{items:items.map(item=>({...item,id:Number(item.id),employeeId:Number(item.employeeId),amountCents:Number(item.amountCents),hasProof:Boolean(item.proofStorageKey)}))}}

export function listCashFloatAlerts(database=defaultDb){return{items:database.prepare(`SELECT a.id,a.employee_id employeeId,e.name employeeName,a.balance_cents balanceCents,a.threshold_cents thresholdCents,a.target_float_cents targetFloatCents,a.triggered_at triggeredAt FROM cash_float_alerts a JOIN employees e ON e.id=a.employee_id JOIN cash_float_members m ON m.employee_id=a.employee_id AND m.is_selected=1 JOIN cash_float_accounts f ON f.employee_id=a.employee_id AND f.is_active=1 WHERE a.status='active' ORDER BY a.triggered_at`).all().map(item=>({...item,id:Number(item.id),employeeId:Number(item.employeeId),balanceCents:Number(item.balanceCents),thresholdCents:Number(item.thresholdCents),targetFloatCents:Number(item.targetFloatCents),suggestedTopUpCents:Math.max(0,Number(item.targetFloatCents)-Number(item.balanceCents))}))}}

export function cashFloatProofFile(transactionId,database=defaultDb){return database.prepare('SELECT proof_storage_key storageKey,proof_content_type contentType FROM cash_float_transactions WHERE id=? AND proof_storage_key IS NOT NULL').get(Number(transactionId))||null}

export async function cashFloatWorkbook(filters={},database=defaultDb){const accounts=listCashFloatAccounts({date:filters.to},database).items.filter(item=>item.configured),transactions=listCashFloatTransactions(filters,database).items,workbook=new ExcelJS.Workbook();workbook.creator='KCS Dispatch System';const summary=workbook.addWorksheet('Cash Float Summary');summary.columns=[{header:'Employee',key:'employee',width:26},{header:'Target Float',key:'target',width:16},{header:'Low Balance Alert',key:'threshold',width:18},{header:'Current Balance',key:'balance',width:18},{header:'Suggested Top Up',key:'suggested',width:18},{header:'Status',key:'status',width:14}];accounts.forEach(item=>summary.addRow({employee:item.employeeName,target:item.targetFloatCents/100,threshold:item.lowBalanceThresholdCents/100,balance:item.balanceCents/100,suggested:item.suggestedTopUpCents/100,status:item.lowBalance?'LOW':'OK'}));const ledger=workbook.addWorksheet('Cash Float Ledger');ledger.columns=[{header:'Date',key:'date',width:12},{header:'Employee',key:'employee',width:26},{header:'Type',key:'type',width:18},{header:'Amount',key:'amount',width:14},{header:'Channel',key:'channel',width:16},{header:'PO No.',key:'bill',width:20},{header:'Description',key:'description',width:35},{header:'Reference',key:'reference',width:20},{header:'Entered By',key:'createdBy',width:24},{header:'Time',key:'time',width:22}];transactions.forEach(item=>ledger.addRow({date:item.serviceDate,employee:item.employeeName,type:item.transactionType,amount:item.amountCents/100,channel:item.paymentChannel||'',bill:item.billNumber||'',description:item.description||'',reference:item.referenceNumber||'',createdBy:item.createdBy,time:item.createdAt}));for(const sheet of [summary,ledger]){sheet.autoFilter={from:'A1',to:{row:Math.max(1,sheet.rowCount),column:sheet.columnCount}};sheet.views=[{state:'frozen',ySplit:1}];sheet.getRow(1).eachCell(cell=>{cell.font={bold:true,color:{argb:'FFFFFFFF'}};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF176B5B'}}})}for(let row=2;row<=summary.rowCount;row++)for(let col=2;col<=5;col++)summary.getCell(row,col).numFmt='RM #,##0.00';for(let row=2;row<=ledger.rowCount;row++)ledger.getCell(row,4).numFmt='RM #,##0.00';return Buffer.from(await workbook.xlsx.writeBuffer())}
