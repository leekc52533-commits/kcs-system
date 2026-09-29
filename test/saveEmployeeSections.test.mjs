import test from 'node:test'
import assert from 'node:assert/strict'
import {saveEmployeeSections} from '../shared/saveEmployeeSections.js'
test('failed section and later edits survive; retry skips completed sections', async()=>{
 const calls=[];let fail=true
 const pending={attendance:async()=>calls.push('attendance'),account:async()=>{calls.push('account');if(fail)throw Error('denied')}}
 await assert.rejects(saveEmployeeSections(pending),/denied/)
 assert.deepEqual(Object.keys(pending),['account'])
 fail=false;await saveEmployeeSections(pending)
 assert.deepEqual(calls,['attendance','account','account']);assert.deepEqual(pending,{})
})
test('an operation cannot discard a newer staged edit',async()=>{
 const newer=async()=>{};const pending={account:async()=>{pending.account=newer}}
 await saveEmployeeSections(pending);assert.equal(pending.account,newer)
})
