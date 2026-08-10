import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {DatabaseSync} from 'node:sqlite'
import {schemaSql} from '../server/schema.mjs'
import {geocodeGoogleAddress,reverseGeocodeGoogle} from '../server/googleGeocodingService.mjs'
import {dashboardSummary,dataQualitySummary} from '../server/queryService.mjs'

const mapSource=readFileSync(new URL('../src/GoogleMapPreview.jsx',import.meta.url),'utf8')
const mobileSource=readFileSync(new URL('../src/AuthPages.jsx',import.meta.url),'utf8')
const dataSource=readFileSync(new URL('../src/DataPages.jsx',import.meta.url),'utf8')
const dashboardSource=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8')

test('Google Map uses only the Vite web key, creates a Marker and updates center safely',()=>{
  assert.match(mapSource,/import\.meta\.env\.VITE_GOOGLE_MAPS_API_KEY/)
  assert.doesNotMatch(mapSource,/GOOGLE_GEOCODING_API_KEY/)
  for(const token of ['new maps.Map','new maps.Marker','setCenter(position)','setPosition(position)','gpsCollection.mapKeyMissing'])assert.ok(mapSource.includes(token))
  assert.match(mobileSource,/GoogleMapPreview/)
})

test('Google address search returns coordinates without exposing the server key',async()=>{
  let requested='';const result=await geocodeGoogleAddress('Lee Sai Ker',{apiKey:'test-key',fetchImpl:async url=>{requested=String(url);return{ok:true,json:async()=>({status:'OK',results:[{formatted_address:'Kuching, Sarawak',geometry:{location:{lat:1.5,lng:110.3}}}]})}}})
  assert.deepEqual(result,{latitude:'1.5',longitude:'110.3',address:'Kuching, Sarawak',provider:'Google Geocoding API'});assert.match(requested,/address=Lee\+Sai\+Ker/);assert.doesNotMatch(readFileSync(new URL('../src/SharedGpsInput.jsx',import.meta.url),'utf8'),/GOOGLE_GEOCODING_API_KEY/)
})

test('Google reverse geocoding maps real address components and leaves missing fields empty',async()=>{
  const fetchImpl=async()=>({ok:true,json:async()=>({status:'OK',results:[{formatted_address:'10 Main Road, Kuching, Sarawak',address_components:[{long_name:'10',types:['street_number']},{long_name:'Main Road',types:['route']},{long_name:'Kuching',types:['locality']},{long_name:'Sarawak',types:['administrative_area_level_1']}]}]})})
  const result=await reverseGeocodeGoogle(1.5,110.3,{fetchImpl,apiKey:'test-key'})
  assert.deepEqual(result,{address:'10 Main Road, Kuching, Sarawak',state:'Sarawak',street:'Main Road',city:'Kuching',streetNumber:'10',postalCode:'',provider:'Google Geocoding API'})
  await assert.rejects(()=>reverseGeocodeGoogle(1.5,110.3,{fetchImpl:async()=>({ok:true,json:async()=>({status:'REQUEST_DENIED'})}),apiKey:'test-key'}),/Google could not return/)
  await assert.rejects(()=>reverseGeocodeGoogle(1.5,110.3,{fetchImpl,apiKey:''}),/not configured/)
})

test('Dashboard GPS To Collect excludes Official and valid Pending GPS',()=>{
  const db=new DatabaseSync(':memory:');db.exec(schemaSql)
  const customer=db.prepare("INSERT INTO customers(jodoo_customer_id,name,status,is_active) VALUES('1','Customer','active',1)").run().lastInsertRowid
  db.prepare("INSERT INTO branches(jodoo_branch_id,customer_id,branch_name,status,is_active) VALUES('1',?,'Collect','active',1)").run(customer)
  db.prepare("INSERT INTO branches(jodoo_branch_id,customer_id,branch_name,latitude,longitude,status,is_active) VALUES('2',?,'Official',1.5,110.3,'active',1)").run(customer)
  const pending=db.prepare("INSERT INTO branches(jodoo_branch_id,customer_id,branch_name,status,is_active) VALUES('3',?,'Pending','active',1)").run(customer).lastInsertRowid
  db.prepare("INSERT INTO temporary_locations(branch_id,latitude,longitude,location_source,verification_status) VALUES(?,1.5,110.3,'Driver Captured','pending_supervisor')").run(pending)
  assert.equal(dashboardSummary(db).gpsToCollectCount,1)
  assert.match(dashboardSource,/dashboard\.gpsToCollect/)
})

test('both missing-GPS quality groups navigate to the unified preselected collector only when collectable',()=>{
  assert.match(dataSource,/\['scheduledMissingGps','missingGpsAndSchedule'\]/)
  assert.match(dataSource,/page=location-zone&tab=locations&branch=/)
  assert.match(dataSource,/encodeURIComponent\(formatBranchId\(branchId\)\)/)
  assert.match(dataSource,/event\.key==='Enter'\|\|event\.key===' '/)
  const db=new DatabaseSync(':memory:');db.exec(schemaSql)
  const customer=db.prepare("INSERT INTO customers(jodoo_customer_id,name,status,is_active) VALUES('1','Customer','active',1)").run().lastInsertRowid
  const branch=db.prepare("INSERT INTO branches(jodoo_branch_id,customer_id,branch_name,status,is_active) VALUES('1',?,'Missing','active',1)").run(customer).lastInsertRowid
  db.prepare("INSERT INTO temporary_locations(branch_id,latitude,longitude,location_source,verification_status) VALUES(?,1.5,110.3,'Driver Captured','pending_supervisor')").run(branch)
  assert.equal(Boolean(dataQualitySummary(db).missingGpsAndSchedule[0].hasPendingGps),true)
})
