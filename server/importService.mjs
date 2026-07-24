import crypto from 'node:crypto'
import { db } from './database.mjs'
import { recalculateRecommendations } from './gpsRecommendationService.mjs'
import { cleanId, cleanText, identifyFile, normalizeDayOfWeek, validCoordinate } from '../shared/importRules.js'

const previews = new Map()
const order = { areas: 1, customers: 2, branches: 3, schedules: 4, locations: 5 }
const iso = (value) => value instanceof Date ? value.toISOString() : cleanText(value)
const numberOrNull = (value) => cleanText(value) === '' ? null : Number.isFinite(Number(value)) ? Number(value) : null
const comparable = (value) => value === undefined || value === null || value === '' ? null : value
const same = (record, fields) => fields.every(([key, current]) => comparable(record?.[key]) === comparable(current))

function normalize(type, row) {
  if (type === 'areas') return { areaId: cleanId(row.AreaID), name: cleanText(row.AreaName), scheduleText: cleanText(row['Area Schedule']), driver: cleanText(row.Driver), sourceUpdatedAt: iso(row['更新时间']) }
  if (type === 'customers') return { customerId: cleanId(row.CustomerID), name: cleanText(row['Customer Name']), tin: cleanText(row['TIN NUMBER']), paymentType: cleanText(row['Payment type']) || null, occPrice: numberOrNull(row['OCC Price']), sourceUpdatedAt: iso(row['更新时间']) }
  if (type === 'branches') return { branchId: cleanId(row.BranchID), customerId: cleanId(row.CustomerID), areaId: cleanId(row.AreaID), branchName: cleanText(row['New Branch'] || row.Branch || row['Customer Name']), address: cleanText(row.Location || [row['Street Number'], row.Street, row.City, row.State, row['Postal Code']].filter(Boolean).join(', ')), latitude: numberOrNull(row.Latitude), longitude: numberOrNull(row.Longtitude), gpsStatus: cleanText(row['GPS Status']), gpsVerifiedAt: iso(row['GPS Verified Date']), parkingNote: cleanText(row['Parking Note']), truckAccess: cleanText(row['Truck Access']), gpsRemark: cleanText(row['GPS Remark']), sourceUpdatedAt: iso(row['更新时间']) }
  if (type === 'schedules') return { scheduleId: cleanId(row.ScheduleID), branchId: cleanId(row.BranchID), branchName: cleanText(row.Branch), frequency: cleanText(row.Frequency), daysOfWeek: normalizeDayOfWeek(row['Day Of Week']), originalDaysOfWeek: cleanText(row['Day Of Week']), takeDate: iso(row['Take Date']), nextTakeDate: iso(row['Next Take Date']), sourceUpdatedAt: iso(row['更新时间']) }
  return { branchId: cleanId(row['Branch ID']), latitude: numberOrNull(row.Latitude), longitude: numberOrNull(row.Longtitude), gpsStatus: cleanText(row['GPS Status']), gpsVerifiedAt: iso(row['GPS Verified Date']), parkingNote: cleanText(row['Parking Note']), truckAccess: cleanText(row['Truck Access']), gpsRemark: cleanText(row['GPS Remark']), sourceUpdatedAt: iso(row['更新时间']) }
}

function existingMaps(database) {
  return {
    areas: new Map(database.prepare('SELECT jodoo_area_id externalId, name, schedule_text scheduleText, default_driver_name driver FROM areas').all().map((r) => [r.externalId, r])),
    customers: new Map(database.prepare('SELECT jodoo_customer_id externalId, name, tin_number tin, payment_type paymentType, occ_price occPrice FROM customers').all().map((r) => [r.externalId, r])),
    branches: new Map(database.prepare(`SELECT b.jodoo_branch_id externalId, COALESCE(c.jodoo_customer_id,b.source_customer_id) customerId, COALESCE(a.jodoo_area_id,b.source_area_id) areaId, b.branch_name branchName, b.address, b.latitude, b.longitude, b.gps_status gpsStatus, b.gps_verified_at gpsVerifiedAt, b.parking_note parkingNote, b.truck_access truckAccess, b.gps_remark gpsRemark FROM branches b LEFT JOIN customers c ON c.id=b.customer_id LEFT JOIN areas a ON a.id=b.area_id`).all().map((r) => [r.externalId, r])),
    schedules: new Map(database.prepare(`SELECT s.jodoo_schedule_id externalId, s.source_branch_id branchId, s.frequency, s.days_of_week daysOfWeek, s.take_date takeDate, s.next_take_date nextTakeDate FROM branch_schedules s`).all().map((r) => [r.externalId, r])),
  }
}

