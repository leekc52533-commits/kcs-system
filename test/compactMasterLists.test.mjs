import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {DatabaseSync} from 'node:sqlite'
import {schemaSql,SCHEMA_VERSION} from '../server/schema.mjs'
import {listBranches} from '../server/customerMasterService.mjs'
import {listAccounts} from '../server/authService.mjs'
import {messages} from '../src/translations.js'

const source=file=>fs.readFileSync(new URL(`../${file}`,import.meta.url),'utf8')
function fixture(){const db=new DatabaseSync(':memory:');db.exec(`PRAGMA foreign_keys=ON;${schemaSql}`);db.prepare("INSERT INTO customers(id,jodoo_customer_id,name) VALUES(1,'10001','Alpha')").run();db.prepare("INSERT INTO branches(id,jodoo_branch_id,customer_id,branch_name,status,is_active,lifecycle_status) VALUES(1,'10001',1,'Active Branch','active',1,'ACTIVE'),(2,'10002',1,'Paused Branch','paused',0,'TEMPORARILY_PAUSED'),(3,'10003',1,'Closed Branch','closed',0,'CLOSED')").run();return db}

test('Customer Branch Master default query can show ACTIVE without duplicating inactive review records',()=>{const db=fixture();assert.deepEqual(listBranches({lifecycleStatus:'ACTIVE',pageSize:500},db).items.map(item=>item.branchId),['10001']);assert.deepEqual(listBranches({pageSize:500},db).items.map(item=>item.branchId).sort(),['10001','10002','10003'])})

test('account list exposes employee main job role and timestamps without changing permissions',()=>{const db=fixture();db.prepare("INSERT INTO employees(id,employee_code,name,job_role) VALUES(1,'EMP-0001','Office User','Office')").run();db.prepare("INSERT INTO auth_accounts(id,employee_id,username,password_hash,role,system_role) VALUES(1,1,'office1','hash','office','office')").run();const item=listAccounts({role:'owner_admin'},db)[0];assert.equal(item.employeeCode,'EMP-0001');assert.equal(item.mainJobRole,'Office');assert.ok(Object.hasOwn(item,'updatedAt'));assert.deepEqual(item.permissions,[])})

test('four master surfaces use one compact selectable expandable list with copy feedback',()=>{const compact=source('src/CompactDataTable.jsx'),master=source('src/MasterDataPage.jsx'),review=source('src/BranchLifecycleReviewPage.jsx'),accounts=source('src/AccountManagementPage.jsx'),css=source('src/CompactDataTable.css');for(const token of ['type="checkbox"','toggleAll','aria-expanded','toggleExpanded','CopyValue','navigator.clipboard.writeText'])assert.match(compact,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));assert.match(master,/type==='branch'\?'ACTIVE'/);assert.match(master,/lifecycleStatus/);assert.match(master,/CompactDataTable/);assert.match(review,/CompactDataTable/);assert.doesNotMatch(review,/branch-review-grid/);assert.match(accounts,/CompactDataTable/);assert.doesNotMatch(accounts,/className="account-list"/);assert.match(css,/@media\(max-width:700px\)/);assert.match(css,/overflow-x:auto/);assert.match(css,/focus-visible/)})

test('compact list labels are complete in English, Bahasa Melayu and Chinese',()=>{const keys=['selected','selectAll','selectRow','sortAsc','sortDesc','clearSort','clearFilter','actions','details','expand','collapse','copy','copied','columns','closeColumns','resetColumns','noResults','activeOnly','includeInactive','customerId','branchId','employeeId','accountStatus','searchAccounts','customerMasterTitle','branchMasterTitle','email','gps.set','gps.notSet'];for(const language of ['en','ms','zh'])for(const key of keys)assert.ok(messages[language][`list.${key}`],`${language} list.${key}`);for(const key of ['selected','selectAll','sortAsc','clearFilter','copied','columns','resetColumns','includeInactive','searchAccounts','customerMasterTitle','branchMasterTitle','gps.set'])assert.notEqual(messages.ms[`list.${key}`],messages.en[`list.${key}`]);assert.equal(SCHEMA_VERSION,42)})
