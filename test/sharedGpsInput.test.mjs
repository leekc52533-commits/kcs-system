import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {parseCoordinates,validCoordinatePair} from '../src/gpsCoordinates.js'

test('combined coordinates accept whitespace and preserve latitude longitude order',()=>{
  assert.deepEqual(parseCoordinates(' 1.4449047, 110.3337165 '),{latitude:'1.4449047',longitude:'110.3337165'})
  assert.deepEqual(parseCoordinates('-1.5, -179.25'),{latitude:'-1.5',longitude:'-179.25'})
})

test('invalid, out-of-range, or ambiguous coordinates are rejected without swapping',()=>{
  assert.throws(()=>parseCoordinates('110.3337165 1.4449047'),/latitude, longitude/)
  assert.throws(()=>parseCoordinates('91, 110'),/Latitude/)
  assert.throws(()=>parseCoordinates('1, 181'),/Longitude/)
  assert.equal(validCoordinatePair('1.4','110.3'),true)
  assert.equal(validCoordinatePair('',''),false)
})

test('shared picker exposes three sources, map confirmation, reverse geocoding, and paste-safe inputs',()=>{
  const source=fs.readFileSync(new URL('../src/SharedGpsInput.jsx',import.meta.url),'utf8')
  assert.match(source,/Get Current GPS/)
  assert.match(source,/Paste Coordinates/)
  assert.match(source,/Select on Map/)
  assert.match(source,/Use This Location/)
  assert.match(source,/manual_coordinates/)
  assert.match(source,/map_selection/)
  assert.match(source,/'device'/)
  assert.match(source,/inputMode="decimal"/)
  assert.match(source,/reverse-geocode/)
  assert.match(source,/gps-collection\/geocode/)
  assert.match(source,/Search address or place/)
  assert.match(source,/items\.length===1/)
  assert.match(source,/candidates\.length>1/)
  assert.match(source,/chooseCandidate/)
  assert.match(source,/useState\(address\|\|''\)/)
  assert.doesNotMatch(source,/onPaste=.*preventDefault/)
})

test('map picker supports direct gestures, map click, drag, and native map type control',()=>{
  const map=fs.readFileSync(new URL('../src/GoogleMapPreview.jsx',import.meta.url),'utf8')
  assert.match(map,/onMapClick/)
  assert.match(map,/map\.current\.addListener\('click'/)
  assert.match(map,/draggable:Boolean/)
  assert.match(map,/mapTypeControl:true/)
  assert.match(map,/gestureHandling:'greedy'/)
  assert.match(map,/zoomControl:false/)
  assert.match(map,/panControl:false/)
  assert.match(map,/cameraControl:false/)
})

test('all supported editors use the shared picker and customer capture remains temporary',()=>{
  for(const file of ['MasterDataPage.jsx','EmployeeMasterPage.jsx','WeeklyDispatchPage.jsx','AuthPages.jsx']){
    assert.match(fs.readFileSync(new URL(`../src/${file}`,import.meta.url),'utf8'),/SharedGpsInput/)
  }
  const auth=fs.readFileSync(new URL('../src/AuthPages.jsx',import.meta.url),'utf8')
  assert.match(auth,/\/api\/gps-collector\/branch\//)
  assert.doesNotMatch(auth,/official-gps.*SharedGpsInput/i)
  const master=fs.readFileSync(new URL('../src/MasterDataPage.jsx',import.meta.url),'utf8')
  assert.match(master,/selectedHasOfficial&&!selectedHasPending/)
})
