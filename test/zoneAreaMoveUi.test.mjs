import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const ui=fs.readFileSync(new URL('../src/ZoneGroupManager.jsx',import.meta.url),'utf8')
const route=fs.readFileSync(new URL('../server/index.mjs',import.meta.url),'utf8')
const app=fs.readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8')

test('Move selected Areas保留可点击validation并显示就地成功或错误反馈',()=>{
  assert.match(ui,/onClick=\{\(\)=>move\(selected,bulkZone\)\}/)
  assert.doesNotMatch(ui,/disabled=\{!selected\.length\|\|!bulkZone\} onClick=\{\(\)=>move\(selected,bulkZone\)\}/)
  assert.match(ui,/Select at least one Area\./)
  assert.match(ui,/Select a target Zone Group\./)
  assert.match(ui,/role="alert"/)
  assert.match(ui,/role="status"/)
  assert.match(ui,/setBulkZone\(''\)/)
})

test('Area移动API以稳定ID payload调用并由Session权限保护',()=>{
  assert.match(ui,/save\('\/api\/areas\/bulk-zone-group','POST',\{areaIds,zoneGroupId:targetId,reason/)
  assert.match(route,/url\.pathname === '\/api\/areas\/bulk-zone-group'/)
  assert.match(route,/if\(!canManageSchedules\(session\)\)return sendJson\(response,403/)
  assert.match(route,/actorRole:'supervisor',changedBy:session\.employeeName/)
})

test('Area确认与移动复用Session排程权限且owner_admin不会被legacy admin角色误判',()=>{
  assert.match(route,/url\.pathname === '\/api\/areas\/bulk-confirmation'/)
  assert.equal((route.match(/if\(!canManageSchedules\(session\)\)return sendJson\(response,403/g)||[]).length>=2,true)
  assert.match(route,/setAreasConfirmation\(payload\.areaIds,payload\.confirmed!==false,\{\.\.\.payload,changedBy:session\.employeeName\}\)/)
  assert.match(app,/systemRole:account\.role,permissions:account\.permissions\|\|\[\]/)
  assert.match(ui,/\['owner_admin','operations_admin','supervisor'\]\.includes\(currentUser\.systemRole\)\|\|currentUser\.permissions\?\.includes\('schedule_manage'\)/)
  assert.match(ui,/The Area confirmation could not be changed\. No Areas were changed\./)
  assert.match(ui,/Area assignment confirmed\./)
})
