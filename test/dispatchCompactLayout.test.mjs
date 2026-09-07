import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import test from 'node:test'

const ui=await readFile(new URL('../src/WeeklyDispatchPage.jsx',import.meta.url),'utf8')
const css=await readFile(new URL('../src/Planner.css',import.meta.url),'utf8')

test('date shortcuts stay pinned below the workspace navigation',()=>{
  assert.match(css,/\.workspace-hub--pinned \.planner-navigation\{position:sticky;top:141px;/)
  assert.match(css,/\.workspace-hub--pinned>\.planner-page\{padding-top:0\}/)
})

test('the redundant whole-day heading and approval panel are removed',()=>{
  assert.doesNotMatch(ui,/function DayApprovalControls/)
  assert.doesNotMatch(ui,/<small>\{day\.dispatch_date\}<\/small>/)
  assert.match(ui,/撤回当天批准/)
})

test('vehicle tabs show the registration plate only',()=>{
  assert.match(ui,/\{board\.registrationNumber\|\|board\.vehicle\}<\/button>/)
  assert.doesNotMatch(ui,/\{board\.customerCount\} stops/)
  assert.doesNotMatch(ui,/\{board\.vehicle\} · \{board\.registrationNumber/)
})

test('collapsed and saved start locations show names without addresses',()=>{
  const component=ui.slice(ui.indexOf('function StartLocationControl'),ui.indexOf('function DriverPicker'))
  const trigger=component.slice(component.indexOf('className="start-location-trigger"'),component.indexOf('{open&&'))
  assert.doesNotMatch(trigger,/startAddress|Address not set/)
  assert.doesNotMatch(component,/options\.factory\.startAddress|item\.startAddress/)
})

test('individual route approval remains available',()=>{
  assert.match(ui,/批准这条 Route/)
  assert.match(ui,/\/approval-check/)
})

test('Route vehicle labels use plates and reorder controls use arrows',()=>{
  const panel=ui.slice(ui.indexOf('function RouteAssignmentPanel'),ui.indexOf('function UnassignedPool'))
  assert.match(panel,/route\.registrationNumber\|\|route\.vehicle/)
  assert.match(panel,/vehicle\.registrationNumber\|\|vehicle\.vehicleCode\|\|vehicle\.vehicle/)
  assert.doesNotMatch(panel,/\{vehicleLabel\(vehicle\)\}/)
  assert.match(panel,/>↑<\/button>/)
  assert.match(panel,/>↓<\/button>/)
  assert.doesNotMatch(panel,/>上移<\/button>|>下移<\/button>/)
})
