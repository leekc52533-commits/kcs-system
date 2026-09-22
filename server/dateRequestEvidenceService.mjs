import {evidenceProblem,dateEvidenceMode} from '../shared/dateRequestEvidence.js'
import {image} from './driverExecutionService.mjs'
import {canManageDispatch} from '../shared/dispatchAccess.js'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
const fail=(statusCode=400)=>Object.assign(new Error('DATE_EVIDENCE_REQUIRED'),{code:'DATE_EVIDENCE_REQUIRED',statusCode})
export function prepareDateEvidence(db,s,p,context){
 const e=p.evidence||{},code=p.reasonCode,mode=dateEvidenceMode(code)
 if(evidenceProblem(code,e))throw fail()
 const now=Date.parse(context.now||new Date().toISOString())
 if(mode==='onsite'&&(!Number.isFinite(Date.parse(e.capturedAt))||Math.abs(now-Date.parse(e.capturedAt))>30*60*1000))throw fail()
 if(mode==='contact'&&Date.parse(e.contactAt)>now+60000)throw fail()
 const detail={reasonCode:code,details:String(e.details||'').trim().slice(0,1000)}
 if(mode==='contact')Object.assign(detail,{contactMethod:e.contactMethod,contactName:String(e.contactName).trim().slice(0,200),contactAt:e.contactAt})
 if(mode==='onsite')Object.assign(detail,{captureSource:e.captureSource,capturedAt:e.capturedAt,position:{latitude:e.position.latitude,longitude:e.position.longitude,accuracyM:e.position.accuracyM}})
 if(mode==='record'){
  const bill=db.prepare("SELECT id,bill_number,branch_id,issued_at FROM purchase_bills WHERE bill_number=? AND branch_id=? AND status='issued'").get(String(e.billNumber).trim(),s.branch_id)
  if(!bill)throw fail()
  detail.bill={id:bill.id,number:bill.bill_number,issuedAt:bill.issued_at}
 }
 // Snapshot the actual assignment and stop progress for the supervisor, not employee-supplied values.
 detail.operations=db.prepare(`SELECT d.driver_id,d.assistant_id,d.vehicle_id,t.execution_status,t.started_at,
 (SELECT name FROM employees WHERE id=d.driver_id) driverName,
 (SELECT name FROM employees WHERE id=d.assistant_id) crewName,
 (SELECT registration_number FROM vehicles WHERE id=d.vehicle_id) plate,
 (SELECT COUNT(*) FROM dispatch_stops WHERE dispatch_trip_id=t.id) totalStops,
 (SELECT COUNT(*) FROM dispatch_stops WHERE dispatch_trip_id=t.id AND status='completed') completedStops
 FROM dispatch_trips t JOIN dispatches d ON d.id=t.dispatch_id WHERE t.id=?`).get(s.trip_id)
 const photoNeeded=mode==='onsite'||mode==='photo'||mode==='contact'&&e.contactMethod==='message'
 return{code,detail,photo:photoNeeded?image(e.photo):null}
}
export function writeDateEvidence(db,id,prepared,uploadsRoot){
 if(prepared.photo&&!uploadsRoot)throw fail(500)
 const key=prepared.photo?`date-requests/${crypto.randomUUID()}.${prepared.photo.extension}`:null
 const file=key&&path.resolve(uploadsRoot,key)
 if(file){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,prepared.photo.bytes,{flag:'wx'})}
 try{db.prepare('INSERT INTO driver_date_evidence(request_id,reason_code,details_json,storage_key,content_type) VALUES(?,?,?,?,?)').run(id,prepared.code,JSON.stringify(prepared.detail),key,prepared.photo?.type||null)}catch(e){if(file)fs.unlinkSync(file);throw e}
 return file
}
export function dateEvidence(db,id){const r=db.prepare('SELECT * FROM driver_date_evidence WHERE request_id=?').get(id);return r?{...JSON.parse(r.details_json),photoUrl:r.storage_key?`/api/dispatch/date-requests/${id}/proof`:null}:null}
export function dateEvidenceForViewer(db,id,actor){
 const r=db.prepare('SELECT r.employee_id,e.* FROM driver_date_requests r LEFT JOIN driver_date_evidence e ON e.request_id=r.id WHERE r.id=?').get(id)
 if(!r||!canManageDispatch(actor)&&Number(r.employee_id)!==Number(actor.employeeId))throw fail(403)
 return r
}
