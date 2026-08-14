import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {loadGoogleMaps} from '../src/googleMapsLoader.js'

function fakePage(){
  const scripts=[],runtime={},documentRef={
    head:{append(script){scripts.push(script)}},
    querySelector(){return scripts[0]||null},
    createElement(){const listeners={};return{dataset:{},addEventListener(type,handler){listeners[type]=handler},emit(type){listeners[type]?.()},remove(){const index=scripts.indexOf(this);if(index>=0)scripts.splice(index,1)}}},
  }
  return{scripts,runtime,documentRef}
}

test('async Maps loader waits for the official callback and is a singleton',async()=>{
  const page=fakePage(),pending=loadGoogleMaps('test-key',{...page,timeoutMs:1000})
  let resolved=false;pending.then(()=>{resolved=true})
  await Promise.resolve()
  assert.equal(resolved,false)
  assert.equal(page.scripts.length,1)
  assert.match(page.scripts[0].src,/loading=async&callback=__kcsGoogleMapsReady/)
  const maps={Map:class{},Marker:class{}}
  page.runtime.google={maps};page.runtime.__kcsGoogleMapsReady()
  assert.equal(await pending,maps)
  assert.equal(await loadGoogleMaps('test-key',{...page}),maps)
  assert.equal(page.scripts.length,1)
})

test('missing key, script errors and readiness timeout reject safely',async()=>{
  await assert.rejects(()=>loadGoogleMaps('',{...fakePage()}),/missing-key/)
  const failed=fakePage(),scriptFailure=loadGoogleMaps('test-key',{...failed,timeoutMs:1000});failed.scripts[0].emit('error')
  await assert.rejects(()=>scriptFailure,/script-load-error/)
  await assert.rejects(()=>loadGoogleMaps('test-key',{...fakePage(),timeoutMs:5}),/api-ready-timeout/)
})

test('Map preview keeps unmount protection and updates existing center and Marker',()=>{
  const source=readFileSync(new URL('../src/GoogleMapPreview.jsx',import.meta.url),'utf8')
  assert.match(source,/if\(!current\|\|!container\.current\)return/)
  assert.match(source,/return\(\)=>\{current=false\}/)
  assert.match(source,/map\.current\.setCenter\(position\)/)
  assert.match(source,/marker\.current\.setPosition\(position\)/)
  assert.match(source,/draggable:Boolean\(adjustmentHandler\.current\)/)
  assert.match(source,/addListener\('dragend'/)
  assert.match(source,/mapTypeControl:true/)
  assert.match(source,/mapTypeId:'roadmap'/)
  assert.match(source,/gestureHandling:'greedy'/)
  assert.match(source,/zoomControl:false/)
  assert.match(source,/cameraControl:false/)
  assert.match(source,/setDraggable\(Boolean\(adjustmentHandler\.current\)\)/)
})
