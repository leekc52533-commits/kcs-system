import test from 'node:test'
import assert from 'node:assert/strict'
import {orderPurchaseProducts} from '../shared/purchaseProductOrder.js'
test('priority dropdown order handles official codes and legacy names without changing data',()=>{
 const codes=['G1','PET','SALI_TIN','ALUMINUM_CAN','OCC','COPPER','BLACK_WHITE_PAPER','MIXED_PAPER','G2']
 const products=codes.map((productCode,i)=>({productId:i+1,productCode,fullName:productCode,currentPrice:.22})),before=JSON.stringify(products)
 assert.deepEqual(orderPurchaseProducts(products).map(p=>p.productCode),['OCC','MIXED_PAPER','BLACK_WHITE_PAPER','ALUMINUM_CAN','PET','G2','SALI_TIN','COPPER','G1'])
 assert.equal(JSON.stringify(products),before)
 assert.deepEqual(orderPurchaseProducts([{shortForm:'SALI/TIN'},{shortForm:'B/W'},{shortForm:'OCC'},{shortForm:'MIX PAPERS'}]).map(p=>p.shortForm),['OCC','MIX PAPERS','B/W','SALI/TIN'])
 assert.deepEqual(orderPurchaseProducts([]),[])
})