function classify(type, normalized, maps) {
  if (type === 'locations') {
    const current = maps.branches.get(normalized.branchId)
    if (!current) return 'unmatched'
    return same(current, [['latitude', normalized.latitude], ['longitude', normalized.longitude], ['gpsRemark', normalized.gpsRemark]]) ? 'unchanged' : 'update'
  }
  const idKey = { areas: 'areaId', customers: 'customerId', branches: 'branchId', schedules: 'scheduleId' }[type]
  const current = maps[type].get(normalized[idKey])
  if (!current) return 'new'
  const fields = comparisonFields(type, normalized, idKey)
  return same(current, fields) ? 'unchanged' : 'update'
}

function comparisonFields(type, normalized, idKey = { areas: 'areaId', customers: 'customerId', branches: 'branchId', schedules: 'scheduleId' }[type]) {
  return Object.entries(normalized).filter(([key]) => !['sourceUpdatedAt','originalDaysOfWeek'].includes(key) && !(type === 'schedules' && key === 'branchName') && key !== idKey)
}

export function previewImport(payload, database = db) {
  if (!Array.isArray(payload.files) || !payload.files.length) throw new Error('请选择至少一份 Excel 文件')
  const maps = existingMaps(database)
  const seen = new Set(), rows = [], errors = [], files = []
  const identifiedFiles = payload.files.map((file) => {
    const headers = Array.isArray(file.headers) ? file.headers.map(cleanText) : []
    return { file, headers, type: identifyFile(headers, file.sheetName) }
  }).sort((a, b) => (order[a.type?.id] ?? 99) - (order[b.type?.id] ?? 99))
  for (const { file, headers, type } of identifiedFiles) {
    if (!type) { errors.push({ severity: 'fatal', code: 'UNKNOWN_FILE_TYPE', message: `${file.name}: 无法根据工作表与栏位识别文件类型` }); continue }
    const fileInfo = { name: cleanText(file.name), sheetName: cleanText(file.sheetName), type: type.id, label: type.label, rowCount: file.rows?.length ?? 0, headers }
    files.push(fileInfo)
    for (const [index, source] of (file.rows ?? []).entries()) {
      const normalized = normalize(type.id, source)
      const externalId = normalized[{ areas: 'areaId', customers: 'customerId', branches: 'branchId', schedules: 'scheduleId', locations: 'branchId' }[type.id]]
      const rowErrors = []
      if (!externalId) rowErrors.push({ severity: 'fatal', code: 'MISSING_EXTERNAL_ID', message: `缺少 ${type.key}` })
      const duplicateKey = `${type.id}:${externalId}`
      if (externalId && seen.has(duplicateKey)) rowErrors.push({ severity: 'fatal', code: 'DUPLICATE_IN_BATCH', message: `同一批次 ${type.key} 重复` })
      seen.add(duplicateKey)
      if (type.id === 'locations' && (normalized.latitude !== null || normalized.longitude !== null) && !validCoordinate(normalized.latitude, normalized.longitude)) rowErrors.push({ severity: 'error', code: 'INVALID_GPS', message: '经纬度无效或超出范围' })
      let action = rowErrors.some((e) => e.severity === 'fatal' || e.code === 'INVALID_GPS') ? 'error' : classify(type.id, normalized, maps)
      if (type.id === 'branches' && normalized.customerId && !maps.customers.has(normalized.customerId)) rowErrors.push({ severity: 'error', code: 'CUSTOMER_NOT_FOUND', message: `CustomerID ${normalized.customerId} 找不到` })
      if (type.id === 'branches' && normalized.areaId && !maps.areas.has(normalized.areaId)) rowErrors.push({ severity: 'error', code: 'AREA_NOT_FOUND', message: `AreaID ${normalized.areaId} 找不到` })
      if (type.id === 'schedules' && !maps.branches.has(normalized.branchId)) { action = 'unmatched'; rowErrors.push({ severity: 'error', code: 'BRANCH_NOT_FOUND', message: `BranchID ${normalized.branchId} 找不到，排程保留待核对` }) }
      if (type.id === 'locations' && action === 'unmatched') rowErrors.push({ severity: 'error', code: 'BRANCH_NOT_FOUND', message: `BranchID ${normalized.branchId} 找不到，不会新增假分店` })
      const differences = action === 'update' && type.id !== 'locations' ? comparisonFields(type.id, normalized).filter(([key,value]) => comparable(maps[type.id].get(externalId)?.[key]) !== comparable(value)).map(([key]) => key) : []
      rows.push({ file: fileInfo, type: type.id, rowNumber: index + 2, externalId, normalized, source, action, differences })
      errors.push(...rowErrors.map((error) => ({ ...error, file: fileInfo.name, type: type.id, rowNumber: index + 2, externalId, source })))
      if (action !== 'error' && type.id !== 'locations') maps[type.id].set(externalId, { externalId, ...normalized })
    }
  }
  rows.sort((a, b) => order[a.type] - order[b.type])
  const summary = { total: rows.length, new: rows.filter((r) => r.action === 'new').length, update: rows.filter((r) => r.action === 'update').length, unchanged: rows.filter((r) => r.action === 'unchanged').length, error: rows.filter((r) => r.action === 'error').length, unmatched: rows.filter((r) => r.action === 'unmatched').length }
  summary.byType = Object.fromEntries(Object.keys(order).map((type) => [type, Object.fromEntries(['new','update','unchanged','error','unmatched'].map((action) => [action, rows.filter((r) => r.type === type && r.action === action).length]))]))
  summary.updateFields = Object.fromEntries([...new Set(rows.flatMap((r) => r.differences))].map((field) => [field, rows.filter((r) => r.differences.includes(field)).length]))
  const batchId = crypto.randomUUID()
  const preview = { batchId, files, rows, errors, summary, canCommit: !errors.some((e) => e.severity === 'fatal'), createdAt: Date.now() }
  previews.set(batchId, preview)
  return { batchId, files, errors: errors.map(({ source: _source, ...e }) => e), summary, canCommit: preview.canCommit }
}

