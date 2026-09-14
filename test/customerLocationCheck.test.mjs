import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {DatabaseSync} from 'node:sqlite'
import {schemaSql} from '../server/schema.mjs'
import {customerWorkspace,saveCustomerWorkspace,checkCustomerLocation,reviewCustomerLocation} from '../server/customerWorkspaceService.mjs'
import {captureBranchGps,adoptBranchGps,withdrawBranchOfficialGps} from '../server/customerMasterService.mjs'
const owner={id:1,role:'owner_admin',employeeName:'KC'},office={id:2,role:'office',employeeName:'Office'}
function fixture(){const db=new DatabaseSync(':memory:');db.exec(schemaSql);db.exec("INSERT INTO areas(id,jodoo_area_id,name,zone_group_id,confirmed_zone_group_id,zone_assignment_status) VALUES(1,'A1','BDC',1,1,'confirmed')");return db}
const draft=()=>({requestId:randomUUID(),reason:'Checked customer',customer:{customerName:'Test'},branch:{branchName:'Test BDC',address:'BDC',areaId:'A1'},gps:{latitude:1.5,longitude:110.3}})
const options={geocoder:async()=>({address:'Jalan BDC, 93350 Kuching'})}
async function prepared(db,actor=owner){const p=draft();p.revision=customerWorkspace({},actor,db).revision;const r=await checkCustomerLocation(p,actor,db,options);p.locationCheck={token:r.token,address:r.address,areaId:'A1'};return p}
test('unsaved preview writes nothing; first GPS and reviewed address save atomically and replay safely',async()=>{
 const db=fixture(),p=await prepared(db);assert.equal(db.prepare('SELECT COUNT(*) n FROM branches').get().n,0)
 const r=saveCustomerWorkspace(p,owner,db);assert.equal(r.branch.address,'Jalan BDC, 93350 Kuching');assert.equal(r.branch.officialLatitude,1.5);assert.equal(r.locationReviews.length,0)
 assert.equal(JSON.stringify(saveCustomerWorkspace(p,owner,db)),JSON.stringify(r));db.close()
})
test('office stages suggestions, supervisor approves in same workspace; stale decisions and other roles denied',async()=>{
 const db=fixture(),p=await prepared(db,office),r=saveCustomerWorkspace(p,office,db);assert.equal(r.branch.address,'BDC');assert.equal(r.locationReviews.length,1)
 const review={branchId:r.branch.branchId,id:r.locationReviews[0].id,decision:'approve',reason:'Verified'}
 assert.throws(()=>reviewCustomerLocation(review,office,db),/permission/)
 const done=reviewCustomerLocation(review,owner,db);assert.equal(done.branch.address,'Jalan BDC, 93350 Kuching');assert.equal(done.locationReviews.length,0)
 assert.throws(()=>reviewCustomerLocation(review,owner,db),/already decided/);db.close()
})
test('changed inputs and tampered previews reject before writes; GPS changes require approval and cannot be replayed after withdrawal',async()=>{
 const db=fixture(),p=await prepared(db);assert.throws(()=>saveCustomerWorkspace({...p,branch:{...p.branch,address:'different'}},owner,db),/changed/)
 assert.throws(()=>saveCustomerWorkspace({...p,locationCheck:{...p.locationCheck,token:'bad'}},owner,db),/preview/)
 assert.equal(db.prepare('SELECT COUNT(*) n FROM customers').get().n,0)
 const r=saveCustomerWorkspace(p,owner,db),change=captureBranchGps(r.branch.branchId,{latitude:1.6,longitude:110.4,reason:'Correct location',capturedBy:'Employee'},db)
 assert.equal(change.initialCapture,false);assert.equal(customerWorkspace({branchId:r.branch.branchId},owner,db).branch.officialLatitude,1.5)
 adoptBranchGps(change.id,{adoptedBy:'KC',reason:'Verified'},db);assert.equal(customerWorkspace({branchId:r.branch.branchId},owner,db).branch.officialLatitude,1.6)
 withdrawBranchOfficialGps(r.branch.branchId,{changedBy:'KC',reason:'Recheck'},db)
 const second=captureBranchGps(r.branch.branchId,{latitude:1.7,longitude:110.5,reason:'Replacement',capturedBy:'Employee'},db)
 assert.equal(second.initialCapture,false);assert.equal(customerWorkspace({branchId:r.branch.branchId},owner,db).branch.officialLatitude,null);db.close()
})
test('geocoder failure keeps draft and still offers Area; unavailable GPS never creates coordinates',async()=>{
 const db=fixture(),p=draft();const r=await checkCustomerLocation(p,owner,db,{geocoder:async()=>{throw Error('offline')}});assert.equal(r.addressUnavailable,true);assert.equal(r.address,null)
 const missing=await checkCustomerLocation({...p,gps:null},owner,db,options);assert.equal(missing.gpsSource,'missing');assert.equal(missing.areaId,'');db.close()
})
