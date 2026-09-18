export const legacySalesSchema=`CREATE TABLE IF NOT EXISTS legacy_sales_driver_allocations(
 settlement_id INTEGER NOT NULL REFERENCES sales_settlements(id),line_index INTEGER NOT NULL,
 employee_id INTEGER NOT NULL REFERENCES employees(id),employee_name TEXT NOT NULL,
 vehicle_id INTEGER NOT NULL,date TEXT NOT NULL,ticket TEXT NOT NULL,weight REAL NOT NULL,
 line_json TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(settlement_id,line_index));`
export const salesTicket=s=>String(s||'').trim().toUpperCase().replace(/^TN-?/,'TN').replace(/\s+/g,'')
export function legacySalesRows(db,all){
 if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='legacy_sales_driver_allocations'").get())return []
 const settlements=db.prepare('SELECT * FROM sales_settlements').all(),lines=settlements.flatMap(s=>JSON.parse(s.lines_json).map((l,i)=>({...l,vehicle:s.vehicle_id,sale:s.id,index:i})))
 return db.prepare('SELECT * FROM legacy_sales_driver_allocations').all().map(a=>{
 const s=settlements.find(s=>s.id===a.settlement_id),l=s&&JSON.parse(s.lines_json)[a.line_index]
 // An eventual genuine cargo link supersedes this legacy assignment, even across periods.
 if(all.some(r=>r.vehicleId===a.vehicle_id&&r.deliveryDate===a.date&&salesTicket(r.ticket)===salesTicket(a.ticket)))return null
 const valid=s&&s.vehicle_id===a.vehicle_id&&JSON.stringify(l)===a.line_json&&lines.filter(x=>x.vehicle===a.vehicle_id&&x.deliveryDate===a.date&&salesTicket(x.slipNumber)===salesTicket(a.ticket)).length===1
 return {...a,valid:Boolean(valid),plate:s?.vehicle_plate||String(a.vehicle_id)}
 }).filter(Boolean)
}
