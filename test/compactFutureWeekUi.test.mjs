import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

test('weekly planner has dispatch and Route views without the old shortcut toolbar',()=>{
  const ui=readFileSync(new URL('../src/WeeklyDispatchPage.jsx',import.meta.url),'utf8')
  const css=readFileSync(new URL('../src/Planner.css',import.meta.url),'utf8')
  assert.match(ui,/function WeekDayTabs/)
  assert.match(ui,/function RouteWeekTabs/)
  assert.match(ui,/visibleDays\.map\(day=>/)
  assert.match(ui,/>派车<\/button>/)
  assert.match(ui,/>Route<\/button>/)
  assert.doesNotMatch(ui,/>看派车<\/button>|>看 Route<\/button>/)
  assert.doesNotMatch(ui,/t\('planner\.today'\)|t\('planner\.tomorrow'\)|t\('planner\.dayAfter'\)|t\('planner\.week'\)/)
  assert.match(css,/\.week-board--single-day\{display:block;overflow:visible\}/)
  assert.match(css,/\.workspace-hub--pinned \.planner-navigation\{position:sticky/)
})

test('Route view omits the redundant explanatory heading',()=>{
  const ui=readFileSync(new URL('../src/WeeklyDispatchPage.jsx',import.meta.url),'utf8')
  assert.doesNotMatch(ui,/车辆、客户顺序和批准都在这里处理/)
  assert.doesNotMatch(ui,/每条 Route 分别分配车辆、分别批准/)
})

test('temporary customers use Route assignment and custom dropdowns close outside',()=>{
  const ui=readFileSync(new URL('../src/WeeklyDispatchPage.jsx',import.meta.url),'utf8')
  assert.match(ui,/\/assign-route/)
  assert.match(ui,/>未分配 Route ▾<\/button>/)
  assert.match(ui,/function RoutePicker/)
  assert.match(ui,/await onChoose\(routeNumber\);setOpen\(false\)/)
  assert.match(ui,/setLocalError\(error\.message\)/)
  assert.match(ui,/function useOutsideClose/)
  assert.match(ui,/document\.addEventListener\('pointerdown',close\)/)
  assert.doesNotMatch(ui,/function VehiclePicker/)
})

test('dispatch overview and temporary-customer dropdown both remain available',()=>{
  const ui=readFileSync(new URL('../src/WeeklyDispatchPage.jsx',import.meta.url),'utf8')
  const css=readFileSync(new URL('../src/Planner.css',import.meta.url),'utf8')
  assert.match(ui,/<RouteDispatchOverview day=\{day\}\/>/)
  assert.match(ui,/aria-label="当天 Route 总览"/)
  assert.match(ui,/route-picker-panel/)
  assert.match(css,/\.route-picker-panel\{right:0;left:auto/)
  assert.doesNotMatch(ui,/<strong>Route 1–5<\/strong>/)
  assert.doesNotMatch(ui,/每条 Route 分别分配车辆、分别批准/)
})

test('approved days use a distinct style and manual adjustment panel is removed',()=>{
  const ui=readFileSync(new URL('../src/WeeklyDispatchPage.jsx',import.meta.url),'utf8')
  const css=readFileSync(new URL('../src/Planner.css',import.meta.url),'utf8')
  assert.match(ui,/every\(route=>route\.approvalStatus==='approved'\)/)
  assert.match(css,/\.week-day-tabs button\.approved\{/)
  assert.doesNotMatch(ui,/function DraftAdjustmentPanel|Supervisor Draft Adjustments|draft-adjustments/)
  assert.match(ui,/import \{ useCallback, useEffect, useMemo, useRef, useState \} from 'react'/)
})

test('route date and compact vehicle actions are shown in the requested rows',()=>{
  const ui=readFileSync(new URL('../src/WeeklyDispatchPage.jsx',import.meta.url),'utf8')
  assert.match(ui,/className="route-service-date">\{day\.dispatch_date\}/)
  assert.match(ui,/className="vehicle-tabs-row"/)
  assert.match(ui,/>＋ 长期车<\/button>/)
  assert.match(ui,/>＋ 临时车<\/button>/)
})
