import {db} from './database.mjs'

// Read-only, derived from current records. There is deliberately no dismiss/read state.
export function dashboardDataTasks(database=db){
 const rows=database.prepare(`SELECT b.id,b.jodoo_branch_id branchId,b.branch_name branchName,c.name customerName,
 b.latitude,b.longitude,a.id areaId,a.is_active areaActive,
 EXISTS(SELECT 1 FROM branch_schedules s WHERE s.branch_id=b.id AND s.is_active=1) hasSchedule,
 EXISTS(SELECT 1 FROM temporary_locations t WHERE t.branch_id=b.id AND t.verification_status='pending_supervisor') pendingGps
 FROM branches b LEFT JOIN customers c ON c.id=b.customer_id LEFT JOIN areas a ON a.id=b.area_id
 WHERE COALESCE(b.lifecycle_status,'ACTIVE')='ACTIVE' AND b.is_active=1 AND b.status='active'
 AND (c.id IS NULL OR (c.status='active' AND c.is_active=1))
 ORDER BY b.branch_name,b.jodoo_branch_id`).all()
 const items=[]
 for(const row of rows){
  const gps=row.latitude!=null&&row.longitude!=null&&Number.isFinite(row.latitude)&&Number.isFinite(row.longitude)&&Math.abs(row.latitude)<=90&&Math.abs(row.longitude)<=180&&(row.latitude!==0||row.longitude!==0)
  const issues=[]
  if(!gps)issues.push(row.latitude!=null||row.longitude!=null?'invalidGps':row.hasSchedule?'scheduledMissingGps':'missingGps')
  if(!row.hasSchedule)issues.push('missingSchedule')
  if(!row.areaId||!row.areaActive)issues.push('missingArea')
  if(row.pendingGps)issues.push('pendingGps')
  if(issues.length)items.push({key:`branch-${row.id}`,branchId:row.branchId,branchName:row.branchName,customerName:row.customerName,issues,kind:'branch'})
 }
 const orphans=database.prepare(`SELECT s.id,s.jodoo_schedule_id scheduleId,s.source_branch_id sourceBranchId,s.frequency,s.days_of_week weekdays
 FROM branch_schedules s LEFT JOIN branches b ON b.id=s.branch_id WHERE b.id IS NULL AND s.is_active=1 ORDER BY s.id`).all()
 for(const row of orphans)items.push({...row,key:`schedule-${row.id}`,kind:'schedule',issues:['unmatchedSchedule']})
 return {items,total:items.length}
}
