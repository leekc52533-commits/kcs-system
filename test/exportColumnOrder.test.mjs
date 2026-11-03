import test from 'node:test'
import assert from 'node:assert/strict'
import {exportColumnOrder,orderedExportColumns} from '../shared/exportColumnOrder.js'
test('server column order validates unknown, duplicate and malformed keys, retains supplementary columns',()=>{
 const columns=[{key:'date',header:'Date'},{key:'amount',header:'Amount'},{key:'proof',header:'Proof'}]
 assert.deepEqual(orderedExportColumns(columns,'["amountLabel","amountLabel","__proto__","unknown"]',{amountLabel:'amount'}).map(c=>c.key),['amount','date','proof'])
 for(const input of ['bad json','{}','null',null,[]])assert.deepEqual(exportColumnOrder(input,['date','amount']),['date','amount'])
 assert.deepEqual(exportColumnOrder('["amount","date"]',['date','amount']),['amount','date'])
})
