export const FILE_TYPES = [
  { id: 'customers', label: 'Customer List', sheets: ['Customer List'], key: 'CustomerID', required: ['CustomerID', 'Customer Name'] },
  { id: 'branches', label: 'Customer Branch', sheets: ['Customer Branch'], key: 'BranchID', required: ['BranchID', 'CustomerID', 'Customer Name'] },
  { id: 'schedules', label: 'BranchSchedule', sheets: ['BranchSchedule'], key: 'ScheduleID', required: ['ScheduleID', 'BranchID', 'Frequency'] },
  { id: 'areas', label: 'AreaInfo', sheets: ['AreaInfo'], key: 'AreaID', required: ['AreaID', 'AreaName'] },
  { id: 'locations', label: 'Customer Location Update', sheets: ['Customer Location Update'], key: 'Branch ID', required: ['Branch ID'] },
]

export const cleanText = (value) => String(value ?? '').trim()
export const cleanId = (value) => cleanText(value).replace(/\.0$/, '')
export const normalizeDayOfWeek = (value) => cleanText(value).replace(/Thurday/g, 'Thursday')
export const validCoordinate = (latitude, longitude) => {
  const lat = Number(latitude)
  const lng = Number(longitude)
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 && !(lat === 0 && lng === 0)
}

export function identifyFile(headers, sheetName = '') {
  const headerSet = new Set(headers.map(cleanText))
  return FILE_TYPES
    .map((type) => ({ type, headerMatch: type.required.every((header) => headerSet.has(header)), sheetMatch: type.sheets.includes(cleanText(sheetName)) }))
    .filter(({ headerMatch }) => headerMatch)
    .sort((a, b) => Number(b.sheetMatch) - Number(a.sheetMatch) || b.type.required.length - a.type.required.length)[0]?.type ?? null
}

export function isRouteReady(branch) {
  const status = cleanText(branch.status || 'Active').toLowerCase()
  const active = !['paused', 'closed', 'ended'].includes(status)
  return active && Number(branch.scheduleCount ?? 0) > 0 && validCoordinate(branch.latitude, branch.longitude)
}

export function validateRows(rows, type) {
  const counts = new Map()
  rows.forEach((row) => { const key = cleanId(row[type.key]); if (key) counts.set(key, (counts.get(key) ?? 0) + 1) })
  let correctedDays = 0
  const results = rows.map((row, index) => {
    const errors = [], warnings = []
    const key = cleanId(row[type.key])
    if (!key) errors.push(`缺少 ${type.key}`)
    if (key && counts.get(key) > 1) errors.push(`同一批次 ${type.key} 重复`)
    type.required.forEach((field) => { if (!cleanText(row[field])) errors.push(`缺少 ${field}`) })
    if (type.id === 'schedules' && cleanText(row['Day Of Week']).includes('Thurday')) { warnings.push('Thurday 将标准化为 Thursday'); correctedDays += 1 }
    if (type.id === 'branches' && (cleanText(row.Latitude) || cleanText(row.Longtitude)) && !validCoordinate(row.Latitude, row.Longtitude)) warnings.push('GPS 坐标不完整或无效')
    if (type.id === 'locations' && (cleanText(row.Latitude) || cleanText(row.Longtitude)) && !validCoordinate(row.Latitude, row.Longtitude)) errors.push('经纬度无效或超出范围')
    return { rowNumber: index + 2, key: key || '—', name: cleanText(row['Customer Name'] ?? row.Branch ?? row.AreaName), errors: [...new Set(errors)], warnings: [...new Set(warnings)] }
  })
  return { results, valid: results.filter((r) => !r.errors.length && !r.warnings.length).length, warnings: results.filter((r) => !r.errors.length && r.warnings.length).length, errors: results.filter((r) => r.errors.length).length, correctedDays }
}

export function analyzeRelationships(files) {
  const byType = Object.fromEntries(files.filter((file) => file.type && file.data).map((file) => [file.type.id, file.data]))
  const missingTypes = FILE_TYPES.filter((type) => !byType[type.id]).map((type) => type.label)
  return { ready: missingTypes.length === 0, missingTypes, groups: [], summary: {} }
}
