import http from 'node:http'
import { databasePath, getSystemStatus, uploadsDir } from './database.mjs'
import { getJodooIntegrationStatus, recordJodooWebhook, verifyJodooWebhookToken } from './jodoo.mjs'

const port = Number(process.env.KCS_API_PORT || 8787)

function sendJson(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' })
  response.end(JSON.stringify(value))
}

async function readJson(request, maxBytes = 1_000_000) {
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
      response.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Jodoo-Token' })
      return response.end()
    }
    if (request.method === 'GET' && url.pathname === '/api/health') return sendJson(response, 200, { status: 'ok', service: 'kcs-api' })
    if (request.method === 'GET' && url.pathname === '/api/system/status') return sendJson(response, 200, { ...getSystemStatus(), integrations: { jodoo: getJodooIntegrationStatus() } })
    if (request.method === 'GET' && url.pathname === '/api/integrations/jodoo/status') return sendJson(response, 200, getJodooIntegrationStatus())
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
