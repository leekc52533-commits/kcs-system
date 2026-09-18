// One-time legacy import from KC's supplied KCS query. No inferred date corrections.
import {DatabaseSync,backup} from 'node:sqlite'
import {pathToFileURL} from 'node:url'
import {earningsPeriod} from '../server/earningsService.mjs'
export const candidates=[
 {id:19,sale:1,vehicle:4,date:'2026-09-12',plate:'QM3028M',driver:16,driverName:'PHANG KHONG YEN',crew:'QAIRUL HIQMAH BIN ABDULL',ticket:'TN-153544',weight:1080},
 {id:27,sale:13,vehicle:5,date:'2026-09-14',plate:'QTY5028',driver:2,driverName:'MOHAMMAD FAIS MOHAMAD REZZY',crew:'MUHAMMAD ISMAIL BIN JUKI',ticket:'TN-12185',weight:580},
 {id:34,sale:13,vehicle:5,date:'2026-09-15',plate:'QTY5028',driver:2,driverName:'MOHAMMAD FAIS MOHAMAD REZZY',crew:'MUHAMMAD ISMAIL BIN JUKI',ticket:'TN-12193',weight:1460},
 {id:35,sale:13,vehicle:5,date:'2026-09-15',plate:'QTY5028',driver:2,driverName:'MOHAMMAD FAIS MOHAMAD REZZY',crew:'MUHAMMAD ISMAIL BIN JUKI',ticket:'TN12198',weight:1420}
]
const norm=s=>String(s||'').trim().toUpperCase()
const number=s=>String(s).replace(/^TN-?/i,'').replace(/^0+/,'')
const hasTicket=(text,ticket)=>(String(text||'').match(/(?<!\d)\d{5,6}(?!\d)/g)||[]).some(n=>n.replace(/^0+/,'')===number(ticket))
export function backfill(db,{apply=false}={}){
 const result={applied:[],alreadyLinked:[],skipped:[],kg:0}
 db.exec(apply?'BEGIN IMMEDIATE':'BEGIN')
 try{
 const sales=db.prepare('SELECT id,vehicle_id,lines_json FROM sales_settlements').all().flatMap(s=>JSON.parse(s.lines_json).map(l=>({...l,sale:s.id,vehicle:s.vehicle_id})))
 for(const c of candidates){
  const code=`H-LEGACY-20260918-${c.id}`,prior=db.prepare('SELECT u.*,b.code FROM cargo_batch_unloads u JOIN cargo_batches b ON b.id=u.batch_id WHERE record_id=?').get(c.id)
  if(prior){if(prior.code===code&&prior.ticket_number===c.ticket)result.alreadyLinked.push(c.id);else result.skipped.push({id:c.id,reason:'Already linked by another operation'});continue}
  const w=db.prepare('SELECT * FROM unloading_weight_records WHERE id=?').get(c.id)
  const matches=sales.filter(s=>s.vehicle===c.vehicle&&norm(s.slipNumber).replace(/^TN-?/,'')===number(c.ticket)&&s.deliveryDate===c.date)
  const vehicle=db.prepare('SELECT registration_number FROM vehicles WHERE id=?').get(c.vehicle)
  const driver=db.prepare('SELECT id,name FROM employees WHERE id=?').get(c.driver)
  const crew=db.prepare('SELECT id,name FROM employees WHERE UPPER(TRIM(name))=?').all(norm(c.crew))
  let reason=''
  if(!w||w.status!=='confirmed'||w.vehicle_id!==c.vehicle||w.service_date!==c.date||norm(w.registration_number_snapshot)!==norm(c.plate)||norm(vehicle?.registration_number)!==norm(c.plate)||w.driver_employee_id!==c.driver||norm(w.driver_name_snapshot)!==norm(c.driverName)||norm(driver?.name)!==norm(c.driverName)||norm(w.crew_names_snapshot)!==norm(c.crew)||crew.length!==1||crew[0].id===c.driver||Number(w.confirmed_weight_kg)!==c.weight||!hasTicket(w.ocr_text,c.ticket))reason='Source, vehicle, ticket or employee evidence changed / ambiguous'
  else if(matches.length!==1||matches[0].sale!==c.sale||Number(matches[0].weightKg)!==c.weight)reason='Sales match is no longer unique and exact'
  else if(db.prepare("SELECT id,ocr_text FROM unloading_weight_records WHERE vehicle_id=? AND service_date=? AND status='confirmed' AND id<>?").all(c.vehicle,c.date,c.id).some(r=>hasTicket(r.ocr_text,c.ticket)))reason='Another unloading record contains this ticket'
  else if(db.prepare('SELECT 1 FROM cargo_batch_unloads u JOIN cargo_batches b ON b.id=u.batch_id WHERE b.vehicle_id=? AND UPPER(REPLACE(u.ticket_number,\'-\',\'\'))=?').get(c.vehicle,norm(c.ticket).replaceAll('-','')))reason='Ticket already associated with another batch'
  else if(db.prepare('SELECT 1 FROM earnings_payments WHERE period_start=? AND employee_id IN (?,?)').get(earningsPeriod(c.date).start,c.driver,crew[0].id))reason='Paid snapshot exists; no historical pay changes applied'
  if(reason){result.skipped.push({id:c.id,reason});continue}
  if(apply){
   const batch=Number(db.prepare("INSERT INTO cargo_batches(code,vehicle_id,plate_snapshot,status,created_by_employee_id,collection_date,driver_employee_id,driver_name_snapshot,eligible_crew_json) VALUES(?,?,?,'closed',?,?,?,?,?)").run(code,c.vehicle,c.plate,c.driver,c.date,c.driver,c.driverName,JSON.stringify(crew)).lastInsertRowid)
   for(const [id,name,role] of [[c.driver,c.driverName,'driver'],[crew[0].id,c.crew,'crew']])db.prepare('INSERT INTO cargo_batch_members(batch_id,employee_id,name_snapshot,role) VALUES(?,?,?,?)').run(batch,id,name,role)
   db.prepare("INSERT INTO cargo_batch_unloads(record_id,batch_id,ticket_number,mode,submitted_by_employee_id) VALUES(?,?,?,'supplement',?)").run(c.id,batch,c.ticket,c.driver)
   db.prepare('INSERT INTO audit_logs(action,entity_type,entity_id,after_json) VALUES(?,?,?,?)').run('legacy_earnings_import','cargo_batch',String(batch),JSON.stringify({source:'KC authorized historical KCS records import 2026-09-18',candidate:c,crewEmployeeId:crew[0].id,dateBasis:'Original unloading service_date; no inferred collection date shift',membershipBasis:'Original driver ID and exact crew name snapshot; not current assignments',unloadModeBasis:'Historical link only; no claim of complete emptying',originalRecord:w.id}))
  }
  result.applied.push({record:c.id,ticket:c.ticket,driver:c.driverName,attendant:c.crew,kg:c.weight});result.kg+=c.weight
 }
 if(apply&&db.prepare('PRAGMA foreign_key_check').get())throw Error('Foreign key validation failed')
 db.exec(apply?'COMMIT':'ROLLBACK');return {...result,mode:apply?'applied':'preview'}
 }catch(e){db.exec('ROLLBACK');throw e}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const path=process.argv[2],apply=process.argv.includes('--apply');if(!path)throw Error('Usage: node script.mjs DATABASE [--apply]')
 const db=new DatabaseSync(path,{readOnly:!apply});db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=10000')
 try{if(apply){const file=`${path}.before-legacy-earnings-${Date.now()}.bak`;await backup(db,file);console.log(`BACKUP=${file}`)}console.log(JSON.stringify(backfill(db,{apply}),null,2))}finally{db.close()}
}
