import http from 'node:http'
import crypto from 'node:crypto'
import os from 'node:os'
import fs from 'node:fs'
import path from 'node:path'
import { db, databasePath, getSystemStatus, uploadsDir } from './database.mjs'
import { getJodooIntegrationStatus, recordJodooWebhook, verifyJodooWebhookToken } from './jodoo.mjs'
import { commitImport, previewImport } from './importService.mjs'
import { customerBranchDetail, customerBranches, dashboardSummary, dataQualitySummary, importBatches, importErrors, schedules } from './queryService.mjs'
import { approveDay, assignAreaStops, assignVehicleDay, createScheduleException, createStop, createTrip, dailyApprovalCheck, deleteStop, driverToday, generateDay, generateWeek, getDispatchDay, getDispatchWeek, getStartLocationOptions, promisedCheck, publishDay, reopenDay, saveDraftAdjustments, transferVehicleDay, updateStop, updateTrip } from './dispatchService.mjs'
import { addTemporaryLocation, adoptTemporaryLocation, convertToExisting, createSpecialRequest, linkNewAccount, listSpecialRequests, listTemporaryLocations, reviewTemporaryLocation, scheduleSpecialRequest, searchCustomerBranches, updateSpecialRequest } from './specialRequestService.mjs'
import { assertEmployeePayloadId, assignAreaZone, createEmployee, createLocation, createTemporaryVehicle, createVehicle, createZoneGroup, endEmployeeEmployment, getAreaConfirmationDetail, getNextEmployeeCode, getZoneGroupMetricDetails, listResources, listZoneGroups, mergeZoneGroups, rehireEmployee, setAreasConfirmation, setZoneActive, splitZoneGroup, supervisorMoveAreasToZone, updateEmployee, updateLocation, updateVehicle, updateZoneGroup } from './resourceService.mjs'
import { addFuelRecord, addMaintenanceRecord, addTyreRecord, addUsageRecord, addVehicleDocument, getVehicleDetail, listVehicleDocuments, replaceVehicleDocument, updateVehicleCompliance, vehicleDocumentFile } from './vehicleService.mjs'
import { bulkAcceptHighConfidence, decideRecommendation, ensureRecommendations, listRecommendations, listZoneBoundaries, recalculateRecommendations, saveZoneBoundary } from './gpsRecommendationService.mjs'
import { adoptBranchGps, areaCloseout, captureBranchGps, createBranch, createCustomer, getBranch, getBuyerDetail, getCustomer, gpsCollectionDashboard, listBranches, listBuyerBranches, listBuyers, listCustomers, listGpsCollector, listMasterAudit, listOperationalLocations, saveBuyer, saveBuyerBranch, saveOperationalLocation, updateBranch, updateCustomer, withdrawBranchOfficialGps } from './customerMasterService.mjs'
import {reverseGeocodeGoogle} from './googleGeocodingService.mjs'
import { commitMasterImport, listTransferLogs, masterExport, masterTemplate, previewMasterImport } from './masterTransferService.mjs'
import { accountCan, bootstrapAccount, canViewVehicleDocuments, changePassword, createAccount, getSession, listAccounts, listAuthAudit, login, logout, setupStatus, updateAccount, updateOwnPreferences } from './authService.mjs'
import { commitGpsMigration, getGpsMigrationBatch, gpsMigrationTemplate, listGpsMigrationBatches, previewGpsMigration, resolveGpsMigrationRow } from './gpsMigrationService.mjs'
import { addEmployeeDocument, employeeDetail, employeeDocumentFile, revealEmployeeField, sensitiveAccessLogs, sensitiveEmployeeExport } from './employeeSensitiveService.mjs'
import { bulkUpdatePriceLevel, createMaterial, createPriceLevel, getMaterial, listMaterials, setPriceLevelStatus } from './materialPriceService.mjs'
import {listBranchProducts,materialIssueReport} from './materialProductService.mjs'
import {assignBranchesToOccPriceGroup,bulkTransferOccBranches,createOccPriceGroup,listOccPriceGroups,setOccPriceGroupStatus,updateOccPriceGroup} from './occPriceGroupService.mjs'
import {assignProductBranches,changeProductGroupPrice,createCategory,createProduct,deleteEntity,entityPreview,getCategory,getPriceGroup,getProduct,listCategories,mergeEntities,moveProductBranches,moveProductCategory,moveProductsCategory,previewMoveProducts,setEntityVisibility,updateCategory} from './materialCatalogService.mjs'
import {kuchingDate} from '../shared/kuchingTime.js'
import {publicError} from './errorCodes.mjs'
import {assertLocationFields} from '../shared/locationText.js'
import {configureScheduleRecurrence,getScheduleRecurrence} from './scheduleRecurrenceService.mjs'
import {arriveAtStop,completeDriverStop,completeDriverTrip,confirmInvoiceCompleted,recordNoGoods,startDriverTrip} from './driverExecutionService.mjs'
import {assertVehicleRegistrationEdit} from './vehicleRegistrationPermissions.mjs'

const port = Number(process.env.KCS_API_PORT || 8787)
const host = process.env.KCS_API_HOST || '0.0.0.0'

function sendJson(response, status, value) {
  if(status>=400&&value?.error&&!value.errorCode)value={...value,...publicError(value.error)}
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' })
  response.end(JSON.stringify(value))
}

const meta=request=>({ipAddress:request.socket.remoteAddress||null,userAgent:request.headers['user-agent']||null})
const cookies=request=>Object.fromEntries(String(request.headers.cookie||'').split(';').map(item=>item.trim().split('=').map(decodeURIComponent)).filter(item=>item.length===2))
const sessionCookie=(token,maxAge)=>`kcs_session=${encodeURIComponent(token||'')}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${process.env.KCS_HTTPS==='1'?'; Secure':''}`
const networkUrls=()=>Object.values(os.networkInterfaces()).flat().filter(item=>item&&item.family==='IPv4'&&!item.internal).map(item=>`http://${item.address}:5175`)
function permissionFor(pathname){if(pathname.startsWith('/api/mobile/'))return'mobile';if(/^\/api\/gps-collector\/branch\/[^/]+\/withdraw$/.test(pathname)||pathname==='/api/gps-collector'||/^\/api\/gps-collector\/\d+\/(adopt|review|photo)$/.test(pathname)||/^\/api\/temporary-locations\/\d+\/adopt$/.test(pathname))return'gps_review';if(pathname.startsWith('/api/gps-collection')||/^\/api\/gps-collector\/branch\/[^/]+$/.test(pathname))return'gps_capture';if(pathname.startsWith('/api/auth/accounts')||pathname==='/api/auth/audit')return'accounts';if(/^\/api\/gps-migration\/(?:batches\/\d+\/commit|rows\/\d+\/resolve)$/.test(pathname))return'gps_migration_approve';if(pathname.startsWith('/api/gps-migration'))return'gps_migration';return'desktop'}

