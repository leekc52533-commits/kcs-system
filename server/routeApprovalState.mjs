import {createHash} from 'node:crypto'
const hash=rows=>createHash('sha256').update(JSON.stringify(rows)).digest('hex')
function rowsFor(db,day,route){
 return db.prepare(`SELECT ds.id,ds.branch_id branchId,ds.route_stop_sequence routeSequence,ds.stop_sequence stopSequence,
 CASE WHEN ds.completion_outcome='no_goods_notice' THEN COALESCE((SELECT json_extract(n.before_json,'$.status') FROM no_goods_notices n WHERE n.dispatch_stop_id=ds.id AND n.restored_at IS NULL),ds.status) ELSE ds.status END status,
 dt.trip_number tripNumber,d.vehicle_id vehicleId
 FROM dispatch_stops ds JOIN dispatch_trips dt ON dt.id=ds.dispatch_trip_id JOIN dispatches d ON d.id=ds.dispatch_id
 WHERE dt.dispatch_day_id=? AND ds.route_number=? AND ds.status<>'cancelled' ORDER BY ds.route_stop_sequence,ds.id`).all(day,route)
}
// Execution progress is not a plan edit. Membership, order, trip and vehicle still are.
export function routeSignature(db,day,route){
 const rows=rowsFor(db,day,route),current='plan2:'+hash(rows.map(({status,...plan})=>plan))
 const saved=db.prepare('SELECT route_signature signature FROM daily_route_approvals WHERE dispatch_day_id=? AND route_number=?').get(day,route)?.signature
 // Read-only compatibility: accept legacy approval only when its plan still matches.
 // Never replace a mismatching old approval merely because its trip has started.
 if(saved&&!saved.startsWith('plan2:')&&[rows,rows.map(r=>({...r,status:'locked'})),rows.map(r=>({...r,status:'available'}))].some(candidate=>hash(candidate)===saved))return saved
 return current
}
export function captureApprovedRoutes(db,dates){
 return [...new Set(dates)].filter(Boolean).flatMap(date=>{
  const day=db.prepare('SELECT * FROM dispatch_days WHERE dispatch_date=?').get(date);if(!day)return[]
  return db.prepare('SELECT * FROM daily_route_approvals WHERE dispatch_day_id=?').all(day.id)
   .filter(r=>r.route_signature===routeSignature(db,day.id,r.route_number))
   .map(r=>({...r,dayStatus:day.status}))
 })
}
// Call only around a validated, supervisor-approved mutation, in its transaction.
export function retainApprovedRoutes(db,snapshot,actor,reason){
 for(const old of snapshot){
  const next=routeSignature(db,old.dispatch_day_id,old.route_number)
  if(next===old.route_signature)continue
  const changed=db.prepare('UPDATE daily_route_approvals SET route_signature=? WHERE dispatch_day_id=? AND route_number=? AND route_signature=?').run(next,old.dispatch_day_id,old.route_number,old.route_signature)
  if(!changed.changes)continue
  db.prepare("INSERT INTO dispatch_change_logs(dispatch_day_id,actor,change_type,entity_type,entity_id,before_json,after_json,requires_reapproval) VALUES(?,?,'approved_request_route_synced','daily_route',?,?,?,0)").run(old.dispatch_day_id,String(actor||'Supervisor'),String(old.route_number),JSON.stringify({signature:old.route_signature}),JSON.stringify({signature:next,reason}))
 }
 for(const id of new Set(snapshot.map(r=>r.dispatch_day_id))){
  const prior=snapshot.find(r=>r.dispatch_day_id===id).dayStatus
  if(!['approved','published'].includes(prior))continue
  const routes=db.prepare("SELECT DISTINCT s.route_number n FROM dispatch_stops s JOIN dispatch_trips t ON t.id=s.dispatch_trip_id WHERE t.dispatch_day_id=? AND s.status<>'cancelled' AND s.route_number IS NOT NULL").all(id)
  if(routes.length&&routes.every(r=>db.prepare('SELECT route_signature s FROM daily_route_approvals WHERE dispatch_day_id=? AND route_number=?').get(id,r.n)?.s===routeSignature(db,id,r.n)))db.prepare("UPDATE dispatch_days SET status=?,approved_revision=revision WHERE id=? AND status='reapproval_required'").run(prior,id)
 }
}
