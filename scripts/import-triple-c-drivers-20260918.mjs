import {DatabaseSync,backup} from 'node:sqlite'
import {pathToFileURL} from 'node:url'
import {legacySalesSchema,salesTicket} from '../server/legacySalesEarnings.mjs'
import {earningsPeriod} from '../server/earningsService.mjs'
export function importDrivers(db){
 db.exec('BEGIN IMMEDIATE')
 const result={corrected:[],added:[],skipped:[],alreadyAdded:0}
 try{
 db.exec(legacySalesSchema)
 // Explicit date correction authorized by KC; preserve all other original line values.
 const correction=db.prepare('SELECT * FROM sales_settlements WHERE id=8').get()
 if(correction){const lines=JSON.parse(correction.lines_json);let changed=false
 for(const l of lines)if(['TN20808','TN20812','TN153564'].includes(salesTicket(l.slipNumber))&&l.deliveryDate==='2074-09-15'){
 if(db.prepare("SELECT 1 FROM earnings_payments WHERE period_start IN ('2074-09-01','2026-09-01')").get())throw Error('Paid period exists; date correction needs separate review')
 l.deliveryDate='2026-09-15';changed=true;result.corrected.push(l.slipNumber)
 }
 if(changed){db.prepare('UPDATE sales_settlements SET lines_json=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(JSON.stringify(lines),8)
 db.prepare('INSERT INTO sales_settlement_audit(settlement_id,actor,before_json,after_json) VALUES(?,?,?,?)').run(8,'KC authorized legacy date correction',JSON.stringify(correction),JSON.stringify(db.prepare('SELECT * FROM sales_settlements WHERE id=8').get()))}
 }
 const sales=db.prepare('SELECT * FROM sales_settlements').all(),allLines=sales.flatMap(s=>JSON.parse(s.lines_json).map(l=>({...l,vehicle:s.vehicle_id})))
 const cargo=db.prepare('SELECT b.vehicle_id,w.service_date,u.ticket_number FROM cargo_batch_unloads u JOIN cargo_batches b ON b.id=u.batch_id JOIN unloading_weight_records w ON w.id=u.record_id').all()
 for(const s of sales.filter(s=>s.id>=1&&s.id<=13)){
 if(!/\b(?:TRIPLE|MULTIPLE)\s*C\b/i.test(s.buyer_name)){result.skipped.push({sale:s.id,reason:'Factory name is not Triple C / Multiple C',factory:s.buyer_name});continue}
 for(const [i,l] of JSON.parse(s.lines_json).entries()){
 const skip=reason=>result.skipped.push({sale:s.id,ticket:l.slipNumber,reason})
 if(db.prepare('SELECT 1 FROM legacy_sales_driver_allocations WHERE settlement_id=? AND line_index=?').get(s.id,i)){result.alreadyAdded++;continue}
 if(cargo.some(c=>c.vehicle_id===s.vehicle_id&&c.service_date===l.deliveryDate&&salesTicket(c.ticket_number)===salesTicket(l.slipNumber))){skip('Already covered by cargo records');continue}
 if(!/^TN-?\d+$/i.test(String(l.slipNumber))||!(Number(l.weightKg)>0)||!Number.isFinite(Number(l.weightKg))){skip('Invalid ticket or weight');continue}
 let period;try{period=earningsPeriod(l.deliveryDate)}catch{skip('Invalid delivery date');continue}
 if(l.deliveryDate<'2026-09-01'||l.deliveryDate>'2026-09-18'){skip('Outside authorized historical period');continue}
 if(allLines.filter(x=>x.vehicle===s.vehicle_id&&x.deliveryDate===l.deliveryDate&&salesTicket(x.slipNumber)===salesTicket(l.slipNumber)).length!==1){skip('Duplicate sales ticket');continue}
 const assignments=db.prepare('SELECT DISTINCT driver_id FROM dispatches WHERE vehicle_id=? AND dispatch_date=?').all(s.vehicle_id,l.deliveryDate)
 if(assignments.length!==1||!assignments[0].driver_id){skip('No unique driver on vehicle and delivery date');continue}
 const e=db.prepare('SELECT id,name FROM employees WHERE id=?').get(assignments[0].driver_id)
 const v=db.prepare('SELECT registration_number FROM vehicles WHERE id=?').get(s.vehicle_id)
 if(!e||!v||String(v.registration_number).replace(/\s/g,'').toUpperCase()!==String(s.vehicle_plate).replace(/\s/g,'').toUpperCase()){skip('Vehicle plate or employee cannot be verified');continue}
 if(db.prepare('SELECT 1 FROM earnings_payments WHERE period_start=? AND employee_id=?').get(period.start,e.id)){skip('Employee period already paid');continue}
 db.prepare('INSERT INTO legacy_sales_driver_allocations(settlement_id,line_index,employee_id,employee_name,vehicle_id,date,ticket,weight,line_json) VALUES(?,?,?,?,?,?,?,?,?)').run(s.id,i,e.id,e.name,s.vehicle_id,l.deliveryDate,l.slipNumber,Number(l.weightKg),JSON.stringify(l))
 const item={sale:s.id,line:i,ticket:l.slipNumber,date:l.deliveryDate,plate:s.vehicle_plate,driver:e.name,kg:Number(l.weightKg)}
 db.prepare('INSERT INTO audit_logs(action,entity_type,entity_id,after_json) VALUES(?,?,?,?)').run('legacy_sales_driver_import','sales_settlement',String(s.id),JSON.stringify({...item,employeeId:e.id,basis:'KC authorized delivery-date vehicle driver; no attendant assignment'}));result.added.push(item)
 }}
 if(db.prepare('PRAGMA foreign_key_check').get())throw Error('Foreign key validation failed')
 db.exec('COMMIT');return result
 }catch(e){db.exec('ROLLBACK');throw e}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 if(!process.argv[2]||!process.argv.includes('--apply'))throw Error('Usage: script DATABASE --apply')
 const db=new DatabaseSync(process.argv[2]);db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=10000')
 try{const file=`${process.argv[2]}.before-triple-c-drivers-${Date.now()}.bak`;await backup(db,file);console.log(`BACKUP=${file}`);console.log(JSON.stringify(importDrivers(db),null,2))}finally{db.close()}
}
