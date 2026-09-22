// Only expose the assigned team's released requests; never expose another employee's queue.
export function dateSystemReleaseNotices(db,employeeId,date){
 return db.prepare(`SELECT r.id,r.target_date targetDate,b.jodoo_branch_id branchId,b.branch_name branchName,v.status systemStatus,v.proposal_json
 FROM driver_date_system_reviews v JOIN driver_date_requests r ON r.id=v.request_id
 JOIN dispatch_stops s ON s.id=r.dispatch_stop_id JOIN branches b ON b.id=s.branch_id
 JOIN dispatches d ON d.id=s.dispatch_id JOIN dispatch_trips t ON t.id=s.dispatch_trip_id
 WHERE r.source_date=? AND r.status='approved' AND v.status IN ('pending','rejected')
 AND (r.employee_id=? OR d.driver_id=? OR d.assistant_id=? OR EXISTS(
 SELECT 1 FROM dispatch_vehicle_assistants a WHERE a.dispatch_day_id=t.dispatch_day_id AND a.vehicle_id=d.vehicle_id AND a.employee_id=?))
 ORDER BY v.first_at,r.id`).all(date,employeeId,employeeId,employeeId,employeeId).filter(r=>JSON.parse(r.proposal_json).executionReleased===true).map(({proposal_json,...r})=>({...r,targetDate:JSON.parse(proposal_json).targetDate}))
}
