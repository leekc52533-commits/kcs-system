export const pendingArrangement=(db,id,kind)=>db.prepare("SELECT * FROM driver_arrangement_requests WHERE dispatch_stop_id=? AND kind=? AND status='pending'").get(id,kind)
export function saveArrangementRequest(db,s,context,kind,reason,payload){
 const previous=pendingArrangement(db,s.id,kind)
 if(previous)return{id:previous.id,status:'pending',idempotent:true}
 const id=Number(db.prepare('INSERT INTO driver_arrangement_requests(dispatch_stop_id,service_date,employee_id,employee_role,trip_id,vehicle_id,driver_id,kind,reason,payload_json) VALUES(?,?,?,?,?,?,?,?,?,?)').run(s.id,s.dispatch_date,context.employeeId,context.role,s.dispatch_trip_id,s.vehicle_id??null,s.driver_id??null,kind,reason,JSON.stringify(payload)).lastInsertRowid)
 db.prepare("INSERT INTO dispatch_change_logs(dispatch_day_id,actor,change_type,entity_type,entity_id,after_json,requires_reapproval) VALUES(?,?,'driver_arrangement_requested','dispatch_stop',?,?,0)").run(s.day_id,String(context.employeeId),String(s.id),JSON.stringify({requestId:id,kind,reason}))
 return{id,status:'pending',idempotent:false}
}
