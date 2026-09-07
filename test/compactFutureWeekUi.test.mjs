import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

test('future week uses one pinned date selector and one visible day',()=>{
  const ui=readFileSync(new URL('../src/WeeklyDispatchPage.jsx',import.meta.url),'utf8')
  const css=readFileSync(new URL('../src/Planner.css',import.meta.url),'utf8')
  assert.match(ui,/function WeekDayTabs/)
  assert.match(ui,/visibleDays\.map\(day=>/)
  assert.match(ui,/aria-expanded=\{viewMode==='week'\}/)
  assert.match(css,/\.week-board--single-day\{display:block;overflow:visible\}/)
  assert.match(css,/\.workspace-hub--pinned \.planner-navigation\{position:sticky/)
})

test('route date and compact vehicle actions are shown in the requested rows',()=>{
  const ui=readFileSync(new URL('../src/WeeklyDispatchPage.jsx',import.meta.url),'utf8')
  assert.match(ui,/className="route-service-date">\{day\.dispatch_date\}/)
  assert.match(ui,/className="vehicle-tabs-row"/)
  assert.match(ui,/>＋ 长期车<\/button>/)
  assert.match(ui,/>＋ 临时车<\/button>/)
})