const canManageEmployees=session=>accountCan(session,'employee_manage')
const canManageSchedules=session=>accountCan(session,'schedule_manage')||['owner_admin','supervisor'].includes(session.role)
const canManageBuyers=session=>['owner_admin','operations_admin','supervisor','office'].includes(session.role)
const canManageOperationalLocations=session=>['owner_admin','operations_admin','supervisor','office'].includes(session.role)
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
  const requestId=crypto.randomUUID()
  response.setHeader('X-Request-ID',requestId)
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
    if (request.method === 'GET' && url.pathname === '/api/auth/accounts') return sendJson(response,200,{items:listAccounts(session)})
    if (request.method === 'POST' && url.pathname === '/api/auth/accounts') return sendJson(response,201,createAccount((await readJson(request)).payload,session,meta(request)))
    if (request.method === 'PATCH' && /^\/api\/auth\/accounts\/\d+$/.test(url.pathname)) {const payload=(await readJson(request)).payload;if(Array.isArray(payload.permissions)&&session.role!=='owner_admin')return sendJson(response,403,{error:'只有Owner Admin可以授权敏感资料权限'});return sendJson(response,200,updateAccount(Number(url.pathname.split('/').at(-1)),payload,session,meta(request)))}
    if (request.method === 'GET' && url.pathname === '/api/auth/audit') return sendJson(response,200,{items:listAuthAudit(Object.fromEntries(url.searchParams))})
    if (request.method === 'GET' && url.pathname === '/api/system/network') return sendJson(response,200,{host,apiPort:port,lanUrls:networkUrls(),httpsRequiredForGps:true})
    if (request.method === 'GET' && url.pathname === '/api/mobile/today') return sendJson(response,200,driverToday({employeeId:session.employeeId,role:session.role}))
    if (request.method === 'POST' && /^\/api\/mobile\/trips\/\d+\/start$/.test(url.pathname)) return sendJson(response,200,startDriverTrip(Number(url.pathname.split('/')[4]),{employeeId:session.employeeId,role:session.role}))
    if (request.method === 'POST' && /^\/api\/mobile\/stops\/\d+\/arrive$/.test(url.pathname)) return sendJson(response,200,arriveAtStop(Number(url.pathname.split('/')[4]),(await readJson(request)).payload,{employeeId:session.employeeId,role:session.role}))
    if (request.method === 'POST' && /^\/api\/mobile\/stops\/\d+\/invoice-confirm$/.test(url.pathname)) return sendJson(response,200,confirmInvoiceCompleted(Number(url.pathname.split('/')[4]),(await readJson(request)).payload,{employeeId:session.employeeId,role:session.role}))
    if (request.method === 'POST' && /^\/api\/mobile\/stops\/\d+\/complete$/.test(url.pathname)) return sendJson(response,200,completeDriverStop(Number(url.pathname.split('/')[4]),{employeeId:session.employeeId,role:session.role}))
    if (request.method === 'POST' && /^\/api\/mobile\/stops\/\d+\/no-goods$/.test(url.pathname)) return sendJson(response,200,recordNoGoods(Number(url.pathname.split('/')[4]),(await readJson(request)).payload,{employeeId:session.employeeId,role:session.role},db,{uploadsRoot:uploadsDir}))
    if (request.method === 'POST' && /^\/api\/mobile\/trips\/\d+\/complete$/.test(url.pathname)) return sendJson(response,200,completeDriverTrip(Number(url.pathname.split('/')[4]),{employeeId:session.employeeId,role:session.role}))
    if (request.method === 'GET' && /^\/api\/driver-no-goods\/\d+\/photo$/.test(url.pathname)) {const proof=db.prepare(`SELECT p.storage_key,p.content_type,d.driver_id FROM driver_no_goods_proofs p JOIN dispatch_trips t ON t.id=p.dispatch_trip_id JOIN dispatches d ON d.id=t.dispatch_id WHERE p.id=?`).get(Number(url.pathname.split('/')[3]));if(!proof)return sendJson(response,404,{error:'No Goods proof not found'});const privileged=['owner','owner_admin','supervisor','dispatcher'].includes(String(session.role).toLowerCase()),own=Number(proof.driver_id)===Number(session.employeeId);if(!privileged&&!own)return sendJson(response,403,{error:'You do not have permission to view this proof.'});const file=path.resolve(uploadsDir,proof.storage_key),root=path.resolve(uploadsDir)+path.sep;if(!file.startsWith(root)||!fs.existsSync(file))return sendJson(response,404,{error:'No Goods proof not found'});response.writeHead(200,{'Content-Type':proof.content_type,'Cache-Control':'private, no-store'});return fs.createReadStream(file).pipe(response)}
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
    if (request.method === 'GET' && url.pathname === '/api/materials') return sendJson(response,200,{items:listMaterials({includeInactive:url.searchParams.get('includeInactive')==='true'})})
    if (request.method === 'GET' && url.pathname === '/api/material-categories') return sendJson(response,200,listCategories())
    if (request.method === 'POST' && url.pathname === '/api/material-categories') {if(!accountCan(session,'price_manage'))return sendJson(response,403,{error:'Material management permission is required.'});return sendJson(response,201,createCategory({...((await readJson(request)).payload),changedBy:session.employeeName}))}
    if (request.method === 'POST' && /^\/api\/material-categories\/\d+\/products$/.test(url.pathname)) {if(!accountCan(session,'price_manage'))return sendJson(response,403,{error:'Material management permission is required.'});const categoryId=Number(url.pathname.split('/')[3]),payload=(await readJson(request)).payload;return sendJson(response,201,createProduct(categoryId,{...payload,changedBy:session.employeeName}))}
    if (request.method === 'GET' && /^\/api\/material-categories\/\d+$/.test(url.pathname)) return sendJson(response,200,getCategory(Number(url.pathname.split('/').at(-1))))
    if (request.method === 'PATCH' && /^\/api\/material-categories\/\d+$/.test(url.pathname)) {if(!accountCan(session,'price_manage'))return sendJson(response,403,{error:'Material management permission is required.'});return sendJson(response,200,updateCategory(Number(url.pathname.split('/').at(-1)),{...((await readJson(request)).payload),changedBy:session.employeeName}))}
    if (request.method === 'POST' && url.pathname === '/api/material-categories/move-products/preview') {if(!accountCan(session,'price_manage'))return sendJson(response,403,{error:'Material management permission is required.'});const payload=(await readJson(request)).payload;return sendJson(response,200,previewMoveProducts(payload.sourceCategoryId,payload.targetCategoryId,payload.productIds))}
    if (request.method === 'POST' && url.pathname === '/api/material-categories/move-products') {if(!accountCan(session,'price_manage'))return sendJson(response,403,{error:'Material management permission is required.'});const payload=(await readJson(request)).payload;return sendJson(response,200,moveProductsCategory(payload.sourceCategoryId,payload.targetCategoryId,payload.productIds,{...payload,changedBy:session.employeeName}))}
    if (request.method === 'GET' && /^\/api\/material-products\/\d+$/.test(url.pathname)) return sendJson(response,200,getProduct(Number(url.pathname.split('/').at(-1))))
    if (request.method === 'PATCH' && /^\/api\/material-products\/\d+\/category$/.test(url.pathname)) {if(!accountCan(session,'price_manage'))return sendJson(response,403,{error:'Material management permission is required.'});const payload=(await readJson(request)).payload;return sendJson(response,200,moveProductCategory(Number(url.pathname.split('/')[3]),Number(payload.categoryId),{...payload,changedBy:session.employeeName}))}
    if (request.method === 'GET' && /^\/api\/product-price-groups\/\d+$/.test(url.pathname)) return sendJson(response,200,getPriceGroup(Number(url.pathname.split('/').at(-1))))
    if (request.method === 'POST' && url.pathname === '/api/product-price-groups/move-branches') {if(!accountCan(session,'price_manage'))return sendJson(response,403,{error:'Price management permission is required.'});const payload=(await readJson(request)).payload;return sendJson(response,200,moveProductBranches(payload.sourcePriceLevelId,payload.targetPriceLevelId,payload.branchIds,{...payload,changedBy:session.employeeName}))}
    if (request.method === 'POST' && /^\/api\/product-price-groups\/\d+\/assign-branches$/.test(url.pathname)) {if(!accountCan(session,'price_manage'))return sendJson(response,403,{error:'Price management permission is required.'});const payload=(await readJson(request)).payload;return sendJson(response,200,assignProductBranches(Number(url.pathname.split('/')[3]),payload.branchIds,{...payload,changedBy:session.employeeName}))}
    if (request.method === 'PATCH' && /^\/api\/product-price-groups\/\d+\/price$/.test(url.pathname)) {if(!accountCan(session,'price_manage'))return sendJson(response,403,{error:'Price management permission is required.'});const payload=(await readJson(request)).payload;return sendJson(response,200,changeProductGroupPrice(Number(url.pathname.split('/')[3]),{...payload,changedBy:session.employeeName}))}
    if (request.method === 'POST' && /^\/api\/material-management\/(category|product|priceGroup)\/\d+\/(archive|hide)$/.test(url.pathname)) {if(!accountCan(session,'price_manage'))return sendJson(response,403,{error:'Material management permission is required.'});const parts=url.pathname.split('/'),payload=(await readJson(request)).payload;return sendJson(response,200,setEntityVisibility(parts[3],Number(parts[4]),parts[5],{...payload,changedBy:session.employeeName}))}
    if (request.method === 'GET' && /^\/api\/material-management\/(category|product|priceGroup)\/\d+\/preview$/.test(url.pathname)) {const parts=url.pathname.split('/');return sendJson(response,200,entityPreview(parts[3],Number(parts[4])))}
    if (request.method === 'DELETE' && /^\/api\/material-management\/(category|product|priceGroup)\/\d+$/.test(url.pathname)) {if(!accountCan(session,'price_manage'))return sendJson(response,403,{error:'Material management permission is required.'});const parts=url.pathname.split('/'),payload=(await readJson(request)).payload;return sendJson(response,200,deleteEntity(parts[3],Number(parts[4]),{...payload,changedBy:session.employeeName}))}
    if (request.method === 'POST' && url.pathname === '/api/material-management/merge') {if(!accountCan(session,'price_manage'))return sendJson(response,403,{error:'Material management permission is required.'});const payload=(await readJson(request)).payload;return sendJson(response,200,mergeEntities(payload.entityType,Number(payload.sourceId),Number(payload.targetId),{...payload,changedBy:session.employeeName}))}
    if (request.method === 'GET' && url.pathname === '/api/material-issues') return sendJson(response,200,materialIssueReport(db))
    if (request.method === 'GET' && /^\/api\/branch-products\/[^/]+$/.test(url.pathname)) return sendJson(response,200,{items:listBranchProducts(decodeURIComponent(url.pathname.split('/').at(-1)),db)})
    if (request.method === 'GET' && /^\/api\/materials\/\d+$/.test(url.pathname)) {const item=getMaterial(Number(url.pathname.split('/').at(-1)));return item?sendJson(response,200,item):sendJson(response,404,{error:'Material not found'})}
    if (request.method === 'POST' && url.pathname === '/api/materials') {if(!accountCan(session,'price_manage'))return sendJson(response,403,{error:'没有 Material 管理权限'});return sendJson(response,201,createMaterial((await readJson(request)).payload))}
    if (request.method === 'POST' && /^\/api\/materials\/\d+\/price-levels$/.test(url.pathname)) {if(!accountCan(session,'price_manage'))return sendJson(response,403,{error:'没有 Price Level 管理权限'});return sendJson(response,201,createPriceLevel(Number(url.pathname.split('/')[3]),(await readJson(request)).payload))}
    if (request.method === 'PATCH' && /^\/api\/price-levels\/\d+\/status$/.test(url.pathname)) {if(!accountCan(session,'price_manage'))return sendJson(response,403,{error:'没有 Price Level 管理权限'});const payload=(await readJson(request)).payload;return sendJson(response,200,setPriceLevelStatus(Number(url.pathname.split('/')[3]),payload.status,payload))}
    if (request.method === 'POST' && /^\/api\/price-levels\/\d+\/bulk-update$/.test(url.pathname)) {if(!accountCan(session,'price_manage'))return sendJson(response,403,{error:'没有批量调价权限'});return sendJson(response,200,bulkUpdatePriceLevel(Number(url.pathname.split('/')[3]),(await readJson(request)).payload))}
    if (request.method === 'GET' && url.pathname === '/api/occ-price-groups') return sendJson(response,200,listOccPriceGroups())
    if (request.method === 'POST' && url.pathname === '/api/occ-price-groups') {if(!accountCan(session,'price_manage'))return sendJson(response,403,{error:'没有OCC价格组管理权限'});return sendJson(response,201,createOccPriceGroup({...((await readJson(request)).payload),changedBy:session.employeeName}))}
    if (request.method === 'PATCH' && /^\/api\/occ-price-groups\/\d+\/status$/.test(url.pathname)) {if(!accountCan(session,'price_manage'))return sendJson(response,403,{error:'没有OCC价格组管理权限'});const payload=(await readJson(request)).payload;return sendJson(response,200,setOccPriceGroupStatus(Number(url.pathname.split('/')[3]),payload.status,payload))}
    if (request.method === 'PATCH' && /^\/api\/occ-price-groups\/\d+\/price$/.test(url.pathname)) {if(!accountCan(session,'price_manage'))return sendJson(response,403,{error:'没有OCC价格组管理权限'});const payload=(await readJson(request)).payload;return sendJson(response,200,updateOccPriceGroup(Number(url.pathname.split('/')[3]),{...payload,changedBy:session.employeeName}))}
    if (request.method === 'POST' && /^\/api\/occ-price-groups\/\d+\/assign$/.test(url.pathname)) {if(!accountCan(session,'price_manage'))return sendJson(response,403,{error:'没有OCC价格组管理权限'});const payload=(await readJson(request)).payload;return sendJson(response,200,assignBranchesToOccPriceGroup(Number(url.pathname.split('/')[3]),payload.branchIds,payload))}
    if (request.method === 'POST' && url.pathname === '/api/occ-price-groups/bulk-transfer') {if(!accountCan(session,'price_manage'))return sendJson(response,403,{error:'没有OCC批量转移权限'});const payload=(await readJson(request)).payload;request.kcsDiagnostic={operation:'occ_bulk_transfer',sourceGroupId:Number(payload.sourceGroupId)||null,targetGroupId:Number(payload.targetGroupId)||null,branchCount:Array.isArray(payload.branchIds)?payload.branchIds.length:0};return sendJson(response,200,bulkTransferOccBranches(payload.sourceGroupId,payload.targetGroupId,payload.branchIds,{...payload,changedBy:session.employeeName}))}
    if (request.method === 'GET' && url.pathname === '/api/master/area-closeout') return sendJson(response,200,areaCloseout())
    if (request.method === 'GET' && url.pathname === '/api/master/audit') return sendJson(response,200,{items:listMasterAudit(Object.fromEntries(url.searchParams))})
    if (request.method === 'GET' && url.pathname === '/api/customers') return sendJson(response,200,listCustomers(Object.fromEntries(url.searchParams)))
    if (request.method === 'POST' && url.pathname === '/api/customers') {const payload=(await readJson(request)).payload;if((Array.isArray(payload.materialPricing)&&payload.materialPricing.length||Array.isArray(payload.removedMaterialIds)&&payload.removedMaterialIds.length)&&!accountCan(session,'price_manage'))return sendJson(response,403,{error:'没有 Customer Pricing 管理权限'});return sendJson(response,201,createCustomer(payload))}
    if (request.method === 'GET' && /^\/api\/customers\/[^/]+$/.test(url.pathname)) {const item=getCustomer(decodeURIComponent(url.pathname.split('/').at(-1)));return item?sendJson(response,200,item):sendJson(response,404,{error:'Customer not found'})}
    if (request.method === 'PATCH' && /^\/api\/customers\/[^/]+$/.test(url.pathname)) {const payload=(await readJson(request)).payload;if((Array.isArray(payload.materialPricing)||Array.isArray(payload.removedMaterialIds))&&!accountCan(session,'price_manage'))return sendJson(response,403,{error:'没有 Customer Pricing 管理权限'});return sendJson(response,200,updateCustomer(decodeURIComponent(url.pathname.split('/').at(-1)),payload))}
    if (request.method === 'GET' && url.pathname === '/api/master/branches') return sendJson(response,200,listBranches(Object.fromEntries(url.searchParams)))
    if (request.method === 'POST' && url.pathname === '/api/master/branches') {const payload=(await readJson(request)).payload;if(payload.occPriceGroupId&&!accountCan(session,'price_manage'))return sendJson(response,403,{error:'没有OCC价格组管理权限'});const branch=createBranch(payload);if(payload.occPriceGroupId)assignBranchesToOccPriceGroup(Number(payload.occPriceGroupId),[branch.internalId],{reason:payload.reason||'Branch OCC Price Group assignment',changedBy:session.employeeName});return sendJson(response,201,getBranch(branch.branchId))}
    if (request.method === 'GET' && /^\/api\/master\/branches\/[^/]+$/.test(url.pathname)) {const item=getBranch(decodeURIComponent(url.pathname.split('/').at(-1)));return item?sendJson(response,200,item):sendJson(response,404,{error:'Branch not found'})}
    if (request.method === 'PATCH' && /^\/api\/master\/branches\/[^/]+$/.test(url.pathname)) {const payload=(await readJson(request)).payload;if(payload.occPriceGroupId&&!accountCan(session,'price_manage'))return sendJson(response,403,{error:'没有OCC价格组管理权限'});const branchId=decodeURIComponent(url.pathname.split('/').at(-1)),branch=updateBranch(branchId,payload);if(payload.occPriceGroupId)assignBranchesToOccPriceGroup(Number(payload.occPriceGroupId),[branch.internalId],{reason:payload.reason||'Branch OCC Price Group assignment',changedBy:session.employeeName});return sendJson(response,200,getBranch(branchId))}
    if (request.method === 'GET' && url.pathname === '/api/gps-collection/branches') return sendJson(response,200,gpsCollectionDashboard(Object.fromEntries(url.searchParams)))
    if (request.method === 'GET' && url.pathname === '/api/gps-collection/reverse-geocode') return sendJson(response,200,await reverseGeocodeGoogle(url.searchParams.get('latitude'),url.searchParams.get('longitude')))
    if (request.method === 'GET' && url.pathname === '/api/gps-collector') return sendJson(response,200,{items:listGpsCollector(Object.fromEntries(url.searchParams))})
    if (request.method === 'GET' && /^\/api\/gps-collector\/\d+\/photo$/.test(url.pathname)) {const item=db.prepare('SELECT photo_storage_key,photo_content_type FROM temporary_locations WHERE id=?').get(Number(url.pathname.split('/')[3]));if(!item?.photo_storage_key)return sendJson(response,404,{error:'GPS photo not found'});const file=path.resolve(uploadsDir,item.photo_storage_key),root=path.resolve(uploadsDir)+path.sep;if(!file.startsWith(root)||!fs.existsSync(file))return sendJson(response,404,{error:'GPS photo not found'});response.writeHead(200,{'Content-Type':item.photo_content_type||'application/octet-stream','Cache-Control':'private, max-age=60'});return fs.createReadStream(file).pipe(response)}
    if (request.method === 'POST' && /^\/api\/gps-collector\/branch\/[^/]+$/.test(url.pathname)) {const payload=(await readJson(request)).payload;if(['driver','crew'].includes(session.role)&&!payload.photo?.dataUrl)throw new Error('司机或跟车员采集 GPS 必须上传现场照片');return sendJson(response,201,captureBranchGps(decodeURIComponent(url.pathname.split('/').at(-1)),{...payload,employeeId:session.employeeId,capturedBy:session.employeeName,changedBy:session.employeeName}))}
    if (request.method === 'POST' && /^\/api\/gps-collector\/branch\/[^/]+\/withdraw$/.test(url.pathname)) {const payload=(await readJson(request)).payload;return sendJson(response,200,withdrawBranchOfficialGps(decodeURIComponent(url.pathname.split('/')[4]),{...payload,changedBy:session.employeeName}))}
    if (request.method === 'POST' && /^\/api\/gps-collector\/\d+\/adopt$/.test(url.pathname)) {const payload=(await readJson(request)).payload;return sendJson(response,200,adoptBranchGps(Number(url.pathname.split('/')[3]),{...payload,adoptedBy:session.employeeName,adoptedByAccountId:session.id,changedBy:session.employeeName}))}
    if (request.method === 'POST' && /^\/api\/gps-collector\/\d+\/review$/.test(url.pathname)) {const payload=(await readJson(request)).payload;return sendJson(response,200,reviewTemporaryLocation(Number(url.pathname.split('/')[3]),{...payload,reviewedBy:session.employeeName,reviewedByAccountId:session.id}))}
    if (url.pathname.startsWith('/api/buyers')||url.pathname.startsWith('/api/buyer-branches'))if(!canManageBuyers(session))return sendJson(response,403,{error:'Buyer Master permission is required'})
    if (request.method === 'GET' && url.pathname === '/api/buyers') return sendJson(response,200,{items:listBuyers(Object.fromEntries(url.searchParams))})
    if (request.method === 'GET' && /^\/api\/buyers\/\d+$/.test(url.pathname)) return sendJson(response,200,getBuyerDetail(Number(url.pathname.split('/').at(-1))))
    if (request.method === 'POST' && url.pathname === '/api/buyers') {const payload=(await readJson(request)).payload;assertLocationFields(payload,['locationName','address']);return sendJson(response,201,saveBuyer(payload))}
    if (request.method === 'PATCH' && /^\/api\/buyers\/\d+$/.test(url.pathname)) {const payload=(await readJson(request)).payload;if(Object.hasOwn(payload,'buyerId')||Object.hasOwn(payload,'id'))return sendJson(response,400,{error:'Buyer ID is system generated and cannot be changed'});assertLocationFields(payload,['locationName','address']);return sendJson(response,200,saveBuyer(payload,Number(url.pathname.split('/').at(-1))))}
    if (request.method === 'GET' && /^\/api\/buyers\/\d+\/branches$/.test(url.pathname)) return sendJson(response,200,{items:listBuyerBranches({buyerId:Number(url.pathname.split('/')[3]),...Object.fromEntries(url.searchParams)})})
    if (request.method === 'POST' && /^\/api\/buyers\/\d+\/branches$/.test(url.pathname)) {const payload=(await readJson(request)).payload;assertLocationFields(payload,['branchName','address']);return sendJson(response,201,saveBuyerBranch({...payload,parentBuyerId:Number(url.pathname.split('/')[3])}))}
    if (request.method === 'PATCH' && /^\/api\/buyer-branches\/\d+$/.test(url.pathname)) {const payload=(await readJson(request)).payload;for(const key of ['id','buyerBranchId','locationId','buyerId','parentBuyerId'])if(Object.hasOwn(payload,key))return sendJson(response,400,{error:'Buyer Branch ID and parent Buyer cannot be changed'});assertLocationFields(payload,['branchName','address']);return sendJson(response,200,saveBuyerBranch(payload,Number(url.pathname.split('/').at(-1))))}
    if (request.method === 'GET' && url.pathname === '/api/operational-locations') return sendJson(response,200,{items:listOperationalLocations(Object.fromEntries(url.searchParams))})
    if (request.method === 'POST' && url.pathname === '/api/operational-locations') {if(!canManageOperationalLocations(session))return sendJson(response,403,{error:'Operational Location management permission is required'});const payload=(await readJson(request)).payload;assertLocationFields(payload,['name','address']);return sendJson(response,201,saveOperationalLocation({...payload,changedBy:session.employeeName}))}
    if (request.method === 'PATCH' && /^\/api\/operational-locations\/\d+$/.test(url.pathname)) {if(!canManageOperationalLocations(session))return sendJson(response,403,{error:'Operational Location management permission is required'});const payload=(await readJson(request)).payload;assertLocationFields(payload,['name','address']);return sendJson(response,200,saveOperationalLocation({...payload,changedBy:session.employeeName},Number(url.pathname.split('/').at(-1))))}
    if (request.method === 'GET' && /^\/api\/master-transfer\/[^/]+\/template$/.test(url.pathname)) {const module=url.pathname.split('/')[3];if(module==='employee'&&!canManageEmployees(session))return sendJson(response,403,{error:'没有 Employee 导入权限'});return sendJson(response,200,masterTemplate(module))}
    if (request.method === 'GET' && /^\/api\/master-transfer\/[^/]+\/export$/.test(url.pathname)) return sendJson(response,200,masterExport(url.pathname.split('/')[3],{...Object.fromEntries(url.searchParams),changedBy:session.employeeName}))
    if (request.method === 'GET' && url.pathname === '/api/master-transfer/logs') return sendJson(response,200,{items:listTransferLogs()})
    if (request.method === 'POST' && url.pathname === '/api/master-transfer/preview') {const payload=(await readJson(request)).payload;if(payload.module==='employee'&&!canManageEmployees(session))return sendJson(response,403,{error:'没有 Employee 导入权限'});return sendJson(response,200,previewMasterImport(payload))}
    if (request.method === 'POST' && url.pathname === '/api/master-transfer/commit') {const payload=(await readJson(request)).payload;const batch=db.prepare('SELECT source FROM import_batches WHERE id=?').get(payload.batchId);if(batch?.source==='kcs_master_employee'&&!canManageEmployees(session))return sendJson(response,403,{error:'没有 Employee 导入权限'});return sendJson(response,200,commitMasterImport(payload.batchId,{...payload,changedBy:session.employeeName}))}
    if (request.method === 'GET' && url.pathname === '/api/customer-branches') return sendJson(response, 200, customerBranches(Object.fromEntries(url.searchParams)))
    if (request.method === 'GET' && url.pathname.startsWith('/api/customer-branches/')) {
      const item = customerBranchDetail(decodeURIComponent(url.pathname.slice('/api/customer-branches/'.length)))
      return item ? sendJson(response, 200, item) : sendJson(response, 404, { error: 'Branch not found' })
    }
    if (request.method === 'GET' && url.pathname === '/api/schedules') return sendJson(response, 200, schedules(Object.fromEntries(url.searchParams)))
    if (request.method === 'GET' && url.pathname === '/api/data-quality/summary') return sendJson(response, 200, dataQualitySummary())
    if (request.method === 'GET' && url.pathname === '/api/dispatch/week') return sendJson(response, 200, getDispatchWeek(Object.fromEntries(url.searchParams)))
    if (request.method === 'GET' && url.pathname === '/api/dispatch/start-location-options') {if(!canManageSchedules(session))return sendJson(response,403,{error:'Schedule management permission is required.'});const driverId=Number(url.searchParams.get('driverId'))||null,includeEmployeeHome=canManageEmployees(session);return sendJson(response,200,getStartLocationOptions({driverId,includeEmployeeHome}))}
    if (request.method === 'GET' && /^\/api\/schedules\/\d+\/recurrence$/.test(url.pathname)) return sendJson(response,200,getScheduleRecurrence(Number(url.pathname.split('/')[3])))
    if (request.method === 'PATCH' && /^\/api\/schedules\/\d+\/recurrence$/.test(url.pathname)) {if(!canManageSchedules(session))return sendJson(response,403,{error:'Schedule management permission is required.'});return sendJson(response,200,configureScheduleRecurrence(Number(url.pathname.split('/')[3]),{...((await readJson(request)).payload),changedBy:session.employeeName}))}
    if (request.method === 'POST' && url.pathname === '/api/dispatch/generate-week') {if(!canManageSchedules(session))return sendJson(response,403,{error:'Schedule management permission is required.'});return sendJson(response,200,generateWeek({...((await readJson(request)).payload),generatedBy:session.employeeName}))}
    if (request.method === 'POST' && url.pathname === '/api/dispatch/generate-day') {if(!canManageSchedules(session))return sendJson(response,403,{error:'Schedule management permission is required.'});return sendJson(response,200,generateDay({...((await readJson(request)).payload),generatedBy:session.employeeName}))}
    if (request.method === 'POST' && url.pathname === '/api/dispatch/draft-adjustments') {if(!canManageSchedules(session))return sendJson(response,403,{error:'Schedule management permission is required.'});return sendJson(response,200,saveDraftAdjustments({...((await readJson(request)).payload),changedBy:session.employeeName}))}
    if (request.method === 'GET' && /^\/api\/dispatch\/day\/[^/]+\/approval-check$/.test(url.pathname)) {if(!canManageSchedules(session))return sendJson(response,403,{error:'Schedule management permission is required.'});return sendJson(response,200,dailyApprovalCheck(decodeURIComponent(url.pathname.split('/')[4])))}
    if (request.method === 'GET' && url.pathname.startsWith('/api/dispatch/day/')) {
      const item=getDispatchDay(decodeURIComponent(url.pathname.slice('/api/dispatch/day/'.length)))
      return item?sendJson(response,200,item):sendJson(response,404,{error:'Dispatch day not found'})
    }
    if (request.method === 'POST' && /^\/api\/dispatch\/day\/[^/]+\/(approve|publish|reopen)$/.test(url.pathname)) {
      const parts=url.pathname.split('/'),date=decodeURIComponent(parts[4]),action=parts[5],payload=(await readJson(request)).payload
      if(['approve','reopen'].includes(action)&&!canManageSchedules(session))return sendJson(response,403,{error:'Schedule management permission is required.'})
      return sendJson(response,200,action==='approve'?approveDay(date,payload):action==='publish'?publishDay(date,payload):reopenDay(date,payload))
    }
    if (request.method === 'GET' && url.pathname.startsWith('/api/dispatch/promised-check/')) return sendJson(response,200,promisedCheck(decodeURIComponent(url.pathname.slice('/api/dispatch/promised-check/'.length))))
    if (request.method === 'GET' && url.pathname === '/api/driver/today') return sendJson(response,200,driverToday({employeeId:session.employeeId,role:session.role}))
    if (request.method === 'POST' && url.pathname === '/api/dispatch/stops') {if(!canManageSchedules(session))return sendJson(response,403,{error:'Schedule management permission is required.'});return sendJson(response,201,createStop((await readJson(request)).payload))}
    if (request.method === 'POST' && url.pathname === '/api/dispatch/trips') {if(!canManageSchedules(session))return sendJson(response,403,{error:'Schedule management permission is required.'});return sendJson(response,201,createTrip((await readJson(request)).payload))}
    if (request.method === 'PATCH' && /^\/api\/dispatch\/stops\/\d+$/.test(url.pathname)) {if(!canManageSchedules(session))return sendJson(response,403,{error:'Schedule management permission is required.'});return sendJson(response,200,updateStop(Number(url.pathname.split('/').at(-1)),(await readJson(request)).payload))}
    if (request.method === 'DELETE' && /^\/api\/dispatch\/stops\/\d+$/.test(url.pathname)) {if(!canManageSchedules(session))return sendJson(response,403,{error:'Schedule management permission is required.'});return sendJson(response,200,deleteStop(Number(url.pathname.split('/').at(-1)),(await readJson(request)).payload))}
    if (request.method === 'PATCH' && /^\/api\/dispatch\/trips\/\d+$/.test(url.pathname)) {if(!canManageSchedules(session))return sendJson(response,403,{error:'Schedule management permission is required.'});const payload=(await readJson(request)).payload;return sendJson(response,200,updateTrip(Number(url.pathname.split('/').at(-1)),{...payload,changedBy:session.employeeName,canViewEmployeeHome:canManageEmployees(session)}))}
    if (request.method === 'PATCH' && /^\/api\/dispatch\/day\/[^/]+\/vehicle\/\d+$/.test(url.pathname)) {if(!canManageSchedules(session))return sendJson(response,403,{error:'Schedule management permission is required.'});const parts=url.pathname.split('/'),payload=(await readJson(request)).payload;return sendJson(response,200,assignVehicleDay(decodeURIComponent(parts[4]),Number(parts[6]),{...payload,changedBy:session.employeeName,canViewEmployeeHome:canManageEmployees(session)}))}
    if (request.method === 'POST' && /^\/api\/dispatch\/day\/[^/]+\/vehicle\/\d+\/transfer$/.test(url.pathname)) {const parts=url.pathname.split('/');return sendJson(response,200,transferVehicleDay(decodeURIComponent(parts[4]),Number(parts[6]),(await readJson(request)).payload))}
    if (request.method === 'POST' && /^\/api\/dispatch\/day\/[^/]+\/assign-area$/.test(url.pathname)) {const parts=url.pathname.split('/');return sendJson(response,200,assignAreaStops(decodeURIComponent(parts[4]),(await readJson(request)).payload))}
    if (request.method === 'GET' && url.pathname === '/api/resources') return sendJson(response,200,listResources())
    if (request.method === 'GET' && url.pathname === '/api/zone-groups') return sendJson(response,200,listZoneGroups())
    if (request.method === 'GET' && /^\/api\/zone-groups\/\d+\/metric-details$/.test(url.pathname)) return sendJson(response,200,getZoneGroupMetricDetails(Number(url.pathname.split('/')[3]),Object.fromEntries(url.searchParams)))
    if (request.method === 'GET' && url.pathname === '/api/zone-boundaries') return sendJson(response,200,listZoneBoundaries({includeHistory:url.searchParams.get('history')==='true'}))
    if (request.method === 'POST' && /^\/api\/zone-groups\/\d+\/boundaries$/.test(url.pathname)) return sendJson(response,201,saveZoneBoundary(Number(url.pathname.split('/')[3]),(await readJson(request)).payload))
    if (request.method === 'GET' && url.pathname === '/api/gps-zone-recommendations') return sendJson(response,200,listRecommendations(Object.fromEntries(url.searchParams)))
    if (request.method === 'POST' && url.pathname === '/api/gps-zone-recommendations/recalculate') {if(!accountCan(session,'gps_review'))return sendJson(response,403,{error:'没有GPS审批权限'});return sendJson(response,200,recalculateRecommendations({...((await readJson(request)).payload),changedBy:session.employeeName}))}
    if (request.method === 'POST' && url.pathname === '/api/gps-zone-recommendations/bulk-confirm-high') {if(!accountCan(session,'gps_review'))return sendJson(response,403,{error:'没有GPS审批权限'});return sendJson(response,200,bulkAcceptHighConfidence({...((await readJson(request)).payload),confirmedBy:session.employeeName}))}
    if (request.method === 'POST' && /^\/api\/gps-zone-recommendations\/\d+\/decision$/.test(url.pathname)) {if(!accountCan(session,'gps_review'))return sendJson(response,403,{error:'没有GPS审批权限'});return sendJson(response,200,decideRecommendation(Number(url.pathname.split('/')[3]),{...((await readJson(request)).payload),confirmedBy:session.employeeName}))}
    if (request.method === 'POST' && url.pathname === '/api/zone-groups') return sendJson(response,201,createZoneGroup((await readJson(request)).payload))
    if (request.method === 'POST' && url.pathname === '/api/zone-groups/merge') return sendJson(response,200,mergeZoneGroups((await readJson(request)).payload))
    if (request.method === 'POST' && url.pathname === '/api/zone-groups/split') return sendJson(response,201,splitZoneGroup((await readJson(request)).payload))
    if (request.method === 'POST' && /^\/api\/zone-groups\/\d+\/(deactivate|reactivate)$/.test(url.pathname)) {const parts=url.pathname.split('/'),payload=(await readJson(request)).payload;return sendJson(response,200,setZoneActive(Number(parts[3]),parts[4]==='reactivate',payload))}
    if (request.method === 'PATCH' && /^\/api\/zone-groups\/\d+$/.test(url.pathname)) return sendJson(response,200,updateZoneGroup(Number(url.pathname.split('/').at(-1)),(await readJson(request)).payload))
    if (request.method === 'GET' && /^\/api\/areas\/\d+\/zone-confirmation$/.test(url.pathname)) return sendJson(response,200,getAreaConfirmationDetail(Number(url.pathname.split('/')[3])))
    if (request.method === 'POST' && url.pathname === '/api/areas/bulk-zone-group') {
      if(!canManageSchedules(session))return sendJson(response,403,{error:'You do not have permission to move Areas'})
      const payload=(await readJson(request)).payload
      return sendJson(response,200,{items:supervisorMoveAreasToZone(payload.areaIds,Number(payload.zoneGroupId),{...payload,actorRole:'supervisor',changedBy:session.employeeName})})
    }
    if (request.method === 'POST' && url.pathname === '/api/areas/bulk-confirmation') {
      if(!canManageSchedules(session))return sendJson(response,403,{error:'You do not have permission to confirm Areas'})
      const payload=(await readJson(request)).payload
      return sendJson(response,200,{items:setAreasConfirmation(payload.areaIds,payload.confirmed!==false,{...payload,changedBy:session.employeeName})})
    }
    if (request.method === 'PATCH' && /^\/api\/areas\/\d+\/zone-group$/.test(url.pathname)) {const parts=url.pathname.split('/'),payload=(await readJson(request)).payload;return sendJson(response,200,assignAreaZone(Number(parts[3]),Number(payload.zoneGroupId),payload))}
    if (request.method === 'POST' && url.pathname === '/api/vehicles') {if(!accountCan(session,'vehicle_manage'))return sendJson(response,403,{error:'Vehicle management permission is required'});return sendJson(response,201,createVehicle({...((await readJson(request)).payload),changedBy:session.employeeName}))}
    if (request.method === 'POST' && url.pathname === '/api/vehicles/temporary') {if(!accountCan(session,'vehicle_manage'))return sendJson(response,403,{error:'Vehicle management permission is required'});return sendJson(response,201,createTemporaryVehicle((await readJson(request)).payload))}
    if (request.method === 'GET' && /^\/api\/vehicles\/\d+\/documents$/.test(url.pathname)) {if(!canViewVehicleDocuments(session))return sendJson(response,403,{error:'Vehicle document access is restricted to office administrators'});return sendJson(response,200,{items:listVehicleDocuments(Number(url.pathname.split('/')[3]))})}
    if (request.method === 'GET' && /^\/api\/vehicle-documents\/\d+\/(preview|download)$/.test(url.pathname)) {if(!canViewVehicleDocuments(session))return sendJson(response,403,{error:'Vehicle document access is restricted to office administrators'});const parts=url.pathname.split('/'),file=vehicleDocumentFile(Number(parts[3])),download=parts[4]==='download',safeName=String(file.originalName).replace(/["\r\n]/g,'_');response.writeHead(200,{'Content-Type':file.contentType,'Content-Length':file.buffer.length,'Content-Disposition':`${download?'attachment':'inline'}; filename="${safeName}"`,'X-Content-Type-Options':'nosniff','Cache-Control':'private, no-store'});return response.end(file.buffer)}
    if (request.method === 'POST' && /^\/api\/vehicles\/\d+\/documents$/.test(url.pathname)) {if(!accountCan(session,'vehicle_manage'))return sendJson(response,403,{error:'Vehicle management permission is required'});return sendJson(response,201,addVehicleDocument(Number(url.pathname.split('/')[3]),(await readJson(request)).payload,session))}
    if (request.method === 'POST' && /^\/api\/vehicle-documents\/\d+\/replace$/.test(url.pathname)) {if(!accountCan(session,'vehicle_manage'))return sendJson(response,403,{error:'Vehicle management permission is required'});return sendJson(response,201,replaceVehicleDocument(Number(url.pathname.split('/')[3]),(await readJson(request)).payload,session))}
    if (request.method === 'GET' && /^\/api\/vehicles\/\d+$/.test(url.pathname)) return sendJson(response,200,getVehicleDetail(Number(url.pathname.split('/').at(-1)),db,{includeDocuments:canViewVehicleDocuments(session)}))
    if (request.method === 'PATCH' && /^\/api\/vehicles\/\d+$/.test(url.pathname)) {const payload=(await readJson(request)).payload;assertVehicleRegistrationEdit(session,payload);if(!accountCan(session,'vehicle_manage'))return sendJson(response,403,{error:'Vehicle management permission is required'});return sendJson(response,200,updateVehicle(Number(url.pathname.split('/').at(-1)),{...payload,changedBy:session.employeeName}))}
    if (request.method === 'POST' && /^\/api\/vehicles\/\d+\/(compliance|maintenance|fuel|tyres|usage)$/.test(url.pathname)) {if(!accountCan(session,'vehicle_manage'))return sendJson(response,403,{error:'Vehicle management permission is required'});const parts=url.pathname.split('/'),id=Number(parts[3]),type=parts[4],payload=(await readJson(request)).payload;const handlers={compliance:updateVehicleCompliance,maintenance:addMaintenanceRecord,fuel:addFuelRecord,tyres:addTyreRecord,usage:addUsageRecord};return sendJson(response,type==='compliance'?200:201,handlers[type](id,{...payload,changedBy:session.employeeName}))}
    if (request.method === 'GET' && url.pathname === '/api/employees/next-code') return sendJson(response,200,getNextEmployeeCode())
    if (request.method === 'GET' && url.pathname === '/api/employees-sensitive-export') {if(!canViewPayroll(session))return sendJson(response,403,{error:'没有薪资敏感资料导出权限'});return sendJson(response,200,sensitiveEmployeeExport(url.searchParams.get('reason'),session,meta(request)))}
    if (request.method === 'GET' && /^\/api\/employees\/\d+$/.test(url.pathname)) {if(!canManageEmployees(session))return sendJson(response,403,{error:'No permission to view private employee location'});const id=Number(url.pathname.split('/').at(-1)),item=employeeDetail(id,{canViewSensitive:canViewIdentity(session)||canViewPayroll(session),canViewHome:true});return item?sendJson(response,200,item):sendJson(response,404,{error:'Employee not found'})}
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
    if (request.method === 'POST' && /^\/api\/temporary-locations\/\d+\/adopt$/.test(url.pathname)) {if(!accountCan(session,'gps_review'))return sendJson(response,403,{error:'没有GPS审批权限'});const payload=(await readJson(request)).payload;return sendJson(response,200,adoptTemporaryLocation(Number(url.pathname.split('/')[3]),{...payload,adoptedBy:session.employeeName,adoptedByAccountId:session.id}))}
    if (request.method === 'GET' && url.pathname === '/api/import-batches') return sendJson(response, 200, { items: importBatches() })
    if (request.method === 'GET' && /^\/api\/import-batches\/\d+\/errors$/.test(url.pathname)) return sendJson(response, 200, { items: importErrors(Number(url.pathname.split('/')[3])) })
    if (request.method === 'POST' && url.pathname === '/api/import/preview') return sendJson(response, 200, previewImport((await readJson(request)).payload))
    if (request.method === 'POST' && url.pathname === '/api/import/commit') return sendJson(response, 200, commitImport((await readJson(request)).payload.batchId))
    return sendJson(response, 404, { error: 'Not found' })
  } catch (error) {
    const status=error.statusCode || (error instanceof SyntaxError ? 400 : 500),body={...publicError(error),...(error.publicDetails||{}),requestId}
    console.error(JSON.stringify({event:'api_error',requestId,method:request.method,path:String(request.url||'').split('?')[0],status,errorCode:body.errorCode,message:String(error?.message||error),diagnostic:request.kcsDiagnostic||null}))
    return sendJson(response,status,body)
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
