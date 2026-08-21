import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import test from 'node:test'
import {translate} from '../src/translations.js'

const master=readFileSync(new URL('../src/MasterDataPage.jsx',import.meta.url),'utf8')
const workspace=readFileSync(new URL('../src/WorkspaceHub.jsx',import.meta.url),'utf8')
const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8')

test('new Customer opens its detail at the top and Branch refresh does not add history',()=>{
  assert.match(master,/open\(saved,\{pushHistory:!edit,scrollTop:!edit,preserveTab:edit\}\)/)
  assert.match(master,/window\.scrollTo\(\{top:0,behavior:'auto'\}\)/)
  assert.match(master,/detailRef\.current\?\.scrollIntoView\(\{block:'start'\}\)/)
  assert.match(master,/open\(selected,\{pushHistory:false,preserveTab:true\}\)/)
})

test('Customer Detail owns browser history but has no duplicate in-card Back button',()=>{
  assert.match(master,/url\.searchParams\.set\('customer',formatCustomerId\(detail\.customerId\)\)/)
  assert.match(master,/window\.history\.pushState\(\{kcsPage:'customers',customerDetail:true\}/)
  const detail=master.match(/if\(selected\)\{[\s\S]*?return <section ref=\{detailRef\}[\s\S]*?return <section className="master-workspace customer"/)?.[0]||''
  assert.ok(detail)
  assert.doesNotMatch(detail,/className="back-button"/)
  assert.match(app,/page!=='customers'\)return go\('dashboard'\)/)
  assert.match(app,/url\.searchParams\.delete\('customer'\)/)
  assert.match(app,/window\.dispatchEvent\(new PopStateEvent\('popstate'/)
})

test('Branch Directory remains internal and the empty Unlinked Branches tab is removed',()=>{
  assert.match(workspace,/tabs=\[\['customers',[^\]]+\],\['branch-review',[^\]]+\]\]/)
  assert.match(workspace,/validTabs=\[\.\.\.tabs,\['branches',t\('master\.branch'\)\]\]/)
  assert.match(workspace,/tab==='branch-review'\?<BranchLifecycleReviewPage/)
  assert.doesNotMatch(workspace,/UnlinkedBranchesPage|\['unlinked'/)
})

test('Customer search also returns Branch matches and opens the parent Customer',()=>{
  assert.match(master,/api\(`\/api\/master\/branches\?search=\$\{encodeURIComponent\(term\)\}&pageSize=100`\)/)
  assert.match(master,/customerHierarchy\.branchMatches/)
  assert.match(master,/formatBranchId\(branch\.branchId\)/)
  assert.match(master,/formatCustomerId\(branch\.customerId\)/)
  assert.match(master,/openBranchMatch=async branch=>\{await open\(\{customerId:branch\.customerId\}\);setExpanded\(branch\.branchId\)\}/)
})

test('Customer hierarchy navigation labels remain complete in EN BM and ZH',()=>{
  for(const language of ['en','ms','zh'])for(const key of ['master.customer','branchLifecycle.reviewTitle','customerHierarchy.addBranch','customerHierarchy.addFirstBranch','customerHierarchy.search','customerHierarchy.branchMatches'])assert.notEqual(translate(language,key),key)
})
