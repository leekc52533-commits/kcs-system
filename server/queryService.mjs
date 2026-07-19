import { db } from './database.mjs'

const routeReadySql = `EXISTS (SELECT 1 FROM branch_schedules s WHERE s.branch_id=b.id AND s.is_active=1) AND b.latitude BETWEEN -90 AND 90 AND b.longitude BETWEEN -180 AND 180 AND NOT (b.latitude=0 AND b.longitude=0) AND b.is_active=1`
const gpsValidSql = `b.latitude BETWEEN -90 AND 90 AND b.longitude BETWEEN -180 AND 180 AND NOT (b.latitude=0 AND b.longitude=0)`
const like = (value) => `%${value}%`

export function dashboardSummary(database = db) {
  return database.prepare(`SELECT
    (SELECT COUNT(*) FROM customers WHERE is_active=1) customerCount,
    (SELECT COUNT(*) FROM branches WHERE is_active=1) branchCount,
    (SELECT COUNT(DISTINCT branch_id) FROM branch_schedules WHERE branch_id IS NOT NULL AND is_active=1) scheduledBranchCount,
    (SELECT COUNT(*) FROM branches b WHERE ${gpsValidSql}) gpsBranchCount,
    (SELECT COUNT(*) FROM branches b WHERE ${routeReadySql}) routeReadyCount,
    (SELECT COUNT(*) FROM branches b WHERE EXISTS(SELECT 1 FROM branch_schedules s WHERE s.branch_id=b.id AND s.is_active=1) AND NOT COALESCE((${gpsValidSql}),0)) scheduledMissingGpsCount,
    (SELECT COUNT(*) FROM branches b WHERE NOT EXISTS(SELECT 1 FROM branch_schedules s WHERE s.branch_id=b.id AND s.is_active=1)) noScheduleCount,
    (SELECT COUNT(*) FROM branch_schedules WHERE branch_id IS NULL) unmatchedScheduleCount`).get()
}

export function customerBranches(params, database = db) {
  const where = ['1=1'], args = []
  if (params.search) { where.push(`(c.name LIKE ? OR b.branch_name LIKE ? OR b.jodoo_branch_id LIKE ?)`); args.push(like(params.search),like(params.search),like(params.search)) }
  if (params.area) { where.push(`a.jodoo_area_id=?`); args.push(params.area) }
  if (params.gps === 'complete') where.push(gpsValidSql)
  if (params.gps === 'missing') where.push(`NOT COALESCE((${gpsValidSql}),0)`)
  if (params.schedule === 'scheduled') where.push(`EXISTS(SELECT 1 FROM branch_schedules sx WHERE sx.branch_id=b.id)`)
  if (params.schedule === 'none') where.push(`NOT EXISTS(SELECT 1 FROM branch_schedules sx WHERE sx.branch_id=b.id)`)
  const page = Math.max(1, Number(params.page) || 1), pageSize = Math.min(100, Math.max(1, Number(params.pageSize) || 25))
  const base = `FROM branches b LEFT JOIN customers c ON c.id=b.customer_id LEFT JOIN areas a ON a.id=b.area_id`
  const total = database.prepare(`SELECT COUNT(*) total ${base} WHERE ${where.join(' AND ')}`).get(...args).total
  const items = database.prepare(`SELECT b.jodoo_branch_id branchId,c.name customerName,b.branch_name branchName,a.name area,a.jodoo_area_id areaId,c.payment_type paymentType,c.occ_price occPrice,b.gps_status gpsStatus,b.latitude,b.longitude,COUNT(s.id) scheduleCount,GROUP_CONCAT(DISTINCT s.days_of_week) daysOfWeek,GROUP_CONCAT(DISTINCT s.frequency) frequency ${base} LEFT JOIN branch_schedules s ON s.branch_id=b.id WHERE ${where.join(' AND ')} GROUP BY b.id ORDER BY c.name,b.branch_name LIMIT ? OFFSET ?`).all(...args,pageSize,(page-1)*pageSize)
  return { items, pagination: { page, pageSize, total, pages: Math.ceil(total/pageSize) } }
}

