import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const read=name=>readFileSync(new URL(`../src/${name}`,import.meta.url),'utf8')
const app=read('App.jsx')
const backButton=read('BackButton.jsx')
const hub=read('WorkspaceHub.jsx')
const planner=read('WeeklyDispatchPage.jsx')
const hubCss=read('WorkspaceHub.css')
const appCss=read('App.css')

test('Dispatch sticky navigation owns one accessible icon-only Back control and all tabs',()=>{
  assert.match(hub,/workspace-tabs--sticky/)
  assert.match(hub,/backControl=\{<BackButton className="workspace-back" fallback=\{onBack\} iconOnly\/>\}/)
  assert.match(backButton,/aria-label=\{iconOnly\?accessibleLabel:undefined\}/)
  assert.match(backButton,/title=\{iconOnly\?accessibleLabel:undefined\}/)
  assert.match(backButton,/>←\{!iconOnly&&/)
  assert.match(app,/page!==['"]operations['"]&&pageTab/)
  for(const tab of ['hub.weekly','hub.schedules','hub.areaZone'])assert.match(hub,new RegExp(tab.replace('.','\\.')))
})

test('Special request action appears once beside the draft update action',()=>{
  assert.equal(planner.match(/t\('planner\.special'\)/g)?.length,1)
  assert.match(planner,/className="planner-update-actions"[^<]*<button className="primary"[\s\S]*?<button onClick=\{onOpenSpecial\}>\{t\('planner\.special'\)\}<\/button><\/div>/)
  assert.match(appCss,/\.planner-toolbar \.planner-update-actions\{[^}]*display:flex/)
})

test('Dispatch navigation is sticky below the global header and remains usable on narrow screens',()=>{
  assert.match(appCss,/\.topbar\{[^}]*position:sticky;[^}]*top:0;[^}]*z-index:[1-9][0-9]*;[^}]*box-shadow:/)
  assert.match(hubCss,/\.workspace-tabs--sticky\{[^}]*position:sticky;[^}]*top:76px;[^}]*z-index:[1-9][0-9]*;[^}]*background:[^;}]+;[^}]*box-shadow:/)
  assert.match(hubCss,/@media\(max-width:600px\)\{\.workspace-tabs--sticky\{[^}]*display:flex;[^}]*overflow-x:auto/)
  assert.match(hubCss,/\.workspace-tabs--sticky>button\{[^}]*white-space:nowrap/)
})
