import test from 'node:test'
import assert from 'node:assert/strict'
import {EventEmitter} from 'node:events'
import {trackApiRequest} from '../server/requestTiming.mjs'

test('request timing keeps correlation, strips query secrets and records slow completion once',()=>{
  const rows=[],response=new EventEmitter();response.statusCode=200
  let time=0
  trackApiRequest({url:'/api/dispatch/week?token=secret',method:'GET'},response,'id',{log:r=>rows.push(r),now:()=>time})
  assert.equal(rows[0].event,'api_request_started')
  time=6000;response.emit('finish');response.emit('close')
  assert.equal(rows.length,2)
  assert.deepEqual(rows[1],{event:'api_request_slow',requestId:'id',method:'GET',path:'/api/dispatch/week',durationMs:6000,phase:'finished',status:200})
  assert.ok(!JSON.stringify(rows).includes('secret'))
})
test('pending request warns and disconnected request is recorded',async()=>{
  const rows=[],response=new EventEmitter();response.statusCode=200
  trackApiRequest({url:'/api/example',method:'POST'},response,'id',{log:r=>rows.push(r),slowMs:5})
  await new Promise(r=>setTimeout(r,15));response.emit('close')
  assert.equal(rows[1].phase,'pending');assert.equal(rows[2].phase,'disconnected')
})