export function customerBranchDetail(branchId, database = db) {
  const item = database.prepare(`SELECT b.jodoo_branch_id branchId,c.jodoo_customer_id customerId,c.name customerName,c.tin_number tinNumber,c.payment_type paymentType,c.occ_price occPrice,b.branch_name branchName,b.address,b.latitude,b.longitude,b.gps_status gpsStatus,b.gps_verified_at gpsVerifiedDate,b.parking_note parkingNote,b.truck_access truckAccess,b.gps_remark gpsRemark,a.jodoo_area_id areaId,a.name area,a.schedule_text areaSchedule FROM branches b LEFT JOIN customers c ON c.id=b.customer_id LEFT JOIN areas a ON a.id=b.area_id WHERE b.jodoo_branch_id=?`).get(branchId)
  if (!item) return null
  item.schedules = database.prepare(`SELECT jodoo_schedule_id scheduleId,frequency,days_of_week dayOfWeek,take_date takeDate,next_take_date nextTakeDate FROM branch_schedules WHERE source_branch_id=? ORDER BY days_of_week`).all(branchId)
  item.warnings = []
  if (!item.customerId) item.warnings.push('CustomerID 找不到')
  if (!item.areaId) item.warnings.push('AreaID 找不到或未填写')
  if (!(item.latitude >= -90 && item.latitude <= 90 && item.longitude >= -180 && item.longitude <= 180) || (item.latitude === 0 && item.longitude === 0)) item.warnings.push('GPS 资料未完成或格式异常')
  if (!item.schedules.length) item.warnings.push('没有收货排程')
  return item
}

export function schedules(params, database = db) {
  const where=['1=1'], args=[]
  if (params.day) { where.push('s.days_of_week LIKE ?'); args.push(like(params.day)) }
  if (params.frequency) { where.push('s.frequency=?'); args.push(params.frequency) }
  if (params.search) { where.push('(s.source_branch_id LIKE ? OR b.branch_name LIKE ?)'); args.push(like(params.search),like(params.search)) }
  if (params.area) { where.push('a.jodoo_area_id=?'); args.push(params.area) }
  if (params.unmatched === 'true') where.push('s.branch_id IS NULL')
  return database.prepare(`SELECT s.jodoo_schedule_id scheduleId,s.source_branch_id branchId,COALESCE(b.branch_name,'') branch,s.frequency,s.days_of_week dayOfWeek,s.take_date takeDate,s.next_take_date nextTakeDate,s.branch_id IS NULL unmatched,(SELECT COUNT(*) FROM branch_schedules sx WHERE sx.source_branch_id=s.source_branch_id)>1 multipleSchedules,a.name area FROM branch_schedules s LEFT JOIN branches b ON b.id=s.branch_id LEFT JOIN areas a ON a.id=b.area_id WHERE ${where.join(' AND ')} ORDER BY s.source_branch_id,s.days_of_week`).all(...args)
}

export function dataQualitySummary(database = db) {
  const groups = database.prepare(`SELECT b.jodoo_branch_id branchId,c.name customerName,b.branch_name branchName,a.name area,
    CASE WHEN ${gpsValidSql} THEN 1 ELSE 0 END hasGps,
    CASE WHEN EXISTS(SELECT 1 FROM branch_schedules s WHERE s.branch_id=b.id) THEN 1 ELSE 0 END hasSchedule,
    CASE WHEN (b.latitude IS NOT NULL OR b.longitude IS NOT NULL) AND NOT (${gpsValidSql}) THEN 1 ELSE 0 END invalidGps,
    CASE WHEN b.area_id IS NULL THEN 1 ELSE 0 END missingArea
    FROM branches b LEFT JOIN customers c ON c.id=b.customer_id LEFT JOIN areas a ON a.id=b.area_id ORDER BY c.name,b.branch_name`).all()
  const unmatchedSchedules = database.prepare(`SELECT jodoo_schedule_id scheduleId,source_branch_id branchId,days_of_week dayOfWeek FROM branch_schedules WHERE branch_id IS NULL`).all()
  return {
    scheduledWithGps: groups.filter((x)=>x.hasSchedule&&x.hasGps), scheduledMissingGps: groups.filter((x)=>x.hasSchedule&&!x.hasGps&&!x.invalidGps),
    gpsWithoutSchedule: groups.filter((x)=>!x.hasSchedule&&x.hasGps), missingGpsAndSchedule: groups.filter((x)=>!x.hasSchedule&&!x.hasGps&&!x.invalidGps),
    invalidGps: groups.filter((x)=>x.invalidGps), unmatchedSchedules, missingArea: groups.filter((x)=>x.missingArea),
  }
}

export function importBatches(database = db) {
  return database.prepare(`SELECT b.id,b.status,b.created_at createdAt,b.completed_at completedAt,b.summary_json summaryJson,COUNT(e.id) errorCount FROM import_batches b LEFT JOIN import_errors e ON e.import_batch_id=b.id GROUP BY b.id ORDER BY b.id DESC LIMIT 100`).all().map((r)=>({...r,summary:JSON.parse(r.summaryJson||'{}'),summaryJson:undefined}))
}

export function importErrors(batchId, database = db) {
  return database.prepare(`SELECT id,row_number rowNumber,entity_type entityType,external_id externalId,severity,error_code code,message,created_at createdAt,resolved_at resolvedAt FROM import_errors WHERE import_batch_id=? ORDER BY id`).all(batchId)
}
