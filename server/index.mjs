import http from 'node:http'
import os from 'node:os'
import fs from 'node:fs'
import path from 'node:path'
import { db, databasePath, getSystemStatus, uploadsDir } from './database.mjs'
import { getJodooIntegrationStatus, recordJodooWebhook, verifyJodooWebhookToken } from './jodoo.mjs'
import { commitImport, previewImport } from './importService.mjs'
import { customerBranchDetail, customerBranches, dashboardSummary, dataQualitySummary, importBatches, importErrors, schedules } from './queryService.mjs'
import { approveDay, assignAreaStops, assignVehicleDay, createScheduleException, createStop, createTrip, deleteStop, driverToday, generateDay, generateWeek, getDispatchDay, getDispatchWeek, promisedCheck, publishDay, reopenDay, transferVehicleDay, updateStop, updateTrip } from './dispatchService.mjs'
import { addTemporaryLocation, adoptTemporaryLocation, convertToExisting, createSpecialRequest, linkNewAccount, listSpecialRequests, listTemporaryLocations, reviewTemporaryLocation, scheduleSpecialRequest, searchCustomerBranches, updateSpecialRequest } from './specialRequestService.mjs'
import { assertEmployeePayloadId, assignAreaZone, createEmployee, createLocation, createTemporaryVehicle, createVehicle, createZoneGroup, endEmployeeEmployment, getAreaConfirmationDetail, getNextEmployeeCode, getZoneGroupMetricDetails, listResources, listZoneGroups, mergeZoneGroups, rehireEmployee, setAreasConfirmation, setZoneActive, splitZoneGroup, supervisorMoveAreasToZone, updateEmployee, updateLocation, updateVehicle, updateZoneGroup } from './resourceService.mjs'
import { addFuelRecord, addMaintenanceRecord, addTyreRecord, addUsageRecord, addVehicleDocument, getVehicleDetail, updateVehicleCompliance } from './vehicleService.mjs'
import { bulkAcceptHighConfidence, decideRecommendation, ensureRecommendations, listRecommendations, listZoneBoundaries, recalculateRecommendations, saveZoneBoundary } from './gpsRecommendationService.mjs'
import { adoptBranchGps, areaCloseout, captureBranchGps, createBranch, createCustomer, getBranch, getCustomer, listBranches, listBuyers, listCustomers, listGpsCollector, listMasterAudit, listOperationalLocations, saveBuyer, saveOperationalLocation, updateBranch, updateCustomer } from './customerMasterService.mjs'
import { commitMasterImport, listTransferLogs, masterExport, masterTemplate, previewMasterImport } from './masterTransferService.mjs'
import { accountCan, bootstrapAccount, changePassword, createAccount, getSession, listAccounts, listAuthAudit, login, logout, setupStatus, updateAccount, updateOwnPreferences } from './authService.mjs'
import { commitGpsMigration, getGpsMigrationBatch, gpsMigrationTemplate, listGpsMigrationBatches, previewGpsMigration, resolveGpsMigrationRow } from './gpsMigrationService.mjs'
import { addEmployeeDocument, employeeDetail, employeeDocumentFile, revealEmployeeField, sensitiveAccessLogs, sensitiveEmployeeExport } from './employeeSensitiveService.mjs'
import {kuchingDate} from '../shared/kuchingTime.js'

const port = Number(process.env.KCS_API_PORT || 8787)
const host = process.env.KCS_API_HOST || '0.0.0.0'

function sendJson(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' })
  response.end(JSON.stringify(value))
}

