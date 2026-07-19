export const FILE_TYPES = [
  { id: 'customers', label: 'Customer List', key: 'CustomerID', required: ['CustomerID', 'Customer Name'] },
  { id: 'branches', label: 'Customer Branch', key: 'BranchID', required: ['BranchID', 'Customer Name', 'CustomerID'] },
  { id: 'schedules', label: 'BranchSchedule', key: 'BranchID', required: ['ScheduleID', 'BranchID', 'Frequency', 'Day Of Week'] },
  { id: 'areas', label: 'AreaInfo', key: 'AreaID', required: ['AreaID', 'AreaName'] },
  { id: 'locations', label: 'Customer Location Update', key: 'Branch ID', required: ['CustomerID', 'Branch ID', 'Latitude', 'Longtitude'] },
]

export function identifyFile(headers) {
  return FILE_TYPES
    .filter((type) => type.required.every((header) => headers.includes(header)))
    .sort((a, b) => b.required.length - a.required.length)[0]
}

const clean = (value) => String(value ?? '').trim()
const validCoordinate = (latitude, longitude) => {
  const lat = Number(latitude)
  const lng = Number(longitude)
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 && !(lat === 0 && lng === 0)
}

export function validateRows(rows, type) {
  const keyCounts = new Map()
  rows.forEach((row) => {
    const key = clean(row[type.key])
    if (key) keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1)
  })

  let correctedDays = 0
  const results = rows.map((row, index) => {
    const errors = []
    const warnings = []
    const key = clean(row[type.key])
    if (!key) errors.push(`缺少 ${type.key}`)
    if (key && keyCounts.get(key) > 1) warnings.push(`同一文件内 ${type.key} 重复`)
    type.required.forEach((field) => {
      const callWithoutDay = type.id === 'schedules' && field === 'Day Of Week' && clean(row.Frequency) === 'Call'
      if (!clean(row[field]) && !callWithoutDay) errors.push(`缺少 ${field}`)
    })

    if (type.id === 'schedules') {
      const day = clean(row['Day Of Week'])
      if (day.includes('Thurday')) { warnings.push('Thurday 将标准化为 Thursday'); correctedDays += 1 }
      if (!day && clean(row.Frequency) !== 'Call') errors.push('缺少收货星期')
    }
    if (type.id === 'locations' && !validCoordinate(row.Latitude, row.Longtitude)) errors.push('经纬度无效或超出范围')
    if (type.id === 'branches') {
      const hasEither = clean(row.Latitude) || clean(row.Longtitude)
      if (hasEither && !validCoordinate(row.Latitude, row.Longtitude)) warnings.push('GPS 坐标不完整或无效')
    }

    return { rowNumber: index + 2, key: key || '—', name: clean(row['Customer Name'] ?? row.Branch ?? row.AreaName), errors, warnings }
  })

  return {
    results,
    valid: results.filter((row) => row.errors.length === 0 && row.warnings.length === 0).length,
    warnings: results.filter((row) => row.errors.length === 0 && row.warnings.length > 0).length,
    errors: results.filter((row) => row.errors.length > 0).length,
    correctedDays,
  }
}

export function analyzeRelationships(files) {
  const byType = Object.fromEntries(files.filter((file) => file.type && file.data).map((file) => [file.type.id, file.data]))
  const missingTypes = FILE_TYPES.filter((type) => !byType[type.id]).map((type) => type.label)
  if (missingTypes.length) return { ready: false, missingTypes }

  const id = (value) => clean(value).replace(/\.0$/, '')
  const unique = (rows, field) => new Set(rows.map((row) => id(row[field])).filter(Boolean))
  const customers = byType.customers
  const branches = byType.branches
  const schedules = byType.schedules
  const areas = byType.areas
  const locations = byType.locations
  const customerIds = unique(customers, 'CustomerID')
  const branchIds = unique(branches, 'BranchID')
  const scheduledIds = unique(schedules, 'BranchID')
  const areaIds = unique(areas, 'AreaID')
  const locationIds = unique(locations, 'Branch ID')
  const coordinateBranchIds = new Set(branches.filter((row) => validCoordinate(row.Latitude, row.Longtitude)).map((row) => id(row.BranchID)))
  const scheduleCounts = new Map()
  schedules.forEach((row) => { const key = id(row.BranchID); if (key) scheduleCounts.set(key, (scheduleCounts.get(key) ?? 0) + 1) })

  const unmatchedSchedules = schedules.filter((row) => !branchIds.has(id(row.BranchID))).map((row) => ({ id: id(row.BranchID), name: clean(row.Branch), detail: '排程找不到对应分店' }))
  const unmatchedCustomers = branches.filter((row) => !customerIds.has(id(row.CustomerID))).map((row) => ({ id: id(row.BranchID), name: clean(row['Customer Name']), detail: `CustomerID ${id(row.CustomerID)} 不存在` }))
  const areaProblems = branches.filter((row) => !id(row.AreaID) || !areaIds.has(id(row.AreaID))).map((row) => ({ id: id(row.BranchID), name: clean(row['Customer Name']), detail: !id(row.AreaID) ? '缺少 AreaID' : `AreaID ${id(row.AreaID)} 不存在` }))
  const unmatchedLocations = locations.filter((row) => !branchIds.has(id(row['Branch ID']))).map((row) => ({ id: id(row['Branch ID']), name: clean(row.Branch), detail: 'GPS 更新找不到对应分店' }))
  const duplicateSchedules = [...scheduleCounts.entries()].filter(([, count]) => count > 1).map(([branchId, count]) => ({ id: branchId, name: clean(branches.find((row) => id(row.BranchID) === branchId)?.['Customer Name']), detail: `${count} 条排程，需确认是否为多收货日` }))
  const readyForRouting = [...scheduledIds].filter((branchId) => branchIds.has(branchId) && coordinateBranchIds.has(branchId)).length
  const scheduledMatched = [...scheduledIds].filter((branchId) => branchIds.has(branchId)).length

  return {
    ready: true,
    summary: {
      customers: customerIds.size, branches: branchIds.size, schedules: scheduledIds.size,
      areas: areaIds.size, gpsUpdates: locationIds.size, branchesWithCoordinates: coordinateBranchIds.size,
      readyForRouting, scheduledMissingGps: scheduledMatched - readyForRouting,
      branchesWithoutSchedule: [...branchIds].filter((branchId) => !scheduledIds.has(branchId)).length,
    },
    groups: [
      { level: 'error', title: '排程无法匹配分店', items: unmatchedSchedules },
      { level: 'error', title: '分店无法匹配客户', items: unmatchedCustomers },
      { level: 'error', title: '分店 Area 关联异常', items: areaProblems },
      { level: 'error', title: 'GPS 更新无法匹配分店', items: unmatchedLocations },
      { level: 'warning', title: '同一 BranchID 有多条排程', items: duplicateSchedules },
    ],
  }
}