const upserts = {
  areas: `INSERT INTO areas (jodoo_area_id,name,zone_group_id,schedule_text,default_driver_name,source_updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(jodoo_area_id) DO UPDATE SET name=excluded.name,schedule_text=excluded.schedule_text,default_driver_name=excluded.default_driver_name,source_updated_at=excluded.source_updated_at,updated_at=CURRENT_TIMESTAMP`,
  customers: `INSERT INTO customers (jodoo_customer_id,name,tin_number,payment_type,occ_price,source_updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(jodoo_customer_id) DO UPDATE SET name=excluded.name,tin_number=excluded.tin_number,payment_type=excluded.payment_type,occ_price=excluded.occ_price,source_updated_at=excluded.source_updated_at,updated_at=CURRENT_TIMESTAMP`,
  branches: `INSERT INTO branches (jodoo_branch_id,customer_id,area_id,source_customer_id,source_area_id,branch_name,address,latitude,longitude,gps_status,gps_verified_at,parking_note,truck_access,gps_remark,source_updated_at) VALUES (?,(SELECT id FROM customers WHERE jodoo_customer_id=?),(SELECT id FROM areas WHERE jodoo_area_id=?),?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(jodoo_branch_id) DO UPDATE SET customer_id=excluded.customer_id,area_id=excluded.area_id,source_customer_id=excluded.source_customer_id,source_area_id=excluded.source_area_id,branch_name=excluded.branch_name,address=excluded.address,latitude=excluded.latitude,longitude=excluded.longitude,gps_status=excluded.gps_status,gps_verified_at=excluded.gps_verified_at,parking_note=excluded.parking_note,truck_access=excluded.truck_access,gps_remark=excluded.gps_remark,source_updated_at=excluded.source_updated_at,updated_at=CURRENT_TIMESTAMP`,
  schedules: `INSERT INTO branch_schedules (jodoo_schedule_id,branch_id,source_branch_id,frequency,days_of_week,take_date,next_take_date,source_updated_at) VALUES (?,(SELECT id FROM branches WHERE jodoo_branch_id=?),?,?,?,?,?,?) ON CONFLICT(jodoo_schedule_id) DO UPDATE SET branch_id=excluded.branch_id,source_branch_id=excluded.source_branch_id,frequency=excluded.frequency,days_of_week=excluded.days_of_week,take_date=excluded.take_date,next_take_date=excluded.next_take_date,source_updated_at=excluded.source_updated_at,updated_at=CURRENT_TIMESTAMP`,
}

