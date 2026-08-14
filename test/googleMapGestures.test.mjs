import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const map=readFileSync(new URL('../src/GoogleMapPreview.jsx',import.meta.url),'utf8')
const picker=readFileSync(new URL('../src/SharedGpsInput.jsx',import.meta.url),'utf8')

test('shared Google map uses direct mouse and touch gestures without camera or zoom controls',()=>{
  for(const option of ["gestureHandling:'greedy'","draggable:true","scrollwheel:true","disableDoubleClickZoom:false","zoomControl:false","panControl:false","cameraControl:false"])assert.ok(map.includes(option),option)
})

test('map type selection, map click, and draggable marker remain available',()=>{
  for(const option of ["mapTypeControl:true","mapTypeId:'roadmap'","draggable:Boolean(adjustmentHandler.current)","addListener('dragend'","map.current.addListener('click'"])assert.ok(map.includes(option),option)
})

test('address search, reverse geocoding, and temporary save workflow remain wired',()=>{
  for(const token of ['Find on Map','Select on Map','reverse-geocode','onMapClick={select}','onPositionAdjusted={select}'])assert.ok(picker.includes(token),token)
  const customer=readFileSync(new URL('../src/AuthPages.jsx',import.meta.url),'utf8')
  assert.match(customer,/t\('mobile\.submitGps'\)/)
  assert.match(customer,/\/api\/gps-collector\/branch\//)
})
