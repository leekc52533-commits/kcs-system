import http from 'node:http'
import { databasePath, getSystemStatus, uploadsDir } from './database.mjs'
import { getJodooIntegrationStatus, recordJodooWebhook, verifyJodooWebhookToken } from './jodoo.mjs'
import { commitImport, previewImport } from './importService.mjs'
import { customerBranchDetail, customerBranches, dashboardSummary, dataQualitySummary, importBatches, importErrors, schedules } from './queryService.mjs'
import { approveDay, assignAreaStops, assignVehicleDay, createScheduleException, createStop, createTrip, deleteStop, driverToday, generateDay, generateWeek, getDispatchDay, getDispatchWeek, promisedCheck, publishDay, reopenDay, transferVehicleDay, updateStop, updateTrip } from './dispatchService.mjs'
import { addTemporaryLocation, adoptTemporaryLocation, convertToExisting, createSpecialRequest, linkNewAccount, listSpecialRequests, listTemporaryLocations, scheduleSpecialRequest, searchCustomerBranches, updateSpecialRequest } from './specialRequestService.mjs'
import { assignAreaZone, createEmployee, createLocation, createTemporaryVehicle, createVehicle, listResources, updateEmployee, updateLocation, updateVehicle, updateZoneGroup } from './resourceService.mjs'
import { addFuelRecord, addMaintenanceRecord, addTyreRecord, addUsageRecord, addVehicleDocument, getVehicleDetail, updateVehicleCompliance } from './vehicleService.mjs'

const port = Number(process.env.KCS_API_PORT || 8787)

function sendJson(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' })
  response.end(JSON.stringify(value))
}

async function readJson(request, maxBytes = 15_000_000) {
  const chunks = []
  let total = 0
  for await (const chunk of request) {
    total += chunk.length
    if (total > maxBytes) throw new Error('Request body is too large')
    chunks.push(chunk)
  }
  const rawBody = Buffer.concat(chunks).toString('utf8')
  return { rawBody, payload: JSON.parse(rawBody || '{}') }
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`)
    if (request.method === 'OPTIONS') {
      response.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Jodoo-Token' })
      return response.end()
    }
    if (request.method === 'GET' && url.pathname === '/api/health') return sendJson(response, 200, { status: 'ok', service: 'kcs-api' })
    if (request.method === 'GET' && url.pathname === '/api/system/status') return sendJson(response, 200, { ...getSystemStatus(), integrations: { jodoo: getJodooIntegrationStatus() } })
    if (request.method === 'GET' && url.pathname === '/api/integrations/jodoo/status') return sendJson(response, 200, getJodooIntegrationStatus())
    if (request.method === 'GET' && url.pathname === '/api/dashboard/summary') return sendJson(response, 200, dashboardSummary())
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
    if (request.method === 'PATCH' && /^\/api\/zone-groups\/\d+$/.test(url.pathname)) return sendJson(response,200,updateZoneGroup(Number(url.pathname.split('/').at(-1)),(await readJson(request)).payload))
    if (request.method === 'PATCH' && /^\/api\/areas\/\d+\/zone-group$/.test(url.pathname)) {const parts=url.pathname.split('/'),payload=(await readJson(request)).payload;return sendJson(response,200,assignAreaZone(Number(parts[3]),Number(payload.zoneGroupId),payload))}
    if (request.method === 'POST' && url.pathname === '/api/vehicles') return sendJson(response,201,createVehicle((await readJson(request)).payload))
    if (request.method === 'POST' && url.pathname === '/api/vehicles/temporary') return sendJson(response,201,createTemporaryVehicle((await readJson(request)).payload))
    if (request.method === 'GET' && /^\/api\/vehicles\/\d+$/.test(url.pathname)) return sendJson(response,200,getVehicleDetail(Number(url.pathname.split('/').at(-1))))
    if (request.method === 'PATCH' && /^\/api\/vehicles\/\d+$/.test(url.pathname)) return sendJson(response,200,updateVehicle(Number(url.pathname.split('/').at(-1)),(await readJson(request)).payload))
    if (request.method === 'POST' && /^\/api\/vehicles\/\d+\/(compliance|maintenance|fuel|tyres|documents|usage)$/.test(url.pathname)) {const parts=url.pathname.split('/'),id=Number(parts[3]),type=parts[4],payload=(await readJson(request)).payload;const handlers={compliance:updateVehicleCompliance,maintenance:addMaintenanceRecord,fuel:addFuelRecord,tyres:addTyreRecord,documents:addVehicleDocument,usage:addUsageRecord};return sendJson(response,type==='compliance'?200:201,handlers[type](id,payload))}
    if (request.method === 'POST' && url.pathname === '/api/employees') return sendJson(response,201,createEmployee((await readJson(request)).payload))
    if (request.method === 'PATCH' && /^\/api\/employees\/\d+$/.test(url.pathname)) return sendJson(response,200,updateEmployee(Number(url.pathname.split('/').at(-1)),(await readJson(request)).payload))
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
    if (request.method === 'POST' && /^\/api\/temporary-locations\/\d+\/adopt$/.test(url.pathname)) return sendJson(response,200,adoptTemporaryLocation(Number(url.pathname.split('/')[3]),(await readJson(request)).payload))
    if (request.method === 'GET' && url.pathname === '/api/import-batches') return sendJson(response, 200, { items: importBatches() })
    if (request.method === 'GET' && /^\/api\/import-batches\/\d+\/errors$/.test(url.pathname)) return sendJson(response, 200, { items: importErrors(Number(url.pathname.split('/')[3])) })
    if (request.method === 'POST' && url.pathname === '/api/import/preview') return sendJson(response, 200, previewImport((await readJson(request)).payload))
    if (request.method === 'POST' && url.pathname === '/api/import/commit') return sendJson(response, 200, commitImport((await readJson(request)).payload.batchId))
    if (request.method === 'POST' && url.pathname === '/api/integrations/jodoo/webhook') {
      const token = request.headers['x-jodoo-token'] || url.searchParams.get('token')
      if (!verifyJodooWebhookToken(token)) return sendJson(response, 401, { error: 'Invalid Jodoo webhook token' })
      const { rawBody, payload } = await readJson(request)
      return sendJson(response, 202, { accepted: true, ...recordJodooWebhook(rawBody, payload) })
    }
    return sendJson(response, 404, { error: 'Not found' })
  } catch (error) {
    return sendJson(response, error instanceof SyntaxError ? 400 : 500, { error: error.message })
  }
})

server.listen(port, '127.0.0.1', () => {
  console.log(`[KCS API] ready on http://127.0.0.1:${port}`)
  console.log(`[KCS API] database: ${databasePath}`)
  console.log(`[KCS API] uploads: ${uploadsDir}`)
})

function shutdown() { server.close(() => process.exit(0)) }
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