const meta=request=>({ipAddress:request.socket.remoteAddress||null,userAgent:request.headers['user-agent']||null})
const cookies=request=>Object.fromEntries(String(request.headers.cookie||'').split(';').map(item=>item.trim().split('=').map(decodeURIComponent)).filter(item=>item.length===2))
const sessionCookie=(token,maxAge)=>`kcs_session=${encodeURIComponent(token||'')}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${process.env.KCS_HTTPS==='1'?'; Secure':''}`
const networkUrls=()=>Object.values(os.networkInterfaces()).flat().filter(item=>item&&item.family==='IPv4'&&!item.internal).map(item=>`http://${item.address}:5175`)
function permissionFor(pathname){if(pathname.startsWith('/api/mobile/'))return'mobile';if(/^\/api\/gps-collector\/branch\//.test(pathname))return'gps_capture';if(pathname==='/api/gps-collector'||/^\/api\/gps-collector\/\d+\/(adopt|review|photo)$/.test(pathname)||/^\/api\/temporary-locations\/\d+\/adopt$/.test(pathname))return'gps_review';if(pathname.startsWith('/api/auth/accounts')||pathname==='/api/auth/audit')return'accounts';if(/^\/api\/gps-migration\/(?:batches\/\d+\/commit|rows\/\d+\/resolve)$/.test(pathname))return'gps_migration_approve';if(pathname.startsWith('/api/gps-migration'))return'gps_migration';return'desktop'}
const canManageEmployees=session=>accountCan(session,'employee_manage')||session.role==='supervisor'
const canViewIdentity=session=>accountCan(session,'sensitive_data')||accountCan(session,'employee_identity_sensitive')
const canViewPayroll=session=>accountCan(session,'sensitive_data')||accountCan(session,'employee_payroll_sensitive')

async function readJson(request, maxBytes = 15_000_000) {
  const chunks = []
  let total = 0
  for await (const chunk of request) {
    total += chunk.length
    if (total > maxBytes) throw new Error('Request body is too large')
    chunks.push(chunk)
  }
  const rawBody = Buffer.concat(chunks).toString('utf8'),payload=JSON.parse(rawBody || '{}')
  if(request.kcsSession){const actor=request.kcsSession.employeeName;payload.changedBy=actor;for(const key of ['createdBy','approvedBy','publishedBy','reopenedBy','scheduledBy','generatedBy','adoptedBy','capturedBy','updatedBy','uploadedBy','confirmedBy'])if(Object.hasOwn(payload,key))payload[key]=actor}
  return { rawBody, payload }
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`)
    if (request.method === 'OPTIONS') {
      response.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Jodoo-Token' })
      return response.end()
    }
    if (request.method === 'GET' && url.pathname === '/api/health') return sendJson(response, 200, { status: 'ok', service: 'kcs-api' })
    if (request.method === 'GET' && url.pathname === '/api/auth/setup-status') return sendJson(response,200,setupStatus())
    if (request.method === 'POST' && url.pathname === '/api/auth/bootstrap') return sendJson(response,201,bootstrapAccount((await readJson(request)).payload,meta(request)))
    if (request.method === 'POST' && url.pathname === '/api/auth/login') {const result=login((await readJson(request)).payload,meta(request));response.setHeader('Set-Cookie',sessionCookie(result.token,12*3600));return sendJson(response,200,{account:result.account,expiresAt:result.expiresAt})}
    if (request.method === 'POST' && url.pathname === '/api/integrations/jodoo/webhook') {const token=request.headers['x-jodoo-token']||url.searchParams.get('token');if(!verifyJodooWebhookToken(token))return sendJson(response,401,{error:'Invalid Jodoo webhook token'});const{rawBody,payload}=await readJson(request);return sendJson(response,202,{accepted:true,...recordJodooWebhook(rawBody,payload)})}
    const session=getSession(cookies(request).kcs_session)
    if (request.method === 'GET' && url.pathname === '/api/auth/session') return sendJson(response,200,{account:session||null})
    if(!session)return sendJson(response,401,{error:'请先登录 KCS'})
    request.kcsSession=session
    if (request.method === 'POST' && url.pathname === '/api/auth/logout') {logout(session);response.setHeader('Set-Cookie',sessionCookie('',0));return sendJson(response,200,{ok:true})}
    if (request.method === 'POST' && url.pathname === '/api/auth/change-password') return sendJson(response,200,changePassword(session,(await readJson(request)).payload))
    if (request.method === 'PATCH' && url.pathname === '/api/auth/preferences') return sendJson(response,200,{account:updateOwnPreferences(session,(await readJson(request)).payload)})
    if(session.mustChangePassword)return sendJson(response,403,{error:'首次登录必须先修改密码',code:'PASSWORD_CHANGE_REQUIRED'})
    const permission=permissionFor(url.pathname)
    if(!accountCan(session,permission))return sendJson(response,403,{error:'此账号没有权限执行该操作'})
    if (request.method === 'GET' && url.pathname === '/api/auth/accounts') return sendJson(response,200,{items:listAccounts()})
    if (request.method === 'POST' && url.pathname === '/api/auth/accounts') return sendJson(response,201,createAccount((await readJson(request)).payload,session,meta(request)))
    if (request.method === 'PATCH' && /^\/api\/auth\/accounts\/\d+$/.test(url.pathname)) {const payload=(await readJson(request)).payload;if(Array.isArray(payload.permissions)&&session.role!=='owner_admin')return sendJson(response,403,{error:'只有Owner Admin可以授权敏感资料权限'});return sendJson(response,200,updateAccount(Number(url.pathname.split('/').at(-1)),payload,session,meta(request)))}
    if (request.method === 'GET' && url.pathname === '/api/auth/audit') return sendJson(response,200,{items:listAuthAudit(Object.fromEntries(url.searchParams))})
    if (request.method === 'GET' && url.pathname === '/api/system/network') return sendJson(response,200,{host,apiPort:port,lanUrls:networkUrls(),httpsRequiredForGps:true})
    if (request.method === 'GET' && url.pathname === '/api/mobile/today') {const data=driverToday({employeeId:session.employeeId,includeAssistant:session.role==='crew',date:url.searchParams.get('date')||undefined});for(const trip of data.trips||[])for(const stop of trip.stops||[]){delete stop.occPrice;delete stop.paymentType;delete stop.latitude;delete stop.longitude}return sendJson(response,200,data)}
    if (request.method === 'GET' && url.pathname === '/api/mobile/branch-search') {const search=String(url.searchParams.get('search')||'').trim(),q=`%${search}%`;const items=db.prepare(`SELECT b.jodoo_branch_id branchId,b.branch_name branchName,c.name customerName,b.address,CASE WHEN b.latitude BETWEEN -90 AND 90 AND b.longitude BETWEEN -180 AND 180 AND NOT(b.latitude=0 AND b.longitude=0) THEN 1 ELSE 0 END hasOfficialGps,(SELECT verification_status FROM temporary_locations t WHERE t.branch_id=b.id ORDER BY t.id DESC LIMIT 1) temporaryGpsStatus FROM branches b LEFT JOIN customers c ON c.id=b.customer_id WHERE ?<>'' AND (b.jodoo_branch_id LIKE ? OR b.branch_name LIKE ? OR c.name LIKE ?) ORDER BY c.name,b.branch_name LIMIT 30`).all(search,q,q,q);return sendJson(response,200,{items})}
    if (request.method === 'GET' && url.pathname === '/api/mobile/submissions') return sendJson(response,200,{items:listTemporaryLocations({employeeId:session.employeeId})})
    if (request.method === 'POST' && url.pathname === '/api/mobile/temporary-customers') {const payload=(await readJson(request)).payload;return sendJson(response,201,createSpecialRequest({...payload,employeeId:session.employeeId,requestType:'potential_new',createdBy:session.employeeName,requestedCollectionDate:payload.requestedCollectionDate||kuchingDate(),status:'awaiting_supervisor'}))}
    if (request.method === 'GET' && url.pathname === '/api/gps-migration/template') return sendJson(response,200,gpsMigrationTemplate())
    if (request.method === 'GET' && url.pathname === '/api/gps-migration/batches') return sendJson(response,200,{items:listGpsMigrationBatches()})
    if (request.method === 'GET' && /^\/api\/gps-migration\/batches\/\d+$/.test(url.pathname)) return sendJson(response,200,getGpsMigrationBatch(Number(url.pathname.split('/').at(-1))))
    if (request.method === 'POST' && url.pathname === '/api/gps-migration/preview') return sendJson(response,200,previewGpsMigration((await readJson(request)).payload,session.username))
    if (request.method === 'POST' && /^\/api\/gps-migration\/batches\/\d+\/commit$/.test(url.pathname)) return sendJson(response,200,commitGpsMigration(Number(url.pathname.split('/')[4]),session.username))
    if (request.method === 'POST' && /^\/api\/gps-migration\/rows\/\d+\/resolve$/.test(url.pathname)) return sendJson(response,200,resolveGpsMigrationRow(Number(url.pathname.split('/')[4]),(await readJson(request)).payload,session.username))
    if (request.method === 'GET' && url.pathname === '/api/system/status') return sendJson(response, 200, { ...getSystemStatus(), integrations: { jodoo: getJodooIntegrationStatus() } })
    if (request.method === 'GET' && url.pathname === '/api/integrations/jodoo/status') return sendJson(response, 200, getJodooIntegrationStatus())
    if (request.method === 'GET' && url.pathname === '/api/dashboard/summary') return sendJson(response, 200, dashboardSummary())
    if (request.method === 'GET' && url.pathname === '/api/master/area-closeout') return sendJson(response,200,areaCloseout())
    if (request.method === 'GET' && url.pathname === '/api/master/audit') return sendJson(response,200,{items:listMasterAudit(Object.fromEntries(url.searchParams))})
    if (request.method === 'GET' && url.pathname === '/api/customers') return sendJson(response,200,listCustomers(Object.fromEntries(url.searchParams)))
    if (request.method === 'POST' && url.pathname === '/api/customers') return sendJson(response,201,createCustomer((await readJson(request)).payload))
    if (request.method === 'GET' && /^\/api\/customers\/[^/]+$/.test(url.pathname)) {const item=getCustomer(decodeURIComponent(url.pathname.split('/').at(-1)));return item?sendJson(response,200,item):sendJson(response,404,{error:'Customer not found'})}
    if (request.method === 'PATCH' && /^\/api\/customers\/[^/]+$/.test(url.pathname)) return sendJson(response,200,updateCustomer(decodeURIComponent(url.pathname.split('/').at(-1)),(await readJson(request)).payload))
    if (request.method === 'GET' && url.pathname === '/api/master/branches') return sendJson(response,200,listBranches(Object.fromEntries(url.searchParams)))
    if (request.method === 'POST' && url.pathname === '/api/master/branches') return sendJson(response,201,createBranch((await readJson(request)).payload))
    if (request.method === 'GET' && /^\/api\/master\/branches\/[^/]+$/.test(url.pathname)) {const item=getBranch(decodeURIComponent(url.pathname.split('/').at(-1)));return item?sendJson(response,200,item):sendJson(response,404,{error:'Branch not found'})}
    if (request.method === 'PATCH' && /^\/api\/master\/branches\/[^/]+$/.test(url.pathname)) return sendJson(response,200,updateBranch(decodeURIComponent(url.pathname.split('/').at(-1)),(await readJson(request)).payload))
    if (request.method === 'GET' && url.pathname === '/api/gps-collector') return sendJson(response,200,{items:listGpsCollector(Object.fromEntries(url.searchParams))})
    if (request.method === 'GET' && /^\/api\/gps-collector\/\d+\/photo$/.test(url.pathname)) {const item=db.prepare('SELECT photo_storage_key,photo_content_type FROM temporary_locations WHERE id=?').get(Number(url.pathname.split('/')[3]));if(!item?.photo_storage_key)return sendJson(response,404,{error:'GPS photo not found'});const file=path.resolve(uploadsDir,item.photo_storage_key),root=path.resolve(uploadsDir)+path.sep;if(!file.startsWith(root)||!fs.existsSync(file))return sendJson(response,404,{error:'GPS photo not found'});response.writeHead(200,{'Content-Type':item.photo_content_type||'application/octet-stream','Cache-Control':'private, max-age=60'});return fs.createReadStream(file).pipe(response)}
    if (request.method === 'POST' && /^\/api\/gps-collector\/branch\/[^/]+$/.test(url.pathname)) {const payload=(await readJson(request)).payload;if(['driver','crew'].includes(session.role)&&!payload.photo?.dataUrl)throw new Error('司机或跟车员采集 GPS 必须上传现场照片');return sendJson(response,201,captureBranchGps(decodeURIComponent(url.pathname.split('/').at(-1)),{...payload,employeeId:session.employeeId,capturedBy:session.employeeName,changedBy:session.employeeName}))}
    if (request.method === 'POST' && /^\/api\/gps-collector\/\d+\/adopt$/.test(url.pathname)) {const payload=(await readJson(request)).payload;return sendJson(response,200,adoptBranchGps(Number(url.pathname.split('/')[3]),{...payload,adoptedBy:session.employeeName,changedBy:session.employeeName}))}
    if (request.method === 'POST' && /^\/api\/gps-collector\/\d+\/review$/.test(url.pathname)) {const payload=(await readJson(request)).payload;return sendJson(response,200,reviewTemporaryLocation(Number(url.pathname.split('/')[3]),{...payload,reviewedBy:session.employeeName,reviewedByAccountId:session.id}))}
    if (request.method === 'GET' && url.pathname === '/api/buyers') return sendJson(response,200,{items:listBuyers(Object.fromEntries(url.searchParams))})
    if (request.method === 'POST' && url.pathname === '/api/buyers') return sendJson(response,201,saveBuyer((await readJson(request)).payload))
    if (request.method === 'PATCH' && /^\/api\/buyers\/\d+$/.test(url.pathname)) return sendJson(response,200,saveBuyer((await readJson(request)).payload,Number(url.pathname.split('/').at(-1))))
    if (request.method === 'GET' && url.pathname === '/api/operational-locations') return sendJson(response,200,{items:listOperationalLocations(Object.fromEntries(url.searchParams))})
    if (request.method === 'POST' && url.pathname === '/api/operational-locations') return sendJson(response,201,saveOperationalLocation((await readJson(request)).payload))
    if (request.method === 'PATCH' && /^\/api\/operational-locations\/\d+$/.test(url.pathname)) return sendJson(response,200,saveOperationalLocation((await readJson(request)).payload,Number(url.pathname.split('/').at(-1))))
    if (request.method === 'GET' && /^\/api\/master-transfer\/[^/]+\/template$/.test(url.pathname)) return sendJson(response,200,masterTemplate(url.pathname.split('/')[3]))
    if (request.method === 'GET' && /^\/api\/master-transfer\/[^/]+\/export$/.test(url.pathname)) return sendJson(response,200,masterExport(url.pathname.split('/')[3],{...Object.fromEntries(url.searchParams),changedBy:session.employeeName}))
    if (request.method === 'GET' && url.pathname === '/api/master-transfer/logs') return sendJson(response,200,{items:listTransferLogs()})
    if (request.method === 'POST' && url.pathname === '/api/master-transfer/preview') {const payload=(await readJson(request)).payload;if(payload.module==='employee'&&session.role!=='admin'&&!accountCan(session,'employee_sensitive_import'))return sendJson(response,403,{error:'没有 Employee 敏感资料导入权限'});return sendJson(response,200,previewMasterImport(payload))}
    if (request.method === 'POST' && url.pathname === '/api/master-transfer/commit') {const payload=(await readJson(request)).payload;const batch=db.prepare('SELECT source FROM import_batches WHERE id=?').get(payload.batchId);if(batch?.source==='kcs_master_employee'&&session.role!=='admin'&&!accountCan(session,'employee_sensitive_import'))return sendJson(response,403,{error:'没有 Employee 敏感资料导入权限'});return sendJson(response,200,commitMasterImport(payload.batchId,{...payload,changedBy:session.employeeName}))}
    if (request.method === 'GET' && url.pathname === '/api/customer-branches') return sendJson(response, 200, customerBranches(Object.fromEntries(url.searchParams)))
    if (request.method === 'GET' && url.pathname.startsWith('/api/customer-branches/')) {
      const item = customerBranchDetail(decodeURIComponent(url.pathname.slice('/api/customer-branches/'.length)))
      return item ? sendJson(response, 200, item) : sendJson(response, 404, { error: 'Branch not found' })
    }
    if (request.method === 'GET' && url.pathname === '/api/schedules') return sendJson(response, 200, schedules(Object.fromEntries(url.searchParams)))
    if (request.method === 'GET' && url.pathname === '/api/data-quality/summary') return sendJson(response, 200, dataQualitySummary())
    if (request.method === 'GET' && url.pathname === '/api/dispatch/week') return sendJson(response, 200, getDispatchWeek(Object.fromEntries(url.searchParams)))
    if (request.method === 'POST' && url.pathname === '/api/dispatch/generate-week') return sendJson(response, 200, generateWeek((await readJson(request)).payload))
    if (request.method === 'POST' && url.pathname === '/api/dispatch/generate-day') return sendJson(response, 200, generateDay((await readJson(request)).payload))
    if (request.method === 'GET' && url.pathname.startsWith('/api/dispatch/day/')) {
      const item=getDispatchDay(decodeURIComponent(url.pathname.slice('/api/dispatch/day/'.length)))
      return item?sendJson(response,200,item):sendJson(response,404,{error:'Dispatch day not found'})
    }
    if (request.method === 'POST' && /^\/api\/dispatch\/day\/[^/]+\/(approve|publish|reopen)$/.test(url.pathname)) {
      const parts=url.pathname.split('/'),date=decodeURIComponent(parts[4]),action=parts[5],payload=(await readJson(request)).payload
      return sendJson(response,200,action==='approve'?approveDay(date,payload):action==='publish'?publishDay(date,payload):reopenDay(date,payload))
    }
    if (request.method === 'GET' && url.pathname.startsWith('/api/dispatch/promised-check/')) return sendJson(response,200,promisedCheck(decodeURIComponent(url.pathname.slice('/api/dispatch/promised-check/'.length))))
    if (request.method === 'GET' && url.pathname === '/api/driver/today') return sendJson(response,200,driverToday({driverId:url.searchParams.get('driverId')}))
    if (request.method === 'POST' && url.pathname === '/api/dispatch/stops') return sendJson(response,201,createStop((await readJson(request)).payload))
    if (request.method === 'POST' && url.pathname === '/api/dispatch/trips') return sendJson(response,201,createTrip((await readJson(request)).payload))
    if (request.method === 'PATCH' && /^\/api\/dispatch\/stops\/\d+$/.test(url.pathname)) return sendJson(response,200,updateStop(Number(url.pathname.split('/').at(-1)),(await readJson(request)).payload))
    if (request.method === 'DELETE' && /^\/api\/dispatch\/stops\/\d+$/.test(url.pathname)) return sendJson(response,200,deleteStop(Number(url.pathname.split('/').at(-1)),(await readJson(request)).payload))
    if (request.method === 'PATCH' && /^\/api\/dispatch\/trips\/\d+$/.test(url.pathname)) return sendJson(response,200,updateTrip(Number(url.pathname.split('/').at(-1)),(await readJson(request)).payload))
    if (request.method === 'PATCH' && /^\/api\/dispatch\/day\/[^/]+\/vehicle\/\d+$/.test(url.pathname)) {const parts=url.pathname.split('/');return sendJson(response,200,assignVehicleDay(decodeURIComponent(parts[4]),Number(parts[6]),(await readJson(request)).payload))}
    if (request.method === 'POST' && /^\/api\/dispatch\/day\/[^/]+\/vehicle\/\d+\/transfer$/.test(url.pathname)) {const parts=url.pathname.split('/');return sendJson(response,200,transferVehicleDay(decodeURIComponent(parts[4]),Number(parts[6]),(await readJson(request)).payload))}
    if (request.method === 'POST' && /^\/api\/dispatch\/day\/[^/]+\/assign-area$/.test(url.pathname)) {const parts=url.pathname.split('/');return sendJson(response,200,assignAreaStops(decodeURIComponent(parts[4]),(await readJson(request)).payload))}
    if (request.method === 'GET' && url.pathname === '/api/resources') return sendJson(response,200,listResources())
    if (request.method === 'GET' && url.pathname === '/api/zone-groups') return sendJson(response,200,listZoneGroups())
    if (request.method === 'GET' && /^\/api\/zone-groups\/\d+\/metric-details$/.test(url.pathname)) return sendJson(response,200,getZoneGroupMetricDetails(Number(url.pathname.split('/')[3]),Object.fromEntries(url.searchParams)))
    if (request.method === 'GET' && url.pathname === '/api/zone-boundaries') return sendJson(response,200,listZoneBoundaries({includeHistory:url.searchParams.get('history')==='true'}))
    if (request.method === 'POST' && /^\/api\/zone-groups\/\d+\/boundaries$/.test(url.pathname)) return sendJson(response,201,saveZoneBoundary(Number(url.pathname.split('/')[3]),(await readJson(request)).payload))
    if (request.method === 'GET' && url.pathname === '/api/gps-zone-recommendations') return sendJson(response,200,listRecommendations(Object.fromEntries(url.searchParams)))
    if (request.method === 'POST' && url.pathname === '/api/gps-zone-recommendations/recalculate') return sendJson(response,200,recalculateRecommendations((await readJson(request)).payload))
    if (request.method === 'POST' && url.pathname === '/api/gps-zone-recommendations/bulk-confirm-high') return sendJson(response,200,bulkAcceptHighConfidence((await readJson(request)).payload))
    if (request.method === 'POST' && /^\/api\/gps-zone-recommendations\/\d+\/decision$/.test(url.pathname)) return sendJson(response,200,decideRecommendation(Number(url.pathname.split('/')[3]),(await readJson(request)).payload))
    if (request.method === 'POST' && url.pathname === '/api/zone-groups') return sendJson(response,201,createZoneGroup((await readJson(request)).payload))
    if (request.method === 'POST' && url.pathname === '/api/zone-groups/merge') return sendJson(response,200,mergeZoneGroups((await readJson(request)).payload))
    if (request.method === 'POST' && url.pathname === '/api/zone-groups/split') return sendJson(response,201,splitZoneGroup((await readJson(request)).payload))
    if (request.method === 'POST' && /^\/api\/zone-groups\/\d+\/(deactivate|reactivate)$/.test(url.pathname)) {const parts=url.pathname.split('/'),payload=(await readJson(request)).payload;return sendJson(response,200,setZoneActive(Number(parts[3]),parts[4]==='reactivate',payload))}
    if (request.method === 'PATCH' && /^\/api\/zone-groups\/\d+$/.test(url.pathname)) return sendJson(response,200,updateZoneGroup(Number(url.pathname.split('/').at(-1)),(await readJson(request)).payload))
    if (request.method === 'GET' && /^\/api\/areas\/\d+\/zone-confirmation$/.test(url.pathname)) return sendJson(response,200,getAreaConfirmationDetail(Number(url.pathname.split('/')[3])))
    if (request.method === 'POST' && url.pathname === '/api/areas/bulk-zone-group') {const payload=(await readJson(request)).payload;return sendJson(response,200,{items:supervisorMoveAreasToZone(payload.areaIds,Number(payload.zoneGroupId),payload)})}
    if (request.method === 'POST' && url.pathname === '/api/areas/bulk-confirmation') {const payload=(await readJson(request)).payload;return sendJson(response,200,{items:setAreasConfirmation(payload.areaIds,payload.confirmed!==false,payload)})}
    if (request.method === 'PATCH' && /^\/api\/areas\/\d+\/zone-group$/.test(url.pathname)) {const parts=url.pathname.split('/'),payload=(await readJson(request)).payload;return sendJson(response,200,assignAreaZone(Number(parts[3]),Number(payload.zoneGroupId),payload))}
    if (request.method === 'POST' && url.pathname === '/api/vehicles') return sendJson(response,201,createVehicle((await readJson(request)).payload))
    if (request.method === 'POST' && url.pathname === '/api/vehicles/temporary') return sendJson(response,201,createTemporaryVehicle((await readJson(request)).payload))
    if (request.method === 'GET' && /^\/api\/vehicles\/\d+$/.test(url.pathname)) return sendJson(response,200,getVehicleDetail(Number(url.pathname.split('/').at(-1))))
    if (request.method === 'PATCH' && /^\/api\/vehicles\/\d+$/.test(url.pathname)) return sendJson(response,200,updateVehicle(Number(url.pathname.split('/').at(-1)),(await readJson(request)).payload))
    if (request.method === 'POST' && /^\/api\/vehicles\/\d+\/(compliance|maintenance|fuel|tyres|documents|usage)$/.test(url.pathname)) {const parts=url.pathname.split('/'),id=Number(parts[3]),type=parts[4],payload=(await readJson(request)).payload;const handlers={compliance:updateVehicleCompliance,maintenance:addMaintenanceRecord,fuel:addFuelRecord,tyres:addTyreRecord,documents:addVehicleDocument,usage:addUsageRecord};return sendJson(response,type==='compliance'?200:201,handlers[type](id,payload))}
    if (request.method === 'GET' && url.pathname === '/api/employees/next-code') return sendJson(response,200,getNextEmployeeCode())
    if (request.method === 'GET' && url.pathname === '/api/employees-sensitive-export') {if(!canViewPayroll(session))return sendJson(response,403,{error:'没有薪资敏感资料导出权限'});return sendJson(response,200,sensitiveEmployeeExport(url.searchParams.get('reason'),session,meta(request)))}
    if (request.method === 'GET' && /^\/api\/employees\/\d+$/.test(url.pathname)) {const id=Number(url.pathname.split('/').at(-1)),item=employeeDetail(id,{canViewSensitive:canViewIdentity(session)||canViewPayroll(session)});return item?sendJson(response,200,item):sendJson(response,404,{error:'Employee not found'})}
    if (request.method === 'POST' && url.pathname === '/api/employees') {if(!canManageEmployees(session))return sendJson(response,403,{error:'没有建立员工权限'});const payload=(await readJson(request)).payload;if(payload.nationalIdNumber&&!canViewIdentity(session))return sendJson(response,403,{error:'没有身份证资料建立权限'});if(['bankAccountNumber','epfNumber','socsoNumber'].some(key=>payload[key])&&!canViewPayroll(session))return sendJson(response,403,{error:'没有薪资资料建立权限'});return sendJson(response,201,createEmployee({...payload,changedBy:session.employeeName}))}
    if (request.method === 'PATCH' && /^\/api\/employees\/\d+$/.test(url.pathname)) {
      if(!canManageEmployees(session))return sendJson(response,403,{error:'没有修改员工权限'})
      const id=Number(url.pathname.split('/').at(-1)),payload=(await readJson(request)).payload
      assertEmployeePayloadId(id,payload)
      if(Object.hasOwn(payload,'nationalIdNumber')&&!canViewIdentity(session))return sendJson(response,403,{error:'没有身份证资料修改权限'})
      if(['bankName','bankAccountNumber','bankAccountHolderName','epfNumber','socsoNumber'].some(key=>Object.hasOwn(payload,key))&&!canViewPayroll(session))return sendJson(response,403,{error:'没有薪资资料修改权限'})
      return sendJson(response,200,updateEmployee(id,{...payload,changedBy:session.employeeName}))
    }
    if (request.method === 'POST' && /^\/api\/employees\/\d+\/terminate$/.test(url.pathname)) {
      if(!canManageEmployees(session))return sendJson(response,403,{error:'没有办理离职权限'})
      const id=Number(url.pathname.split('/')[3]),payload=(await readJson(request)).payload
      assertEmployeePayloadId(id,payload)
      return sendJson(response,200,endEmployeeEmployment(id,{...payload,changedBy:session.employeeName}))
    }
    if (request.method === 'POST' && /^\/api\/employees\/\d+\/rehire$/.test(url.pathname)) {
      if(!canManageEmployees(session))return sendJson(response,403,{error:'没有重新入职权限'})
      const id=Number(url.pathname.split('/')[3]),payload=(await readJson(request)).payload
      assertEmployeePayloadId(id,payload)
      return sendJson(response,200,rehireEmployee(id,{...payload,changedBy:session.employeeName}))
    }
    if (request.method === 'POST' && /^\/api\/employees\/\d+\/sensitive$/.test(url.pathname)) {const id=Number(url.pathname.split('/')[3]),payload=(await readJson(request)).payload,identity=payload.field==='nationalIdNumber',allowed=identity?canViewIdentity(session):canViewPayroll(session);if(!allowed)return sendJson(response,403,{error:'没有查看该敏感资料的权限'});return sendJson(response,200,revealEmployeeField(id,payload.field,payload.reason,session,meta(request)))}
    if (request.method === 'GET' && /^\/api\/employees\/\d+\/sensitive-audit$/.test(url.pathname)) {if(session.role!=='owner_admin')return sendJson(response,403,{error:'只有Owner Admin可以查看敏感资料审计'});return sendJson(response,200,{items:sensitiveAccessLogs(Number(url.pathname.split('/')[3]))})}
    if (request.method === 'POST' && /^\/api\/employees\/\d+\/documents$/.test(url.pathname)) {if(!canViewIdentity(session))return sendJson(response,403,{error:'没有身份证件管理权限'});return sendJson(response,201,addEmployeeDocument(Number(url.pathname.split('/')[3]),(await readJson(request)).payload,session,meta(request)))}
    if (request.method === 'GET' && /^\/api\/employee-documents\/\d+$/.test(url.pathname)) {if(!canViewIdentity(session))return sendJson(response,403,{error:'没有身份证件查看权限'});const file=employeeDocumentFile(Number(url.pathname.split('/')[3]),session,url.searchParams.get('reason'),meta(request));response.writeHead(200,{'Content-Type':file.contentType,'Content-Disposition':`attachment; filename="${file.fileName}"`,'Cache-Control':'no-store, private'});return fs.createReadStream(file.absolute).pipe(response)}
    if (request.method === 'POST' && url.pathname === '/api/locations') return sendJson(response,201,createLocation((await readJson(request)).payload))
    if (request.method === 'PATCH' && /^\/api\/locations\/\d+$/.test(url.pathname)) return sendJson(response,200,updateLocation(Number(url.pathname.split('/').at(-1)),(await readJson(request)).payload))
    if (request.method === 'POST' && url.pathname === '/api/schedule-exceptions') return sendJson(response,201,createScheduleException((await readJson(request)).payload))
    if (request.method === 'GET' && url.pathname === '/api/special-requests/customer-search') return sendJson(response,200,{items:searchCustomerBranches(Object.fromEntries(url.searchParams))})
    if (request.method === 'GET' && url.pathname === '/api/special-requests') return sendJson(response,200,{items:listSpecialRequests(Object.fromEntries(url.searchParams))})
    if (request.method === 'POST' && url.pathname === '/api/special-requests') return sendJson(response,201,createSpecialRequest((await readJson(request)).payload))
    if (request.method === 'PATCH' && /^\/api\/special-requests\/\d+$/.test(url.pathname)) return sendJson(response,200,updateSpecialRequest(Number(url.pathname.split('/').at(-1)),(await readJson(request)).payload))
    if (request.method === 'POST' && /^\/api\/special-requests\/\d+\/(schedule|convert-to-existing|link-new-account)$/.test(url.pathname)) {
      const parts=url.pathname.split('/'),id=Number(parts[3]),action=parts[4],payload=(await readJson(request)).payload
      return sendJson(response,200,action==='schedule'?scheduleSpecialRequest(id,payload):action==='convert-to-existing'?convertToExisting(id,payload):linkNewAccount(id,payload))
    }
    if (request.method === 'POST' && url.pathname === '/api/temporary-locations') return sendJson(response,201,addTemporaryLocation((await readJson(request)).payload))
    if (request.method === 'GET' && url.pathname === '/api/temporary-locations') return sendJson(response,200,{items:listTemporaryLocations(Object.fromEntries(url.searchParams))})
    if (request.method === 'POST' && /^\/api\/temporary-locations\/\d+\/adopt$/.test(url.pathname)) {const payload=(await readJson(request)).payload;return sendJson(response,200,adoptTemporaryLocation(Number(url.pathname.split('/')[3]),{...payload,adoptedBy:session.employeeName}))}
    if (request.method === 'GET' && url.pathname === '/api/import-batches') return sendJson(response, 200, { items: importBatches() })
    if (request.method === 'GET' && /^\/api\/import-batches\/\d+\/errors$/.test(url.pathname)) return sendJson(response, 200, { items: importErrors(Number(url.pathname.split('/')[3])) })
    if (request.method === 'POST' && url.pathname === '/api/import/preview') return sendJson(response, 200, previewImport((await readJson(request)).payload))
    if (request.method === 'POST' && url.pathname === '/api/import/commit') return sendJson(response, 200, commitImport((await readJson(request)).payload.batchId))
    return sendJson(response, 404, { error: 'Not found' })
  } catch (error) {
    return sendJson(response, error.statusCode || (error instanceof SyntaxError ? 400 : 500), { error: error.message })
  }
})

ensureRecommendations()
server.listen(port, host, () => {
  console.log(`[KCS API] ready on http://${host}:${port}`)
  for(const url of networkUrls())console.log(`[KCS Mobile] ${url}`)
  console.log(`[KCS API] database: ${databasePath}`)
  console.log(`[KCS API] uploads: ${uploadsDir}`)
})

function shutdown() { server.close(() => process.exit(0)) }
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
