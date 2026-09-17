import {db as defaultDb} from './database.mjs'
import {canManageDispatch} from '../shared/dispatchAccess.js'

const parse=value=>{try{return JSON.parse(value||'null')}catch{return value}}
const comparable=value=>Array.isArray(value)?value.map(comparable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().filter(k=>!['updatedAt','updated_at','createdAt','created_at'].includes(k)).map(k=>[k,comparable(value[k])])):value

// Existing durable audit timestamps, never browser visit time; no writes or expiry deletion.
export function dashboardRecentActivity(actor,database=defaultDb,now=new Date().toISOString()){
 if(!canManageDispatch(actor))throw Object.assign(new Error('Permission denied'),{statusCode:403})
 const items=[]
 for(const [table,kind,reviewer] of [
  ['driver_defer_requests','defer','reviewed_by_name_snapshot'],
  ['temporary_customer_intakes','intake','reviewed_by'],
  ['customer_transfer_requests','transfer','reviewed_by'],
  ['driver_arrangement_requests','arrangement','reviewed_by'],
  ['driver_date_requests','date','reviewed_by']
 ]){
  items.push(...database.prepare(`SELECT ? || '-' || r.id id,? kind,r.status,r.reviewed_at time,r.${reviewer} actor,r.review_reason reason,b.jodoo_branch_id branchId,b.branch_name name
   FROM ${table} r LEFT JOIN dispatch_stops s ON s.id=r.dispatch_stop_id LEFT JOIN branches b ON b.id=s.branch_id
   WHERE r.status NOT IN ('pending','draft') AND julianday(r.reviewed_at)>julianday(?)-1 AND julianday(r.reviewed_at)<=julianday(?)`).all(kind,kind,now,now))
 }
 items.push(...database.prepare(`SELECT 'gps-'||t.id id,'gps' kind,t.verification_status status,t.reviewed_at time,t.reviewed_by actor,t.review_reason reason,b.jodoo_branch_id branchId,b.branch_name name
  FROM temporary_locations t LEFT JOIN branches b ON b.id=t.branch_id
  WHERE t.verification_status<>'pending_supervisor' AND julianday(t.reviewed_at)>julianday(?)-1 AND julianday(t.reviewed_at)<=julianday(?)`).all(now,now))
 items.push(...database.prepare(`SELECT 'master-'||id id,'data' kind,'changed' status,changed_at time,changed_by actor,reason,entity_id branchId,entity_type entityType,before_json,after_json,old_value,new_value
  FROM master_change_history WHERE entity_type IN ('branch','customer','branch_schedule')
  AND julianday(changed_at)>julianday(?)-1 AND julianday(changed_at)<=julianday(?)
  AND (COALESCE(before_json,'')<>COALESCE(after_json,'') OR COALESCE(old_value,'')<>COALESCE(new_value,''))`).all(now,now).filter(r=>JSON.stringify(comparable(parse(r.before_json)))!==JSON.stringify(comparable(parse(r.after_json)))||r.old_value!==r.new_value).map(({before_json,after_json,old_value,new_value,...r})=>{const snapshot=parse(after_json)||parse(before_json);return {...r,name:snapshot?.branchName||snapshot?.customerName||snapshot?.branch_name||snapshot?.name||null}}))
 return {items:items.sort((a,b)=>Date.parse(b.time.replace(' ','T')+(/Z|[+-]\d\d:\d\d$/.test(b.time)?'':'Z'))-Date.parse(a.time.replace(' ','T')+(/Z|[+-]\d\d:\d\d$/.test(a.time)?'':'Z')))}
}
