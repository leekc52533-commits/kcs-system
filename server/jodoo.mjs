import crypto from 'node:crypto'
import { db } from './database.mjs'

const API_BASE_URL = 'https://api.jodoo.com/api'
const requiredConfig = {
  apiKey: 'JODOO_API_KEY',
  appId: 'JODOO_APP_ID',
  entryId: 'JODOO_TRANSACTION_ENTRY_ID',
  webhookToken: 'JODOO_WEBHOOK_TOKEN',
  branchIdField: 'JODOO_FIELD_BRANCH_ID',
  weightField: 'JODOO_FIELD_WEIGHT',
  invoiceNumberField: 'JODOO_FIELD_INVOICE_NUMBER',
  invoicePhotoField: 'JODOO_FIELD_INVOICE_PHOTO',
  sitePhotoField: 'JODOO_FIELD_SITE_PHOTO',
  paymentProofField: 'JODOO_FIELD_PAYMENT_PROOF',
  noCollectionStatusField: 'JODOO_FIELD_NO_COLLECTION_STATUS',
  noCollectionReasonField: 'JODOO_FIELD_NO_COLLECTION_REASON',
  noCollectionEvidenceField: 'JODOO_FIELD_NO_COLLECTION_EVIDENCE',
}

export function getJodooConfig() {
  return Object.fromEntries(Object.entries(requiredConfig).map(([key, environmentName]) => [key, process.env[environmentName]?.trim() || '']))
}

export function getJodooIntegrationStatus() {
  const config = getJodooConfig()
  const missing = Object.entries(requiredConfig).filter(([key]) => !config[key]).map(([, environmentName]) => environmentName)
  const queue = Object.fromEntries(['pending','processing','succeeded','failed'].map((status) => [status, db.prepare('SELECT COUNT(*) AS count FROM jodoo_outbox_jobs WHERE status = ?').get(status).count]))
  return { configured: missing.length === 0, missing, webhookPath: '/api/integrations/jodoo/webhook', queue }
}

export async function jodooRequest(pathname, body) {
  const { apiKey } = getJodooConfig()
  if (!apiKey) throw new Error('JODOO_API_KEY is not configured')
  const response = await fetch(`${API_BASE_URL}${pathname}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(`Jodoo API ${response.status}: ${result.msg || 'request failed'}`)
  return result
}

export async function requestUploadTargets(transactionId) {
  const { appId, entryId } = getJodooConfig()
  return jodooRequest('/v5/app/entry/file/get_upload_token', { app_id: appId, entry_id: entryId, transaction_id: transactionId })
}

export async function updateJodooRecord({ dataId, transactionId, data }) {
  const { appId, entryId } = getJodooConfig()
  return jodooRequest('/v5/app/entry/data/update', { app_id: appId, entry_id: entryId, data_id: dataId, transaction_id: transactionId, data })
}

export async function uploadJodooFile({ url, token, fileName, contentType, bytes }) {
  const form = new FormData()
  form.append('token', token)
  form.append('file', new Blob([bytes], { type: contentType }), fileName)
  const response = await fetch(url, { method: 'POST', body: form })
  const result = await response.json().catch(() => ({}))
  if (!response.ok || !result.key) throw new Error(`Jodoo file upload ${response.status}: ${result.msg || 'missing file key'}`)
  return result.key
}

function safeTokenMatch(expected, received) {
  if (!expected || !received) return false
  const expectedBytes = Buffer.from(expected)
  const receivedBytes = Buffer.from(received)
  return expectedBytes.length === receivedBytes.length && crypto.timingSafeEqual(expectedBytes, receivedBytes)
}

export function verifyJodooWebhookToken(receivedToken) {
  return safeTokenMatch(getJodooConfig().webhookToken, receivedToken)
}

export function recordJodooWebhook(rawBody, payload) {
  const eventId = crypto.createHash('sha256').update(rawBody).digest('hex')
  const eventType = String(payload?.op || 'unknown')
  const formId = String(payload?.data?.entry_id || payload?.entry_id || getJodooConfig().entryId || '')
  const dataId = String(payload?.data?.data_id || payload?.data?._id || payload?.data_id || '')
  const result = db.prepare(`
    INSERT OR IGNORE INTO jodoo_sync_events (event_id, event_type, form_id, data_id, payload_json, status)
    VALUES (?, ?, ?, ?, ?, 'received')
  `).run(eventId, eventType, formId || null, dataId || null, rawBody)
  return { eventId, duplicate: result.changes === 0 }
}

export function enqueueJodooJob({ jobType, dispatchStopId = null, dataId = null, payload }) {
  const result = db.prepare(`
    INSERT INTO jodoo_outbox_jobs (job_type, dispatch_stop_id, jodoo_data_id, payload_json)
    VALUES (?, ?, ?, ?)
  `).run(jobType, dispatchStopId, dataId, JSON.stringify(payload))
  return Number(result.lastInsertRowid)
}
