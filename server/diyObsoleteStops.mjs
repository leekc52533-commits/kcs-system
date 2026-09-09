import {nextCollectionDate} from '../shared/scheduleRecurrence.js'
import {kuchingDate} from '../shared/kuchingTime.js'
const targets=[[2981,'10389','2026-09-10'],[3090,'10389','2026-09-11'],[3197,'10408','2026-09-12'],[3334,'10389','2026-09-14'],[3447,'10389','2026-09-15']]
const retained=[2873,2980,3333]
const reason='KC confirmed cancellation of five obsolete DIY draft stops after schedule correction 2026-09-09'
const get=db=>db.prepare('SELECT s.*,b.jodoo_branch_id branch_code,d.dispatch_date,d.status dispatch_status,t.execution_status,t.started_at,dd.id day_id,dd.status day_status,dd.dispatch_date day_date FROM dispatch_stops s JOIN branches b ON b.id=s.branch_id JOIN dispatches d ON d.id=s.dispatch_id LEFT JOIN dispatch_trips t ON t.id=s.dispatch_trip_id LEFT JOIN dispatch_days dd ON dd.id=t.dispatch_day_id WHERE s.id=?')
export function cancelDiyObsoleteStops(db,{apply=false,today=kuchingDate()}={}){
 db.exec('BEGIN IMMEDIATE');try{
 const read=get(db),preserved=retained.map(id=>db.prepare('SELECT * FROM dispatch_stops WHERE id=?').get(id));if(preserved.some(x=>!x))throw Error('A retained stop is missing')
 const result=[]
 for(const[id,code,date]of targets){
 const before=read.get(id)
 if(!before||String(before.branch_code).replace(/^B/i,'')!==code||(before.service_date||before.dispatch_date)!==date||before.dispatch_date!==date||before.day_date&&before.day_date!==date)throw Error('Stop identity/date mismatch: '+id)
 if(before.status==='cancelled'&&before.superseded_reason===reason){result.push({id,status:'already_cancelled'});continue}
 if(date<=today||before.status!=='locked'||before.dispatch_status!=='draft'||before.day_status&&before.day_status!=='draft'||before.execution_status&&before.execution_status!=='not_started'||before.started_at)throw Error('Stop is no longer an unstarted future draft: '+id)
 const fields=['arrived_at','completed_at','collected_weight_kg','invoice_number','payment_status','override_reason','override_note','override_by','override_at','arrived_by_employee_id','source_special_request_id']
 if(fields.some(k=>before[k]!=null&&String(before[k]).trim()!==''))throw Error('Stop has business activity: '+id)
 for(const table of ['purchase_bills','stop_documents','stop_step_records','temporary_locations','driver_defer_requests'])if(db.prepare(`SELECT COUNT(*) n FROM ${table} WHERE dispatch_stop_id=?`).get(id).n)throw Error('Stop has linked business records: '+id)
 const schedules=db.prepare('SELECT * FROM branch_schedules WHERE branch_id=? AND is_active=1').all(before.branch_id)
 if(schedules.length!==1||nextCollectionDate(schedules[0],date)===date)throw Error('Current schedule does not justify cancellation: '+id)
 const occurrences=db.prepare('SELECT * FROM schedule_occurrences WHERE dispatch_stop_id=? OR (schedule_id=? AND planned_date=?)').all(id,before.source_schedule_id,date)
 if(occurrences.some(o=>o.dispatch_stop_id!=null&&o.dispatch_stop_id!==id||['completed','collected'].includes(o.status)))throw Error('Occurrence has conflicting activity: '+id)
 db.prepare("UPDATE dispatch_stops SET status='cancelled',superseded_reason=?,superseded_at=CURRENT_TIMESTAMP,superseded_by='KC' WHERE id=?").run(reason,id)
 db.prepare("UPDATE schedule_occurrences SET status='cancelled',dispatch_stop_id=NULL,updated_at=CURRENT_TIMESTAMP WHERE dispatch_stop_id=? OR (schedule_id=? AND planned_date=?)").run(id,before.source_schedule_id,date)
 const after=db.prepare('SELECT * FROM dispatch_stops WHERE id=?').get(id)
 if(before.day_id){db.prepare('UPDATE dispatch_days SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(before.day_id);db.prepare("INSERT INTO dispatch_change_logs(dispatch_day_id,actor,change_type,entity_type,entity_id,before_json,after_json,requires_reapproval) VALUES(?,'KC','obsolete_diy_stop_cancelled','dispatch_stop',?,?,?,0)").run(before.day_id,String(id),JSON.stringify(before),JSON.stringify(after))}
 db.prepare("INSERT INTO audit_logs(action,entity_type,entity_id,before_json,after_json) VALUES('obsolete_diy_stop_cancelled','dispatch_stop',?,?,?)").run(String(id),JSON.stringify(before),JSON.stringify({after,reason,changedBy:'KC'}))
 result.push({id,branch:'B'+code,date,status:'cancelled'})
 }
 for(let i=0;i<retained.length;i++)if(JSON.stringify(preserved[i])!==JSON.stringify(db.prepare('SELECT * FROM dispatch_stops WHERE id=?').get(retained[i])))throw Error('Retained stop changed')
 if(db.prepare('PRAGMA foreign_key_check').all().length)throw Error('Foreign key check failed')
 db.exec(apply?'COMMIT':'ROLLBACK');return{applied:apply,items:result,retained:preserved.map(x=>({id:x.id,status:x.status,serviceDate:x.service_date}))}
 }catch(e){db.exec('ROLLBACK');throw e}
}
