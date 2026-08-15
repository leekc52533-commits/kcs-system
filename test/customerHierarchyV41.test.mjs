import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {schemaSql} from '../server/schema.mjs'
import {createBranch,createCustomer,getCustomer,linkBranchToCustomer,listUnlinkedBranches} from '../server/customerMasterService.mjs'

function fixture(){const database=new DatabaseSync(':memory:');database.exec(`PRAGMA foreign_keys=ON;${schemaSql}`);return database}

test('Customer and Branch IDs are generated and a Branch created from a Customer always has its parent',()=>{
  const database=fixture(),customer=createCustomer({customerName:'Single Shop'},database),branch=createBranch({customerId:customer.customerId,branchName:'Single Shop Location'},database)
  assert.match(customer.customerId,/^C\d{5}$/)
  assert.match(branch.branchId,/^B\d{5}$/)
  assert.equal(branch.customerId,customer.customerId)
  assert.equal(getCustomer(customer.customerId,database).branches.length,1)
  assert.throws(()=>createBranch({branchName:'Orphan Attempt'},database),/Parent Customer is required/)
})

test('legacy unlinked Branch remains unchanged until an explicit audited parent link',()=>{
  const database=fixture(),customer=createCustomer({customerName:'Parent'},database)
  database.exec("INSERT INTO areas(id,jodoo_area_id,name) VALUES(7,'A7','Bau')")
  database.prepare("INSERT INTO branches(jodoo_branch_id,customer_id,area_id,branch_name,address,latitude,longitude,lifecycle_status,notes) VALUES('99888',NULL,7,'Legacy Branch','Old address',1.23,110.45,'TEMPORARILY_PAUSED','Keep me')").run()
  database.exec("INSERT INTO dispatches(id,dispatch_date,status) VALUES(1,'2026-08-15','draft');INSERT INTO dispatch_stops(id,dispatch_id,branch_id,stop_sequence,status) VALUES(1,1,1,1,'locked')")
  const before=database.prepare('SELECT * FROM branches WHERE id=1').get(),stopBefore=database.prepare('SELECT * FROM dispatch_stops WHERE id=1').get(),review=listUnlinkedBranches({},database)
  assert.equal(review.summary.unlinkedBranches,1)
  assert.equal(review.items[0].branchId,'99888')
  linkBranchToCustomer('99888',{customerId:customer.customerId,reason:'Supervisor confirmed company registration',changedBy:'Manager'},database)
  const after=database.prepare('SELECT * FROM branches WHERE id=1').get(),stopAfter=database.prepare('SELECT * FROM dispatch_stops WHERE id=1').get()
  for(const field of ['jodoo_branch_id','area_id','branch_name','address','latitude','longitude','lifecycle_status','notes'])assert.equal(after[field],before[field])
  assert.deepEqual(stopAfter,stopBefore)
  assert.equal(after.customer_id,1)
  assert.equal(database.prepare("SELECT COUNT(*) n FROM master_change_history WHERE entity_type='branch' AND entity_id='99888' AND change_type='parent_customer_linked'").get().n,1)
  assert.equal(listUnlinkedBranches({},database).summary.unlinkedBranches,0)
})
