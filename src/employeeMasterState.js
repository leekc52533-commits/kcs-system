export const terminalEmploymentStatuses = new Set(['inactive', 'resigned', 'terminated', 'contract_end', 'suspended'])

export function employeeDetailDraft(employee) {
  return {
    employeeId: employee.id,
    name: employee.name || '',
    employeeCode: employee.employeeCode || '',
    phone: employee.phone || '',
    jobRole: employee.jobRole || 'Other',
    additionalRoles: [...(employee.additionalRoles || [])],
    employmentType: employee.employmentType || 'Permanent',
    employmentStatus: employee.employmentStatus || 'active',
    employmentStartDate: employee.employmentStartDate || '',
    defaultBaseLocationId: employee.defaultBaseLocationId || '',
    usualAreaIds: [...(employee.usualAreaIds || [])],
  }
}

export function employeeMatchesDirectory(employee, filters) {
  const query = (filters.search || '').trim().toLowerCase()
  const searchable = `${employee.name || ''} ${employee.employeeCode || ''} ${employee.phone || ''} ${employee.nationalIdMasked || ''} ${employee.nationalIdSuffix || ''}`.toLowerCase()
  if (query && !searchable.includes(query)) return false
  if (filters.status === 'rehired' && !(employee.employmentPeriods || []).some((period) => period.rehireFlag)) return false
  if (filters.status && filters.status !== 'rehired' && employee.employmentStatus !== filters.status) return false
  if (filters.jobRole && employee.jobRole !== filters.jobRole && !(employee.additionalRoles || []).includes(filters.jobRole)) return false
  if (filters.employmentType && employee.employmentType !== filters.employmentType) return false
  if (filters.accountStatus === 'active' && !employee.accountActive) return false
  if (filters.accountStatus === 'disabled' && (!employee.accountId || employee.accountActive)) return false
  if (filters.accountStatus === 'none' && employee.accountId) return false
  return true
}

export function createEmployeeSelectionGuard() {
  let sequence = 0
  return {
    begin(employeeId) { return { employeeId: Number(employeeId), sequence: ++sequence } },
    isCurrent(ticket, employeeId) { return ticket.sequence === sequence && ticket.employeeId === Number(employeeId) },
    cancel() { sequence += 1 },
  }
}
