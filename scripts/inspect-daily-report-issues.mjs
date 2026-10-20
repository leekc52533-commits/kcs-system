// Read-only production evidence. No application startup, migrations or writes.
import {DatabaseSync} from 'node:sqlite'
import {safeDetails} from '../server/dailyReport.mjs'
const db=new DatabaseSync(process.argv[2]||'/var/lib/kcs/data/kcs-dispatch.db',{readOnly:true})
const date=process.argv[3]||'2026-10-19'
const out=(label,rows)=>console.log(label,JSON.stringify(safeDetails(rows),null,2))
try{
 db.exec('BEGIN')
 const branches=db.prepare("SELECT id,jodoo_branch_id,branch_name FROM branches WHERE upper(branch_name) IN ('DIY BKW','DIY KST KUCHING SENTRAL','ECO QKS KUCHING SENTRAL')").all()
 out('分店匹配',branches)
 for(const b of branches){
  out('分店',b)
  const stops=db.prepare('SELECT id,branch_id,source_schedule_id,status,service_date,superseded_reason,superseded_at,superseded_by,override_note,override_reason FROM dispatch_stops WHERE branch_id=? AND service_date=?').all(b.id,date)
  out('当天收货记录',stops)
  out('当前排程（不代表取消当时的排程）',db.prepare('SELECT * FROM branch_schedules WHERE branch_id=?').all(b.id))
  out('日期例外记录',db.prepare('SELECT * FROM schedule_exceptions WHERE branch_id=? AND (original_date=? OR target_date=?)').all(b.id,date,date))
  for(const s of stops){
   out('该任务派车变更',db.prepare("SELECT id,change_type,entity_type,entity_id,actor,created_at,before_json,after_json FROM dispatch_change_logs WHERE entity_type='dispatch_stop' AND entity_id=? ORDER BY id").all(String(s.id)))
   out('取消前的排程变更',db.prepare("SELECT * FROM master_change_history WHERE entity_type='branch_schedule' AND entity_id=? AND julianday(changed_at)<=julianday(COALESCE(?,CURRENT_TIMESTAMP)) ORDER BY changed_at DESC,id DESC LIMIT 10").all(String(s.source_schedule_id),s.superseded_at))
  }
 }
 out('67/66/68 的当天来源（不假设为分店编号）',db.prepare("SELECT id,action,entity_type,entity_id,created_at FROM audit_logs WHERE date(created_at,'+8 hours')=? AND entity_id IN ('67','66','68') ORDER BY id").all(date))
 db.exec('COMMIT')
}finally{db.close()}
