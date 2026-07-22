import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read=file=>fs.readFileSync(new URL(`../${file}`,import.meta.url),'utf8')

test('auth session route is public and registered before the login guard',()=>{
  const source=read('server/index.mjs')
  const sessionRoute=source.indexOf("url.pathname === '/api/auth/session'")
  const loginGuard=source.indexOf("if(!session)return sendJson(response,401")
  assert.ok(sessionRoute>=0)
  assert.ok(sessionRoute<loginGuard)
})

test('Vite proxies API requests to the KCS API port',()=>{
  const source=read('vite.config.js')
  assert.match(source,/['"]\/api['"]\s*:\s*process\.env\.KCS_API_PROXY\s*\|\|\s*['"]http:\/\/127\.0\.0\.1:8787['"]/) 
})

test('React effects do not directly return async loader promises',()=>{
  const source=['src/App.jsx','src/AuthPages.jsx','src/GpsMigrationPage.jsx'].map(read).join('\n')
  assert.doesNotMatch(source,/useEffect\s*\(\s*async\b/)
  assert.doesNotMatch(source,/useEffect\s*\(\s*(?:load|refresh)\s*,/)
})
