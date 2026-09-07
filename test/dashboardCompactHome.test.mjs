import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

test('dashboard omits create-today action and five summary cards while keeping feature navigation',()=>{
  const source=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8')
  const dashboard=source.slice(source.indexOf('function Dashboard'),source.indexOf('function Heading'))
  assert.doesNotMatch(dashboard,/dashboard-actions/)
  assert.doesNotMatch(dashboard,/className="stats"/)
  assert.doesNotMatch(dashboard,/dashboard\.create/)
  assert.match(dashboard,/dashboardModules\.map/)
  assert.match(dashboard,/dashboard\.features/)
})
