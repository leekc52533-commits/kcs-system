import {noticePhotos} from './noticePhotos.mjs'
import {noticeVersions,noticeTerms,translateNoticeSource} from './noticeTranslation.mjs'
import {db as defaultDb} from './database.mjs'
import {canManageDispatch} from '../shared/dispatchAccess.js'
import {withImmediateTransaction} from './branchServiceDateGuard.mjs'
const fail=(code,statusCode=400)=>{throw Object.assign(Error(code),{code,statusCode})}
function employee(ctx,db){const e=db.prepare("SELECT id,name FROM employees WHERE id=? AND is_active=1 AND employment_status='active'").get(Number(ctx.employeeId));if(!e)fail('NOTICE_ACCESS',403);return e}
function manager(ctx,db){if(!canManageDispatch(ctx))fail('NOTICE_ACCESS',403);return employee(ctx,db)}
export function noticeRecipients(ctx,db=defaultDb){manager(ctx,db);return db.prepare("SELECT id,name,employee_code employeeCode,job_role jobRole FROM employees WHERE is_active=1 AND employment_status='active' ORDER BY name COLLATE NOCASE,id").all()}
export function publishNotice(payload,ctx,db=defaultDb){
 if(payload.photos!==undefined)noticePhotos(payload.photos)
 const title=String(payload.title||'').trim(),body=String(payload.body||'').trim(),priority=payload.priority||'normal',audience=payload.audience,key=String(payload.requestKey||'')
 if(!title||title.length>120||!body||body.length>5000||!['normal','urgent'].includes(priority)||!['all','selected'].includes(audience)||!/^[-a-zA-Z0-9]{16,80}$/.test(key))fail('NOTICE_FIELDS')
 if(audience==='selected'&&(!Array.isArray(payload.employeeIds)||!payload.employeeIds.length||payload.employeeIds.length>1000||payload.employeeIds.some(id=>!Number.isSafeInteger(Number(id))||Number(id)<=0)))fail('NOTICE_RECIPIENTS')
 const ids=audience==='all'?[]:[...new Set(payload.employeeIds.map(Number))].sort((a,b)=>a-b),requestJson=JSON.stringify({title,body,priority,audience,ids,...noticeVersions(payload),...(payload.photos?.length?{photos:noticePhotos(payload.photos)}:{})})
 return withImmediateTransaction(db,()=>{
  const actor=manager(ctx,db),prior=db.prepare('SELECT * FROM employee_notices WHERE request_key=?').get(key)
  if(prior){if(prior.publisher_id!==actor.id||prior.request_json!==requestJson)fail('NOTICE_RETRY',409);return{id:prior.id,idempotent:true}}
  const recipients=noticeRecipients(ctx,db).filter(e=>audience==='all'||ids.includes(e.id))
  if(!recipients.length||(audience==='selected'&&recipients.length!==ids.length))fail('NOTICE_RECIPIENTS')
  const createdAt=new Date().toISOString(),id=Number(db.prepare('INSERT INTO employee_notices(title,body,priority,audience,publisher_id,publisher_name,request_key,request_json,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(title,body,priority,audience,actor.id,actor.name,key,requestJson,createdAt).lastInsertRowid)
  const insert=db.prepare('INSERT INTO employee_notice_receipts(notice_id,employee_id,employee_name) VALUES(?,?,?)');for(const e of recipients)insert.run(id,e.id,e.name)
  return{id,recipientCount:recipients.length,idempotent:false}
 })
}
export function employeeNotices(ctx,db=defaultDb){
 const e=employee(ctx,db)
 return db.prepare('SELECT n.id,n.title,n.body,n.request_json,n.priority,n.created_at createdAt,n.publisher_name publisherName,r.read_at readAt FROM employee_notice_receipts r JOIN employee_notices n ON n.id=r.notice_id WHERE r.employee_id=? ORDER BY n.id DESC').all(e.id).map(withTranslations)
}
export function acknowledgeNotice(id,ctx,db=defaultDb){
 return withImmediateTransaction(db,()=>{
  const e=employee(ctx,db),r=db.prepare('SELECT read_at FROM employee_notice_receipts WHERE notice_id=? AND employee_id=?').get(Number(id),e.id)
  if(!r)fail('NOTICE_ACCESS',403)
  const readAt=r.read_at||new Date().toISOString();db.prepare('UPDATE employee_notice_receipts SET read_at=COALESCE(read_at,?) WHERE notice_id=? AND employee_id=?').run(readAt,Number(id),e.id)
  return{ok:true,readAt,idempotent:Boolean(r.read_at)}
 })
}
export function noticeManagement(ctx,db=defaultDb){
 manager(ctx,db)
 return db.prepare('SELECT n.id,n.title,n.body,n.request_json,n.priority,n.audience,n.created_at createdAt,n.publisher_name publisherName,COUNT(r.employee_id) recipientCount,SUM(CASE WHEN r.read_at IS NOT NULL THEN 1 ELSE 0 END) readCount FROM employee_notices n JOIN employee_notice_receipts r ON r.notice_id=n.id GROUP BY n.id ORDER BY n.id DESC').all().map(withTranslations)
}
export function noticeReadStatus(id,ctx,db=defaultDb){
 manager(ctx,db)
 if(!db.prepare('SELECT 1 FROM employee_notices WHERE id=?').get(Number(id)))fail('NOTICE_MISSING',404)
 return db.prepare('SELECT employee_id employeeId,employee_name employeeName,read_at readAt FROM employee_notice_receipts WHERE notice_id=? ORDER BY read_at IS NOT NULL,employee_name COLLATE NOCASE,employee_id').all(Number(id))
}

function withTranslations(row){
 const {request_json,...item}=row
 try{const saved=JSON.parse(request_json);return {...item,sourceLanguage:saved.sourceLanguage||null,translations:saved.translations||{},photos:(saved.photos||[]).map((p,index)=>({name:p.name,url:`/api/notices/${item.id}/photos/${index}`}))}}catch{return {...item,translations:{}}}
}
const translating=new Set()
export async function translateNotice(payload,ctx,db=defaultDb,options={}){
 const actor=manager(ctx,db)
 if(translating.has(actor.id))return {translations:{},failedLanguages:['zh','ms','en'],status:'busy'}
 translating.add(actor.id)
 try{return await translateNoticeSource(payload,{...options,terms:noticeTerms(db)})}finally{translating.delete(actor.id)}
}

export function noticePhoto(id,index,ctx,db=defaultDb){
 const e=employee(ctx,db)
 if(!canManageDispatch(ctx)&&!db.prepare('SELECT 1 FROM employee_notice_receipts WHERE notice_id=? AND employee_id=?').get(Number(id),e.id))fail('NOTICE_ACCESS',403)
 const row=db.prepare('SELECT request_json FROM employee_notices WHERE id=?').get(Number(id))
 if(!row)fail('NOTICE_MISSING',404)
 const photo=JSON.parse(row.request_json).photos?.[Number(index)]
 if(!photo)fail('NOTICE_MISSING',404)
 return Buffer.from(photo.dataUrl.split(',')[1],'base64')
}
