import test from 'node:test'
import assert from 'node:assert/strict'
import {isEmployeeBillVoidRoute} from '../server/billVoidRouteAccess.mjs'
test('employee void entry points admit only supported own-document operations',()=>{
 for(const path of ['/api/bill-voids','/api/bill-voids/47/replacement','/api/purchase-payment-proofs/47/photo'])assert.equal(isEmployeeBillVoidRoute(path,'GET'),true)
 for(const action of ['request','replacement','replacement-proof'])assert.equal(isEmployeeBillVoidRoute('/api/bill-voids/47/'+action,'POST'),true)
 for(const method of ['GET','POST','PATCH','DELETE'])for(const path of ['/api/bill-voids/47/approve','/api/bill-voids/47/reject','/api/purchase-bills','/api/bill-voids/47/request/extra'])assert.equal(isEmployeeBillVoidRoute(path,method),false)
 assert.equal(isEmployeeBillVoidRoute('/api/bill-voids/47/request','GET'),false)
 assert.equal(isEmployeeBillVoidRoute('/api/bill-voids','POST'),false)
})
