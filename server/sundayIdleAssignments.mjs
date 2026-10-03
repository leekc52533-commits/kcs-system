// Release only unused, unexecuted Sunday vehicle assignments. Never rewrite history.
export function releaseIdleSundayAssignments(db,day,{excludeVehicleId=null,today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kuching',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}={}){
 if(!day||day.dispatch_date<today||new Date(day.dispatch_date+'T12:00:00Z').getUTCDay()!==0||day.status==='completed')return []
 if(!db.prepare('SELECT 1 FROM sunday_dispatch_setup WHERE dispatch_day_id=?').get(day.id))return []
 db.exec('SAVEPOINT release_idle_sunday')
 try{
 const ids=db.prepare(`SELECT vehicle_id id FROM dispatch_vehicle_assistants WHERE dispatch_day_id=? UNION SELECT d.vehicle_id id FROM dispatches d JOIN dispatch_trips t ON t.dispatch_id=d.id WHERE t.dispatch_day_id=? AND (d.driver_id IS NOT NULL OR d.assistant_id IS NOT NULL)`).all(day.id,day.id)
 const released=[]
 for(const {id} of ids){
  if(id==null||Number(id)===Number(excludeVehicleId))continue
  if(db.prepare('SELECT 1 FROM daily_route_assignments WHERE dispatch_day_id=? AND vehicle_id=?').get(day.id,id))continue
  const trips=db.prepare('SELECT t.*,d.status dispatch_status,d.driver_id,d.assistant_id,d.driver_employment_period_id,d.assistant_employment_period_id FROM dispatch_trips t JOIN dispatches d ON d.id=t.dispatch_id WHERE t.dispatch_day_id=? AND d.vehicle_id=?').all(day.id,id)
  if(trips.some(t=>t.started_at||t.started_by_employee_id||t.execution_status!=='not_started'||!['draft','planned','assigned'].includes(t.dispatch_status)))continue
  if(db.prepare('SELECT 1 FROM dispatch_stops s JOIN dispatches d ON d.id=s.dispatch_id JOIN dispatch_trips t ON t.dispatch_id=d.id WHERE t.dispatch_day_id=? AND d.vehicle_id=? LIMIT 1').get(day.id,id))continue
  if(db.prepare('SELECT 1 FROM purchase_bills WHERE dispatch_day_id=? AND vehicle_id=? UNION SELECT 1 FROM unloading_weight_records WHERE dispatch_day_id=? AND vehicle_id=?').get(day.id,id,day.id,id))continue
  const crew=db.prepare('SELECT * FROM dispatch_vehicle_assistants WHERE dispatch_day_id=? AND vehicle_id=?').all(day.id,id)
  db.prepare('DELETE FROM dispatch_vehicle_assistants WHERE dispatch_day_id=? AND vehicle_id=?').run(day.id,id)
  for(const t of trips)db.prepare('UPDATE dispatches SET driver_id=NULL,assistant_id=NULL,driver_employment_period_id=NULL,assistant_employment_period_id=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(t.dispatch_id)
  db.prepare(`INSERT INTO dispatch_change_logs(dispatch_day_id,actor,change_type,entity_type,entity_id,before_json,after_json,requires_reapproval) VALUES(?,'System','idle_sunday_staff_released','vehicle',?,?,?,0)`).run(day.id,String(id),JSON.stringify({crew,trips}),JSON.stringify({reason:'No route, stops, execution or documents on grouped Sunday',driverId:null,assistantIds:[]}))
  released.push(id)
 }
 db.exec('RELEASE release_idle_sunday');return released
 }catch(error){db.exec('ROLLBACK TO release_idle_sunday');db.exec('RELEASE release_idle_sunday');throw error}
}
