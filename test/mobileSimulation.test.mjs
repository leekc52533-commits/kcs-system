import test from 'node:test'
import assert from 'node:assert/strict'
import {createMobileSimulation} from '../src/mobileSimulationState.js'
const setup=(paymentMethod='Credit')=>createMobileSimulation({date:'2026-10-05',paymentMethod})
const post=(m,path,body={})=>m.request(path,{method:'POST',body:JSON.stringify(body)})
const check=m=>post(m,'/api/mobile/trips/1/tomorrow-plan/check',{expectedSignature:m.view().trips[0].driverPlan.signature})
test('order, check invalidation, approval, collection and test-only bill lifecycle',async()=>{
 const m=setup();assert.equal(m.view().date,'2026-10-06');assert.equal(m.view().trips[0].canPlan,true);assert.throws(()=>m.approve())
 await check(m);const signature=m.view().trips[0].driverPlan.signature
 await post(m,'/api/mobile/trips/1/tomorrow-plan/order',{stopId:2,direction:'up',expectedSignature:signature});assert.equal(m.view().trips[0].driverPlan.checked,false)
 await assert.rejects(()=>post(m,'/api/mobile/trips/1/tomorrow-plan/check',{expectedSignature:signature}))
 await check(m);m.approve();await post(m,'/api/mobile/trips/1/start');assert.equal(m.view().trips[0].currentStopId,2)
 await assert.rejects(()=>post(m,'/api/mobile/stops/1/arrive'))
 for(const id of [2,1,3]){await post(m,`/api/mobile/stops/${id}/arrive`);const b=await post(m,`/api/mobile/stops/${id}/bills`,{items:[{productId:1,quantity:100}],printChoice:'print'});assert.match(b.billNumber,/^TEST-/);assert.equal(b.printChoice,'no_print');assert.equal(b.totalCents,2000);await post(m,`/api/mobile/stops/${id}/complete`)}
 await post(m,'/api/mobile/trips/1/complete');assert.equal(m.view().trips[0].executionStatus,'completed')
 assert.equal(setup().view().trips[0].stops[0].billCreated,false)
})
test('cash proof, invalid inputs, unsupported writes and detached snapshots',async()=>{
 const m=setup('Cash');await check(m);m.approve();await post(m,'/api/mobile/trips/1/start');await post(m,'/api/mobile/stops/1/arrive')
 await assert.rejects(()=>post(m,'/api/mobile/stops/1/bills',{items:[{productId:1,quantity:-1}]}))
 await post(m,'/api/mobile/stops/1/bills',{items:[{productId:1,quantity:10}]});await assert.rejects(()=>post(m,'/api/mobile/stops/1/complete'))
 await post(m,'/api/mobile/stops/1/payment-proof',{photo:{dataUrl:'data:image/png;base64,TEST'}});await post(m,'/api/mobile/stops/1/complete')
 const copy=m.view();copy.trips[0].stops=[];assert.equal(m.view().trips[0].stops.length,3)
 for(const path of ['/api/mobile/stops/1/request-date','/api/sales','/api/auth/logout'])await assert.rejects(()=>post(m,path))
})
