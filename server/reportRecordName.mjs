// Resolve identifiers only against the record's declared entity type.
export function reportRecordName(db,record,branchName){
 if(branchName)return {name:branchName}
 const id=String(record.entity_id||record.settlement_id||record.record_id||record.id),type=record.entity_type
 const has=table=>Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table))
 if(type==='vehicle'){
  const r=db.prepare('SELECT registration_number,vehicle_code FROM vehicles WHERE id=?').get(id)
  return {name:r?.registration_number||r?.vehicle_code||id,nameType:'vehicle'}
 }
 if(['route','daily_route'].includes(type)){
  const r=has('weekly_route_definitions')?db.prepare('SELECT d.display_name FROM weekly_route_definitions d JOIN weekly_route_plans p ON p.id=d.plan_id WHERE p.is_active=1 AND d.route_number=?').get(id):null
  return {name:[id,r?.display_name].filter(Boolean).join(' · '),nameType:'route'}
 }
 if(type==='dispatch_trip'){
  const r=db.prepare('SELECT t.trip_number,v.registration_number,v.vehicle_code FROM dispatch_trips t JOIN dispatches d ON d.id=t.dispatch_id LEFT JOIN vehicles v ON v.id=d.vehicle_id WHERE t.id=?').get(id)
  return {name:r?`${r.trip_number} · ${r.registration_number||r.vehicle_code||'—'} (#${id})`:id,nameType:'dispatch_trip'}
 }
 if(['day','dispatch_day'].includes(type)){
  const r=db.prepare('SELECT dispatch_date FROM dispatch_days WHERE id=?').get(id)
  return {name:r?.dispatch_date||id,nameType:'dispatch_day'}
 }
 if(type==='cargo_batch'&&has('cargo_batches')){
  const r=db.prepare('SELECT code,plate_snapshot FROM cargo_batches WHERE id=?').get(id)
  return {name:r?[r.code||`#${id}`,r.plate_snapshot].filter(Boolean).join(' · '):id,nameType:'cargo_batch'}
 }
 return {name:id,nameType:'recordReference'}
}
