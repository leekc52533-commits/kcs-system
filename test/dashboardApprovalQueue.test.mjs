import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

test('needs-action approval queue is first, polls, and supports direct decisions',()=>{
  const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8'),queue=readFileSync(new URL('../src/DashboardApprovals.jsx',import.meta.url),'utf8')
  const dashboard=app.slice(app.indexOf('function Dashboard'),app.indexOf('function Heading'))
  assert.ok(dashboard.indexOf('dashboard-needs-action')<dashboard.indexOf('dashboard-features'))
  assert.match(queue,/defer-requests\/pending/);assert.match(queue,/setInterval\(\(\)=>void load\(\),5000\)/);assert.match(queue,/defer-requests\/\$\{item\.id\}\/\$\{decision\}/)
  assert.match(queue,/AudioContext/);assert.match(queue,/knownIds/);assert.match(queue,/dashboard\.enableSound/);assert.match(queue,/document\.title=items\.length\?`🔔/)
})
