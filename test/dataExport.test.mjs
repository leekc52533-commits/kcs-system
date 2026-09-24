import test from 'node:test'
import assert from 'node:assert/strict'
import {allExportItems,exportRows} from '../src/dataExport.js'
test('collects every server page in order with the same search/status',async()=>{
 const urls=[];const data=await allExportItems('/api/master/branches?search=Ever&lifecycleStatus=ACTIVE',async url=>{
 urls.push(url);const page=Number(new URL(url,'https://kcs.test').searchParams.get('page'));
 return {items:[{id:page}],pagination:{pages:3}};
 });
 assert.deepEqual(data.items.map(r=>r.id),[1,2,3]);
 assert.equal(urls.length,3);
 for(const url of urls){assert.match(url,/search=Ever&lifecycleStatus=ACTIVE/);assert.match(url,/pageSize=500/)}
});
test('page failure rejects instead of producing a partial export',async()=>{
 await assert.rejects(allExportItems('/api/customers',async url=>{
 if(url.includes('page=2'))throw new Error('network');
 return {items:[{id:1}],pagination:{pages:2}};
 }),/network/);
});
test('export includes only declared columns and preserves order, zero and duplicate labels',()=>{
 const result=exportRows([{name:'Second',amount:0,secret:'never export'},{name:'First',amount:12,secret:'hidden'}],[{key:'name',label:'Value'},{key:'amount',label:'Value'}]);
 assert.deepEqual(result.columns,['Value','Value (2)']);
 assert.deepEqual(result.rows,[{Value:'Second','Value (2)':0},{Value:'First','Value (2)':12}]);
 assert.doesNotMatch(JSON.stringify(result),/secret|hidden/);
});
test('export uses display value resolver, not nested action or detail data',()=>{
 assert.deepEqual(exportRows([{id:12,details:{password:'hidden'}}],[{key:'id',label:'ID',value:r=>'B'+r.id}]).rows,[{ID:'B12'}]);
});
