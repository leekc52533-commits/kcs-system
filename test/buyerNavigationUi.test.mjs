import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import test from 'node:test'
import {translate} from '../src/translations.js'

const workspace=readFileSync(new URL('../src/WorkspaceHub.jsx',import.meta.url),'utf8')
const master=readFileSync(new URL('../src/MasterDataPage.jsx',import.meta.url),'utf8')
const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8')

test('Buyer Master is restored as an independent Location workspace tab',()=>{
  assert.match(workspace,/\['buyers',t\('hub\.buyerMaster'\)\]/)
  assert.match(workspace,/tab==='locations'\?<MasterDataPage key="locations" embedded currentUser=\{currentUser\} initialTab="gps" allowedTabs=\{\['gps','locations'\]\}/)
  assert.match(workspace,/tab==='buyers'\?<MasterDataPage key="buyers" embedded currentUser=\{currentUser\} initialTab="buyers" allowedTabs=\{\['buyers'\]\}/)
  assert.match(master,/tab==='buyers'\?<EntityManager[^\n]*type="buyer" endpoint="\/api\/buyers"/)
  assert.match(master,/officialLatitude/)
  assert.match(master,/officialLongitude/)
})

test('Buyer and GPS remount independent MasterData content when switching',()=>{
  assert.match(workspace,/<MasterDataPage key="locations"[^>]*initialTab="gps"/)
  assert.match(workspace,/<MasterDataPage key="buyers"[^>]*initialTab="buyers"/)
  assert.match(app,/const changeTab=tab=>\{window\.history\.replaceState[^\n]*setPageTab\(tab\)\}/)
  assert.match(app,/initialTab=\{pageTab\|\|'locations'\}/)
})

test('Buyer navigation is limited to existing office and supervisor desktop roles',()=>{
  assert.match(workspace,/\['owner_admin','operations_admin','supervisor','office'\]\.includes\(currentUser\.systemRole\)/)
  assert.doesNotMatch(workspace,/\['owner_admin','operations_admin','supervisor','office','driver'/)
  assert.doesNotMatch(workspace,/\['owner_admin','operations_admin','supervisor','office','crew'/)
})

test('Buyer labels are complete in all supported languages',()=>{
  assert.equal(translate('en','hub.buyerMaster'),'Buyer Master')
  assert.equal(translate('ms','hub.buyerMaster'),'Pengurusan Buyer')
  assert.equal(translate('zh','hub.buyerMaster'),'Buyer 管理')
})

test('Customer and Branch remain separate and shared Back navigation remains active',()=>{
  assert.match(workspace,/tabs=\[\['customers',t\('master\.customer'\)\],\['branches',t\('master\.branch'\)\]\]/)
  assert.match(app,/page!=='dashboard'&&page!=='materials'&&page!=='vehicles'&&<BackButton/)
})
