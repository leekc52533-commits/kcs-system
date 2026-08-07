import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import test from 'node:test'
import {translate} from '../src/translations.js'

const workspace=readFileSync(new URL('../src/WorkspaceHub.jsx',import.meta.url),'utf8')
const master=readFileSync(new URL('../src/MasterDataPage.jsx',import.meta.url),'utf8')
const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8')
const server=readFileSync(new URL('../server/index.mjs',import.meta.url),'utf8')

test('Buyer Master is an independent main workspace and not a Location tab',()=>{
  assert.match(app,/\['buyers','◉','nav\.buyers'\]/)
  assert.match(app,/page==='buyers'&&canAccessBuyer\?<MasterDataPage currentUser=\{currentUser\} initialTab="buyers" allowedTabs=\{\['buyers'\]\}/)
  assert.doesNotMatch(workspace,/\['buyers',t\('hub\.buyerMaster'\)\]/)
  assert.doesNotMatch(workspace,/tab==='buyers'/)
  assert.match(master,/tab==='buyers'\?<BuyerManager/)
  assert.match(master,/officialLatitude/)
  assert.match(master,/officialLongitude/)
})

test('Buyer form and list use an immutable system-generated typed ID',()=>{
  assert.match(master,/buyerFields=\[\['buyerId','Buyer ID','readonly'\]/)
  assert.match(master,/type==='buyer'\?formatBuyerId\(item\.id\)/)
  assert.match(master,/if\(type==='buyer'\)\{delete payload\.buyerId;delete payload\.id\}/)
  assert.ok(server.includes("request.method === 'PATCH' && /^\\/api\\/buyers\\/\\d+$/.test"))
  assert.match(server,/Object\.hasOwn\(payload,'buyerId'\)\|\|Object\.hasOwn\(payload,'id'\)/)
  assert.match(server,/sendJson\(response,400,\{error:'Buyer ID is system generated and cannot be changed'\}\)/)
})

test('Buyer route persists through the existing page query while invalid Location tabs fall back safely',()=>{
  assert.match(app,/query\.get\('page'\)/)
  assert.match(app,/window\.history\.pushState[^\n]*`\?page=\$\{next\}/)
  assert.match(workspace,/tabs\.some\(\(\[id\]\)=>id===initialTab\)\?initialTab:defaultTab/)
})

test('Buyer navigation is limited to existing office and supervisor desktop roles',()=>{
  assert.match(app,/canAccessBuyer=\['owner_admin','operations_admin','supervisor','office'\]\.includes\(account\.role\)/)
  assert.match(app,/visibleNavigation=navigation\.filter\(item=>item\[0\]!=='buyers'\|\|canAccessBuyer\)/)
  assert.doesNotMatch(app,/\['owner_admin','operations_admin','supervisor','office','driver'/)
  assert.doesNotMatch(app,/\['owner_admin','operations_admin','supervisor','office','crew'/)
})

test('Buyer labels are complete in all supported languages',()=>{
  assert.equal(translate('en','hub.buyerMaster'),'Buyer Master')
  assert.equal(translate('ms','hub.buyerMaster'),'Pengurusan Buyer')
  assert.equal(translate('zh','hub.buyerMaster'),'Buyer 管理')
  assert.equal(translate('en','nav.buyers'),'Buyer Management')
  assert.equal(translate('ms','nav.buyers'),'Pengurusan Buyer')
  assert.equal(translate('zh','nav.buyers'),'Buyer 管理')
})

test('Special Collection Request is removed only from the sidebar and remains available from scheduling',()=>{
  assert.doesNotMatch(app,/const navigation=\[[^\n]*\['special'/)
  assert.match(app,/page==='special'\?<SpecialRequestsPage/)
  assert.match(app,/<DispatchScheduleHub[^\n]*onOpenSpecial=\{\(\)=>go\('special'\)\}/)
  assert.match(workspace,/<WeeklyDispatchPage onOpenSpecial=\{onOpenSpecial\}/)
})

test('Customer and Branch remain separate and shared Back navigation remains active',()=>{
  assert.match(workspace,/tabs=\[\['customers',t\('master\.customer'\)\],\['branches',t\('master\.branch'\)\]\]/)
  assert.match(app,/page!=='dashboard'&&page!=='materials'&&page!=='vehicles'&&<BackButton/)
})
