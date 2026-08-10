import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const shared=readFileSync(new URL('../src/SharedGpsInput.jsx',import.meta.url),'utf8')
const mobile=readFileSync(new URL('../src/AuthPages.jsx',import.meta.url),'utf8')
const desktop=readFileSync(new URL('../src/MasterDataPage.jsx',import.meta.url),'utf8')
const map=readFileSync(new URL('../src/GoogleMapPreview.jsx',import.meta.url),'utf8')

test('Customer collectors show Find on Map for any non-empty current Address without device GPS',()=>{
  assert.match(shared,/onClick=\{findAddress\}>Find on Map<\/button>/)
  assert.match(shared,/const query=String\(address\|\|draft\.address\|\|''\)\.trim\(\)/)
  assert.doesNotMatch(shared,/findAddress=.*getDevice/)
  assert.match(mobile,/setCapture\(\{\.\.\.emptyCapture,address:branch\.address\|\|''\}\)/)
  assert.match(desktop,/setGps\(\{\.\.\.emptyGpsCapture,address:branch\.address\|\|''\}\)/)
  assert.match(desktop,/selectedBranch\?\.address.*address:selectedBranch\.address/)
  const mobileShared=mobile.indexOf('<SharedGpsInput className="customer-gps-shared" resetKey=')
  const desktopShared=desktop.indexOf('<SharedGpsInput className="customer-gps-shared" resetKey=',desktop.indexOf('export function GpsCollector'))
  assert.ok(mobile.indexOf("<label>{t('mobile.address')}")<mobileShared)
  assert.ok(desktop.lastIndexOf("<label>{t('mobile.address')}",desktopShared)<desktopShared)
})

test('address result selection remains draft-only, supports candidates and the existing map controls',()=>{
  assert.match(shared,/items\.length===1/)
  assert.match(shared,/candidates\.length>1/)
  assert.match(shared,/onClick=\{\(\)=>chooseCandidate\(candidate\)\}/)
  assert.match(shared,/reverse\(\{latitude:candidate\.latitude,longitude:candidate\.longitude\},'map_selection',false\)/)
  assert.match(map,/mapTypeControl:true/)
  assert.match(map,/onPositionAdjusted/)
  assert.match(desktop,/\/api\/gps-collector\/branch\//)
  assert.doesNotMatch(shared,/method:'POST'/)
})
