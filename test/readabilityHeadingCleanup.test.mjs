import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const source=file=>fs.readFileSync(new URL(`../${file}`,import.meta.url),'utf8')

test('workspace shell relies on the app header for page identity',()=>{
  const hub=source('src/WorkspaceHub.jsx')
  assert.doesNotMatch(hub,/KCS WORKSPACE/)
  assert.doesNotMatch(hub,/className="data-title"/)
  assert.match(hub,/className="workspace-tabs" aria-label="Workspace sections"/)
})

test('master pages retain section headings without repetitive introductions',()=>{
  const master=source('src/MasterDataPage.jsx')
  const resources=source('src/ResourcePage.jsx')
  assert.match(master,/list\.customerMasterTitle/)
  assert.doesNotMatch(master,/customerHierarchy\.masterHelp/)
  assert.doesNotMatch(master,/KCS MASTER DATA/)
  assert.doesNotMatch(resources,/VEHICLE MANAGEMENT|resource\.vehiclePageHelp/)
})

test('global typography sets readable body, metadata, and control floors',()=>{
  const app=source('src/App.jsx')
  const css=source('src/readability.css')
  assert.match(app,/import '\.\/readability\.css'/)
  assert.match(css,/--font-body: 1\.0625rem/)
  assert.match(css,/--font-control: 1rem/)
  assert.match(css,/--font-meta: 0\.875rem/)
  assert.doesNotMatch(css,/\b(?:zoom|transform)\s*:/)
})
