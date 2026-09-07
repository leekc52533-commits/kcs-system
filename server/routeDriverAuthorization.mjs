const managementRoles=new Set(['supervisor','operations_admin','owner_admin'])

export function activeRouteDriver(database,employeeId,accountRole){
  const role=String(accountRole||'').trim().toLowerCase()
  if(role!=='driver'&&!managementRoles.has(role))return null
  const employee=database.prepare(`SELECT e.id,e.name,e.job_role jobRole,
      EXISTS(SELECT 1 FROM employee_job_roles r WHERE r.employee_id=e.id AND r.role='Driver' AND r.is_active=1) hasDriverRole
    FROM employees e WHERE e.id=? AND e.is_active=1 AND e.employment_status='active'`).get(Number(employeeId))
  if(!employee)return null
  if(managementRoles.has(role))return employee
  return String(employee.jobRole||'').trim().toLowerCase()==='driver'||Boolean(employee.hasDriverRole)?employee:null
}

export const isTemporarySupervisorDriver=employee=>String(employee?.jobRole||employee?.job_role||'').trim().toLowerCase()==='supervisor'
