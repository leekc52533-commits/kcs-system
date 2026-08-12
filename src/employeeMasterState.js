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
    drivingLicenceExpiryDate: employee.drivingLicenceExpiryDate || '',
    gdlExpiryDate: employee.gdlExpiryDate || '',
    defaultBaseLocationId: employee.defaultBaseLocationId || '',
    usualAreaIds: [...(employee.usualAreaIds || [])],
    homeAddress: employee.homeAddress || '',
    homeLatitude: employee.homeLatitude ?? '',
    homeLongitude: employee.homeLongitude ?? '',
    homeGpsRemark: employee.homeGpsRemark || '',
  }
}

export function employeeMatchesDirectory(employee, filters) {
  const query = (filters.search || '').trim().toLowerCase()
  const searchable = `${employee.name || ''} ${employee.employeeCode || ''} ${employee.phone || ''} ${employee.nationalIdMasked || ''} ${employee.nationalIdSuffix || ''}`.toLowerCase()
  if (query && !searchable.includes(query)) return false
  const selected = (value) => Array.isArray(value) ? value : value ? [value] : []
  const statuses = selected(filters.status)
  const roles = selected(filters.jobRole)
  const types = selected(filters.employmentType)
  const accounts = selected(filters.accountStatus)
  const isRehired = (employee.employmentPeriods || []).some((period) => period.rehireFlag)
  if (statuses.length && !statuses.some((status) => status === 'rehired' ? isRehired : employee.employmentStatus === status)) return false
  if (roles.length && !roles.some((role) => employee.jobRole === role || (employee.additionalRoles || []).includes(role))) return false
  if (types.length && !types.includes(employee.employmentType)) return false
  const accountStatus = employee.accountId ? (employee.accountActive ? 'active' : 'disabled') : 'none'
  if (accounts.length && !accounts.includes(accountStatus)) return false
  return true
}

const currentPeriod = (employee) => [...(employee.employmentPeriods || [])].reverse().find((period) => !period.endDate && period.employmentStatus === 'active')

export function employeeDirectoryValue(employee, column) {
  const period = currentPeriod(employee)
  return ({
    employeeCode: employee.employeeCode,
    name: employee.name,
    jobRole: employee.jobRole,
    employmentType: employee.employmentType,
    employmentStatus: employee.employmentStatus,
    homeGpsStatus: employee.homeGpsStatus,
    currentStartDate: period?.startDate,
    lastWorkingDay: period?.lastWorkingDay,
    employmentEndDate: period?.endDate,
    accountStatus: employee.accountId ? (employee.accountActive ? 'active' : 'disabled') : 'none',
    phone: employee.phone,
  })[column] || ''
}

export function sortEmployeeDirectory(employees, sort) {
  if (!sort?.column || !sort?.direction) return employees
  return employees.map((employee, index) => ({employee, index})).sort((left, right) => {
    const a = String(employeeDirectoryValue(left.employee, sort.column)).trim()
    const b = String(employeeDirectoryValue(right.employee, sort.column)).trim()
    if (!a && !b) return left.index - right.index
    if (!a) return 1
    if (!b) return -1
    const result = a.localeCompare(b, undefined, {numeric: true, sensitivity: 'base'})
    return result ? result * (sort.direction === 'desc' ? -1 : 1) : left.index - right.index
  }).map(({employee}) => employee)
}

export function createEmployeeSelectionGuard() {
  let sequence = 0
  return {
    begin(employeeId) { return { employeeId: Number(employeeId), sequence: ++sequence } },
    isCurrent(ticket, employeeId) { return ticket.sequence === sequence && ticket.employeeId === Number(employeeId) },
    cancel() { sequence += 1 },
  }
}
