import test from 'node:test'
import assert from 'node:assert/strict'
import {collectHighAccuracyPosition} from '../src/highAccuracyGps.js'

function geolocation(samples,{error}={}){
  let cleared=0
  return{
    watchPosition(success,fail,_options){queueMicrotask(()=>{if(error)return fail(error);for(const sample of samples)success({coords:{latitude:sample.latitude,longitude:sample.longitude,accuracy:sample.accuracy},timestamp:sample.timestamp||Date.now()})});return 7},
    clearWatch(id){assert.equal(id,7);cleared+=1},
    get cleared(){return cleared}
  }
}

test('continuous high accuracy collection chooses the best sample instead of the first',async()=>{
  const device=geolocation([{latitude:1.5,longitude:110.3,accuracy:150},{latitude:1.51,longitude:110.31,accuracy:45},{latitude:1.52,longitude:110.32,accuracy:10}]),seen=[]
  const best=await collectHighAccuracyPosition(device,{durationMs:100,timeoutMs:200,minSamples:3,targetAccuracy:20,onSample:item=>seen.push(item.accuracyM)})
  assert.equal(best.accuracyM,10)
  assert.equal(best.latitude,'1.5200000')
  assert.deepEqual(seen,[150,45,10])
  assert.equal(device.cleared,1)
})

test('collection returns the best available sample with a low accuracy result',async()=>{
  const best=await collectHighAccuracyPosition(geolocation([{latitude:1,longitude:110,accuracy:151},{latitude:1.1,longitude:110.1,accuracy:80}]),{durationMs:5,minSamples:3})
  assert.equal(best.accuracyM,80)
})

test('permission denial and unsupported geolocation fail safely',async()=>{
  await assert.rejects(()=>collectHighAccuracyPosition(geolocation([],{error:new Error('permission denied')}),{durationMs:20}),/permission denied/)
  await assert.rejects(()=>collectHighAccuracyPosition(null),/gps-unsupported/)
})
