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

test('confirmed page-specific heroes are removed without removing operational controls',()=>{
  const weekly=source('src/WeeklyDispatchPage.jsx')
  assert.doesNotMatch(weekly,/WEEKLY DISPATCH PLANNER|planner\.description|planner\.single/)
  assert.match(weekly,/planner\.special/)
  assert.match(weekly,/planner-toolbar/)

  const special=source('src/SpecialRequestsPage.jsx')
  assert.doesNotMatch(special,/SPECIAL COLLECTION REQUESTS|specialRequest\.title|specialRequest\.description/)
  assert.match(special,/specialRequest\.openPlanner/)
  assert.match(special,/specialRequest\.searchExisting/)

  const lifecycle=source('src/BranchLifecycleReviewPage.jsx')
  assert.doesNotMatch(lifecycle,/branchLifecycle\.reviewHelp/)
  assert.match(lifecycle,/branchLifecycle\.preserveHistory/)
  assert.match(lifecycle,/lifecycle-impact-warning/)

  const analysis=source('src/AddressAnalysisPage.jsx')
  assert.doesNotMatch(analysis,/addressAnalysis\.(?:eyebrow|title|safety)/)
  assert.match(analysis,/addressAnalysis\.safeBatch/)
  assert.match(analysis,/addressAnalysis\.batchTitle/)
  assert.match(analysis,/addressAnalysis\.previewNotProof/)
})

test('major navigable desktop pages do not render page-identity hero markup',()=>{
  const files=[
    'src/AccountManagementPage.jsx',
    'src/DataPages.jsx',
    'src/GpsMigrationPage.jsx',
    'src/GpsZoneRecommendationPage.jsx',
    'src/ImportPage.jsx',
    'src/SpecialRequestsPage.jsx',
    'src/WeeklyDispatchPage.jsx',
  ]
  for(const file of files){
    const page=source(file)
    assert.doesNotMatch(page,/className="(?:welcome|data-title)"/,file)
    assert.doesNotMatch(page,/<em>(?:GPS MIGRATION|JODOO DATA IMPORT|KCS SECURITY|GPS-BASED ZONE RECOMMENDATION V1)<\/em>/,file)
  }
  assert.doesNotMatch(source('src/App.jsx'),/dashboard\.(?:eyebrow|greeting|truth)/)
  assert.doesNotMatch(source('src/VehicleDetailPage.jsx'),/<em>VEHICLE MANAGEMENT<\/em>/)
  assert.doesNotMatch(source('src/EmployeeMasterPage.jsx'),/The directory and detail view are separate/)
  assert.doesNotMatch(source('src/ZoneGroupManager.jsx'),/Zone Groups and Area assignment confirmation are managed separately/)
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
