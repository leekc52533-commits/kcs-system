import test from 'node:test'
import assert from 'node:assert/strict'
import {createMobileSimulation} from '../src/mobileSimulationState.js'
const setup=(paymentMethod='Credit')=>createMobileSimulation({date:'2026-10-05',paymentMethod})
const post=(m,path,body={})=>m.request(path,{method:'POST',body:JSON.stringify(body)})
const check=m=>post(m,'/api/mobile/trips/1/tomorrow-plan/check',{expectedSignature:m.view().trips[0].driverPlan.signature})
test('training requests need explicit simulated review and new customers bill with entered price',async()=>{
 const m=setup();await check(m);m.approve();await post(m,'/api/mobile/trips/1/start')
 await post(m,'/api/mobile/stops/2/trial-reorder',{direction:'up',reason:'TEST'})
 assert.equal(m.view().trips[0].stops[0].id,1);m.review(m.view().pending[0].id,'approved');assert.equal(m.view().trips[0].stops[0].id,2)
 await post(m,'/api/mobile/stops/2/request-date',{targetDate:'2026-10-07',reason:'TEST',reasonCode:'time',evidence:{}})
 await assert.rejects(()=>post(m,'/api/mobile/stops/2/arrive'))
 m.review(m.view().pending[0].id,'rejected');assert.equal(m.view().trips[0].currentStopId,2)
 await post(m,'/api/mobile/stops/2/no-goods-notice',{reason:'TEST',photo:{dataUrl:'TEST'}})
 m.review(m.view().pending[0].id,'approved');assert.equal(m.view().trips[0].currentStopId,1)
 const intake=await post(m,'/api/mobile/customer-intakes',{name:'NEW TEST SHOP',newConfirmed:true,customerType:'new',searchCheckedName:'NEW TEST SHOP',searchMatchCount:0,latitude:1.55})
 await post(m,`/api/mobile/stops/${intake.stopId}/arrive`)
 const bill=await post(m,`/api/mobile/stops/${intake.stopId}/bills`,{items:[{productId:1,quantity:100,unitPrice:0.19}]})
 assert.equal(bill.totalCents,1900);assert.match(bill.billNumber,/^TEST-/)
 await post(m,`/api/mobile/stops/${intake.stopId}/complete`)
 assert.equal((await m.request('/api/mobile/customer-intakes')).items[0].stopStatus,'completed')
 assert.equal(setup().view().pending.length,0)
})
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
test('customer commitment training requires scope, previews promised day and blocks rescheduling without real writes',async()=>{
 const m=setup();await check(m);m.approve();await post(m,'/api/mobile/trips/1/start')
 const payload={targetDate:'2026-10-07',reason:'Customer requested rescheduling',reasonCode:'customer',evidence:{contactMethod:'phone',contactName:'TEST',contactAt:'2026-10-05T01:00:00Z'}}
 await assert.rejects(()=>post(m,'/api/mobile/stops/1/request-date',{...payload,reasonCode:'other'}))
 await post(m,'/api/mobile/stops/1/request-date',payload)
 const id=m.view().pending[0].id
 assert.throws(()=>m.review(id,'approved'));assert.equal(m.view().pending.length,1)
 m.review(id,'approved',{scope:'permanent',customerPromiseConfirmed:true})
 assert.deepEqual(m.view().promisedDates,['2026-10-07'])
 m.openPromisedDate('2026-10-07')
 const stop=m.view().trips[0].stops[0]
 assert.equal(stop.customerDatePromise.date,'2026-10-07');assert.equal(stop.fixedSchedule.weekday,3)
 await post(m,'/api/mobile/trips/1/start')
 await assert.rejects(()=>post(m,`/api/mobile/stops/${stop.id}/request-date`,{...payload,targetDate:'2026-10-08'}),/promised/)
 await post(m,`/api/mobile/stops/${stop.id}/arrive`)
 assert.ok(m.view().trips[0].stops[0].arrivedAt)
 assert.deepEqual(setup().view().promisedDates,[])
})
