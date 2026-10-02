import {branchRescheduleHistory} from './branchRescheduleHistory.mjs'
import {image} from './driverExecutionService.mjs'
const fail=code=>{throw Object.assign(Error(code),{code,statusCode:409})}
export function recordRepeatDateApproval(db,r,s,p,actor){
 const target=String(p.targetDate||r.target_date)
 if(target===r.source_date)return
 const number=branchRescheduleHistory(db,s.branch_id,{excludeRequestId:r.id,now:actor.now||new Date()}).count+1
 if(number<2)return
 // Match the exact count shown to the reviewer; another approval makes stale confirmation invalid.
 if(p.repeatApprovalConfirmed!==true||Number(p.repeatApprovalNumber)!==number)fail('REPEAT_DATE_CONFIRM')
 let proof=null,e=p.repeatContact||{}
 if(number>=3){
  const at=Date.parse(e.contactAt),now=Date.parse(actor.now||new Date()),created=Date.parse(r.requested_at||r.created_at||r.source_date)
  if(!String(e.contactName||'').trim()||String(e.contactName).length>200||!String(e.result||'').trim()||String(e.result).length>2000||!Number.isFinite(at)||at>now+60000||(Number.isFinite(created)&&at<created))fail('REPEAT_DATE_PROOF')
  try{proof=image(e.photo)}catch{fail('REPEAT_DATE_PROOF')}
 }
 db.prepare(`INSERT INTO driver_date_repeat_reviews(request_id,branch_id,approval_number,confirmed_at,reviewer,contact_name,contact_at,contact_result,proof,content_type)
 VALUES(?,?,?,?,?,?,?,?,?,?)`).run(r.id,s.branch_id,number,new Date(actor.now||Date.now()).toISOString(),actor.employeeName||String(actor.employeeId),proof?String(e.contactName).trim():null,proof?new Date(e.contactAt).toISOString():null,proof?String(e.result).trim():null,proof?.bytes||null,proof?.type||null)
}
