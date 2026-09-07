import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

test('weekly planner has dispatch and Route views without the old shortcut toolbar',()=>{
  const ui=readFileSync(new URL('../src/WeeklyDispatchPage.jsx',import.meta.url),'utf8')
  const css=readFileSync(new URL('../src/Planner.css',import.meta.url),'utf8')
  assert.match(ui,/function WeekDayTabs/)
  assert.match(ui,/function RouteWeekTabs/)
  assert.match(ui,/visibleDays\.map\(day=>/)
  assert.match(ui,/>看派车<\/button>/)
  assert.match(ui,/>看 Route<\/button>/)
  assert.doesNotMatch(ui,/t\('planner\.today'\)|t\('planner\.tomorrow'\)|t\('planner\.dayAfter'\)|t\('planner\.week'\)/)
  assert.match(css,/\.week-board--single-day\{display:block;overflow:visible\}/)
  assert.match(css,/\.workspace-hub--pinned \.planner-navigation\{position:sticky/)
})

test('approved days use a distinct style and manual adjustment panel is removed',()=>{
  const ui=readFileSync(new URL('../src/WeeklyDispatchPage.jsx',import.meta.url),'utf8')
  const css=readFileSync(new URL('../src/Planner.css',import.meta.url),'utf8')
  assert.match(ui,/every\(route=>route\.approvalStatus==='approved'\)/)
  assert.match(css,/\.week-day-tabs button\.approved\{/)
  assert.doesNotMatch(ui,/function DraftAdjustmentPanel|Supervisor Draft Adjustments|draft-adjustments/)
})

test('route date and compact vehicle actions are shown in the requested rows',()=>{
  const ui=readFileSync(new URL('../src/WeeklyDispatchPage.jsx',import.meta.url),'utf8')
  assert.match(ui,/className="route-service-date">\{day\.dispatch_date\}/)
  assert.match(ui,/className="vehicle-tabs-row"/)
  assert.match(ui,/>＋ 长期车<\/button>/)
  assert.match(ui,/>＋ 临时车<\/button>/)
})
