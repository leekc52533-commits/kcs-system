import {createHash} from 'node:crypto'
import {db as defaultDb} from './database.mjs'
import {withImmediateTransaction} from './branchServiceDateGuard.mjs'
import {decideDriverDate} from './driverRouteAdjustmentService.mjs'
import {customerWorkspace,saveCustomerWorkspace} from './customerWorkspaceService.mjs'
import {systemReviewReasons,dualReviewReasons} from '../shared/dateSystemReview.js'
import {applyBranchLifecycle} from './branchLifecycleService.mjs'
import {dateEvidence} from './dateRequestEvidenceService.mjs'
import {canManageDispatch} from '../shared/dispatchAccess.js'
const proposalToken=r=>createHash('sha256').update(r.proposal_json+':'+r.first_employee_id+':'+r.first_at).digest('hex')
const fail=(code,statusCode=409)=>{throw Object.assign(new Error(code),{code,statusCode})}
export function dateSystemReview(db,id){
 const r=db.prepare('SELECT * FROM driver_date_system_reviews WHERE request_id=?').get(id)
 return r?{proposalToken:proposalToken(r),status:r.status,firstName:r.first_name,firstAt:r.first_at,secondName:r.second_name,secondAt:r.second_at,proposal:JSON.parse(r.proposal_json)}:null
}
function audit(db,id,actor,action,detail){
 db.prepare('INSERT INTO audit_logs(action,entity_type,entity_id,after_json) VALUES(?,?,?,?)').run(action,'driver_date_request',String(id),JSON.stringify({accountId:actor.id,employeeId:actor.employeeId,name:actor.employeeName,...detail}))
}
export function reviewDateWithSystemChange(id,decision,payload,actor,db=defaultDb){
 if(!canManageDispatch(actor))fail('SYSTEM_REVIEW_FORBIDDEN',403)
 return withImmediateTransaction(db,()=>{
  const request=db.prepare('SELECT r.*,s.branch_id,b.jodoo_branch_id branch_code FROM driver_date_requests r JOIN dispatch_stops s ON s.id=r.dispatch_stop_id JOIN branches b ON b.id=s.branch_id WHERE r.id=?').get(id)
  if(!request)fail('SYSTEM_REVIEW_NOT_FOUND',404)
  const code=dateEvidence(db,id)?.reasonCode
  const pending=db.prepare('SELECT * FROM driver_date_system_reviews WHERE request_id=?').get(id)
  const dual=dualReviewReasons.includes(code)&&Boolean(pending||payload.systemChange==='workspace')
  if(decision==='rejected'){
   const result=decideDriverDate(id,decision,payload,actor,db)
   if(pending)db.prepare("UPDATE driver_date_system_reviews SET status='rejected' WHERE request_id=? AND status='pending'").run(id)
   audit(db,id,actor,'date_system_review_rejected',{reason:payload.reason})
   return result
  }
  if(request.status!=='pending')return decideDriverDate(id,decision,payload,actor,db)
  if(!systemReviewReasons.includes(code))return decideDriverDate(id,decision,payload,actor,db)
  if(!payload.evidenceChecked||!String(payload.reason||'').trim())fail('SYSTEM_REVIEW_EVIDENCE',400)
  if(dual&&(!['owner_admin','operations_admin','supervisor'].includes(actor.role)||!Number(actor.id)||!Number(actor.employeeId)))fail('SYSTEM_REVIEW_SUPERVISOR',403)
  let proposal=pending?JSON.parse(pending.proposal_json):payload
  if(dual&&pending){
   if(pending.status!=='pending')fail('SYSTEM_REVIEW_STALE')
   if(pending.first_account_id===Number(actor.id)||pending.first_employee_id===Number(actor.employeeId))fail('SYSTEM_REVIEW_DIFFERENT')
   if(payload.proposalToken!==proposalToken(pending))fail('SYSTEM_REVIEW_STALE')
  }
  if(!['none','workspace','planner'].includes(proposal.systemChange)||proposal.scope&&proposal.scope!=='once')fail('SYSTEM_REVIEW_CHOOSE',400)
  if(proposal.systemChange==='planner'){
   const revision=db.prepare('SELECT revision FROM dispatch_days WHERE dispatch_date=?').get(request.source_date)?.revision
   if(code!=='full'||!Number.isInteger(proposal.plannerBeforeRevision)||revision===proposal.plannerBeforeRevision)fail('SYSTEM_REVIEW_STALE')
  }
  if(proposal.systemChange==='workspace'){
   const draft=proposal.workspaceDraft
   if(!draft||String(draft.branchId)!==String(request.branch_code)||draft.gps||draft.locationCheck)fail('SYSTEM_REVIEW_DRAFT',400)
   const current=customerWorkspace({branchId:request.branch_code},actor,db)
   if(current.revision!==draft.revision)fail('SYSTEM_REVIEW_STALE')
   if(dual){
    if(!['ACTIVE','TEMPORARILY_PAUSED','CLOSED'].includes(draft.branch?.lifecycleStatus))fail('SYSTEM_REVIEW_DRAFT',400)
    proposal={...proposal,workspaceDraft:{branchId:draft.branchId,revision:draft.revision,reason:draft.reason,branch:{lifecycleStatus:draft.branch.lifecycleStatus}},previousStatus:current.branch.lifecycleStatus}
   }
  }
  const apply=()=>{
   // Decision and master changes are one transaction: any failure rolls both back.
   const result=decideDriverDate(id,'approved',proposal,actor,db)
   if(proposal.systemChange==='workspace'){
    const draft={...proposal.workspaceDraft}
    // The date decision itself may change this branch's schedule/exception revision.
    draft.revision=customerWorkspace({branchId:request.branch_code},actor,db).revision
    if(dual)applyBranchLifecycle(request.branch_code,{lifecycleStatus:draft.branch.lifecycleStatus,reason:draft.reason},{changedBy:actor.employeeName,accountId:actor.id,approvedDateRequestId:id,previewDateReview:!pending},db)
    else{const saved=saveCustomerWorkspace(draft,actor,db);result.systemReview=saved.review}
   }
   return result
  }
  if(dual&&!pending){
   // Validate the exact proposed decision and edits without persisting either.
   db.exec('SAVEPOINT validate_system_review')
   try{apply()}finally{db.exec('ROLLBACK TO validate_system_review; RELEASE validate_system_review')}
   db.prepare('INSERT INTO driver_date_system_reviews(request_id,branch_id,proposal_json,first_account_id,first_employee_id,first_name) VALUES(?,?,?,?,?,?)').run(id,request.branch_id,JSON.stringify(proposal),actor.id,actor.employeeId,actor.employeeName||actor.username||String(actor.id))
   audit(db,id,actor,'date_system_first_approved',{reason:payload.reason,proposal})
   return{id,status:'pending',awaitingSecond:true}
  }
  if(pending)db.prepare("UPDATE driver_date_system_reviews SET status='approved' WHERE request_id=?").run(id)
  const result=apply()
  if(pending)db.prepare("UPDATE driver_date_system_reviews SET status='approved',second_account_id=?,second_employee_id=?,second_name=?,second_at=CURRENT_TIMESTAMP WHERE request_id=?").run(actor.id,actor.employeeId,actor.employeeName||actor.username||String(actor.id),id)
  audit(db,id,actor,'date_system_review_applied',{reason:payload.reason,firstName:pending?.first_name||null,proposal})
  return result
 })
}
