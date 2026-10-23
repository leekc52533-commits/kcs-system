import test from 'node:test'
import assert from 'node:assert/strict'
import {requestWithTimeout} from '../src/requestWithTimeout.js'
test('timeout rejects even if transport never settles and aborts waiting',async()=>{
  let signal
  await assert.rejects(requestWithTimeout((_,options)=>{signal=options.signal;return new Promise(()=>{})},'/api/test',{},5),{code:'REQUEST_TIMEOUT'})
  assert.equal(signal.aborted,true)
})
test('successful and failed requests retain results and errors',async()=>{
  assert.deepEqual(await requestWithTimeout(async()=>({ok:true}),'/api/test',{},100),{ok:true})
  await assert.rejects(requestWithTimeout(async()=>{throw Error('offline')},'/api/test',{},100),/offline/)
})