function invalidateApprovedDaysAfterImport(preview,database,batchId){
  const affected=new Map()
  const addDay=(day,row)=>{if(!affected.has(day.id))affected.set(day.id,{day,changes:[]});affected.get(day.id).changes.push({type:row.type,action:row.action,normalized:row.normalized})}
  const future=database.prepare("SELECT * FROM dispatch_days WHERE dispatch_date>=date('now','+8 hours') AND status IN ('approved','published')").all()
  for(const row of preview.rows){
    if(!['new','update'].includes(row.action)||!['areas','customers','branches','schedules','locations'].includes(row.type))continue
    let days=[]
    if(row.type==='schedules'){
      const wanted=String(row.normalized.daysOfWeek||'').split(/[,;/]/).map(x=>x.trim())
      const names=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
      days=future.filter(day=>wanted.includes(names[new Date(`${day.dispatch_date}T00:00:00`).getDay()]))
    }else if(row.type==='customers')days=database.prepare(`SELECT DISTINCT dd.* FROM dispatch_days dd JOIN dispatch_trips dt ON dt.dispatch_day_id=dd.id JOIN dispatch_stops ds ON ds.dispatch_trip_id=dt.id JOIN branches b ON b.id=ds.branch_id JOIN customers c ON c.id=b.customer_id WHERE c.jodoo_customer_id=? AND dd.dispatch_date>=date('now','+8 hours') AND dd.status IN ('approved','published')`).all(row.normalized.customerId)
    else if(row.type==='areas')days=database.prepare(`SELECT DISTINCT dd.* FROM dispatch_days dd JOIN dispatch_trips dt ON dt.dispatch_day_id=dd.id JOIN dispatch_stops ds ON ds.dispatch_trip_id=dt.id JOIN branches b ON b.id=ds.branch_id JOIN areas a ON a.id=b.area_id WHERE a.jodoo_area_id=? AND dd.dispatch_date>=date('now','+8 hours') AND dd.status IN ('approved','published')`).all(row.normalized.areaId)
    else days=database.prepare(`SELECT DISTINCT dd.* FROM dispatch_days dd JOIN dispatch_trips dt ON dt.dispatch_day_id=dd.id JOIN dispatch_stops ds ON ds.dispatch_trip_id=dt.id JOIN branches b ON b.id=ds.branch_id WHERE b.jodoo_branch_id=? AND dd.dispatch_date>=date('now','+8 hours') AND dd.status IN ('approved','published')`).all(row.normalized.branchId)
    days.forEach(day=>addDay(day,row))
  }
  for(const {day,changes} of affected.values()){
    database.prepare("UPDATE dispatch_days SET status='reapproval_required',revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(day.id)
    database.prepare(`INSERT INTO dispatch_change_logs(dispatch_day_id,actor,change_type,entity_type,entity_id,before_json,after_json,requires_reapproval) VALUES(?,'Jodoo Excel Import','master_data_import','import_batch',?,NULL,?,1)`).run(day.id,String(batchId),JSON.stringify(changes))
  }
}

export function commitImport(batchId, database = db) {
  const preview = previews.get(batchId)
  if (!preview) throw new Error('导入预览已过期，请重新选择 Excel')
  if (!preview.canCommit) throw new Error('预览包含重要错误，不能确认导入')
  database.exec('BEGIN IMMEDIATE')
  let databaseBatchId
  try {
    const batch = database.prepare(`INSERT INTO import_batches (status,file_manifest_json,summary_json,completed_at) VALUES ('importing',?,?,NULL)`).run(JSON.stringify(preview.files), JSON.stringify(preview.summary))
    databaseBatchId = Number(batch.lastInsertRowid)
    const errorStmt = database.prepare(`INSERT INTO import_errors (import_batch_id,row_number,entity_type,external_id,severity,error_code,message,source_json) VALUES (?,?,?,?,?,?,?,?)`)
    preview.errors.forEach((e) => errorStmt.run(databaseBatchId, e.rowNumber ?? null, e.type ?? 'file', e.externalId ?? null, e.severity, e.code, e.message, JSON.stringify(e.source ?? {})))
    const statements = Object.fromEntries(Object.entries(upserts).map(([key, sql]) => [key, database.prepare(sql)]))
    for (const row of preview.rows) {
      if (row.action === 'error' || (row.type === 'locations' && row.action === 'unmatched') || row.action === 'unchanged') continue
      const n = row.normalized
      if (row.type === 'areas') {
        // 新 Area 只取得技术上的暂存归属；zone_assignment_status 保持待确认，不根据 Driver 或名称猜测营运 Zone。
        const zone=database.prepare('SELECT id FROM zone_groups WHERE is_active=1 ORDER BY sort_order,id LIMIT 1').get()
        if(!zone)throw new Error('请先建立至少一个启用的 Zone Group')
        statements.areas.run(n.areaId,n.name,zone.id,n.scheduleText,n.driver,n.sourceUpdatedAt)
      }
      if (row.type === 'customers') statements.customers.run(n.customerId,n.name,n.tin,n.paymentType,n.occPrice,n.sourceUpdatedAt)
      if (row.type === 'branches') statements.branches.run(n.branchId,n.customerId,n.areaId,n.customerId,n.areaId,n.branchName,n.address,n.latitude,n.longitude,n.gpsStatus,n.gpsVerifiedAt,n.parkingNote,n.truckAccess,n.gpsRemark,n.sourceUpdatedAt)
      if (row.type === 'schedules') statements.schedules.run(n.scheduleId,n.branchId,n.branchId,n.frequency,n.daysOfWeek,n.takeDate,n.nextTakeDate,n.sourceUpdatedAt)
      if (row.type === 'locations') database.prepare(`UPDATE branches SET latitude=COALESCE(?,latitude),longitude=COALESCE(?,longitude),gps_status=COALESCE(NULLIF(?,''),gps_status),gps_verified_at=COALESCE(NULLIF(?,''),gps_verified_at),parking_note=COALESCE(NULLIF(?,''),parking_note),truck_access=COALESCE(NULLIF(?,''),truck_access),gps_remark=COALESCE(NULLIF(?,''),gps_remark),source_updated_at=COALESCE(NULLIF(?,''),source_updated_at),updated_at=CURRENT_TIMESTAMP WHERE jodoo_branch_id=?`).run(n.latitude,n.longitude,n.gpsStatus,n.gpsVerifiedAt,n.parkingNote,n.truckAccess,n.gpsRemark,n.sourceUpdatedAt,n.branchId)
    }
    invalidateApprovedDaysAfterImport(preview,database,databaseBatchId)
    database.prepare(`UPDATE import_batches SET status='completed',summary_json=?,completed_at=CURRENT_TIMESTAMP WHERE id=?`).run(JSON.stringify(preview.summary), databaseBatchId)
    database.exec('COMMIT')
    previews.delete(batchId)
    recalculateRecommendations({changedBy:'Jodoo Excel Import'},database)
    return { id: databaseBatchId, status: 'completed', summary: preview.summary }
  } catch (error) {
    database.exec('ROLLBACK')
    database.prepare(`INSERT INTO import_batches (status,file_manifest_json,summary_json,completed_at) VALUES ('failed',?,?,CURRENT_TIMESTAMP)`).run(JSON.stringify(preview.files), JSON.stringify({ ...preview.summary, failure: error.message }))
    throw error
  }
}
